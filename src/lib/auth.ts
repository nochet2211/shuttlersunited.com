import type { AstroCookies } from 'astro';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AUTH_COOKIE_SECRET } from 'astro:env/server';
import { getById } from './db';
import type { Member } from './types';

const COOKIE_NAME = 'su_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * The cookie holds "<member id>:<expiry ms>", HMAC-signed so a tampered or
 * forged cookie is rejected before it reaches the database.
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

function setSessionCookie(cookies: AstroCookies, memberId: string): void {
  const payload = `${memberId}:${Date.now() + MAX_AGE_SECONDS * 1000}`;
  cookies.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
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

function readMemberId(cookies: AstroCookies): string | null {
  const raw = cookies.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const separator = raw.lastIndexOf('.');
  if (separator === -1) return null;

  const payload = raw.slice(0, separator);
  if (!verifySignature(payload, raw.slice(separator + 1))) return null;

  const [memberId, expiresAt] = payload.split(':');
  if (!memberId || !(Number(expiresAt) > Date.now())) return null;

  return memberId;
}

/**
 * Resolves the signed-in member, or null. Loading the row on each request costs
 * one query but means a deactivated member loses access immediately rather
 * than when their cookie happens to expire.
 */
export async function resolveMember(cookies: AstroCookies): Promise<Member | null> {
  const memberId = readMemberId(cookies);
  if (!memberId) return null;

  try {
    const member = await getById<Member>('members', memberId);
    if (member?.status !== 'active') {
      clearSessionCookie(cookies);
      return null;
    }
    return member;
  } catch (error) {
    // A database fault is not a reason to sign everyone out.
    console.error('[auth] could not load the session member', error);
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

/** Signs a member in. The OTP check has already proved they own the phone. */
export function startSession(cookies: AstroCookies, memberId: string): void {
  setSessionCookie(cookies, memberId);
}
