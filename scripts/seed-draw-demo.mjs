#!/usr/bin/env node
/**
 * Seeds a complete draw — entries, a group stage and a knockout bracket — for
 * the Summer Smash demo tournament, so the tournament page can be checked
 * against the shape of real results rather than an empty state.
 *
 *   node scripts/seed-draw-demo.mjs
 *
 * Requires `npm run pb:seed` (tournaments) and at least one member to exist.
 * Idempotent: matched on tournament + event + round + order.
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

const TOURNAMENT_SLUG = 'summer-smash-2026';

// Our two pairs. Everyone else in the draw is an outside club, stored by name.
const US_MD = 'Imchen / Kumar';
const US_XD = 'Menon / Rao';

const win = (...scores) => ({ scores, status: 'completed' });

/** Group A of the men's doubles round robin. */
const GROUP_MD = [
  { a: US_MD, b: 'Nair / Pillai', ...win([21, 17], [21, 14]), winner: 'a' },
  { a: 'Rao / Shetty', b: US_MD, ...win([21, 19], [18, 21], [16, 21]), winner: 'b' },
  { a: US_MD, b: "D'Souza / Fernandes", ...win([21, 12], [21, 15]), winner: 'a' },
  { a: 'Nair / Pillai', b: 'Rao / Shetty', ...win([15, 21], [18, 21]), winner: 'b' },
  { a: 'Nair / Pillai', b: "D'Souza / Fernandes", ...win([21, 16], [21, 18]), winner: 'a' },
  { a: 'Rao / Shetty', b: "D'Souza / Fernandes", ...win([21, 23], [21, 15], [21, 11]), winner: 'a' },
];

/** Men's doubles knockout. Our pair runs to the final and loses it. */
const PLAYOFF_MD = [
  { round: 'QF', slot: 0, a: 'Bose / Sen', aSeed: 1, b: 'Nair / Pillai', ...win([21, 14], [21, 16]), winner: 'a' },
  { round: 'QF', slot: 1, a: 'Rao / Shetty', b: 'Menon / Varghese', ...win([21, 18], [19, 21], [21, 17]), winner: 'a' },
  { round: 'QF', slot: 2, a: US_MD, aSeed: 3, b: 'Iyer / Krishnan', ...win([21, 15], [21, 13]), winner: 'a' },
  { round: 'QF', slot: 3, a: 'Ahmed / Khan', aSeed: 2, b: 'Reddy / Naidu', ...win([21, 19], [17, 21], [21, 14]), winner: 'a' },
  { round: 'SF', slot: 0, a: 'Bose / Sen', aSeed: 1, b: 'Rao / Shetty', ...win([21, 17], [21, 19]), winner: 'a' },
  { round: 'SF', slot: 1, a: US_MD, aSeed: 3, b: 'Ahmed / Khan', bSeed: 2, ...win([19, 21], [21, 18], [21, 16]), winner: 'a' },
  { round: '3P', slot: 0, a: 'Rao / Shetty', b: 'Ahmed / Khan', bSeed: 2, ...win([21, 16], [21, 18]), winner: 'a' },
  { round: 'F', slot: 0, a: 'Bose / Sen', aSeed: 1, b: US_MD, bSeed: 3, ...win([21, 18], [17, 21], [21, 19]), winner: 'a' },
];

