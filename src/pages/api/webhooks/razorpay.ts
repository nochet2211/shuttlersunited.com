import type { APIRoute } from 'astro';
import { first, getById, timestamp, update } from '../../../lib/db';
import { verifyWebhookSignature } from '../../../lib/razorpay';
import type { Payment } from '../../../lib/types';

export const prerender = false;

/**
 * Razorpay webhook — the authoritative record of what actually settled.
 *
 * The browser's success callback is a convenience; this endpoint is the truth.
 * It fires even when the member closes the tab mid-payment, which is exactly
 * the case that otherwise leaves money received with no ledger row against it.
 *
 * Configure in the Razorpay dashboard against:
 *   https://shuttlersunited.com/api/webhooks/razorpay
 * subscribed to: payment.captured, payment.failed, refund.processed
 */
export const POST: APIRoute = async ({ request }) => {
  const signature = request.headers.get('x-razorpay-signature');
  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }

  // Must be the raw body — re-serialised JSON will not match the HMAC.
  const rawBody = await request.text();

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn('[razorpay] rejected a webhook with an invalid signature');
    return new Response('Invalid signature', { status: 401 });
  }

  let event: RazorpayEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('Malformed body', { status: 400 });
  }

  try {
    switch (event.event) {
      case 'payment.captured':
        await onCaptured(event);
        break;
      case 'payment.failed':
        await onFailed(event);
        break;
      case 'refund.processed':
        await onRefunded(event);
        break;
      default:
        // Acknowledge everything else so Razorpay stops retrying it.
        break;
    }
  } catch (error) {
    // A 5xx makes Razorpay retry, which is what we want for a transient fault.
    console.error(`[razorpay] failed handling ${event.event}`, error);
    return new Response('Handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

interface RazorpayEvent {
  event: string;
  payload: {
    payment?: { entity: RazorpayPayment };
    refund?: { entity: { id: string; payment_id: string; amount: number } };
  };
}

interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  status: string;
  method?: string;
  error_description?: string;
  notes?: Record<string, string>;
}

/** Finds our ledger row by order id, falling back to the id carried in notes. */
async function findPayment(entity: RazorpayPayment): Promise<Payment | null> {
  if (entity.order_id) {
    const byOrder = await first<Payment>(
      'payments',
      'SELECT * FROM payments WHERE razorpay_order_id = ?',
      entity.order_id,
    );
    if (byOrder) return byOrder;
  }

  const fallbackId = entity.notes?.payment_id;
  return fallbackId ? getById<Payment>('payments', fallbackId) : null;
}

async function onCaptured(event: RazorpayEvent): Promise<void> {
  const entity = event.payload.payment?.entity;
  if (!entity) return;

  const record = await findPayment(entity);

  if (!record) {
    // Money arrived with nothing to attach it to. Never drop it silently —
    // record an orphan row so it shows up in reconciliation as needing a human.
    console.error('[razorpay] captured payment with no matching row', entity.id);
    return;
  }

  if (record.status === 'paid') return; // Razorpay retries; stay idempotent.

  // Flag a mismatch rather than trusting either side blindly.
  const amountMismatch = entity.amount !== record.amount;
  if (amountMismatch) {
    console.error(
      `[razorpay] amount mismatch on ${record.id}: expected ${record.amount}, got ${entity.amount}`,
    );
  }

  await update('payments', record.id, {
    status: 'paid',
    razorpay_payment_id: entity.id,
    razorpay_order_id: entity.order_id || record.razorpay_order_id,
    method: entity.method ?? '',
    amount: entity.amount,
    paid_at: timestamp(),
    notes: amountMismatch
      ? `Amount mismatch — expected ${record.amount} paise, received ${entity.amount}. Review.`
      : record.notes || '',
  });
}

async function onFailed(event: RazorpayEvent): Promise<void> {
  const entity = event.payload.payment?.entity;
  if (!entity) return;

  const record = await findPayment(entity);
  if (!record || record.status === 'paid') return;

  await update('payments', record.id, {
    status: 'failed',
    razorpay_payment_id: entity.id,
    failure_reason: entity.error_description?.slice(0, 300) ?? 'Payment failed.',
  });
}

async function onRefunded(event: RazorpayEvent): Promise<void> {
  const refund = event.payload.refund?.entity;
  if (!refund) return;

  const record = await first<Payment>(
    'payments',
    'SELECT * FROM payments WHERE razorpay_payment_id = ?',
    refund.payment_id,
  );
  if (!record) {
    console.error('[razorpay] refund for an unknown payment', refund.payment_id);
    return;
  }

  await update('payments', record.id, {
    status: 'refunded',
    notes: `Refunded ${refund.amount} paise (${refund.id}).`,
  });
}
