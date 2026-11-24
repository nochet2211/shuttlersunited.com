#!/usr/bin/env node
/**
 * Seeds the club's pilot member profile — the first real player on the roster,
 * used to sanity-check the profile page against actual content instead of
 * lorem ipsum.
 *
 *   node scripts/seed-pilot-member.mjs --phone=+919000000000
 *   PILOT_PHONE=+919000000000 node scripts/seed-pilot-member.mjs
 *
 * Idempotent: matched on `slug`, so re-running updates the record (including
 * the phone, if you pass a different one) rather than creating a duplicate.
 */
import PocketBase from 'pocketbase';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// --- env ---------------------------------------------------------------------

function loadEnv() {
  try {
    for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match) process.env[match[1]] ??= match[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    // No .env file — rely on the ambient environment.
  }
}
loadEnv();

const URL_BASE = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;
const PASSWORD_SECRET = process.env.MEMBER_PASSWORD_SECRET;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !PASSWORD_SECRET) {
  console.error(
    'Set POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD and MEMBER_PASSWORD_SECRET (see .env.example).',
  );
  process.exit(1);
}

// The phone is the login identity, so it has to come from outside this file.
// The placeholder keeps the seed runnable on a fresh checkout; swap it for the
// real number and re-run to move the account onto it.
const PLACEHOLDER_PHONE = '+910000000000';
const phoneArg = process.argv.find((arg) => arg.startsWith('--phone='))?.slice('--phone='.length);
const PHONE = phoneArg || process.env.PILOT_PHONE || PLACEHOLDER_PHONE;

if (!/^\+\d{10,15}$/.test(PHONE)) {
  console.error(`Not an E.164 phone number: ${PHONE}  (expected e.g. +919876543210)`);
  process.exit(1);
}

// --- the profile -------------------------------------------------------------

const AVATAR_PATH = fileURLToPath(new URL('../public/ben.jpeg', import.meta.url));

const PILOT = {
  slug: 'bendangnochet-imchen',
  name: 'Bendangnochet Imchen',
  role: 'admin',
  status: 'active',
  handedness: 'right',
  play_style: 'all-round',
  skill_level: 'intermediate',
  preferred_events: ['MD'],
  gender: 'male',
  is_public: true,
  bio: 'Right-handed all-round doubles player and one of the founding members of Shuttlers United. Splits time between the front court and running the club.',
};

// `is_current` is what the profile page reads for "In the bag", so both rackets
// stay true; `spec` carries the primary/secondary distinction.
const GEAR = [
  { category: 'racket', brand: 'Victor', model: 'Ryuga Metallic', spec: 'Primary racket', is_current: true },
  { category: 'racket', brand: 'Yonex', model: 'Nanoflare 700', spec: 'Secondary racket', is_current: true },
];

// --- helpers -----------------------------------------------------------------

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Mirrors src/lib/member-password.ts so OTP login works for a seeded record. */
const derivePassword = (memberId, secret) =>
  createHmac('sha256', secret).update(`member:${memberId}`).digest('base64url');

function generateMemberId() {
  let id = '';
  for (const byte of randomBytes(15)) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

/** Today as YYYY-MM-DD, matching `dateKey()` in src/lib/format.ts. */
const dateKey = () => new Date().toISOString().slice(0, 10);

const pb = new PocketBase(URL_BASE);
pb.autoCancellation(false);

async function findBy(collection, filter, params) {
  try {
    return await pb.collection(collection).getFirstListItem(pb.filter(filter, params));
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}

// --- run ---------------------------------------------------------------------

try {
  await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
} catch (error) {
  console.error(`Could not authenticate against ${URL_BASE}.`);
  console.error('Is PocketBase running, and is the superuser created?');
  console.error(error?.message ?? error);
  process.exit(1);
}

try {
  console.log(`\nSeeding pilot member on ${URL_BASE}\n`);

  const existing = await findBy('members', 'slug = {:slug}', { slug: PILOT.slug });

  // The avatar is sent as multipart — PocketBase only accepts file fields that
  // way, so the whole payload goes through FormData.
  const form = new FormData();
  for (const [key, value] of Object.entries(PILOT)) {
    if (Array.isArray(value)) for (const item of value) form.append(key, item);
    else form.append(key, String(value));
  }
  form.append('phone', PHONE);
  form.append('avatar', new Blob([readFileSync(AVATAR_PATH)], { type: 'image/jpeg' }), 'ben.jpeg');

  let member;
  if (existing) {
    member = await pb.collection('members').update(existing.id, form);
    console.log(`  updated  member   ${member.name}`);
  } else {
    const id = generateMemberId();
    const password = derivePassword(id, PASSWORD_SECRET);
    form.append('id', id);
    form.append('password', password);
    form.append('passwordConfirm', password);
    form.append('joined_on', dateKey());
    form.append('emailVisibility', 'false');
    form.append('verified', 'true');
    member = await pb.collection('members').create(form);
    console.log(`  created  member   ${member.name}`);
  }

  console.log(`           phone    ${PHONE}${PHONE === PLACEHOLDER_PHONE ? '  (placeholder — re-run with --phone=)' : ''}`);
  console.log(`           profile  /players/${member.slug}`);

  for (const item of GEAR) {
    const row = { ...item, member: member.id };
    const found = await findBy('gear', 'member = {:member} && brand = {:brand} && model = {:model}', {
      member: member.id,
      brand: item.brand,
      model: item.model,
    });
    if (found) await pb.collection('gear').update(found.id, row);
    else await pb.collection('gear').create(row);
    console.log(`  ${found ? 'updated' : 'created'}  gear     ${item.brand} ${item.model}`);
  }

  console.log('\nDone.\n');
} catch (error) {
  console.error('\nFailed:', error?.message ?? error);
  if (error?.response) console.error(JSON.stringify(error.response, null, 2));
  process.exit(1);
}
