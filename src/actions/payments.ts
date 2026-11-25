import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { first, getById, insert, timestamp, update } from '../lib/db';
import { findDuesPayment } from '../lib/queries';
import { createOrder, verifyPaymentSignature, isRazorpayConfigured } from '../lib/razorpay';
import { periodKey } from '../lib/format';
import { RAZORPAY_KEY_ID } from 'astro:env/server';
import type { Member, MembershipPlan, Payment } from '../lib/types';

function requireMember(locals: App.Locals): Member {
  if (!locals.member) {
    throw new ActionError({ code: 'UNAUTHORIZED', message: 'Please log in.' });
  }
  return locals.member;
}

export const payments = {
  /**
   * Opens a dues payment: writes a `created` ledger row, then a Razorpay order
   * whose receipt is that row's id. Our row exists before any money moves, so
   * a payment can never arrive without somewhere to record it.
   */
  createOrder: defineAction({
    input: z.object({
      plan: z.string().min(1),
      period: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(),
    }),
    handler: async (input, context) => {
      const member = requireMember(context.locals);

      if (!isRazorpayConfigured()) {
        throw new ActionError({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Online payments are not switched on yet. Please pay a club admin directly.',
        });
      }

      const period = input.period ?? periodKey();

      const plan = await getById<MembershipPlan>('membership_plans', input.plan);
      if (!plan) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'That plan no longer exists.' });
      }

      if (!plan.is_active) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'That plan is no longer offered.' });
      }

      // Don't let a member pay the same month twice.
      if (await findDuesPayment(member.id, period)) {
        throw new ActionError({
          code: 'CONFLICT',
          message: 'Dues for this month are already settled.',
        });
      }

      const record = await insert<Payment>('payments', {
        member: member.id,
        plan: plan.id,
        type: 'membership',
        status: 'created',
        amount: plan.amount,
        currency: 'INR',
        period,
      });

      try {
        const order = await createOrder({
          amountPaise: plan.amount,
          receipt: record.id,
          // These notes become columns in the Razorpay dashboard export, which
          // is what lets a settlement be matched back to a member and a month
          // without cross-referencing anything by hand.
          notes: {
            payment_id: record.id,
            member_id: member.id,
            member_name: member.name,
            member_phone: member.phone,
            period,
            plan: plan.name,
          },
        });

        await update('payments', record.id, {
          razorpay_order_id: order.id,
          status: 'attempted',
        });

        return {
          orderId: order.id,
          amount: plan.amount,
          currency: 'INR',
          keyId: RAZORPAY_KEY_ID!,
          paymentId: record.id,
          memberName: member.name,
          memberPhone: member.phone,
          planName: plan.name,
        };
      } catch (error) {
        await update('payments', record.id, {
          status: 'failed',
          failure_reason: 'Could not create the Razorpay order.',
        });
        console.error('[payments] order creation failed', error);
        throw new ActionError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Could not start the payment. Please try again.',
        });
      }
    },
  }),

  /**
   * Called by Checkout's success handler. The signature proves the browser
   * isn't lying, but the webhook remains the source of truth — this only
   * exists so the member sees a settled state immediately instead of waiting.
   */
  confirm: defineAction({
    input: z.object({
      razorpay_order_id: z.string().min(1),
      razorpay_payment_id: z.string().min(1),
      razorpay_signature: z.string().min(1),
    }),
    handler: async (input, context) => {
      const member = requireMember(context.locals);

      const valid = verifyPaymentSignature(
        input.razorpay_order_id,
        input.razorpay_payment_id,
        input.razorpay_signature,
      );

      if (!valid) {
        console.warn('[payments] rejected a bad signature for', input.razorpay_order_id);
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'We could not verify that payment. Our team will check and follow up.',
        });
      }

      const record = await first<Payment>(
        'payments',
        'SELECT * FROM payments WHERE razorpay_order_id = ?',
        input.razorpay_order_id,
      );
      if (!record) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'That payment is not on record.' });
      }

      if (record.member !== member.id) {
        throw new ActionError({ code: 'FORBIDDEN', message: 'That is not your payment.' });
      }

      // The webhook may have landed first; never walk a settled row backwards.
      if (record.status !== 'paid') {
        await update('payments', record.id, {
          status: 'paid',
          razorpay_payment_id: input.razorpay_payment_id,
          razorpay_signature: input.razorpay_signature,
          paid_at: timestamp(),
        });
      }

      return { ok: true, period: record.period };
    },
  }),
};
