import type { APIRoute } from 'astro';
import { all } from '../lib/db';
import { galleryImage } from '../lib/files';
import type { GalleryPhoto } from '../lib/types';

export const prerender = false;

/**
 * The sitemap, built from the database on each request so a new story, fixture,
 * public profile or photo is listed without a redeploy. Only what anyone can
 * see goes in: published stories, public active members, and nothing behind a
 * login (robots.txt keeps crawlers out of those too).
 *
 * Gallery photos carry their image, so they can surface in Google Images.
 */
const STATIC_PAGES = [
  '/',
  '/news',
  '/tournaments',
  '/members',
  '/gallery',
  '/contact',
  '/terms',
  '/privacy',
];

interface Row {
  slug?: string;
  id?: string;
  updated: string;
}

/** "2026-11-25 09:47:59.361Z" → "2026-11-25", the form sitemaps take. */
const day = (stamp: string) => stamp.slice(0, 10);

const escape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://shuttlersunited.com')).origin;
  const url = (path: string) => escape(new URL(path, origin).href);

  const [posts, tournaments, members, photos] = await Promise.all([
    all<Row>('posts', "SELECT slug, updated FROM posts WHERE status = 'published'"),
    all<Row>('tournaments', 'SELECT slug, updated FROM tournaments'),
    all<Row>(
      'members',
      "SELECT slug, updated FROM members WHERE is_public = 1 AND status = 'active'",
    ),
    all<GalleryPhoto>('gallery', 'SELECT * FROM gallery ORDER BY created DESC'),
  ]);

  const entry = (path: string, updated?: string, extra = '') =>
    `  <url>\n    <loc>${url(path)}</loc>\n${
      updated ? `    <lastmod>${day(updated)}</lastmod>\n` : ''
    }${extra}  </url>`;

  const entries = [
    ...STATIC_PAGES.map((path) => entry(path)),
    ...posts.map((row) => entry(`/news/${row.slug}`, row.updated)),
    ...tournaments.map((row) => entry(`/tournaments/${row.slug}`, row.updated)),
    ...members.map((row) => entry(`/members/${row.slug}`, row.updated)),
    ...photos.map((photo) =>
      entry(
        `/gallery/${photo.id}`,
        photo.updated,
        `    <image:image>\n      <image:loc>${url(galleryImage(photo)!)}</image:loc>\n    </image:image>\n`,
      ),
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.join('\n')}
</urlset>
`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
