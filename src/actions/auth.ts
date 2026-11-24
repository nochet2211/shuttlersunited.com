import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { getAdminClient, isNotFound } from '../lib/pocketbase';
import { issueOtp, verifyOtp, OtpError } from '../lib/otp';
import { derivePassword, generateMemberId } from '../lib/member-password';
import { MEMBER_PASSWORD_SECRET } from 'astro:env/server';
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

async function findMemberByPhone(phone: string): Promise<Member | null> {
  const pb = await getAdminClient();
  try {
    return await pb
      .collection('members')
      .getFirstListItem<Member>(pb.filter('phone = {:phone}', { phone }));
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** Ensures the slug is unique by suffixing a counter only when it collides. */
async function uniqueSlug(name: string): Promise<string> {
  const pb = await getAdminClient();
  const base = slugify(name) || 'player';

  for (let suffix = 0; suffix < 50; suffix++) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    try {
      await pb
        .collection('members')
        .getFirstListItem(pb.filter('slug = {:slug}', { slug: candidate }));
    } catch (error) {
      if (isNotFound(error)) return candidate;
      throw error;
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

      await startSession(context.cookies, member.id, verifiedPhone);
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

      const pb = await getAdminClient();
      // Mint the id first so the derived password can be computed for `create`.
      const id = generateMemberId();
      const password = derivePassword(id, MEMBER_PASSWORD_SECRET);

      await pb.collection('members').create({
        id,
        phone,
        password,
        passwordConfirm: password,
        name: input.name,
        slug: await uniqueSlug(input.name),
        role: 'member',
        // `status` is about club membership, not dues. A new member is active
        // straight away; whether they currently owe anything is derived from
        // the payments ledger. Admins deactivate by hand when someone leaves.
        status: 'active',
        city: input.city || '',
        gender: input.gender,
        date_of_birth: input.date_of_birth || null,
        skill_level: input.skill_level ?? 'beginner',
        is_public: input.is_public ?? true,
        joined_on: dateKey(),
        emailVisibility: false,
        verified: true,
      });

      await startSession(context.cookies, id, phone);
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
