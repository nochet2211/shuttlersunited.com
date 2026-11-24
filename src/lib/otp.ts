import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import {
  GUPSHUP_API_KEY,
  GUPSHUP_SOURCE_NUMBER,
  GUPSHUP_APP_NAME,
  GUPSHUP_OTP_TEMPLATE_ID,
} from 'astro:env/server';
import { getAdminClient } from './pocketbase';
import type { OtpCode } from './types';

const CODE_LENGTH = 6;
const TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
/** Cooldown between sends to the same number, to blunt SMS-pumping abuse. */
const RESEND_COOLDOWN_SECONDS = 60;
/** Ceiling on codes issued to one number per hour. */
const MAX_PER_HOUR = 5;

export class OtpError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'INVALID_PHONE'
      | 'RATE_LIMITED'
      | 'COOLDOWN'
      | 'EXPIRED'
      | 'TOO_MANY_ATTEMPTS'
      | 'INCORRECT'
      | 'SEND_FAILED',
  ) {
    super(message);
    this.name = 'OtpError';
  }
}

/**
 * Normalises Indian mobile numbers to E.164. Accepts "9876543210",
 * "09876543210", "+91 98765 43210", "91-9876543210".
 */
export function normalisePhone(input: string): string {
  const digits = input.replace(/\D/g, '');

  let national = digits;
  if (national.startsWith('91') && national.length === 12) national = national.slice(2);
  else if (national.startsWith('0') && national.length === 11) national = national.slice(1);

  // Indian mobile numbers are 10 digits starting 6–9.
  if (!/^[6-9]\d{9}$/.test(national)) {
    throw new OtpError('Enter a valid 10-digit Indian mobile number.', 'INVALID_PHONE');
  }

  return `+91${national}`;
}

/** Display form: +91 98765 43210 */
export function formatPhone(e164: string): string {
  const national = e164.replace('+91', '');
  return `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
}

function hashCode(phone: string, code: string): string {
  // Salting with the phone number stops one rainbow table covering every row.
  return createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

/**
 * Issues a code and delivers it over WhatsApp. Returns the code only when no
 * provider is configured, so local development works without a Meta account.
 */
export async function issueOtp(rawPhone: string): Promise<{ phone: string; devCode?: string }> {
  const phone = normalisePhone(rawPhone);
  const pb = await getAdminClient();
  const now = Date.now();

  const recent = await pb.collection('otp_codes').getList<OtpCode>(1, 10, {
    filter: pb.filter('phone = {:phone} && created > {:since}', {
      phone,
      since: new Date(now - 60 * 60 * 1000).toISOString().replace('T', ' '),
    }),
    sort: '-created',
  });

  if (recent.items.length >= MAX_PER_HOUR) {
    throw new OtpError('Too many codes requested. Try again in an hour.', 'RATE_LIMITED');
  }

  const newest = recent.items[0] as (OtpCode & { created: string }) | undefined;
  if (newest && now - new Date(newest.created).getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
    throw new OtpError('Please wait a minute before requesting another code.', 'COOLDOWN');
  }

  const code = String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');

  await pb.collection('otp_codes').create({
    phone,
    code_hash: hashCode(phone, code),
    expires_at: new Date(now + TTL_MINUTES * 60 * 1000).toISOString().replace('T', ' '),
    attempts: 0,
    consumed: false,
  });

  const configured =
    GUPSHUP_API_KEY && GUPSHUP_SOURCE_NUMBER && GUPSHUP_APP_NAME && GUPSHUP_OTP_TEMPLATE_ID;

  if (!configured) {
    // Surfaced in the dev server log and returned to the login page so the flow
    // is testable end-to-end before Gupshup is provisioned.
    console.info(`[otp] WhatsApp not configured — code for ${phone} is ${code}`);
    return { phone, devCode: code };
  }

  await sendWhatsAppOtp(phone, code);
  return { phone };
}

async function sendWhatsAppOtp(phone: string, code: string): Promise<void> {
  const body = new URLSearchParams({
    channel: 'whatsapp',
    source: GUPSHUP_SOURCE_NUMBER!,
    // Gupshup wants the destination without the leading "+".
    destination: phone.replace('+', ''),
    'src.name': GUPSHUP_APP_NAME!,
    template: JSON.stringify({ id: GUPSHUP_OTP_TEMPLATE_ID, params: [code] }),
  });

  const response = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
    method: 'POST',
    headers: {
      apikey: GUPSHUP_API_KEY!,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    // Never let the provider's response reach the user — it can echo the payload.
    console.error(`[otp] Gupshup send failed (${response.status}):`, await response.text());
    throw new OtpError('Could not send the code right now. Please try again.', 'SEND_FAILED');
  }
}

/** Verifies a code and burns it. Returns the normalised phone on success. */
export async function verifyOtp(rawPhone: string, code: string): Promise<string> {
  const phone = normalisePhone(rawPhone);
  const pb = await getAdminClient();

  let record: OtpCode;
  try {
    record = await pb.collection('otp_codes').getFirstListItem<OtpCode>(
      pb.filter('phone = {:phone} && consumed = false', { phone }),
      { sort: '-created' },
    );
  } catch {
    throw new OtpError('That code has expired. Request a new one.', 'EXPIRED');
  }

  if (new Date(record.expires_at).getTime() < Date.now()) {
    throw new OtpError('That code has expired. Request a new one.', 'EXPIRED');
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    throw new OtpError('Too many incorrect attempts. Request a new code.', 'TOO_MANY_ATTEMPTS');
  }

  const expected = Buffer.from(record.code_hash);
  const actual = Buffer.from(hashCode(phone, code.trim()));
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) {
    await pb.collection('otp_codes').update(record.id, { attempts: record.attempts + 1 });
    throw new OtpError('That code is incorrect.', 'INCORRECT');
  }

  await pb.collection('otp_codes').update(record.id, { consumed: true });
  return phone;
}
