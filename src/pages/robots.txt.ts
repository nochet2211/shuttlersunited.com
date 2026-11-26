import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Crawlers get the public site and its images. Kept out: everything behind a
 * login, the sign-in and sign-up flow, form and webhook endpoints, and the
 * one-off /launch page.
 */
export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://shuttlersunited.com')).origin;

  const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /dashboard
Disallow: /login
Disallow: /join
Disallow: /launch
Disallow: /api/
Disallow: /_actions/

Sitemap: ${origin}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=86400',
    },
  });
};
