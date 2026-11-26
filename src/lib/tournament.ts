import { shortDate } from './format';
import type {
  GameScore,
  Match,
  MatchEvent,
  MatchRound,
  Tournament,
  TournamentEntry,
  TournamentResult,
} from './types';

/**
 * Tournament presentation logic, kept out of the pages so the bracket, the
 * group tables and the profile pages all agree on what a round is called and
 * who won a match.
 */

export const EVENT_ORDER: MatchEvent[] = [
  'MS',
  'WS',
  'MD',
  'WD',
  'XD',
  'MD40',
  'MD45',
  'MD60',
  '75+',
  '85+',
  '95+',
  '105+',
];

export const EVENT_NAMES: Record<MatchEvent, string> = {
  MS: "Men's singles",
  WS: "Women's singles",
  MD: "Men's doubles",
  WD: "Women's doubles",
  XD: 'Mixed doubles',
  MD40: "Men's doubles 40+",
  MD45: "Men's doubles 45+",
  MD60: "Men's doubles 60+",
  '75+': '75+ doubles',
  '85+': '85+ doubles',
  '95+': '95+ doubles',
  '105+': '105+ doubles',
};

/** Earliest round first. Bracket columns are laid out in this order. */
export const ROUND_ORDER: MatchRound[] = ['RR', 'R64', 'R32', 'R16', 'QF', 'SF', '3P', 'F'];

export const ROUND_LABELS: Record<MatchRound, string> = {
  RR: 'Round robin',
  R64: 'Round of 64',
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  '3P': 'Third place',
  F: 'Final',
};

/**
 * How a finish is written out. Lives here beside EVENT_NAMES and ROUND_LABELS
 * so the newsroom and the tournament pages agree on the wording. A podium
 * finish is named by its medal, the way the Medals icons name it; see
 * MEDAL_FOR in src/lib/members.ts.
 */
export const RESULT_LABELS: Record<TournamentResult, string> = {
  winner: 'Gold',
  'runner-up': 'Silver',
  'semi-final': 'Bronze',
  'quarter-final': 'Quarter-finalist',
  'round-of-16': 'Round of 16',
  'group-stage': 'Group stage',
  participated: 'Participated',
};

const roundIndex = (round: MatchRound) => ROUND_ORDER.indexOf(round);

// --- dates -------------------------------------------------------------------

type Dated = Pick<Tournament, 'start_date' | 'end_date' | 'date_label'>;

/**
 * When a tournament was played, as shown: "27 Nov 2026 – 28 Nov 2026", or the
 * day alone for a one-day event. A tournament whose days aren't known carries
 * a `date_label` ("2023") that stands in for both.
 */
export function tournamentDates(tournament: Dated): string {
  if (tournament.date_label) return tournament.date_label;
  return tournament.end_date &&
    tournament.end_date.slice(0, 10) !== tournament.start_date.slice(0, 10)
    ? `${shortDate(tournament.start_date)} – ${shortDate(tournament.end_date)}`
    : shortDate(tournament.start_date);
}

/** The start day alone, for a one-line mention such as a profile's record. */
export const tournamentDay = (tournament: Dated) =>
  tournament.date_label || shortDate(tournament.start_date);

// --- scores ------------------------------------------------------------------

/** Normalises the stored JSON, which may arrive as [] or null. */
export function games(match: Match): GameScore[] {
  return Array.isArray(match.scores)
    ? match.scores.filter(
        (game): game is GameScore =>
          Array.isArray(game) && game.length === 2 && game.every((n) => typeof n === 'number'),
      )
    : [];
}

/** Games won by each side — the headline score, e.g. 2–1. */
export function gamesWon(match: Match): [number, number] {
  let a = 0;
  let b = 0;
  for (const [pointsA, pointsB] of games(match)) {
    if (pointsA > pointsB) a++;
    else if (pointsB > pointsA) b++;
  }
  return [a, b];
}

/** "21-18, 19-21, 21-15" — the per-game detail shown under a bracket match. */
export function scoreLine(match: Match): string {
  if (match.status === 'walkover') return 'Walkover';
  return games(match)
    .map(([a, b]) => `${a}-${b}`)
    .join(', ');
}

/**
 * The winner as recorded, falling back to the game count. An admin who fills in
 * scores but forgets the winner field still gets a correct bracket.
 */
export function winnerOf(match: Match): 'a' | 'b' | null {
  if (match.winner) return match.winner;
  if (match.status !== 'completed') return null;
  const [a, b] = gamesWon(match);
  if (a === b) return null;
  return a > b ? 'a' : 'b';
}

