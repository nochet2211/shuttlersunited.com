#!/usr/bin/env node
/**
 * Seeds the club roster from the 2026 fee collection register (pages 1–6),
 * in register order, so the members list carries the real club rather than
 * an empty state.
 *
 *   node scripts/seed-roster.mjs
 *
 * Names only: the register's fee columns are private and stay off the site.
 * The register has no phone numbers, but phone is the login identity, so each
 * record gets a placeholder in +91000000xxxx — a range no Indian mobile uses —
 * keyed on the register serial. Replace it with the member's real number
 * before they log in, or signing up will create a second record.
 *
 * Idempotent: matched on `slug`. An existing record is left as it is, so this
 * never overwrites a profile a member has already filled in — except for
 * `office`, `competes_at` and `honours`, which the club assigns, so a listed
 * value is always applied.
 */
import PocketBase from 'pocketbase';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

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
const PASSWORD_SECRET = process.env.MEMBER_PASSWORD_SECRET;

if (!process.env.POCKETBASE_ADMIN_EMAIL || !process.env.POCKETBASE_ADMIN_PASSWORD || !PASSWORD_SECRET) {
  console.error(
    'Set POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD and MEMBER_PASSWORD_SECRET (see .env.example).',
  );
  process.exit(1);
}

/**
 * Register order, serials 1–78. Spellings follow the handwriting; titles
 * (Dr., Er., Rev.) are kept because the register uses them to tell people
 * apart. A slug is given only where the record already exists under it, and
 * an office only for office bearers, and a playing level only for members
 * who compete for the club. Honours and gear are listed where the club has them.
 */
const ROSTER = [
  { name: 'Akangyanger', office: 'Executive Member' },
  'Akok Walling',
  'Alezo Kedetsu',
  'Along Nokdir',
  { name: 'Amai Chingkhu', office: 'President' },
  'Andy Richard',
  'Anjit',
  'Baumei',
  'Bendang PWD',
  { name: 'Bendang Pongen', office: 'Finance Convenor' },
  'Bendangyanger',
  { name: 'Chansu', office: 'General Secretary' },
  'Chumlanthung',
  { name: 'Dr. Benjong Imchen', office: 'Executive Member' },
  'Dr. Benrithung Ngullie',
  { name: 'Dr. Chubakumzuk Longchar', office: 'Treasurer' },
  'Dr. Kumzuk',
  { name: 'Er. Oren Ovung', office: 'Executive Member' },
  'Er. Temsu Aier',
  'I. Sentiwapang',
  { name: 'Imlitemjen', office: 'Finance Member' },
  'Imkong Jamir',
  'K. Ezung',
  'Katemjongshi',
  'Lanuakum',
  'Lipok Jamir',
  'Luther Anar',
  'Meren Lemtur',
  'Meyi Aier',
  'Nukshi Imchen',
  'Opendro Yumnam',
  'Phejei',
  'Purnungsang Jamir',
  'Puryapang Lkr',
  'R. Bendang Yaden',
  'Rev. Lima Jamir',
  'Raj Kumar Das',
  'Rongsennuklu',
  'S. Bendang Imsong',
  { name: 'S. Meren Ao', office: 'Executive Member' },
  {
    name: 'Salang Jamir',
    competes_at: 'state',
    // Career honours as the club records them: no dated tournament behind
    // them, so not tournament entries (those are in scripts/seed-results.mjs).
    honours: [
      { title: 'U-13 Singles District Champion', medal: 'gold' },
      { title: 'U-16 Singles District Champion', medal: 'gold' },
      { title: 'U-16 Singles State Runner-up', medal: 'silver' },
      { title: 'U-19 Doubles State Champion', partner: 'Imolong Jamir', medal: 'gold', count: 2 },
      { title: 'Nagaland State & Para Games 2022, Doubles Bronze', partner: 'Imolong Jamir',
        medal: 'bronze' },
      { title: 'Nagaland State & Para Games 2024, Singles Bronze', medal: 'bronze' },
      { title: '1st All Assam Non-Ranking Badminton Tournament 2022 Champion',
        partner: 'Imolong Jamir', medal: 'gold' },
      { title: 'Ao Students\' Union Autumn Huddle Tournament 2026 Champion',
        partner: 'Imolong Jamir', medal: 'gold' },
      { title: 'North East Games Team Silver', medal: 'silver' },
    ],
    gear: [
      { category: 'racket', brand: 'Yonex', model: 'ArcSaber 11 Pro' },
      { category: 'shoes', brand: 'Victor', model: 'P9200HANG A' },
    ],
  },
  'Solo Kath',
  'Sujit Roy',
  'Supongtemsu Pongen',
  'Tali Pongener',
  { name: 'Talimoa Longchar', office: 'Executive Member' },
  'Temjen Lemtur',
  { name: 'Temjennungsang', office: 'Finance Member' },
  'Temjentoshi Jamir',
  'Vilabielie Khing',
  'Wangba Konyak',
  'Watitemjen',
  'Nadu Yaden',
  'Lipok Pongen',
  'P. Bendangmongba',
  // The register has "Bendangnochet"; the pilot profile already holds this slug.
  { name: 'Bendangnochet Imchen', slug: 'bendangnochet-imchen' },
  'Atsung Jamir',
  'Wabongtoshi',
  'Wiridin',
  'Lendi',
  'Irang',
  'Imliwabang',
  'Avikie Nisa',
  'Arenkaba',
  'Dr. Chingei Phom',
  'Abung',
  'Supong Longchar',
  'Temsuwapang',
  'Meyiyanger Aier',
  'Moanungsang',
  'Sital Kr Jain',
  'Anil Kr Pareek',
  'Kushal Jain',
  'Shanky Jain',
  'Rohit Ajmera',
  'Sanjay Sethi',
  'Samuel Lkr',
  'Jongshi',
];

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Mirrors src/lib/member-password.ts so OTP login works for a seeded record. */
const derivePassword = (memberId, secret) =>
  createHmac('sha256', secret).update(`member:${memberId}`).digest('base64url');

