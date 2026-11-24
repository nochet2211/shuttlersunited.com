import { POCKETBASE_URL } from 'astro:env/server';

/**
 * Builds a PocketBase file URL. `thumb` asks PocketBase to generate and cache a
 * resized variant (e.g. "200x200"), which keeps roster grids from shipping
 * full-resolution profile photos.
 */
export function fileUrl(
  collection: string,
  recordId: string,
  filename: string | undefined | null,
  thumb?: string,
): string | null {
  if (!filename) return null;
  const url = `${POCKETBASE_URL}/api/files/${collection}/${recordId}/${filename}`;
  return thumb ? `${url}?thumb=${thumb}` : url;
}

export const memberAvatar = (
  member: { id: string; avatar?: string },
  thumb = '200x200',
): string | null => fileUrl('members', member.id, member.avatar, thumb);