// --- bracket -----------------------------------------------------------------

export interface BracketColumn {
  round: MatchRound;
  label: string;
  matches: Match[];
}

/**
 * Groups playoff matches into ordered bracket columns. The third-place match
 * sits in its own column before the final, which is where it is actually
 * played and how draw sheets print it.
 */
export function buildBracket(matches: Match[], event: MatchEvent): BracketColumn[] {
  const playoff = matches.filter((match) => match.event === event && match.stage === 'playoff');

  return ROUND_ORDER.map((round) => ({
    round,
    label: ROUND_LABELS[round],
    matches: playoff
      .filter((match) => match.round === round)
      .sort((a, b) => a.slot - b.slot),
  }))
    .filter((column) => column.matches.length > 0)
    .sort((a, b) => roundIndex(a.round) - roundIndex(b.round));
}

// --- group standings ---------------------------------------------------------

export interface StandingRow {
  name: string;
  memberId?: string;
  slug?: string;
  played: number;
  won: number;
  lost: number;
  gamesFor: number;
  gamesAgainst: number;
  pointsFor: number;
  pointsAgainst: number;
}

/**
 * Derives a group table from the group-stage matches themselves, so a table can
 * never disagree with the results printed below it. Ordered by wins, then game
 * difference, then point difference — the standard badminton tiebreak short of
 * a head-to-head, which only matters once a group is genuinely level.
 */
export function standingsFor(matches: Match[], event: MatchEvent, group?: string): StandingRow[] {
  const relevant = matches.filter(
    (match) =>
      match.event === event &&
      match.stage === 'group' &&
      (group === undefined || match.group_name === group),
  );

  const rows = new Map<string, StandingRow>();

  const rowFor = (name: string, memberId?: string, slug?: string): StandingRow => {
    const existing = rows.get(name);
    if (existing) {
      // A side may be linked to a member on one row and not another; keep the link.
      existing.memberId ??= memberId;
      existing.slug ??= slug;
      return existing;
    }
    const created: StandingRow = {
      name,
      memberId,
      slug,
      played: 0,
      won: 0,
      lost: 0,
      gamesFor: 0,
      gamesAgainst: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    };
    rows.set(name, created);
    return created;
  };

  for (const match of relevant) {
    const a = rowFor(
      match.side_a_name,
      match.side_a_member,
      match.expand?.side_a_member?.slug,
    );
    const b = rowFor(
      match.side_b_name,
      match.side_b_member,
      match.expand?.side_b_member?.slug,
    );

    const winner = winnerOf(match);
    if (!winner) continue; // Unplayed fixtures do not count towards a table.

    a.played++;
    b.played++;

    const [gamesA, gamesB] = gamesWon(match);
    a.gamesFor += gamesA;
    a.gamesAgainst += gamesB;
    b.gamesFor += gamesB;
    b.gamesAgainst += gamesA;

    for (const [pointsA, pointsB] of games(match)) {
      a.pointsFor += pointsA;
      a.pointsAgainst += pointsB;
      b.pointsFor += pointsB;
      b.pointsAgainst += pointsA;
    }

    if (winner === 'a') {
      a.won++;
      b.lost++;
    } else {
      b.won++;
      a.lost++;
    }
  }

  return [...rows.values()].sort(
    (x, y) =>
      y.won - x.won ||
      y.gamesFor - y.gamesAgainst - (x.gamesFor - x.gamesAgainst) ||
      y.pointsFor - y.pointsAgainst - (x.pointsFor - x.pointsAgainst) ||
      x.name.localeCompare(y.name),
  );
}

/** Distinct group names present for an event, in alphabetical order. */
export function groupsFor(matches: Match[], event: MatchEvent): string[] {
  return [
    ...new Set(
      matches
        .filter((match) => match.event === event && match.stage === 'group' && match.group_name)
        .map((match) => match.group_name as string),
    ),
  ].sort();
}

// --- entries -----------------------------------------------------------------

/** Seeded entries first (1, 2, 3…), then everyone else by name. */
export function bySeedThenName(a: TournamentEntry, b: TournamentEntry): number {
  if (a.seed && b.seed) return a.seed - b.seed;
  if (a.seed) return -1;
  if (b.seed) return 1;
  return (a.expand?.member?.name ?? '').localeCompare(b.expand?.member?.name ?? '');
}