/** Mixed doubles is a straight knockout — no groups — to show the other shape. */
const PLAYOFF_XD = [
  { round: 'QF', slot: 0, a: 'Thomas / Joseph', aSeed: 1, b: 'Gupta / Sharma', ...win([21, 12], [21, 17]), winner: 'a' },
  { round: 'QF', slot: 1, a: US_XD, aSeed: 5, b: 'Kulkarni / Deshpande', ...win([21, 19], [21, 18]), winner: 'a' },
  { round: 'QF', slot: 2, a: 'Singh / Kaur', aSeed: 2, b: 'Raman / Lakshmi', ...win([21, 14], [21, 16]), winner: 'a' },
  { round: 'QF', slot: 3, a: 'Dutta / Bose', b: 'Verma / Chopra', aSeed: 4, ...win([21, 18], [21, 15]), winner: 'a' },
  { round: 'SF', slot: 0, a: 'Thomas / Joseph', aSeed: 1, b: US_XD, bSeed: 5, ...win([21, 17], [18, 21], [21, 15]), winner: 'a' },
  { round: 'SF', slot: 1, a: 'Singh / Kaur', aSeed: 2, b: 'Dutta / Bose', ...win([21, 19], [21, 13]), winner: 'a' },
  { round: 'F', slot: 0, a: 'Thomas / Joseph', aSeed: 1, b: 'Singh / Kaur', bSeed: 2, ...win([19, 21], [21, 17], [21, 18]), winner: 'a' },
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
  return existing ? 'updated' : 'created';
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
  const tournament = await findBy('tournaments', 'slug = {:slug}', { slug: TOURNAMENT_SLUG });
  if (!tournament) {
    console.error(`No tournament with slug "${TOURNAMENT_SLUG}". Run: npm run pb:seed`);
    process.exit(1);
  }

  const members = await pb.collection('members').getFullList({ sort: 'created' });
  if (members.length === 0) {
    console.error('No members yet. Run: npm run pb:seed:pilot');
    process.exit(1);
  }

  // The doubles pair is anchored on a real member so the bracket links through
  // to a profile; the second member is whoever else exists, falling back to the
  // first so a single-member database still seeds cleanly.
  const mdMember = members.find((m) => m.slug === 'bendangnochet-imchen') ?? members[0];
  const xdMember = members.find((m) => m.id !== mdMember.id) ?? mdMember;

  console.log(`\nSeeding the ${tournament.name} draw\n`);

  const entryRows = [
    { tournament: tournament.id, member: mdMember.id, event: 'MD', partner_name: 'Rohit Kumar',
      seed: 3, group_name: 'A', qualification: 'Club champion', result: 'runner-up',
      notes: 'Lost the final in three games.' },
    { tournament: tournament.id, member: xdMember.id, event: 'XD', partner_name: 'Sneha Rao',
      seed: 5, qualification: 'Invited', result: 'semi-final' },
  ];

  for (const row of entryRows) {
    const existing = await findBy(
      'tournament_entries',
      'tournament = {:t} && member = {:m} && event = {:e}',
      { t: row.tournament, m: row.member, e: row.event },
    );
    if (existing) await pb.collection('tournament_entries').update(existing.id, row);
    else await pb.collection('tournament_entries').create(row);
    console.log(`  ${existing ? 'updated' : 'created'}  entry    ${row.event}  seed ${row.seed}`);
  }

  const build = (row, event, stage, extra = {}) => ({
    tournament: tournament.id,
    event,
    stage,
    round: row.round ?? 'RR',
    slot: row.slot,
    side_a_name: row.a,
    side_b_name: row.b,
    side_a_seed: row.aSeed ?? null,
    side_b_seed: row.bSeed ?? null,
    // Only our own side carries a member link; the rest are outside clubs.
    side_a_member: row.a === US_MD ? mdMember.id : row.a === US_XD ? xdMember.id : null,
    side_b_member: row.b === US_MD ? mdMember.id : row.b === US_XD ? xdMember.id : null,
    scores: row.scores,
    winner: row.winner,
    status: row.status,
    ...extra,
  });

  let n = 0;
  for (const [index, row] of GROUP_MD.entries()) {
    await upsertMatch(build({ ...row, slot: index }, 'MD', 'group', { group_name: 'A' }));
    n++;
  }
  console.log(`  seeded   MD group A       ${GROUP_MD.length} matches`);

  for (const row of PLAYOFF_MD) {
    await upsertMatch(build(row, 'MD', 'playoff'));
    n++;
  }
  console.log(`  seeded   MD playoffs      ${PLAYOFF_MD.length} matches`);

  for (const row of PLAYOFF_XD) {
    await upsertMatch(build(row, 'XD', 'playoff'));
    n++;
  }
  console.log(`  seeded   XD playoffs      ${PLAYOFF_XD.length} matches`);

  console.log(`\nDone — ${n} matches on /tournaments/${TOURNAMENT_SLUG}\n`);
} catch (error) {
  console.error('\nFailed:', error?.message ?? error);
  if (error?.response) console.error(JSON.stringify(error.response, null, 2));
  process.exit(1);
}
