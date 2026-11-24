import { defineMiddleware } from 'astro:middleware';
import { resolveMember, isAdmin } from './lib/auth';

/** Route prefixes that require a signed-in member, and those that require an admin. */
const MEMBER_ROUTES = ['/dashboard', '/book'];
const ADMIN_ROUTES = ['/admin'];

const startsWithAny = (path: string, prefixes: string[]) =>
  prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

export const onRequest = defineMiddleware(async (context, next) => {
  const member = await resolveMember(context.cookies);
  context.locals.member = member;
  context.locals.isAdmin = isAdmin(member);

  const { pathname } = context.url;

  if (!member && startsWithAny(pathname, [...MEMBER_ROUTES, ...ADMIN_ROUTES])) {
    // Carry the destination so login can return the member where they meant to go.
    const destination = encodeURIComponent(pathname + context.url.search);
    return context.redirect(`/login?next=${destination}`);
  }

  if (startsWithAny(pathname, ADMIN_ROUTES) && !context.locals.isAdmin) {
    return new Response('Not found', { status: 404 });
  }

  return next();
});
