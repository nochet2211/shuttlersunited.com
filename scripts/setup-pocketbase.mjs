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

// Tournament events: the five standard disciplines, veterans' men's doubles
// (40+, 45+, 60+), then the combined-age doubles categories played at the district
// interclub. Mirrors EVENT_ORDER in src/lib/tournament.ts.
const EVENTS = ['MS', 'WS', 'MD', 'WD', 'XD', 'MD40', 'MD45', 'MD60', '75+', '85+', '95+', '105+'];

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
      // Office bearers only, most senior first — the members list sorts by this
      // order (OFFICES in src/lib/members.ts) before it sorts by name.
      select('office', ['President', 'Vice President', 'General Secretary', 'Secretary',
        'Joint Secretary', 'Treasurer', 'Finance Secretary', 'Finance Convenor', 'Finance Member',
        'Executive Member']),
      // Players who compete for the club, at their highest level; drives the
      // "State player" annotation on the roster.
      select('competes_at', ['district', 'state', 'national', 'international']),
      // Career honours with no dated tournament behind them:
      // [{ title, medal?: 'gold' | 'silver' | 'bronze', count? }]. Medals here
      // count alongside the ones earned from tournament entries.
      { name: 'honours', type: 'json', maxSize: 5000 },
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
      // Downloads for readers — an event pamphlet, an entry form.
      { name: 'attachments', type: 'file', maxSelect: 4, maxSize: 10_485_760,
        mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'] },
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
      select('event', EVENTS, { required: true }),
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
      select('event', EVENTS, { required: true }),
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
    { name: '9th Dimapur District Interclub Badminton Tournament 2026',
      slug: 'dimapur-interclub-2026',
      description: 'Clubs from across Dimapur meet for two days of interclub badminton, hosted by Shuttlers United in memory of Late Shri. Mayang Lima. Event partners: State Bank of India and Anil Steel.',
      venue: 'Livingstone Foundation College Indoor Stadium, Landmark Colony', city: 'Dimapur',
      start_date: '2026-11-27 03:30:00', end_date: '2026-11-28 14:30:00',
      level: 'district', status: 'upcoming',
      organizer: 'Shuttlers United, under the aegis of the Dimapur District Badminton Association',
      draw_size: 16, prize_pool: 7_200_000,
      format: [
        'Four combined-age doubles categories — 75+ (min age 35), 85+ (min age 40), 95+ (min age 45) and 105+ (min age 45).',
        'Single elimination from the round of 16.',
        'Best of three games, first to 15 points.',
      ].join('\n') },
    { name: '2nd Ao Open Badminton Tournament 2026', slug: 'ao-open-2026',
      description: 'Organised by the Dimapur Ao Youth Organisation (DAYO) under the theme "Unity through Sports": 56 teams across five categories, veteran players included. We came home with two silver medals.',
      venue: 'Indoor Stadium, Multi Disciplinary Sports Complex', city: 'Dimapur',
      start_date: '2026-11-20 03:30:00', end_date: '2026-11-21 14:30:00',
      level: 'open', status: 'completed', organizer: 'Dimapur Ao Youth Organisation (DAYO)' },
    // Only the closing day (4 September) is published, so it stands as both dates.
    { name: '48th Inter District and State Badminton Championship 2026', slug: 'nba-state-championship-2026',
      description: 'The state championship under the Nagaland Badminton Association, played at the Indoor Badminton Stadium in Mon, with districts from across Nagaland competing in open, age-group and veterans categories.',
      venue: 'Indoor Badminton Stadium', city: 'Mon', start_date: '2026-09-04 03:30:00',
      level: 'state', status: 'completed', organizer: 'Nagaland Badminton Association' },
    { name: 'Nagaland Masters Badminton Championship 2026', slug: 'nagaland-masters-2026',
      description: 'The state masters championship under the Nagaland Badminton Association: 104 players in 72 entries across seven categories — 35+, 40+, 45+, 50+, 55+, 60+ and mixed doubles — over two days in Dimapur.',
      venue: 'Dimapur Badminton Club Stadium, United Colony', city: 'Dimapur',
      start_date: '2026-10-23 03:30:00', end_date: '2026-10-24 14:30:00',
      level: 'state', status: 'completed', organizer: 'Nagaland Badminton Association' },
    // The pamphlet gives an earlier venue (ADC Court, Dimapur) and deadline
    // (20 Nov); the registration form's details are the current ones.
    { name: 'Hornbill Festival Invitational Badminton Championship 2026', slug: 'hornbill-2026',
      description: 'The Nagaland Badminton Association\'s invitational championship, held as part of the Hornbill Festival, with INR 9,00,000 in prize money across nine events.',
      venue: 'Regional Centre for Sporting Excellence, Sovima', city: 'Chümoukedima',
      start_date: '2026-12-02 03:30:00', end_date: '2026-12-05 14:30:00',
      registration_deadline: '2026-11-25 18:29:00', entry_fee: 300_000,
      level: 'open', status: 'upcoming', organizer: 'Nagaland Badminton Association',
      prize_pool: 90_000_000,
      prize_distribution: [
        { place: 'Champion', amount: 5_000_000, note: 'Per event' },
        { place: 'Runners-up', amount: 3_000_000, note: 'Per event' },
        { place: 'Losing semi-finalists', amount: 1_000_000, note: 'Each, per event' },
      ],
      format: [
        'Nine events: U-15 girls\' singles, U-17 boys\' doubles, men\'s and women\'s doubles (open), and combined-age men\'s doubles 75+ and 85+ (each player 35 and above), 95+ and 105+ (45 and above) and 115+ (55 and above).',
        'A player may enter at most three events.',
        'Best of three games, first to 15 points.',
        'Entry INR 3,000 per pair, INR 2,000 for singles.',
      ].join('\n') },
    // The first Ao Open, run by DAYO for Dimapur, Chümoukedima and Niuland.
    { name: '1st DCN Ao Open Badminton Tournament 2024', slug: 'ao-open-2024',
      description: 'The first edition of the Ao Open, organised by the Dimapur Ao Youth Organisation (DAYO) for players from Dimapur, Chümoukedima and Niuland.',
      venue: 'Indoor Stadium, Multi-Disciplinary Sports Complex', city: 'Dimapur',
      start_date: '2024-12-16 03:30:00', end_date: '2024-12-17 14:30:00',
      level: 'open', status: 'completed', organizer: 'Dimapur Ao Youth Organisation (DAYO)' },
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
  // The club's real stories. A story drawn from outside coverage credits it in
  // source_name / source_url and is written in our own words, not copied.
  // The launch batch is dated to the day each event finished, so the feed
  // reads in the order things happened.
  const tournamentIds = new Map();
  for (const { slug } of tournamentRows) {
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
      title: 'Hornbill Festival Invitational Badminton Championship comes to Chümoukedima, 2–5 December',
      slug: 'hornbill-2026-announcement',
      category: 'tournament',
      summary:
        'The Nagaland Badminton Association\'s Hornbill Festival Invitational runs from 2 to 5 December at the Regional Centre for Sporting Excellence, Sovima, with INR 9,00,000 in prize money across nine events. Entries close on 25 November.',
      body: [
        'The Nagaland Badminton Association is hosting the Hornbill Festival Invitational Badminton Championship 2026 from 2 to 5 December, as part of this year\'s Hornbill Festival. Play is at the Regional Centre for Sporting Excellence, Sovima, Chümoukedima.',
        '## Events',
        [
          '- U-15 girls\' singles',
          '- U-17 boys\' doubles',
          '- Men\'s doubles (open)',
          '- Women\'s doubles (open)',
          '- 75+ combined age (each player 35 and above)',
          '- 85+ combined age (35 and above)',
          '- 95+ combined age (45 and above)',
          '- 105+ combined age (45 and above)',
          '- 115+ combined age (55 and above)',
        ].join('\n'),
        'A player may enter at most three events. Matches are best of three games, first to 15 points.',
        '## Prize money',
        'INR 9,00,000 in total. In each event the champions take INR 50,000, the runners-up INR 30,000 and each losing semi-finalist INR 10,000.',
        '## Key dates',
        [
          '- Entries close: Wednesday 25 November',
          '- Last day to withdraw with a refund: Thursday 26 November',
          '- First entry list: Thursday 26 November',
          '- Final entry list: Friday 27 November',
          '- Draw: Saturday 28 November',
        ].join('\n'),
        '## How to enter',
        'Fill in the registration form below, one form per pair (a separate form for each event with a different partner), and send it to the tournament secretary, Er. Ichirang Zeliang, on +91 96155 41951 or at hornbillbadminton@gmail.com. Entry is INR 3,000 per pair and INR 2,000 for singles; payment details are on the form. Bring a BWF, BAI or NBA player ID, or a passport.',
        'The pamphlet below lists an earlier venue and entry deadline. The details here, from the registration form, are the current ones.',
        'Off court, the championship runs alongside the Hornbill Festival extravaganza: ethnic food and handicraft stalls, souvenirs, and music every evening.',
      ].join('\n\n'),
      tournamentSlug: 'hornbill-2026',
      coverPath: 'src/assets/hornbill-2026/cover.jpeg',
      // Uploaded under these names; the article lists them as downloads.
      attachmentFiles: [
        { path: 'src/assets/hornbill-2026/registration-form.pdf', name: 'Registration form.pdf' },
        { path: 'src/assets/hornbill-2026/pamphlet.jpeg', name: 'Pamphlet.jpeg' },
      ],
      published_at: '2026-11-25 09:00:00',
      status: 'published',
    },
    {
      title: 'Shuttlers United to host the 9th Dimapur District Interclub on 27–28 November',
      slug: 'interclub-2026-announcement',
      category: 'tournament',
      summary:
        'Clubs from across Dimapur meet at the Livingstone Foundation College Indoor Stadium this Friday and Saturday for the 9th Dimapur District Interclub Badminton Tournament, held in memory of Late Shri. Mayang Lima. Four age categories, Rs. 72,000 in prize money.',
      body: [
        'Shuttlers United is proud to host the 9th Dimapur District Interclub Badminton Tournament 2026, under the aegis of the Dimapur District Badminton Association. Play runs over two days, 27 and 28 November, at the Livingstone Foundation College Indoor Stadium, Landmark Colony, Dimapur.',
        'This year\'s edition is held in memory of Late Shri. Mayang Lima, and brings together clubs from across the district for two days of competitive interclub badminton.',
        '## Categories',
        'The tournament is contested in four doubles categories:',
        [
          '- 75+ (minimum age 35)',
          '- 85+ (minimum age 40)',
          '- 95+ (minimum age 45)',
          '- 105+ (minimum age 45)',
        ].join('\n'),
        '## Prizes',
        'A total of Rs. 72,000 in prize money will be awarded across the categories, along with certificates, medals and souvenirs.',
        '## The draw',
        'Each category is played as a knockout from the round of 16. The draw for all four categories is on the tournament page and will be updated with names, fixtures and results as the event progresses.',
        '## With thanks',
        'The club thanks our event partners, State Bank of India and Anil Steel, for their support, and the organising committee, led by convenor Tali Pongener, for the months of work behind the event.',
        'Players, families and badminton lovers are warmly invited to come and watch. We look forward to welcoming every club to Dimapur.',
      ].join('\n\n'),
      tournamentSlug: 'dimapur-interclub-2026',
      // The event poster, uploaded from the repo so a fresh seed has the cover.
      coverPath: 'src/assets/interclub-2026.jpeg',
      published_at: '2026-11-25 04:30:00',
      is_pinned: true,
      status: 'published',
    },
    {
      title: "Two silver medals for Shuttlers United at DAYO's 2nd Ao Open",
      slug: 'ao-open-2026-silver-medals',
      category: 'result',
      summary:
        'Dr. Along Nokdir and Katemjongshi took silver in the 85+ category, and Salang Jamir and Imolong Jamir silver in the men\'s category, at the Dimapur Ao Youth Organisation\'s tournament on 20–21 November.',
      body: [
        'Shuttlers United came home from the 2nd Ao Open Badminton Tournament 2026 with two silver medals.',
        'The tournament was organised by the Dimapur Ao Youth Organisation (DAYO) at the Indoor Stadium of the Multi Disciplinary Sports Complex, Dimapur, on 20 and 21 November under the theme "Asaya Ajanga Telongjem" (Unity through Sports). 56 teams competed across five categories: men\'s doubles (open), mixed doubles, and veterans\' 85+, 105+ and 120+ doubles.',
        '## Our medals',
        [
          '- Silver, 85+ category: Dr. Along Nokdir and Katemjongshi',
          '- Silver, men\'s category: Salang Jamir and Imolong Jamir',
        ].join('\n'),
        'It is a second Ao Open final for Salang, who also took silver in the men\'s category at the first edition, the 1st DCN Ao Open in December 2024.',
        'Congratulations to both pairs, and thanks to DAYO for hosting.',
      ].join('\n\n'),
      source_name: 'The Morung Express',
      source_url: 'https://www.morungexpress.com/dayos-2nd-ao-open-badminton-tournament-features-56-teams',
      tournamentSlug: 'ao-open-2026',
      // The prize-winners' photo from the closing day, and DAYO's poster.
      coverPath: 'src/assets/ao-open-2026/cover.jpeg',
      attachmentFiles: [{ path: 'src/assets/ao-open-2026/poster.jpeg', name: 'Poster.jpeg' }],
      published_at: '2026-11-21 12:00:00',
      status: 'published',
    },
    {
      title: 'Gold and silver for Shuttlers United at the Nagaland Masters',
      slug: 'nagaland-masters-2026-gold',
      category: 'result',
      summary:
        'Club president Amai Chingkhu and Raj Kumar Das won the men\'s doubles 45+ title, and Nadu Yaden took silver in the men\'s doubles 60+, at the Nagaland Masters Badminton Championship 2026 in Dimapur.',
      body: [
        'Club president Amai Chingkhu and Raj Kumar Das are Nagaland Masters champions, winning gold in the men\'s doubles 45+ category at the Nagaland Masters Badminton Championship 2026.',
        'The championship, organised by the Nagaland Badminton Association, was played on 23 and 24 October at the Dimapur Badminton Club Stadium in United Colony, Dimapur. 104 players took part across 72 entries and seven categories: 35+, 40+, 45+, 50+, 55+, 60+ and mixed doubles.',
        'Nadu Yaden added a silver medal in the men\'s doubles 60+ category.',
        'For Amai and Raj Kumar Das it is a second state-level podium of the season, after their silver in the men\'s doubles 40 category at the 48th Inter District and State Badminton Championship in Mon in September.',
        'Congratulations to all three.',
      ].join('\n\n'),
      source_name: 'The Morung Express',
      source_url: 'https://www.morungexpress.com/nagaland-masters-badminton-championship-2026-concludes',
      tournamentSlug: 'nagaland-masters-2026',
      // The podium (the 45+ gold) and the pair in play, from NBA's coverage.
      coverPath: 'src/assets/nagaland-masters-2026/cover.jpeg',
      attachmentFiles: [
        { path: 'src/assets/nagaland-masters-2026/podium.jpeg', name: 'On the podium.jpeg' },
        { path: 'src/assets/nagaland-masters-2026/in-play.jpeg', name: 'In play.jpeg' },
      ],
      published_at: '2026-10-24 12:00:00',
      status: 'published',
    },
    {
      title: 'Silver for Amai Chingkhu and Raj Kumar Das at the state championship',
      slug: 'nba-state-championship-2026-silver',
      category: 'result',
      summary:
        'Club president Amai Chingkhu and Raj Kumar Das finished runners-up in the men\'s doubles 40 category at the 48th Inter District and State Badminton Championship 2026 in Mon.',
      body: [
        'Club president Amai Chingkhu and Raj Kumar Das came home from the 48th Inter District and State Badminton Championship 2026 with a silver medal in the men\'s doubles 40 category.',
        'The championship, held under the Nagaland Badminton Association, concluded at the Indoor Badminton Stadium in Mon on 4 September, with players from districts across the state competing in open, age-group and veterans categories.',
        '## The final',
        'Playing for Longleng and Dimapur, Amai and Raj Kumar Das reached the men\'s doubles 40 final, where they finished runners-up to Sendongyanger and Toshikaba of Mokokchung.',
        'Congratulations to both on a podium finish at state level.',
      ].join('\n\n'),
      tournamentSlug: 'nba-state-championship-2026',
      published_at: '2026-09-04 12:00:00',
      status: 'published',
    },
  ];

  for (const { tournamentSlug, coverPath, attachmentFiles, ...row } of postRows) {
    const record = { ...row };
    const tournamentId = tournamentSlug ? tournamentIds.get(tournamentSlug) : undefined;
    if (tournamentId) record.tournament = tournamentId;
    if (coverPath) {
      record.cover = new File([readFileSync(new URL(`../${coverPath}`, import.meta.url))],
        coverPath.split('/').pop(), { type: 'image/jpeg' });
    }
    if (attachmentFiles) {
      record.attachments = attachmentFiles.map(({ path, name }) =>
        new File([readFileSync(new URL(`../${path}`, import.meta.url))], name,
          { type: path.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg' }));
    }

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
