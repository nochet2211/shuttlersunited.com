#!/usr/bin/env node
/**
 * Records the club's tournament results as entries, so each finish shows on
 * the tournament page and in the player's own tournament record.
 *
 *   node scripts/seed-results.mjs
 *
 * Requires `npm run pb:seed` (tournaments) and `npm run pb:seed:roster`
 * (members). Idempotent: matched on tournament + member + event.
 */
import PocketBase from 'pocketbase';
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
const pb = new PocketBase(URL_BASE);
pb.autoCancellation(false);

/**
 * One row per player. A partner who is on the roster is linked by slug, so the
 * pair cross-reference; one who isn't is stored by name only.
 */
const RESULTS = [
  // 1st DCN Ao Open, 16–17 Dec 2024 (DAYO): silver in the men's category, with
  // a partner other than Imolong Jamir (name not on record).
  { tournament: 'ao-open-2024', event: 'MD', member: 'salang-jamir',
    result: 'runner-up', notes: 'Silver medal.' },
  // 2nd Ao Open, 20–21 Nov 2026 (DAYO): two silver medals.
  { tournament: 'ao-open-2026', event: '85+', member: 'along-nokdir', partner: 'katemjongshi',
    result: 'runner-up', notes: 'Silver medal.' },
  { tournament: 'ao-open-2026', event: '85+', member: 'katemjongshi', partner: 'along-nokdir',
    result: 'runner-up', notes: 'Silver medal.' },
  { tournament: 'ao-open-2026', event: 'MD', member: 'salang-jamir', partnerName: 'Imolong Jamir',
    result: 'runner-up', notes: 'Silver medal.' },
  // 48th Inter District and State Championship, Mon, Sep 2026 (NBA): silver,
  // playing for Longleng/Dimapur.
  { tournament: 'nba-state-championship-2026', event: 'MD40', member: 'amai-chingkhu',
    partner: 'raj-kumar-das', result: 'runner-up', notes: 'Silver medal.' },
  { tournament: 'nba-state-championship-2026', event: 'MD40', member: 'raj-kumar-das',
    partner: 'amai-chingkhu', result: 'runner-up', notes: 'Silver medal.' },
  // Nagaland Masters, Dimapur, 23–24 Oct 2026 (NBA): gold.
  { tournament: 'nagaland-masters-2026', event: 'MD45', member: 'amai-chingkhu',
    partner: 'raj-kumar-das', result: 'winner', notes: 'Gold medal.' },
  { tournament: 'nagaland-masters-2026', event: 'MD45', member: 'raj-kumar-das',
    partner: 'amai-chingkhu', result: 'winner', notes: 'Gold medal.' },
  // …and a silver in the 60+; his partner isn't on record.
  { tournament: 'nagaland-masters-2026', event: 'MD60', member: 'nadu-yaden',
    result: 'runner-up', notes: 'Silver medal.' },
];

async function findBy(collection, filter, params) {
  try {
    return await pb.collection(collection).getFirstListItem(pb.filter(filter, params));
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}

async function required(collection, slug) {
  const record = await findBy(collection, 'slug = {:slug}', { slug });
  if (!record) throw new Error(`No ${collection} record with slug "${slug}".`);
  return record;
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
  for (const row of RESULTS) {
    const tournament = await required('tournaments', row.tournament);
    const member = await required('members', row.member);
    const partner = row.partner ? await required('members', row.partner) : null;

    const record = {
      tournament: tournament.id,
      member: member.id,
      event: row.event,
      partner: partner?.id ?? null,
      partner_name: partner?.name ?? row.partnerName ?? '',
      result: row.result,
      notes: row.notes ?? '',
    };

    const existing = await findBy(
      'tournament_entries',
      'tournament = {:t} && member = {:m} && event = {:e}',
      { t: tournament.id, m: member.id, e: row.event },
    );
    if (existing) await pb.collection('tournament_entries').update(existing.id, record);
    else await pb.collection('tournament_entries').create(record);
    console.log(`  ${existing ? 'updated' : 'created'}  ${member.name} — ${row.event} ${row.result}`);
  }
  console.log('\nDone.\n');
} catch (error) {
  console.error('\nFailed:', error?.message ?? error);
  if (error?.response) console.error(JSON.stringify(error.response, null, 2));
  process.exit(1);
}
