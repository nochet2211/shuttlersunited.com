/** Shapes of the PocketBase collections. Kept in sync with scripts/setup-pocketbase.mjs. */

export type Role = 'member' | 'admin';
export type MemberStatus = 'active' | 'inactive' | 'pending';
export type Handedness = 'right' | 'left';
export type PlayStyle = 'attacking' | 'defensive' | 'all-round';

export type Office =
  | 'President'
  | 'Vice President'
  | 'General Secretary'
  | 'Secretary'
  | 'Joint Secretary'
  | 'Treasurer'
  | 'Finance Secretary'
  | 'Finance Convenor'
  | 'Finance Member'
  | 'Executive Member';

/** The highest level a member competes at, for players who represent the club. */
export type CompetitiveLevel = 'district' | 'state' | 'national' | 'international';

/**
 * A career honour the club knows of but has no dated tournament record for,
 * e.g. "U-19 doubles state champion". A medal, when set, counts towards the
 * member's medals; `count` is how many times it was won (default 1).
 */
export interface Honour {
  title: string;
  /** For a doubles honour, who it was won with. */
  partner?: string;
  medal?: 'gold' | 'silver' | 'bronze';
  count?: number;
}

export interface Member {
  id: string;
  phone: string;
  name: string;
  slug: string;
  role: Role;
  status: MemberStatus;
  avatar?: string;
  bio?: string;
  date_of_birth?: string;
  gender?: 'male' | 'female' | 'other';
  height_cm?: number;
  handedness?: Handedness;
  play_style?: PlayStyle;
  preferred_events?: string[];
  jersey_number?: number;
  skill_level?: 'beginner' | 'intermediate' | 'advanced' | 'competitive';
  joined_on?: string;
  city?: string;
  emergency_contact?: string;
  /** Set for office bearers only; see OFFICES in src/lib/members.ts. */
  office?: Office;
  competes_at?: CompetitiveLevel;
  /** Career honours with no tournament record behind them; see Honour. */
  honours?: Honour[];
  is_public: boolean;
  created: string;
  updated: string;
}

export type GearCategory =
  | 'racket'
  | 'string'
  | 'grip'
  | 'shoes'
  | 'shuttle'
  | 'bag'
  | 'apparel';

export interface Gear {
  id: string;
  member: string;
  category: GearCategory;
  brand: string;
  model: string;
  /** e.g. "26 lbs", "4U G5" — the detail players actually care about. */
  spec?: string;
  notes?: string;
  is_current: boolean;
}

export type TournamentLevel =
  | 'club'
  | 'district'
  | 'state'
  | 'national'
  | 'open';

export type TournamentStatus = 'upcoming' | 'ongoing' | 'completed' | 'cancelled';

export interface Tournament {
  id: string;
  name: string;
  slug: string;
  description?: string;
  venue?: string;
  city?: string;
  start_date: string;
  end_date?: string;
  level: TournamentLevel;
  status: TournamentStatus;
  registration_deadline?: string;
  entry_fee?: number;
  organizer?: string;
  /** One stage per line, e.g. "Group stage — 4 groups of 4". */
  format?: string;
  prize_pool?: number;
  prize_distribution?: PrizeSlot[];
  draw_size?: number;
  banner?: string;
  external_url?: string;
}

export interface PrizeSlot {
  place: string;
  amount: number;
  event?: MatchEvent;
  note?: string;
}

// MD40 / MD45 / MD60 are veterans' men's doubles (each player 40 / 45 / 60
// or over). The 75+…105+
// categories are combined-age doubles (the pair's ages add up to at least the
// number), as played at the district interclub.
export type MatchEvent =
  | 'MS'
  | 'WS'
  | 'MD'
  | 'WD'
  | 'XD'
  | 'MD40'
  | 'MD45'
  | 'MD60'
  | '75+'
  | '85+'
  | '95+'
  | '105+';

export type TournamentResult =
  | 'winner'
  | 'runner-up'
  | 'semi-final'
  | 'quarter-final'
  | 'round-of-16'
  | 'group-stage'
  | 'participated';

export interface TournamentEntry {
  id: string;
  tournament: string;
  member: string;
  event: MatchEvent;
  partner?: string;
  partner_name?: string;
  result: TournamentResult;
  seed?: number;
  qualification?: string;
  group_name?: string;
  notes?: string;
  expand?: {
    tournament?: Tournament;
    member?: Member;
    partner?: Member;
  };
}

/** Bracket rounds, ordered from earliest to latest. `RR` is round robin. */
export type MatchRound = 'RR' | 'R64' | 'R32' | 'R16' | 'QF' | 'SF' | '3P' | 'F';

export type MatchStage = 'group' | 'playoff';

export type MatchStatus = 'scheduled' | 'live' | 'completed' | 'walkover' | 'retired';

/** One game: [side A points, side B points]. */
export type GameScore = [number, number];

export interface Match {
  id: string;
  tournament: string;
  event: MatchEvent;
  stage: MatchStage;
  round: MatchRound;
  /** Position within the round, top to bottom. */
  slot: number;
  group_name?: string;
  side_a_name: string;
  side_a_member?: string;
  side_a_seed?: number;
  side_b_name: string;
  side_b_member?: string;
  side_b_seed?: number;
  scores?: GameScore[];
  winner?: 'a' | 'b';
  status: MatchStatus;
  scheduled_at?: string;
  court?: string;
  vod_url?: string;
  expand?: {
    side_a_member?: Member;
    side_b_member?: Member;
    tournament?: Tournament;
  };
}

export interface MembershipPlan {
  id: string;
  name: string;
  amount: number;
  interval: 'monthly' | 'quarterly' | 'annual';
  description?: string;
  benefits?: string[];
  is_active: boolean;
}

export type PaymentType = 'membership' | 'booking' | 'tournament' | 'other';
export type PaymentStatus =
  | 'created'
  | 'attempted'
  | 'paid'
  | 'failed'
  | 'refunded';

export interface Payment {
  id: string;
  member: string;
  plan?: string;
  booking?: string;
  type: PaymentType;
  status: PaymentStatus;
  /** Stored in paise, the unit Razorpay works in — never in rupees. */
  amount: number;
  currency: string;
  /** "2026-08" — the dues month this settles. Unique per member for membership. */
  period?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  method?: string;
  paid_at?: string;
  failure_reason?: string;
  notes?: string;
  expand?: {
    member?: Member;
    plan?: MembershipPlan;
  };
}

export interface OtpCode {
  id: string;
  phone: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  consumed: boolean;
}

/**
 * A newsroom item. The home page is a news feed, so this is the collection it
 * reads from: club announcements, fixture news, results write-ups, facility
 * notices and circulars from the governing bodies.
 */
export type PostCategory =
  | 'club'
  | 'tournament'
  | 'result'
  | 'governing-body'
  | 'facility'
  | 'notice';

export type PostStatus = 'draft' | 'published';

export interface Post {
  id: string;
  title: string;
  slug: string;
  category: PostCategory;
  summary: string;
  body?: string;
  cover?: string;
  /** Files readers can download: a pamphlet, an entry form. */
  attachments?: string[];
  /** Credited publisher for a governing-body item — "Badminton Association of India". */
  source_name?: string;
  source_url?: string;
  tournament?: string;
  author?: string;
  /** Explicit, so a story can be backdated or queued rather than tracking `created`. */
  published_at: string;
  is_pinned: boolean;
  status: PostStatus;
  created: string;
  updated: string;
  expand?: {
    tournament?: Tournament;
    author?: Member;
  };
}
