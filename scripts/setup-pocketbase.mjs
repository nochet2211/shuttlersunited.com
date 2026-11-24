#!/usr/bin/env node
/**
 * Provisions the Shuttlers United PocketBase schema and API rules.
 *
 *   node scripts/setup-pocketbase.mjs           # create/update collections
 *   node scripts/setup-pocketbase.mjs --seed    # also insert demo content
 *
 * Idempotent: existing collections are updated in place, so it is safe to
 * re-run after editing this file.
 */
import PocketBase from 'pocketbase';
import { readFileSync } from 'node:fs';

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

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD (see .env.example).');
  process.exit(1);
}

const pb = new PocketBase(URL_BASE);
pb.autoCancellation(false);

// --- rule fragments ----------------------------------------------------------

const IS_ADMIN = '@request.auth.role = "admin"';
const SIGNED_IN = '@request.auth.id != ""';

// --- helpers -----------------------------------------------------------------

async function upsert(definition) {
  try {
    const existing = await pb.collections.getOne(definition.name);
    await pb.collections.update(existing.id, definition);
    console.log(`  updated  ${definition.name}`);
    return await pb.collections.getOne(definition.name);
  } catch (error) {
    if (error?.status !== 404) throw error;
    const created = await pb.collections.create(definition);
    console.log(`  created  ${definition.name}`);
    return created;
  }
}

