-- Shuttlers United schema on Cloudflare D1.
--
-- Carried over from PocketBase, column for column, so rows import unchanged and
-- the app keeps PocketBase's conventions:
--   * ids are 15 lowercase alphanumerics (src/lib/db.ts mints them);
--   * an unset text, select or relation is '' and an unset number is 0, never
--     NULL — pages test these with plain truthiness;
--   * dates are UTC text, "2026-11-27 03:30:00.000Z", which sorts as a string;
--   * booleans are 0/1 and JSON columns hold text; src/lib/db.ts decodes both.
--
-- Relations are plain text columns without FOREIGN KEY constraints: an empty
-- relation is '', which a foreign key would reject. Nothing in the app deletes
-- a member or a tournament, so the cascades PocketBase declared never fired.

CREATE TABLE members (
  id                TEXT PRIMARY KEY NOT NULL,
  phone             TEXT NOT NULL,
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'member',
  status            TEXT NOT NULL DEFAULT 'active',
  avatar            TEXT NOT NULL DEFAULT '',
  bio               TEXT NOT NULL DEFAULT '',
  date_of_birth     TEXT NOT NULL DEFAULT '',
  gender            TEXT NOT NULL DEFAULT '',
  height_cm         NUMERIC NOT NULL DEFAULT 0,
  handedness        TEXT NOT NULL DEFAULT '',
  play_style        TEXT NOT NULL DEFAULT '',
  preferred_events  TEXT NOT NULL DEFAULT '[]',
  jersey_number     NUMERIC NOT NULL DEFAULT 0,
  skill_level       TEXT NOT NULL DEFAULT '',
  joined_on         TEXT NOT NULL DEFAULT '',
  city              TEXT NOT NULL DEFAULT '',
  emergency_contact TEXT NOT NULL DEFAULT '',
  office            TEXT NOT NULL DEFAULT '',
  competes_at       TEXT NOT NULL DEFAULT '',
  honours           TEXT,
  is_public         INTEGER NOT NULL DEFAULT 0,
  created           TEXT NOT NULL DEFAULT '',
  updated           TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX idx_members_phone ON members (phone);
CREATE UNIQUE INDEX idx_members_slug ON members (slug);

CREATE TABLE otp_codes (
  id         TEXT PRIMARY KEY NOT NULL,
  phone      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts   NUMERIC NOT NULL DEFAULT 0,
  consumed   INTEGER NOT NULL DEFAULT 0,
  created    TEXT NOT NULL DEFAULT '',
  updated    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_otp_phone ON otp_codes (phone, created);

CREATE TABLE gear (
  id         TEXT PRIMARY KEY NOT NULL,
  member     TEXT NOT NULL,
  category   TEXT NOT NULL,
  brand      TEXT NOT NULL,
  model      TEXT NOT NULL,
  spec       TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  is_current INTEGER NOT NULL DEFAULT 0,
  created    TEXT NOT NULL DEFAULT '',
  updated    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_gear_member ON gear (member);

CREATE TABLE tournaments (
  id                    TEXT PRIMARY KEY NOT NULL,
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  venue                 TEXT NOT NULL DEFAULT '',
  city                  TEXT NOT NULL DEFAULT '',
  start_date            TEXT NOT NULL,
  end_date              TEXT NOT NULL DEFAULT '',
  level                 TEXT NOT NULL,
  status                TEXT NOT NULL,
  registration_deadline TEXT NOT NULL DEFAULT '',
  entry_fee             NUMERIC NOT NULL DEFAULT 0,
  organizer             TEXT NOT NULL DEFAULT '',
  format                TEXT NOT NULL DEFAULT '',
  prize_pool            NUMERIC NOT NULL DEFAULT 0,
  prize_distribution    TEXT,
  draw_size             NUMERIC NOT NULL DEFAULT 0,
  banner                TEXT NOT NULL DEFAULT '',
  external_url          TEXT NOT NULL DEFAULT '',
  created               TEXT NOT NULL DEFAULT '',
  updated               TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX idx_tournaments_slug ON tournaments (slug);

CREATE TABLE posts (
  id           TEXT PRIMARY KEY NOT NULL,
  title        TEXT NOT NULL,
  slug         TEXT NOT NULL,
  category     TEXT NOT NULL,
  summary      TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  cover        TEXT NOT NULL DEFAULT '',
  attachments  TEXT NOT NULL DEFAULT '[]',
  source_name  TEXT NOT NULL DEFAULT '',
  source_url   TEXT NOT NULL DEFAULT '',
  tournament   TEXT NOT NULL DEFAULT '',
  author       TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  is_pinned    INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL,
  created      TEXT NOT NULL DEFAULT '',
  updated      TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX idx_posts_slug ON posts (slug);
CREATE INDEX idx_posts_feed ON posts (status, published_at);

CREATE TABLE tournament_entries (
  id            TEXT PRIMARY KEY NOT NULL,
  tournament    TEXT NOT NULL,
  member        TEXT NOT NULL,
  event         TEXT NOT NULL,
  partner       TEXT NOT NULL DEFAULT '',
  partner_name  TEXT NOT NULL DEFAULT '',
  result        TEXT NOT NULL,
  seed          NUMERIC NOT NULL DEFAULT 0,
  qualification TEXT NOT NULL DEFAULT '',
  group_name    TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  created       TEXT NOT NULL DEFAULT '',
  updated       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_entries_member ON tournament_entries (member);
CREATE INDEX idx_entries_tournament ON tournament_entries (tournament);

CREATE TABLE matches (
  id            TEXT PRIMARY KEY NOT NULL,
  tournament    TEXT NOT NULL,
  event         TEXT NOT NULL,
  stage         TEXT NOT NULL,
  round         TEXT NOT NULL,
  slot          NUMERIC NOT NULL DEFAULT 0,
  group_name    TEXT NOT NULL DEFAULT '',
  side_a_name   TEXT NOT NULL,
  side_a_member TEXT NOT NULL DEFAULT '',
  side_a_seed   NUMERIC NOT NULL DEFAULT 0,
  side_b_name   TEXT NOT NULL,
  side_b_member TEXT NOT NULL DEFAULT '',
  side_b_seed   NUMERIC NOT NULL DEFAULT 0,
  scores        TEXT,
  winner        TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL,
  scheduled_at  TEXT NOT NULL DEFAULT '',
  court         TEXT NOT NULL DEFAULT '',
  vod_url       TEXT NOT NULL DEFAULT '',
  created       TEXT NOT NULL DEFAULT '',
  updated       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_matches_tournament ON matches (tournament, event);
CREATE INDEX idx_matches_bracket ON matches (tournament, event, round, slot);

CREATE TABLE courts (
  id          TEXT PRIMARY KEY NOT NULL,
  name        TEXT NOT NULL,
  venue       TEXT NOT NULL,
  surface     TEXT NOT NULL DEFAULT '',
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 0,
  created     TEXT NOT NULL DEFAULT '',
  updated     TEXT NOT NULL DEFAULT ''
);

CREATE TABLE bookings (
  id           TEXT PRIMARY KEY NOT NULL,
  court        TEXT NOT NULL,
  member       TEXT NOT NULL,
  date         TEXT NOT NULL,
  start_minute NUMERIC NOT NULL,
  end_minute   NUMERIC NOT NULL,
  status       TEXT NOT NULL,
  notes        TEXT NOT NULL DEFAULT '',
  created      TEXT NOT NULL DEFAULT '',
  updated      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_bookings_slot ON bookings (court, date, start_minute);

CREATE TABLE membership_plans (
  id          TEXT PRIMARY KEY NOT NULL,
  name        TEXT NOT NULL,
  amount      NUMERIC NOT NULL, -- paise
  interval    TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  benefits    TEXT,
  is_active   INTEGER NOT NULL DEFAULT 0,
  created     TEXT NOT NULL DEFAULT '',
  updated     TEXT NOT NULL DEFAULT ''
);

-- The ledger. Only server code writes here; see src/actions/payments.ts.
CREATE TABLE payments (
  id                  TEXT PRIMARY KEY NOT NULL,
  member              TEXT NOT NULL,
  plan                TEXT NOT NULL DEFAULT '',
  booking             TEXT NOT NULL DEFAULT '',
  type                TEXT NOT NULL,
  status              TEXT NOT NULL,
  amount              NUMERIC NOT NULL, -- paise
  currency            TEXT NOT NULL DEFAULT '',
  period              TEXT NOT NULL DEFAULT '', -- "2026-08"
  razorpay_order_id   TEXT NOT NULL DEFAULT '',
  razorpay_payment_id TEXT NOT NULL DEFAULT '',
  razorpay_signature  TEXT NOT NULL DEFAULT '',
  method              TEXT NOT NULL DEFAULT '',
  paid_at             TEXT NOT NULL DEFAULT '',
  failure_reason      TEXT NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  created             TEXT NOT NULL DEFAULT '',
  updated             TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_payments_member ON payments (member, period);
CREATE UNIQUE INDEX idx_payments_order ON payments (razorpay_order_id) WHERE razorpay_order_id != '';
