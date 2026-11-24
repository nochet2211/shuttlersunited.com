import { createHmac, randomBytes } from 'node:crypto';

/**
 * Members authenticate with a WhatsApp OTP and never see or type a password.
 * PocketBase, however, needs one to issue a real (refreshable) auth token and
 * to make its per-record API rules meaningful.
 *
 * So we derive a password deterministically from a server secret and the
 * member's id. Nothing is stored in plaintext anywhere, the value is
 * recomputed on demand, and PocketBase only ever holds its bcrypt hash.
 *
 * Rotating MEMBER_PASSWORD_SECRET invalidates every derived password, which
 * would require a re-derivation pass over the members collection. Treat it as
 * long-lived, and keep it distinct from the cookie signing secret.
 */
export function derivePassword(memberId: string, secret: string): string {
  return createHmac('sha256', secret).update(`member:${memberId}`).digest('base64url');
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * PocketBase record ids are 15 lowercase alphanumeric characters. We mint the
 * id ourselves so the password can be derived before the record is created.
 */
export function generateMemberId(): string {
  const bytes = randomBytes(15);
  let id = '';
  for (const byte of bytes) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}
