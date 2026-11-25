import { env } from 'cloudflare:workers';
import { randomBytes } from 'node:crypto';

/**
 * Uploads live in R2 under "<collection>/<record id>/<filename>" and are served
 * same-origin by src/pages/files/[...path].ts. The record stores only the
 * filename, as PocketBase did.
 */
export function bucket(): R2Bucket {
  return env.FILES;
}

/**
 * Builds a file URL. `thumb` asks the file route for a resized variant
 * (e.g. "200x200"), which keeps roster grids from shipping full-resolution
 * profile photos.
 */
export function fileUrl(
  collection: string,
  recordId: string,
  filename: string | undefined | null,
  thumb?: string,
): string | null {
  if (!filename) return null;
  const url = `/files/${collection}/${recordId}/${encodeURIComponent(filename)}`;
  return thumb ? `${url}?thumb=${thumb}` : url;
}

export const memberAvatar = (
  member: { id: string; avatar?: string },
  thumb = '200x200',
): string | null => fileUrl('members', member.id, member.avatar, thumb);

/**
 * Stores an upload and returns the filename to save on the record:
 * "Registration form.pdf" → "registration_form_x7k2m9q1ab.pdf". The random
 * suffix means a replaced file never collides with a cached copy of the old one.
 */
export async function storeFile(collection: string, recordId: string, file: File): Promise<string> {
  const dot = file.name.lastIndexOf('.');
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const base =
    (dot > 0 ? file.name.slice(0, dot) : file.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'file';
  const suffix = randomBytes(5).toString('hex');
  const filename = `${base}_${suffix}${ext ? `.${ext}` : ''}`;

  await bucket().put(`${collection}/${recordId}/${filename}`, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  });
  return filename;
}

export async function deleteFile(
  collection: string,
  recordId: string,
  filename: string | undefined | null,
): Promise<void> {
  if (filename) await bucket().delete(`${collection}/${recordId}/${filename}`);
}
