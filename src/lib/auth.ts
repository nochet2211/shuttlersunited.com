import type { AstroCookies } from 'astro';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AUTH_COOKIE_SECRET, MEMBER_PASSWORD_SECRET } from 'astro:env/server';
import { createClient } from './pocketbase';
import { derivePassword } from './member-password';
import type { Member } from './types';

const COOKIE_NAME = 'su_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * The cookie holds the PocketBase auth token, HMAC-signed so a tampered or
 * forged cookie is rejected before it ever reaches PocketBase.
 */
function sign(value: string): string {
  return createHmac('sha256', AUTH_COOKIE_SECRET).update(value).digest('base64url');
}

function verifySignature(value: string, signature: string): boolean {
  const expected = Buffer.from(sign(value));
  const actual = Buffer.from(signature);
  // Length must match before timingSafeEqual, which throws on a mismatch.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function setSessionCookie(cookies: AstroCookies, token: string): void {
  cookies.set(COOKIE_NAME, `${token}.${sign(token)}`, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(cookies: AstroCookies): void {
  cookies.delete(COOKIE_NAME, { path: '/' });
}

function readToken(cookies: AstroCookies): string | null {
  const raw = cookies.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  // The token is a JWT and contains dots, so split from the right.
  const separator = raw.lastIndexOf('.');
  if (separator === -1) return null;

  const token = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);

  return verifySignature(token, signature) ? token : null;
}

/**
 * Resolves the signed-in member, or null. Refreshing against PocketBase on each
 * request costs one round trip but means a deactivated member loses access
 * immediately rather than when their token happens to expire.
 */
export async function resolveMember(cookies: AstroCookies): Promise<Member | null> {
  const token = readToken(cookies);
  if (!token) return null;

  const pb = createClient();
  pb.authStore.save(token, null);

  try {
    const { record } = await pb.collection('members').authRefresh();
    const member = record as unknown as Member;

    if (member.status !== 'active') {
      clearSessionCookie(cookies);
      return null;
    }

    // The refresh hands back a rotated token; keep the cookie current.
    if (pb.authStore.token && pb.authStore.token !== token) {
      setSessionCookie(cookies, pb.authStore.token);
    }

    return member;
  } catch {
    clearSessionCookie(cookies);
    return null;
  }
}

export function isAdmin(member: Member | null): boolean {
  return member?.role === 'admin';
}

/* ---------------------------------------------------------------------------
 * Signup handoff
 *
 * Between "OTP verified" and "profile submitted" we need to remember which
 * phone number was proved, without trusting the browser to tell us. A short
 * signed cookie carries it across that one hop.
 * ------------------------------------------------------------------------- */

const PENDING_COOKIE = 'su_pending';
const PENDING_TTL_SECONDS = 15 * 60;

export function setVerifiedPhone(cookies: AstroCookies, phone: string): void {
  const payload = `${phone}:${Date.now() + PENDING_TTL_SECONDS * 1000}`;
  cookies.set(PENDING_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: PENDING_TTL_SECONDS,
  });
}

export function readVerifiedPhone(cookies: AstroCookies): string | null {
  const raw = cookies.get(PENDING_COOKIE)?.value;
  if (!raw) return null;

  const separator = raw.lastIndexOf('.');
  if (separator === -1) return null;

  const payload = raw.slice(0, separator);
  if (!verifySignature(payload, raw.slice(separator + 1))) return null;

  const [phone, expiresAt] = payload.split(':');
  if (!phone || Number(expiresAt) < Date.now()) return null;

  return phone;
}

export function clearVerifiedPhone(cookies: AstroCookies): void {
  cookies.delete(PENDING_COOKIE, { path: '/' });
}

/** Signs a member in by minting a real PocketBase auth token for them. */
export async function startSession(
  cookies: AstroCookies,
  memberId: string,
  phone: string,
): Promise<void> {
  const pb = createClient();
  await pb
    .collection('members')
    .authWithPassword(phone, derivePassword(memberId, MEMBER_PASSWORD_SECRET));

  setSessionCookie(cookies, pb.authStore.token);
}
