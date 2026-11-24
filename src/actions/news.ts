import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { getAdminClient } from '../lib/pocketbase';
import { slugify } from '../lib/format';
import type { Post } from '../lib/types';

/**
 * Newsroom writes. The posts collection has every write rule set to null, so
 * these actions are the only way a story is created or changed — and each one
 * checks admin first.
 */
function requireAdmin(locals: App.Locals): void {
  if (!locals.isAdmin) {
    // 404 rather than 403 — an admin surface shouldn't confirm it exists.
    throw new ActionError({ code: 'NOT_FOUND', message: 'Not found.' });
  }
}

const CATEGORIES = [
  'club',
  'tournament',
  'result',
  'governing-body',
  'facility',
  'notice',
] as const;

const coverSchema = z
  .instanceof(File)
  .optional()
  .refine((file) => !file || file.size <= 5_242_880, 'Images must be under 5 MB.')
  .refine(
    (file) => !file || file.size === 0 || ['image/jpeg', 'image/png', 'image/webp'].includes(file.type),
    'Use a JPEG, PNG or WebP image.',
  );

const storySchema = z.object({
  title: z.string().trim().min(4, 'Give the story a headline.').max(160),
  category: z.enum(CATEGORIES),
  summary: z.string().trim().min(10, 'Write a one- or two-line summary.').max(400),
  body: z.string().trim().max(20_000).optional(),
  source_name: z.string().trim().max(120).optional(),
  source_url: z
    .string()
    .trim()
    .max(500)
    .refine(
      (value) => value === '' || /^https?:\/\/\S+$/.test(value),
      'Enter a full URL starting with http:// or https://.',
    )
    .optional(),
  tournament: z.string().trim().optional(),
  // A datetime-local field, e.g. "2026-08-30T09:00". Empty means "now".
  published_at: z.string().trim().optional(),
  status: z.enum(['draft', 'published']),
  is_pinned: z.coerce.boolean().optional(),
  cover: coverSchema,
});

/**
 * "2026-08-30T09:00" (the editor's local wall clock, from a datetime-local
 * field) → "2026-08-30 03:30:00", the UTC shape PocketBase stores.
 *
 * The conversion has to happen: PocketBase appends a Z to whatever it is given,
 * so writing the local components straight through would file a story hours
 * away from when the editor said. StoryForm converts back on the way in.
 */
function toPocketBaseDate(value: string | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new ActionError({ code: 'BAD_REQUEST', message: 'That publication date is not valid.' });
  }
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * A slug free of collisions. The collection has a unique index on it, so
 * without this a second story sharing a headline fails with a database error
 * an editor cannot act on.
 */
async function uniqueSlug(title: string, ignoreId?: string): Promise<string> {
  const pb = await getAdminClient();
  const base = slugify(title).slice(0, 140) || 'story';

  for (let suffix = 0; suffix < 50; suffix++) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const clash = await pb.collection('posts').getList<Post>(1, 1, {
      filter: pb.filter('slug = {:slug}', { slug: candidate }),
    });
    if (clash.totalItems === 0 || clash.items[0]?.id === ignoreId) return candidate;
  }

  return `${base}-${Date.now()}`;
}

/** Field values shared by create and update. Never includes the cover file. */
function recordFrom(input: z.infer<typeof storySchema>, slug: string, authorId?: string) {
  return {
    title: input.title,
    slug,
    category: input.category,
    summary: input.summary,
    body: input.body ?? '',
    source_name: input.source_name ?? '',
    source_url: input.source_url ?? '',
    // PocketBase wants an empty string, not null, to clear a relation.
    tournament: input.tournament || '',
    published_at: toPocketBaseDate(input.published_at),
    status: input.status,
    is_pinned: input.is_pinned ?? false,
    ...(authorId ? { author: authorId } : {}),
  };
}

/** A cover is only written when one was actually chosen — an empty file input
 *  arrives as a zero-byte File, which would otherwise wipe the existing image. */
async function attachCover(id: string, cover: File | undefined): Promise<void> {
  if (!cover || cover.size === 0) return;
  const pb = await getAdminClient();
  const form = new FormData();
  form.append('cover', cover);
  await pb.collection('posts').update(id, form);
}

export const news = {
  createPost: defineAction({
    accept: 'form',
    input: storySchema,
    handler: async (input, context) => {
      requireAdmin(context.locals);
      const pb = await getAdminClient();

      const slug = await uniqueSlug(input.title);
      const created = await pb
        .collection('posts')
        .create<Post>(recordFrom(input, slug, context.locals.member?.id));

      await attachCover(created.id, input.cover);

      return { ok: true, id: created.id, slug };
    },
  }),

  updatePost: defineAction({
    accept: 'form',
    input: storySchema.extend({ id: z.string().min(1) }),
    handler: async ({ id, ...input }, context) => {
      requireAdmin(context.locals);
      const pb = await getAdminClient();

      // The slug only moves when the headline does, so a published URL that
      // someone has already shared survives a typo fix in the body.
      const existing = await pb.collection('posts').getOne<Post>(id);
      const slug =
        existing.title === input.title ? existing.slug : await uniqueSlug(input.title, id);

      await pb.collection('posts').update(id, recordFrom(input, slug));
      await attachCover(id, input.cover);

      return { ok: true, slug };
    },
  }),

  setStatus: defineAction({
    accept: 'form',
    input: z.object({ id: z.string().min(1), status: z.enum(['draft', 'published']) }),
    handler: async ({ id, status }, context) => {
      requireAdmin(context.locals);
      const pb = await getAdminClient();
      await pb.collection('posts').update(id, { status });
      return { ok: true };
    },
  }),

  /**
   * Pins a story to the top of the feed. Only one can hold the slot — a feed
   * with three "top stories" has none — so pinning clears whatever held it.
   */
  setPinned: defineAction({
    accept: 'form',
    input: z.object({ id: z.string().min(1), pinned: z.coerce.boolean() }),
    handler: async ({ id, pinned }, context) => {
      requireAdmin(context.locals);
      const pb = await getAdminClient();

      if (pinned) {
        const currentlyPinned = await pb
          .collection('posts')
          .getFullList<Post>({ filter: 'is_pinned = true', fields: 'id' });
        for (const post of currentlyPinned) {
          if (post.id !== id) await pb.collection('posts').update(post.id, { is_pinned: false });
        }
      }

      await pb.collection('posts').update(id, { is_pinned: pinned });
      return { ok: true };
    },
  }),

  deletePost: defineAction({
    accept: 'form',
    input: z.object({ id: z.string().min(1) }),
    handler: async ({ id }, context) => {
      requireAdmin(context.locals);
      const pb = await getAdminClient();
      await pb.collection('posts').delete(id);
      return { ok: true };
    },
  }),
};
