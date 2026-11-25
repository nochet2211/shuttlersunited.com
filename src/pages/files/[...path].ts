import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { bucket } from '../../lib/files';

export const prerender = false;

const RESIZABLE = ['image/jpeg', 'image/png', 'image/webp'];
// Filenames carry a random suffix and are never rewritten in place.
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Serves uploads from R2: /files/<collection>/<record id>/<filename>.
 *
 *   ?thumb=200x200  resized through the Images binding — cropped to fill when
 *                   both sides are set, scaled to fit when one side is 0.
 *   ?download=1     sent as an attachment rather than shown inline.
 *
 * Responses go through the edge cache, so each thumbnail is transformed once
 * per data centre rather than once per view.
 */
export const GET: APIRoute = async ({ params, request, url }) => {
  const key = params.path;
  if (!key || key.split('/').length !== 3) return new Response('Not found', { status: 404 });

  const cache = (caches as unknown as { default: Cache }).default;
  const cached = await cache.match(request);
  if (cached) return cached;

  const object = await bucket().get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const contentType = object.httpMetadata?.contentType ?? 'application/octet-stream';
  const headers = new Headers({ 'content-type': contentType, 'cache-control': CACHE_CONTROL });
  if (url.searchParams.has('download')) {
    const filename = key.split('/').pop()!;
    headers.set('content-disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
  }

  const thumb = url.searchParams.get('thumb')?.match(/^(\d{1,4})x(\d{1,4})$/);
  let response: Response | null = null;
  if (thumb && RESIZABLE.includes(contentType)) {
    response = await resize(object.body, Number(thumb[1]), Number(thumb[2]));
    // A failed resize has consumed the stream, so the original is read again.
    if (!response) response = new Response((await bucket().get(key))!.body, { headers });
  }
  response ??= new Response(object.body, { headers });

  await cache.put(request, response.clone());
  return response;
};

async function resize(
  body: ReadableStream,
  width: number,
  height: number,
): Promise<Response | null> {
  try {
    const result = await (env as unknown as { IMAGES: ImagesBinding }).IMAGES.input(body)
      .transform({
        ...(width && { width }),
        ...(height && { height }),
        fit: width && height ? 'cover' : 'scale-down',
      })
      .output({ format: 'image/webp' });
    return new Response(result.response().body, {
      headers: { 'content-type': 'image/webp', 'cache-control': CACHE_CONTROL },
    });
  } catch (error) {
    // Out of free transformations, or the binding is unavailable in local
    // dev: the original still renders, just heavier.
    console.error('[files] thumbnail failed, serving the original', error);
    return null;
  }
}
