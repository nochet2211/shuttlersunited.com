import Razorpay from 'razorpay';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET,
} from 'astro:env/server';

/**
 * Every amount that crosses this boundary is in paise. Rupee floats are only
 * ever produced for display, never for arithmetic or for Razorpay.
 */
export const toPaise = (rupees: number): number => Math.round(rupees * 100);
export const toRupees = (paise: number): number => paise / 100;

export function isRazorpayConfigured(): boolean {
  return Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
}

let client: Razorpay | null = null;

function getClient(): Razorpay {
  if (!isRazorpayConfigured()) {
    throw new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }
  client ??= new Razorpay({ key_id: RAZORPAY_KEY_ID!, key_secret: RAZORPAY_KEY_SECRET! });
  return client;
}

export interface CreateOrderInput {
  amountPaise: number;
  /** Our own payment row id — this is what makes the dashboard reconcilable. */
  receipt: string;
  notes: Record<string, string>;
}

export async function createOrder({ amountPaise, receipt, notes }: CreateOrderInput) {
  return getClient().orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt,
    // Notes surface as columns in the Razorpay dashboard export, which is what
    // makes a settlement reconcilable against our own ledger without guesswork.
    notes,
  });
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Verifies the handler signature returned by Razorpay Checkout in the browser.
 * A valid signature proves the payment succeeded — but treat it as provisional
 * until the webhook confirms, since the browser is not a trusted reporter.
 */
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  if (!RAZORPAY_KEY_SECRET) return false;
  const expected = createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeEqualHex(expected, signature);
}

/** Verifies a webhook against the raw request body — parsed JSON will not match. */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  if (!RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return safeEqualHex(expected, signature);
}
