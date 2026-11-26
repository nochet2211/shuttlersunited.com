import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { env } from 'cloudflare:workers';
import { getById, insert, newId, remove, update } from '../lib/db';
import { deleteFile, storeFile } from '../lib/files';
import type { GalleryPhoto } from '../lib/types';

/** Gallery writes are admin-only; the public only ever reads. */
function requireAdmin(locals: App.Locals): void {
  if (!locals.isAdmin) {
    // 404 rather than 403 — an admin surface shouldn't confirm it exists.
    throw new ActionError({ code: 'NOT_FOUND', message: 'Not found.' });
  }
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * The photo's pixel size, so the grid can give a portrait shot a tall tile.
 * Unknown (0 × 0) when the Images binding can't read it, e.g. in local dev;
 * the photo then just gets a square tile.
 */
async function dimensions(file: File): Promise<{ width: number; height: number }> {
  try {
    const info = await (env as unknown as { IMAGES: ImagesBinding }).IMAGES.info(file.stream());
    return 'width' in info ? { width: info.width, height: info.height } : { width: 0, height: 0 };
  } catch {
    return { width: 0, height: 0 };
  }
}

const captionSchema = z.string().trim().max(300, 'Keep the caption under 300 characters.');
const creditSchema = z.string().trim().max(120).optional();

export const gallery = {
  addPhoto: defineAction({
    accept: 'form',
    input: z.object({
      photo: z
        .instanceof(File)
        .refine((file) => file.size > 0, 'Choose a photo.')
        .refine((file) => file.size <= 10_485_760, 'Photos must be under 10 MB.')
        .refine((file) => IMAGE_TYPES.includes(file.type), 'Use a JPEG, PNG or WebP image.'),
      caption: captionSchema,
      credit: creditSchema,
    }),
    handler: async ({ photo, caption, credit }, context) => {
      requireAdmin(context.locals);

      // The id is minted first because the file is stored under it.
      const id = newId();
      const image = await storeFile('gallery', id, photo);
      const { width, height } = await dimensions(photo);

      await insert<GalleryPhoto>('gallery', {
        id,
        image,
        caption,
        credit: credit ?? '',
        width,
        height,
      });
      return { id };
    },
  }),

  updatePhoto: defineAction({
    accept: 'form',
    input: z.object({ id: z.string().min(1), caption: captionSchema, credit: creditSchema }),
    handler: async ({ id, caption, credit }, context) => {
      requireAdmin(context.locals);
      await update('gallery', id, { caption, credit: credit ?? '' });
      return { ok: true };
    },
  }),

  removePhoto: defineAction({
    accept: 'form',
    input: z.object({ id: z.string().min(1) }),
    handler: async ({ id }, context) => {
      requireAdmin(context.locals);

      const photo = await getById<GalleryPhoto>('gallery', id);
      if (photo) {
        await remove('gallery', id);
        await deleteFile('gallery', id, photo.image);
      }
      return { ok: true };
    },
  }),
};