const text = (name, options = {}) => ({ name, type: 'text', ...options });
const select = (name, values, options = {}) => ({
  name,
  type: 'select',
  maxSelect: 1,
  values,
  ...options,
});
const number = (name, options = {}) => ({ name, type: 'number', ...options });
const bool = (name) => ({ name, type: 'bool' });
const date = (name, options = {}) => ({ name, type: 'date', ...options });
// PocketBase 0.23+ no longer adds created/updated implicitly — they are ordinary
// autodate fields, and anything that filters or sorts on them must declare them.
const timestamps = () => [
  { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
  { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
];

const relation = (name, collectionId, options = {}) => ({
  name,
  type: 'relation',
  collectionId,
  maxSelect: 1,
  cascadeDelete: false,
  ...options,
});

// --- schema ------------------------------------------------------------------

async function provision() {
  console.log(`\nProvisioning ${URL_BASE}\n`);

  // -- members (auth) ---------------------------------------------------------
  // Read access is public for members who opted in, so the roster page can be
  // served without a session. Writes never happen from the client: every update
  // goes through an Astro action using the superuser client, which whitelists
  // the editable fields. That is what stops a member promoting themselves to
  // admin or flipping their own status.
  const members = await upsert({
    name: 'members',
    type: 'auth',
    passwordAuth: { enabled: true, identityFields: ['phone'] },
    oauth2: { enabled: false },
    otp: { enabled: false },
    mfa: { enabled: false },
    fields: [
      // Phone is the identity here, so the auth collection's built-in `email`
      // field must be declared optional — PocketBase requires it otherwise.
      { name: 'email', type: 'email', required: false },
      text('phone', { required: true, max: 16 }),
      text('name', { required: true, max: 80 }),
      text('slug', { required: true, max: 80 }),
      select('role', ['member', 'admin']),
      select('status', ['pending', 'active', 'inactive']),
      { name: 'avatar', type: 'file', maxSelect: 1, maxSize: 5_242_880,
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] },
      text('bio', { max: 600 }),
      date('date_of_birth'),
      select('gender', ['male', 'female', 'other']),
      number('height_cm', { min: 100, max: 250 }),
      select('handedness', ['right', 'left']),
      select('play_style', ['attacking', 'defensive', 'all-round']),
      select('preferred_events', ['MS', 'WS', 'MD', 'WD', 'XD'], { maxSelect: 5 }),
      number('jersey_number', { min: 0, max: 999 }),
      select('skill_level', ['beginner', 'intermediate', 'advanced', 'competitive']),
      date('joined_on'),
      text('city', { max: 60 }),
      text('emergency_contact', { max: 16 }),
      bool('is_public'),
      ...timestamps(),
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_members_phone` ON `members` (`phone`)',
      'CREATE UNIQUE INDEX `idx_members_slug` ON `members` (`slug`)',
    ],
    listRule: `is_public = true || id = @request.auth.id || ${IS_ADMIN}`,
    viewRule: `is_public = true || id = @request.auth.id || ${IS_ADMIN}`,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  // -- otp_codes --------------------------------------------------------------
  // Fully sealed: only the superuser client touches this. Even the hashes stay
  // unreadable through the public API.
  await upsert({
    name: 'otp_codes',
    type: 'base',
    fields: [
      text('phone', { required: true, max: 16 }),
      text('code_hash', { required: true, max: 64 }),
      date('expires_at', { required: true }),
      number('attempts', { min: 0 }),
      bool('consumed'),
      ...timestamps(),
    ],
    indexes: ['CREATE INDEX `idx_otp_phone` ON `otp_codes` (`phone`, `created`)'],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  // -- gear -------------------------------------------------------------------
  await upsert({
    name: 'gear',
    type: 'base',
    fields: [
      relation('member', members.id, { required: true, cascadeDelete: true }),
      select('category', ['racket', 'string', 'grip', 'shoes', 'shuttle', 'bag', 'apparel'],
        { required: true }),
      text('brand', { required: true, max: 60 }),
      text('model', { required: true, max: 80 }),
      text('spec', { max: 80 }),
      text('notes', { max: 300 }),
      bool('is_current'),
      ...timestamps(),
    ],
    indexes: ['CREATE INDEX `idx_gear_member` ON `gear` (`member`)'],
    listRule: `member.is_public = true || member = @request.auth.id || ${IS_ADMIN}`,
    viewRule: `member.is_public = true || member = @request.auth.id || ${IS_ADMIN}`,
    createRule: `member = @request.auth.id || ${IS_ADMIN}`,
    updateRule: `member = @request.auth.id || ${IS_ADMIN}`,
    deleteRule: `member = @request.auth.id || ${IS_ADMIN}`,
  });

  // -- tournaments ------------------------------------------------------------
  const tournaments = await upsert({
    name: 'tournaments',
    type: 'base',
    fields: [
      text('name', { required: true, max: 120 }),
      text('slug', { required: true, max: 120 }),
      text('description', { max: 2000 }),
      text('venue', { max: 120 }),
      text('city', { max: 60 }),
      date('start_date', { required: true }),
      date('end_date'),
      select('level', ['club', 'district', 'state', 'national', 'open'], { required: true }),
      select('status', ['upcoming', 'ongoing', 'completed', 'cancelled'], { required: true }),
      date('registration_deadline'),
      number('entry_fee', { min: 0 }),
      text('organizer', { max: 120 }),
      // One stage per line. Rendered as an ordered breakdown, the way a
      // tournament page states its structure before showing any result.
      text('format', { max: 1500 }),
      number('prize_pool', { min: 0 }),
      // [{ place: '1st', amount: 2500000, event: 'MD', note: '' }, ...]
      { name: 'prize_distribution', type: 'json', maxSize: 8000 },
      number('draw_size', { min: 2, max: 256 }),
      { name: 'banner', type: 'file', maxSelect: 1, maxSize: 5_242_880,
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] },
      { name: 'external_url', type: 'url' },
      ...timestamps(),
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_tournaments_slug` ON `tournaments` (`slug`)'],
    listRule: '',
    viewRule: '',
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  // -- posts ------------------------------------------------------------------
  // The newsroom behind the home page: club announcements, fixture news, and
  // circulars from the governing bodies (BAI, the state association, SAI). `source_name` and
  // `source_url` exist so a governing-body item can credit and link out to the
  // original notice rather than pretending the club wrote it.
  //
  // Read is public but scoped to published rows, so a draft is invisible even
  // to someone hitting the PocketBase API directly. Writes are server-only.
  await upsert({
    name: 'posts',
    type: 'base',
    fields: [
      text('title', { required: true, max: 160 }),
      text('slug', { required: true, max: 160 }),
      select('category', ['club', 'tournament', 'result', 'governing-body', 'facility', 'notice'],
        { required: true }),
      // The feed shows the summary, never a truncated body — a hard cut mid
      // sentence reads as broken, and an editor should choose the teaser.
      text('summary', { required: true, max: 400 }),
      // Plain text. Blank lines separate paragraphs, "## " marks a subheading
      // and "- " a bullet; see renderPostBody in src/lib/news.ts.
      text('body', { max: 20000 }),
      { name: 'cover', type: 'file', maxSelect: 1, maxSize: 5_242_880,
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] },
      text('source_name', { max: 120 }),
      { name: 'source_url', type: 'url' },
      // Optional: ties a story to the fixture it is about, so the article can
      // link straight through to the draw.
      relation('tournament', tournaments.id),
      relation('author', members.id),
      // Explicit rather than `created`, so a story can be backdated or queued.
      date('published_at', { required: true }),
      bool('is_pinned'),
      select('status', ['draft', 'published'], { required: true }),
      ...timestamps(),
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_posts_slug` ON `posts` (`slug`)',
      'CREATE INDEX `idx_posts_feed` ON `posts` (`status`, `published_at`)',
    ],
    listRule: 'status = "published"',
    viewRule: 'status = "published"',
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  // -- tournament_entries -----------------------------------------------------
  await upsert({
    name: 'tournament_entries',
    type: 'base',
    fields: [
      relation('tournament', tournaments.id, { required: true, cascadeDelete: true }),
      relation('member', members.id, { required: true, cascadeDelete: true }),
      select('event', ['MS', 'WS', 'MD', 'WD', 'XD'], { required: true }),
      relation('partner', members.id),
      text('partner_name', { max: 80 }),
      select('result', ['winner', 'runner-up', 'semi-final', 'quarter-final',
        'round-of-16', 'group-stage', 'participated'], { required: true }),
      number('seed', { min: 1, max: 64 }),
      // How they got in — 'Club champion', 'Qualifier', 'Wildcard'. Liquipedia
      // calls this the qualification method and it is half the participants table.
      text('qualification', { max: 60 }),
      text('group_name', { max: 8 }),
      text('notes', { max: 300 }),
      ...timestamps(),
    ],
    indexes: [
      'CREATE INDEX `idx_entries_member` ON `tournament_entries` (`member`)',
      'CREATE INDEX `idx_entries_tournament` ON `tournament_entries` (`tournament`)',
    ],
    listRule: '',
    viewRule: '',
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  // -- matches ----------------------------------------------------------------
  // The draw sheet. Sides are stored as display names rather than relations
  // because most opponents are not club members — the optional member relation
  // is only there so our own players link through to their profile.
  await upsert({
    name: 'matches',
    type: 'base',
    fields: [
      relation('tournament', tournaments.id, { required: true, cascadeDelete: true }),
      select('event', ['MS', 'WS', 'MD', 'WD', 'XD'], { required: true }),
      select('stage', ['group', 'playoff'], { required: true }),
      // Codes rather than labels so rounds sort into bracket columns.
      select('round', ['R64', 'R32', 'R16', 'QF', 'SF', 'F', '3P', 'RR'], { required: true }),
      // Position within the round, top to bottom. Two matches in one round with
      // the same slot would stack ambiguously, so admins set this explicitly.
      // Named `slot` rather than `order`: PocketBase cannot filter or sort on a
      // field whose name is a SQL keyword.
      number('slot', { min: 0, max: 63 }),
      text('group_name', { max: 8 }),
      text('side_a_name', { required: true, max: 120 }),
      relation('side_a_member', members.id),
      number('side_a_seed', { min: 1, max: 64 }),
      text('side_b_name', { required: true, max: 120 }),
      relation('side_b_member', members.id),
      number('side_b_seed', { min: 1, max: 64 }),
      // Game scores in order: [[21, 18], [19, 21], [21, 15]]. A badminton match
      // is only meaningful game by game, so a single aggregate score won't do.
      { name: 'scores', type: 'json', maxSize: 2000 },
      select('winner', ['a', 'b']),
      select('status', ['scheduled', 'live', 'completed', 'walkover', 'retired'],
        { required: true }),
      date('scheduled_at'),
      text('court', { max: 40 }),
      { name: 'vod_url', type: 'url' },
      ...timestamps(),
    ],
    indexes: [
      'CREATE INDEX `idx_matches_tournament` ON `matches` (`tournament`, `event`)',
      'CREATE INDEX `idx_matches_bracket` ON `matches` (`tournament`, `event`, `round`, `slot`)',
    ],
    listRule: '',
    viewRule: '',
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  // -- courts -----------------------------------------------------------------
  const courts = await upsert({
    name: 'courts',
    type: 'base',
    fields: [
      text('name', { required: true, max: 60 }),
      text('venue', { required: true, max: 120 }),
      select('surface', ['wooden', 'synthetic', 'cement']),
      number('hourly_rate', { required: true, min: 0 }),
      bool('is_active'),
      ...timestamps(),
    ],
    listRule: '',
    viewRule: '',
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  // -- bookings ---------------------------------------------------------------
  // Any signed-in member can read the schedule — you cannot avoid a clash you
  // cannot see. Writes are restricted to the booking's owner.
  const bookings = await upsert({
    name: 'bookings',
    type: 'base',
    fields: [
      relation('court', courts.id, { required: true }),
      relation('member', members.id, { required: true, cascadeDelete: true }),
      date('date', { required: true }),
      number('start_minute', { required: true, min: 0, max: 1440 }),
      number('end_minute', { required: true, min: 0, max: 1440 }),
      select('status', ['confirmed', 'cancelled', 'completed'], { required: true }),
      text('notes', { max: 300 }),
      ...timestamps(),
    ],
    indexes: ['CREATE INDEX `idx_bookings_slot` ON `bookings` (`court`, `date`, `start_minute`)'],
    listRule: SIGNED_IN,
    viewRule: SIGNED_IN,
    createRule: `${SIGNED_IN} && member = @request.auth.id`,
    updateRule: `member = @request.auth.id || ${IS_ADMIN}`,
    deleteRule: `member = @request.auth.id || ${IS_ADMIN}`,
  });

  // -- membership_plans -------------------------------------------------------
  const plans = await upsert({
    name: 'membership_plans',
    type: 'base',
    fields: [
      text('name', { required: true, max: 60 }),
      number('amount', { required: true, min: 0 }), // paise
      select('interval', ['monthly', 'quarterly', 'annual'], { required: true }),
      text('description', { max: 300 }),
      { name: 'benefits', type: 'json', maxSize: 4000 },
      bool('is_active'),
      ...timestamps(),
    ],
    listRule: '',
    viewRule: '',
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  // -- payments ---------------------------------------------------------------
  // The ledger. Every rule below is null except read: a member may look at
  // their own history, but nothing outside the server can create or mutate a
  // row. A member marking their own dues "paid" is the whole threat model here.
  await upsert({
    name: 'payments',
    type: 'base',
    fields: [
      relation('member', members.id, { required: true }),
      relation('plan', plans.id),
      relation('booking', bookings.id),
      select('type', ['membership', 'booking', 'tournament', 'other'], { required: true }),
      select('status', ['created', 'attempted', 'paid', 'failed', 'refunded'], { required: true }),
      number('amount', { required: true, min: 0 }), // paise
      text('currency', { max: 3 }),
      text('period', { max: 7 }), // "2026-08"
      text('razorpay_order_id', { max: 64 }),
      text('razorpay_payment_id', { max: 64 }),
      text('razorpay_signature', { max: 128 }),
      text('method', { max: 32 }),
      date('paid_at'),
      text('failure_reason', { max: 300 }),
      text('notes', { max: 300 }),
      ...timestamps(),
    ],
    indexes: [
      'CREATE INDEX `idx_payments_member` ON `payments` (`member`, `period`)',
      'CREATE UNIQUE INDEX `idx_payments_order` ON `payments` (`razorpay_order_id`) WHERE `razorpay_order_id` != \'\'',
    ],
    listRule: `member = @request.auth.id || ${IS_ADMIN}`,
    viewRule: `member = @request.auth.id || ${IS_ADMIN}`,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  console.log('\nSchema ready.\n');
  return { members, tournaments, courts, plans };
}

// --- seed --------------------------------------------------------------------

async function seed({ plans, courts }) {
  console.log('Seeding demo content\n');

  const planRows = [
    { name: 'Monthly', amount: 80_000, interval: 'monthly', is_active: true,
      description: 'Full court access, coaching drills, and club tournament entry.',
      benefits: ['Unlimited weekday sessions', 'Two coaching drills a month', 'Club tournament entry'] },
    { name: 'Quarterly', amount: 216_000, interval: 'quarterly', is_active: true,
      description: 'Three months up front — one month of dues saved.',
      benefits: ['Everything in Monthly', '10% saving', 'Priority court booking'] },
    { name: 'Annual', amount: 768_000, interval: 'annual', is_active: true,
      description: 'The full season, with a club jersey included.',
      benefits: ['Everything in Quarterly', 'Club jersey', 'Guest passes ×4'] },
  ];

  for (const row of planRows) {
    try {
      const existing = await pb.collection('membership_plans').getFirstListItem(
        pb.filter('name = {:name}', { name: row.name }),
      );
      await pb.collection('membership_plans').update(existing.id, row);
    } catch {
      await pb.collection('membership_plans').create(row);
    }
    console.log(`  plan     ${row.name}`);
  }

  const courtRows = [
    { name: 'Court 1', venue: 'Shuttlers Arena', surface: 'wooden', hourly_rate: 40_000, is_active: true },
    { name: 'Court 2', venue: 'Shuttlers Arena', surface: 'wooden', hourly_rate: 40_000, is_active: true },
    { name: 'Court 3', venue: 'Shuttlers Arena', surface: 'synthetic', hourly_rate: 35_000, is_active: true },
  ];

  for (const row of courtRows) {
    try {
      const existing = await pb.collection('courts').getFirstListItem(
        pb.filter('name = {:name} && venue = {:venue}', { name: row.name, venue: row.venue }),
      );
      await pb.collection('courts').update(existing.id, row);
    } catch {
      await pb.collection('courts').create(row);
    }
    console.log(`  court    ${row.name}`);
  }

  const tournamentRows = [
    { name: 'Shuttlers United Club Championship 2026', slug: 'club-championship-2026',
      description: 'Our flagship internal championship across all five events.',
      venue: 'Shuttlers Arena', city: 'Dimapur', start_date: '2026-09-19 09:00:00',
      end_date: '2026-09-21 20:00:00', level: 'club', status: 'upcoming',
      registration_deadline: '2026-09-10 23:59:00', entry_fee: 50_000,
      organizer: 'Shuttlers United', draw_size: 32, prize_pool: 600_000,
      format: [
        'Five events — MS, WS, MD, WD and XD.',
        'Group stage — groups of 3 or 4 depending on entries.',
        'Top 2 of each group advance to a single-elimination draw.',
        'Best of three games to 21.',
      ].join('\n'),
      prize_distribution: [
        { place: '1st', amount: 60_000, note: 'Per event' },
        { place: '2nd', amount: 35_000, note: 'Per event' },
        { place: '3rd', amount: 20_000, note: 'Per event, both semi-finalists' },
      ] },
    { name: 'Dimapur District Open', slug: 'dimapur-district-open-2026',
      description: 'District ranking tournament — five of our members are entered.',
      venue: 'Dimapur Indoor Stadium', city: 'Dimapur', start_date: '2026-10-10 08:00:00',
      end_date: '2026-10-13 21:00:00', level: 'district', status: 'upcoming',
      registration_deadline: '2026-09-28 23:59:00', entry_fee: 120_000,
      organizer: 'Dimapur District Badminton Association', draw_size: 64,
      format: [
        'Qualifying rounds on day one for unseeded entries.',
        'Main draw of 32, single elimination.',
        'Best of three games to 21.',
      ].join('\n') },
    { name: 'Summer Smash Invitational', slug: 'summer-smash-2026',
      description: 'An eight-club invitational played over a weekend: a round-robin group stage on the Saturday, knockouts on the Sunday. We entered men\'s doubles and mixed doubles.',
      venue: 'DDSC Indoor Stadium', city: 'Dimapur', start_date: '2026-06-14 08:00:00',
      end_date: '2026-06-15 20:00:00', level: 'open', status: 'completed', entry_fee: 90_000,
      organizer: 'Nagaland Badminton Collective', draw_size: 16, prize_pool: 1_500_000,
      format: [
        'Group stage — 4 groups of 4, single round robin.',
        'Top 2 of each group advance to the quarter-finals.',
        'Knockouts — quarter-finals through final, single elimination.',
        'All matches best of three games to 21, cap at 30.',
      ].join('\n'),
      prize_distribution: [
        { place: '1st', amount: 400_000, event: 'MD' },
        { place: '2nd', amount: 200_000, event: 'MD' },
        { place: '3rd', amount: 100_000, event: 'MD' },
        { place: '1st', amount: 400_000, event: 'XD' },
        { place: '2nd', amount: 200_000, event: 'XD' },
        { place: '3rd', amount: 100_000, event: 'XD' },
        { place: 'Quarter-finalists', amount: 25_000, note: 'Each, both events' },
      ] },
  ];

  for (const row of tournamentRows) {
    try {
      const existing = await pb.collection('tournaments').getFirstListItem(
        pb.filter('slug = {:slug}', { slug: row.slug }),
      );
      await pb.collection('tournaments').update(existing.id, row);
    } catch {
      await pb.collection('tournaments').create(row);
    }
    console.log(`  event    ${row.name}`);
  }

  // -- posts ------------------------------------------------------------------
  // The home page is a newsroom, so an empty posts collection makes the whole
  // site look broken. These rows are what the club would actually publish:
  // fixture news, results, a facility notice, and circulars from the governing
  // bodies — the last credited to their source, never presented as club copy.
  const tournamentIds = new Map();
  for (const slug of ['club-championship-2026', 'dimapur-district-open-2026', 'summer-smash-2026']) {
    try {
      const record = await pb.collection('tournaments').getFirstListItem(
        pb.filter('slug = {:slug}', { slug }),
      );
      tournamentIds.set(slug, record.id);
    } catch {
      // Tournament seeding is above this; if it was skipped, the story simply
      // publishes without a fixture link.
    }
  }

  const postRows = [
    {
      title: 'Club Championship draw is published on 12 September',
      slug: 'club-championship-2026-draw-published',
      category: 'tournament',
      summary:
        'Entries close on 10 September and the seeded draw goes up two days later, across all five events. Groups of three or four depending on how many of you enter.',
      body: [
        'The 2026 Club Championship runs from 19 to 21 September at Shuttlers Arena, and it is the one weekend of the year every event is played out properly — MS, WS, MD, WD and XD, group stage into a knockout draw.',
        '## What happens between now and then',
        '- Entries close at 11:59pm on 10 September. Enter through your dashboard.',
        '- Seedings are settled on 11 September from this season\'s club results.',
        '- The draw is published here on 12 September, and the group tables go live as scores come in.',
        'Entry is Rs 500 per event. If you are entering a doubles event, name your partner when you enter — unpartnered entries go into a pool and we will pair you up.',
        '## Format',
        'Group stage first, groups of three or four depending on entries, then the top two from each group into a single-elimination draw. Everything is best of three games to 21.',
      ].join('\n\n'),
      tournamentSlug: 'club-championship-2026',
      published_at: '2026-08-28 09:00:00',
      is_pinned: true,
      status: 'published',
    },
    {
      title: 'Nagaland Badminton Association opens 2026-27 player registration',
      slug: 'nba-2026-27-player-registration',
      category: 'governing-body',
      summary:
        'Anyone planning to enter a district or state ranking tournament this season needs a current NBA player ID. Registration is open until 30 September.',
      body: [
        'The Nagaland Badminton Association has opened player registration for the 2026-27 season. A current NBA player ID is required to enter any district or state ranking event, including the Dimapur District Open in October.',
        '## What you need',
        '- A passport photograph and a government photo ID.',
        '- A date-of-birth proof — the birth certificate or the school leaving certificate, not an Aadhaar card, for age-category events.',
        '- The registration fee, paid to the association directly.',
        'Registration closes on 30 September. If you want help with the paperwork, bring it to a Tuesday session and we will go through it with you.',
      ].join('\n\n'),
      source_name: 'Nagaland Badminton Association',
      published_at: '2026-08-26 11:30:00',
      status: 'published',
    },
    {
      title: 'BAI moves the junior age-category cut-off to 1 October',
      slug: 'bai-junior-age-category-cut-off',
      category: 'governing-body',
      summary:
        'The Badminton Association of India has shifted the age-band reference date. Two of our U-17 players move up a category for the coming season.',
      body: [
        'The Badminton Association of India has confirmed that junior age categories for the 2026-27 season will be calculated against 1 October rather than 1 January. The change aligns the domestic calendar with the BWF junior circuit.',
        'In practice it means anyone whose birthday falls between January and September is now measured a year older than they would have been under the old rule. Two of our U-17 players move into U-19 for the season.',
        'If you compete in age-category events, check which band you now fall into before entering anything. We have flagged it against the affected profiles.',
      ].join('\n\n'),
      source_name: 'Badminton Association of India',
      source_url: 'https://www.badmintonindia.org/',
      published_at: '2026-08-21 16:00:00',
      status: 'published',
    },
    {
      title: 'Five members entered for the Dimapur District Open',
      slug: 'district-open-2026-entries',
      category: 'tournament',
      summary:
        'Qualifying starts on 10 October at Dimapur Indoor Stadium. Five of ours are in, across singles and doubles.',
      body: [
        'Five members have entered the Dimapur District Open, played from 10 to 13 October at the Dimapur Indoor Stadium. Unseeded entries play qualifying on the first day; the main draw of 32 starts on the Saturday.',
        'The club covers half the entry fee for any member entered in a district-level event or above. Claim it through your dashboard once your entry is confirmed by the organisers.',
        'We will post the draw and results here as they come through.',
      ].join('\n\n'),
      tournamentSlug: 'dimapur-district-open-2026',
      published_at: '2026-08-18 10:00:00',
      status: 'published',
    },
    {
      title: 'Court 3 resurfaced — synthetic mat down from Monday',
      slug: 'court-3-resurfaced',
      category: 'facility',
      summary:
        'The worn synthetic on Court 3 has been replaced. It is out of the booking calendar until Monday morning, and the hourly rate stays where it is.',
      body: [
        'Court 3 has been resurfaced with a new BWF-approved synthetic mat. The old surface had gone slick along the tramlines on the north side, which is where most of the slips this year happened.',
        'The court is out of the booking calendar until 6am Monday while the mat settles. Courts 1 and 2 are unaffected.',
        'The hourly rate for Court 3 is unchanged.',
      ].join('\n\n'),
      published_at: '2026-08-14 08:30:00',
      status: 'published',
    },
    {
      title: 'Summer Smash: men\'s doubles title, and a mixed doubles final',
      slug: 'summer-smash-2026-report',
      category: 'result',
      summary:
        'Two finals from an eight-club invitational, and one trophy home. The full draw and every score is on the tournament page.',
      body: [
        'The Summer Smash Invitational brought eight clubs to the DDSC Indoor Stadium over a weekend in June: a round-robin group stage on the Saturday, knockouts on the Sunday.',
        'Our men\'s doubles pair came through the group unbeaten and took the title in straight games. The mixed doubles pair reached the final and lost a third game that could have gone either way at 19-all.',
        'Every match, game by game, is on the tournament page.',
      ].join('\n\n'),
      tournamentSlug: 'summer-smash-2026',
      published_at: '2026-06-16 19:00:00',
      status: 'published',
    },
    {
      title: 'Dues reminders now go out on the 1st',
      slug: 'dues-reminders-on-the-first',
      category: 'notice',
      summary:
        'Monthly dues reminders are sent on the 1st of each month by WhatsApp. Pay from your dashboard — UPI, card or netbanking, receipt is instant.',
      body: [
        'Monthly dues reminders now go out automatically on the 1st of each month to the number you signed up with. No more chasing in the group chat.',
        'You can settle from your dashboard at any point in the month. The receipt lands immediately and your payment history stays on your account.',
      ].join('\n\n'),
      published_at: '2026-08-05 07:00:00',
      status: 'published',
    },
  ];

  for (const { tournamentSlug, ...row } of postRows) {
    const record = { ...row };
    const tournamentId = tournamentSlug ? tournamentIds.get(tournamentSlug) : undefined;
    if (tournamentId) record.tournament = tournamentId;

    try {
      const existing = await pb.collection('posts').getFirstListItem(
        pb.filter('slug = {:slug}', { slug: row.slug }),
      );
      await pb.collection('posts').update(existing.id, record);
    } catch {
      await pb.collection('posts').create(record);
    }
    console.log(`  post     ${row.title}`);
  }

  console.log('\nSeed complete.\n');
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
  const collections = await provision();
  if (process.argv.includes('--seed')) await seed(collections);
} catch (error) {
  console.error('\nFailed:', error?.message ?? error);
  if (error?.response) console.error(JSON.stringify(error.response, null, 2));
  process.exit(1);
}
