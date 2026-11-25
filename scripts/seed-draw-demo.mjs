#!/usr/bin/env node
/**
 * Seeds a placeholder knockout draw for each Interclub 2026 category, so the
 * tournament page shows the bracket shape before the real draw is made: a round
 * of 16 filled with sample names (Player1…Player16), then quarter-finals
 * through the final waiting on winners.
 *
 *   node scripts/seed-draw-demo.mjs
 *
 * Requires `npm run pb:seed` (tournaments). Idempotent: matched on
 * tournament + event + round + slot, and any match outside the categories is
 * removed. Replace the names in the admin once the real draw is out.
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

const TOURNAMENT_SLUG = 'dimapur-interclub-2026';
const CATEGORIES = ['75+', '85+', '95+', '105+'];
const TBD = 'TBD';

// Round of 16 pairs Player1 v Player2, Player3 v Player4, and so on; each later
// round has half as many matches, all still to be decided.
const ROUNDS = [
  { round: 'R16', matches: 8 },
  { round: 'QF', matches: 4 },
  { round: 'SF', matches: 2 },
  { round: 'F', matches: 1 },
];

async function findBy(collection, filter, params) {
  try {
    return await pb.collection(collection).getFirstListItem(pb.filter(filter, params));
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}

async function upsertMatch(row) {
  const existing = await findBy(
    'matches',
    'tournament = {:t} && event = {:e} && round = {:r} && slot = {:s}',
    { t: row.tournament, e: row.event, r: row.round, s: row.slot },
  );
  if (existing) await pb.collection('matches').update(existing.id, row);
  else await pb.collection('matches').create(row);
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
  const tournament = await findBy('tournaments', 'slug = {:slug}', {
    slug: TOURNAMENT_SLUG,
  });
  if (!tournament) {
    console.error(`No tournament with slug "${TOURNAMENT_SLUG}". Run: npm run pb:seed`);
    process.exit(1);
  }

  console.log(`\nSeeding the ${tournament.name} draw\n`);

  const stale = await pb.collection('matches').getFullList({
    filter: pb.filter('tournament = {:t}', { t: tournament.id }),
  });
  for (const match of stale.filter((match) => !CATEGORIES.includes(match.event))) {
    await pb.collection('matches').delete(match.id);
  }

  let n = 0;
  for (const event of CATEGORIES) {
    for (const { round, matches } of ROUNDS) {
      for (let slot = 0; slot < matches; slot++) {
        const isOpening = round === 'R16';
        await upsertMatch({
          tournament: tournament.id,
          event,
          stage: 'playoff',
          round,
          slot,
          side_a_name: isOpening ? `Player${slot * 2 + 1}` : TBD,
          side_b_name: isOpening ? `Player${slot * 2 + 2}` : TBD,
          side_a_seed: null,
          side_b_seed: null,
          side_a_member: null,
          side_b_member: null,
          scores: [],
          winner: null,
          status: 'scheduled',
        });
        n++;
      }
    }
    console.log(`  seeded   ${event.padEnd(5)} ${n} matches so far`);
  }

  console.log(`\nDone — ${n} matches on /tournaments/${TOURNAMENT_SLUG}\n`);
} catch (error) {
  console.error('\nFailed:', error?.message ?? error);
  if (error?.response) console.error(JSON.stringify(error.response, null, 2));
  process.exit(1);
}
