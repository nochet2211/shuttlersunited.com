import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { getAdminClient } from '../lib/pocketbase';
import type { Member } from '../lib/types';

function requireMember(locals: App.Locals): Member {
  if (!locals.member) {
    throw new ActionError({ code: 'UNAUTHORIZED', message: 'Please log in.' });
  }
  return locals.member;
}

export const profile = {
  /**
   * Self-service profile edit. The input schema *is* the allow-list: `role`,
   * `status`, `phone` and `slug` are absent, so no amount of extra form fields
   * can escalate a member's own privileges.
   */
  update: defineAction({
    accept: 'form',
    input: z.object({
      name: z.string().trim().min(2).max(80),
      bio: z.string().trim().max(600).optional(),
      city: z.string().trim().max(60).optional(),
      date_of_birth: z.string().optional(),
      gender: z.enum(['male', 'female', 'other']).optional(),
      height_cm: z.coerce.number().min(100).max(250).optional(),
      handedness: z.enum(['right', 'left']).optional(),
      play_style: z.enum(['attacking', 'defensive', 'all-round']).optional(),
      preferred_events: z.array(z.enum(['MS', 'WS', 'MD', 'WD', 'XD'])).optional(),
      jersey_number: z.coerce.number().min(0).max(999).optional(),
      skill_level: z.enum(['beginner', 'intermediate', 'advanced', 'competitive']).optional(),
      emergency_contact: z.string().trim().max(16).optional(),
      is_public: z.coerce.boolean().optional(),
    }),
    handler: async (input, context) => {
      const member = requireMember(context.locals);
      const pb = await getAdminClient();

      await pb.collection('members').update(member.id, {
        ...input,
        bio: input.bio ?? '',
        city: input.city ?? '',
        emergency_contact: input.emergency_contact ?? '',
        date_of_birth: input.date_of_birth || null,
        preferred_events: input.preferred_events ?? [],
        is_public: input.is_public ?? false,
      });

      return { ok: true };
    },
  }),

  uploadAvatar: defineAction({
    accept: 'form',
    input: z.object({
      avatar: z
        .instanceof(File)
        .refine((file) => file.size > 0, 'Choose an image.')
        .refine((file) => file.size <= 5_242_880, 'Images must be under 5 MB.')
        .refine(
          (file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type),
          'Use a JPEG, PNG or WebP image.',
        ),
    }),
    handler: async ({ avatar }, context) => {
      const member = requireMember(context.locals);
      const pb = await getAdminClient();

      const form = new FormData();
      form.append('avatar', avatar);
      await pb.collection('members').update(member.id, form);

      return { ok: true };
    },
  }),

  addGear: defineAction({
    accept: 'form',
    input: z.object({
      category: z.enum(['racket', 'string', 'grip', 'shoes', 'shuttle', 'bag', 'apparel']),
      brand: z.string().trim().min(1, 'Enter a brand.').max(60),
      model: z.string().trim().min(1, 'Enter a model.').max(80),
      spec: z.string().trim().max(80).optional(),
      notes: z.string().trim().max(300).optional(),
      is_current: z.coerce.boolean().optional(),
    }),
    handler: async (input, context) => {
      const member = requireMember(context.locals);
      const pb = await getAdminClient();

      const gear = await pb.collection('gear').create({
        ...input,
        member: member.id,
        spec: input.spec ?? '',
        notes: input.notes ?? '',
        is_current: input.is_current ?? true,
      });

      return { id: gear.id };
    },
  }),

  removeGear: defineAction({
    accept: 'form',
    input: z.object({ id: z.string().min(1) }),
    handler: async ({ id }, context) => {
      const member = requireMember(context.locals);
      const pb = await getAdminClient();

      // The admin client bypasses API rules, so ownership must be checked here.
      const gear = await pb.collection('gear').getOne(id);
      if (gear.member !== member.id && context.locals.isAdmin !== true) {
        throw new ActionError({ code: 'FORBIDDEN', message: 'That is not your gear.' });
      }

      await pb.collection('gear').delete(id);
      return { ok: true };
    },
  }),
};