function generateMemberId() {
  let id = '';
  for (const byte of randomBytes(15)) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

const pb = new PocketBase(URL_BASE);
pb.autoCancellation(false);

/** What a member plays with, matched on member + brand + model. */
async function syncGear(memberId, name, items) {
  for (const item of items) {
    const row = { member: memberId, is_current: true, ...item };
    let found = null;
    try {
      found = await pb.collection('gear').getFirstListItem(
        pb.filter('member = {:m} && brand = {:b} && model = {:model}',
          { m: memberId, b: item.brand, model: item.model }),
      );
    } catch (error) {
      if (error?.status !== 404) throw error;
    }
    if (found) await pb.collection('gear').update(found.id, row);
    else {
      await pb.collection('gear').create(row);
      console.log(`  gear     ${name} — ${item.brand} ${item.model}`);
    }
  }
}

try {
  await pb
    .collection('_superusers')
    .authWithPassword(process.env.POCKETBASE_ADMIN_EMAIL, process.env.POCKETBASE_ADMIN_PASSWORD);
} catch (error) {
  console.error(`Could not authenticate against ${URL_BASE}.`);
  console.error(error?.message ?? error);
  process.exit(1);
}

try {
  const existing = new Map(
    (await pb.collection('members').getFullList({ fields: 'id,slug,office,competes_at,honours' })).map((member) => [
      member.slug,
      member,
    ]),
  );

  let created = 0;
  for (const [index, entry] of ROSTER.entries()) {
    const { name, slug = slugify(name), office, competes_at, honours, gear } =
      typeof entry === 'string' ? { name: entry } : entry;
    const record = existing.get(slug);
    if (record) {
      if (office && record.office !== office) {
        await pb.collection('members').update(record.id, { office });
        console.log(`  office   ${name} — ${office}`);
      }
      if (competes_at && record.competes_at !== competes_at) {
        await pb.collection('members').update(record.id, { competes_at });
        console.log(`  level    ${name} — ${competes_at}`);
      }
      if (honours && JSON.stringify(record.honours) !== JSON.stringify(honours)) {
        await pb.collection('members').update(record.id, { honours });
        console.log(`  honours  ${name} — ${honours.length}`);
      }
      if (gear) await syncGear(record.id, name, gear);
      continue;
    }

    const id = generateMemberId();
    const password = derivePassword(id, PASSWORD_SECRET);
    await pb.collection('members').create({
      id,
      name,
      slug,
      phone: `+91000000${String(index + 1).padStart(4, '0')}`,
      password,
      passwordConfirm: password,
      role: 'member',
      status: 'active',
      city: 'Dimapur',
      is_public: true,
      ...(office && { office }),
      ...(competes_at && { competes_at }),
      ...(honours && { honours }),
    });
    existing.set(slug, { id, slug, office, competes_at, honours });
    if (gear) await syncGear(id, name, gear);
    created++;
    console.log(`  created  ${name}`);
  }

  console.log(`\nDone — ${created} created, ${ROSTER.length - created} already present.\n`);
} catch (error) {
  console.error('\nFailed:', error?.message ?? error);
  if (error?.response) console.error(JSON.stringify(error.response, null, 2));
  process.exit(1);
}
