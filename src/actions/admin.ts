import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { getAdminClient } from '../lib/pocketbase';
import { toPaise } from '../lib/razorpay';
import { periodKey } from '../lib/format';

function requireAdmin(locals: App.Locals): void {
  if (!locals.isAdmin) {
    // 404 rather than 403 — an admin surface shouldn't confirm it exists.
    throw new ActionError({ code: 'NOT_FOUND', message: 'Not found.' });
  }
}

export const admin = {
  setMemberStatus: defineAction({
    accept: 'form',
    input: z.object({
      id: z.string().min(1),
      status: z.enum(['active', 'inactive', 'pending']),
    }),
    handler: async ({ id, status }, context) => {
      requireAdmin(context.locals);
      const pb = await getAdminClient();
      await pb.collection('members').update(id, { status });
      return { ok: true };
    },
  }),

  setMemberRole: defineAction({
    accept: 'form',
    input: z.object({ id: z.string().min(1), role: z.enum(['member', 'admin']) }),
    handler: async ({ id, role }, context) => {
      requireAdmin(context.locals);

      // An admin demoting themselves could leave the club with no admin at all.
      if (id === context.locals.member?.id && role !== 'admin') {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'You cannot remove your own admin access.',
        });
      }

      const pb = await getAdminClient();
      await pb.collection('members').update(id, { role });
      return { ok: true };
    },
  }),

  /**
   * Records dues paid in cash or by direct UPI. Kept deliberately separate from
   * the Razorpay path: `razorpay_order_id` stays empty, so an offline entry can
   * never be mistaken for a gateway settlement during reconciliation.
   */
  recordManualPayment: defineAction({
    accept: 'form',
    input: z.object({
      member: z.string().min(1),
      amount_rupees: z.coerce.number().min(1, 'Enter an amount.'),
      period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      method: z.enum(['cash', 'upi', 'bank-transfer', 'cheque']),
      notes: z.string().trim().max(300).optional(),
    }),
    handler: async (input, context) => {
      requireAdmin(context.locals);
      const pb = await getAdminClient();
      const period = input.period ?? periodKey();

      const existing = await pb.collection('payments').getList(1, 1, {
        filter: pb.filter(
          'member = {:member} && type = "membership" && period = {:period} && status = "paid"',
          { member: input.member, period },
        ),
      });
      if (existing.totalItems > 0) {
        throw new ActionError({
          code: 'CONFLICT',
          message: 'That member has already settled this month.',
        });
      }

      await pb.collection('payments').create({
        member: input.member,
        type: 'membership',
        status: 'paid',
        amount: toPaise(input.amount_rupees),
        currency: 'INR',
        period,
        method: input.method,
        paid_at: new Date().toISOString().replace('T', ' '),
        notes: input.notes ?? `Recorded offline by ${context.locals.member?.name ?? 'an admin'}`,
      });

      return { ok: true };
    },
  }),
};
