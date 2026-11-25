import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { first, insert } from '../lib/db';
import { issueOtp, verifyOtp, OtpError } from '../lib/otp';
import {
  startSession,
  clearSessionCookie,
  setVerifiedPhone,
  readVerifiedPhone,
  clearVerifiedPhone,
} from '../lib/auth';
import { slugify, dateKey } from '../lib/format';
import type { Member } from '../lib/types';

/** OtpError carries a user-safe message; anything else must not leak outward. */
function toActionError(error: unknown): ActionError {
  if (error instanceof OtpError) {
    const code = error.code === 'RATE_LIMITED' || error.code === 'COOLDOWN'
      ? 'TOO_MANY_REQUESTS'
      : 'BAD_REQUEST';
    return new ActionError({ code, message: error.message });
  }
  console.error('[auth]', error);
  return new ActionError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Something went wrong. Please try again.',
  });
}

const findMemberByPhone = (phone: string) =>
  first<Member>('members', 'SELECT * FROM members WHERE phone = ?', phone);

/** Ensures the slug is unique by suffixing a counter only when it collides. */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || 'player';

  for (let suffix = 0; suffix < 50; suffix++) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    if (!(await first('members', 'SELECT id FROM members WHERE slug = ?', candidate))) {
      return candidate;
    }
  }

  return `${base}-${Date.now().toString(36)}`;
}

export const auth = {
  /** Step 1 — send a WhatsApp OTP. */
  requestOtp: defineAction({
    accept: 'form',
    input: z.object({ phone: z.string().min(1, 'Enter your mobile number.') }),
    handler: async ({ phone }) => {
      try {
        const { phone: normalised, devCode } = await issueOtp(phone);
        return { phone: normalised, devCode };
      } catch (error) {
        throw toActionError(error);
      }
    },
  }),

  /**
   * Step 2 — verify the code. An existing member is signed in; a new number is
   * handed to the signup form with the verified phone held in a signed cookie.
   */
  verifyOtp: defineAction({
    accept: 'form',
    input: z.object({
      phone: z.string().min(1),
      code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
    }),
    handler: async ({ phone, code }, context) => {
      let verifiedPhone: string;
      try {
        verifiedPhone = await verifyOtp(phone, code);
      } catch (error) {
        throw toActionError(error);
      }

      const member = await findMemberByPhone(verifiedPhone);

      if (!member) {
        setVerifiedPhone(context.cookies, verifiedPhone);
        return { status: 'signup' as const, phone: verifiedPhone };
      }

      if (member.status === 'inactive') {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: 'This membership is inactive. Please contact a club admin.',
        });
      }

      startSession(context.cookies, member.id);
      clearVerifiedPhone(context.cookies);
      return { status: 'signed-in' as const, name: member.name };
    },
  }),

  /** Step 3 (new members only) — create the profile against the verified phone. */
  completeSignup: defineAction({
    accept: 'form',
    input: z.object({
      name: z.string().trim().min(2, 'Enter your full name.').max(80),
      city: z.string().trim().max(60).optional(),
      gender: z.enum(['male', 'female', 'other']).optional(),
      date_of_birth: z.string().optional(),
      skill_level: z
        .enum(['beginner', 'intermediate', 'advanced', 'competitive'])
        .optional(),
      is_public: z.coerce.boolean().optional(),
    }),
    handler: async (input, context) => {
      const phone = readVerifiedPhone(context.cookies);
      if (!phone) {
        throw new ActionError({
          code: 'UNAUTHORIZED',
          message: 'Your verification expired. Please start again.',
        });
      }

      // Guard the race where the same number signs up twice in parallel.
      if (await findMemberByPhone(phone)) {
        throw new ActionError({
          code: 'CONFLICT',
          message: 'An account already exists for this number. Try logging in.',
        });
      }

      const member = await insert<Member>('members', {
        phone,
        name: input.name,
        slug: await uniqueSlug(input.name),
        role: 'member',
        // `status` is about club membership, not dues. A new member is active
        // straight away; whether they currently owe anything is derived from
        // the payments ledger. Admins deactivate by hand when someone leaves.
        status: 'active',
        city: input.city || '',
        gender: input.gender,
        date_of_birth: input.date_of_birth || '',
        skill_level: input.skill_level ?? 'beginner',
        is_public: input.is_public ?? true,
        joined_on: dateKey(),
      });

      startSession(context.cookies, member.id);
      clearVerifiedPhone(context.cookies);

      return { status: 'signed-in' as const };
    },
  }),

  logout: defineAction({
    accept: 'form',
    handler: async (_input, context) => {
      clearSessionCookie(context.cookies);
      clearVerifiedPhone(context.cookies);
      return { ok: true };
    },
  }),
};
