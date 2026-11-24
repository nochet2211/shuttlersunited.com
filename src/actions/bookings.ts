import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { getAdminClient } from '../lib/pocketbase';
import { dateKey, dayBounds } from '../lib/format';
import type { Booking, Member } from '../lib/types';

/** Play runs 06:00–22:00 in 30-minute slots. */
export const DAY_START_MINUTE = 6 * 60;
export const DAY_END_MINUTE = 22 * 60;
export const SLOT_MINUTES = 30;
/** How far ahead members may book, and the cap on concurrent open bookings. */
const BOOKING_HORIZON_DAYS = 14;
const MAX_OPEN_BOOKINGS = 3;

function requireMember(locals: App.Locals): Member {
  if (!locals.member) {
    throw new ActionError({ code: 'UNAUTHORIZED', message: 'Please log in.' });
  }
  return locals.member;
}

export const bookings = {
  create: defineAction({
    accept: 'form',
    input: z
      .object({
        court: z.string().min(1, 'Choose a court.'),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.'),
        start_minute: z.coerce.number().int().min(DAY_START_MINUTE).max(DAY_END_MINUTE),
        end_minute: z.coerce.number().int().min(DAY_START_MINUTE).max(DAY_END_MINUTE),
        notes: z.string().trim().max(300).optional(),
      })
      .refine((value) => value.end_minute > value.start_minute, {
        message: 'The end time must be after the start time.',
        path: ['end_minute'],
      })
      .refine((value) => (value.end_minute - value.start_minute) % SLOT_MINUTES === 0, {
        message: 'Bookings run in 30-minute slots.',
        path: ['end_minute'],
      })
      .refine((value) => value.end_minute - value.start_minute <= 120, {
        message: 'A single booking can run for at most two hours.',
        path: ['end_minute'],
      }),
    handler: async (input, context) => {
      const member = requireMember(context.locals);
      const pb = await getAdminClient();

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const requested = new Date(`${input.date}T00:00:00`);
      const horizon = new Date(today);
      horizon.setDate(horizon.getDate() + BOOKING_HORIZON_DAYS);

      if (requested < today) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'That date has passed.' });
      }
      if (requested > horizon) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: `Courts open ${BOOKING_HORIZON_DAYS} days ahead.`,
        });
      }

      // Only bookings from today onward count against the cap; past ones don't.
      const open = await pb.collection('bookings').getList<Booking>(1, 1, {
        filter: pb.filter('member = {:member} && status = "confirmed" && date >= {:today}', {
          member: member.id,
          today: `${dateKey(today)} 00:00:00`,
        }),
      });
      if (open.totalItems >= MAX_OPEN_BOOKINGS) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: `You already hold ${MAX_OPEN_BOOKINGS} bookings. Cancel one first.`,
        });
      }

      // Overlap test: two ranges collide unless one ends before the other starts.
      const day = dayBounds(input.date);
      const clashes = await pb.collection('bookings').getList<Booking>(1, 1, {
        filter: pb.filter(
          'court = {:court} && date >= {:dayStart} && date < {:dayEnd}' +
            ' && status = "confirmed" && start_minute < {:end} && end_minute > {:start}',
          {
            court: input.court,
            dayStart: day.start,
            dayEnd: day.end,
            start: input.start_minute,
            end: input.end_minute,
          },
        ),
      });

      if (clashes.totalItems > 0) {
        throw new ActionError({
          code: 'CONFLICT',
          message: 'That slot was just taken. Pick another.',
        });
      }

      const booking = await pb.collection('bookings').create({
        court: input.court,
        member: member.id,
        date: `${input.date} 00:00:00`,
        start_minute: input.start_minute,
        end_minute: input.end_minute,
        status: 'confirmed',
        notes: input.notes ?? '',
      });

      return { id: booking.id };
    },
  }),

  cancel: defineAction({
    accept: 'form',
    input: z.object({ id: z.string().min(1) }),
    handler: async ({ id }, context) => {
      const member = requireMember(context.locals);
      const pb = await getAdminClient();

      const booking = await pb.collection('bookings').getOne<Booking>(id);
      if (booking.member !== member.id && !context.locals.isAdmin) {
        throw new ActionError({ code: 'FORBIDDEN', message: 'That is not your booking.' });
      }

      await pb.collection('bookings').update(id, { status: 'cancelled' });
      return { ok: true };
    },
  }),
};
