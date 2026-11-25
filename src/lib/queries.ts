import { all, expand, first } from './db';
import { periodKey } from './format';
import { medalsFrom, type MedalWin } from './members';
import type {
  Gear,
  Member,
  MembershipPlan,
  Match,
  Payment,
  Post,
  PostCategory,
  Tournament,
  TournamentEntry,
  TournamentResult,
} from './types';

/**
 * Read helpers shared by pages. The database has no access rules of its own, so
 * every one of them must apply its own visibility filter — `is_public`,
 * ownership, or admin.
 *
 * A page that renders member-scoped data is responsible for passing the right
 * member id; these functions never infer it.
 */

/** Empty results rather than a 500 when the database is unreachable. */
async function safely<T>(work: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await work();
  } catch (error) {
    console.error(`[query:${label}]`, error);
    return fallback;
  }
}

export async function listPublicMembers(): Promise<Member[]> {
  return safely(
    () =>
      all<Member>(
        'members',
        "SELECT * FROM members WHERE is_public = 1 AND status = 'active' ORDER BY name",
      ),
    [],
    'listPublicMembers',
  );
}

export async function getMemberBySlug(slug: string): Promise<Member | null> {
  return safely(
    () => first<Member>('members', 'SELECT * FROM members WHERE slug = ?', slug),
    null,
    'getMemberBySlug',
  );
}

export async function listGearFor(memberId: string): Promise<Gear[]> {
  return safely(
    () =>
      all<Gear>(
        'gear',
        'SELECT * FROM gear WHERE member = ? ORDER BY is_current DESC, category',
        memberId,
      ),
    [],
    'listGearFor',
  );
}

export async function listEntriesFor(memberId: string): Promise<TournamentEntry[]> {
  return safely(
    async () => {
      const entries = await all<TournamentEntry>(
        'tournament_entries',
        `SELECT e.* FROM tournament_entries e
         LEFT JOIN tournaments t ON t.id = e.tournament
         WHERE e.member = ? ORDER BY t.start_date DESC`,
        memberId,
      );
      await expand(entries, 'tournament', 'tournaments');
      return expand(entries, 'partner', 'members');
    },
    [],
    'listEntriesFor',
  );
}

const PODIUM = "result IN ('winner', 'runner-up', 'semi-final')";

/**
 * Every member's medals, keyed by member id, for the roster. One read over the
 * podium finishes beats a query per card.
 */
export async function medalsByMember(): Promise<Map<string, MedalWin[]>> {
  return safely(
    async () => {
      const podium = await expand(
        await all<TournamentEntry>(
          'tournament_entries',
          `SELECT member, result, event, tournament FROM tournament_entries WHERE ${PODIUM}`,
        ),
        'tournament',
        'tournaments',
      );

      const byMember = new Map<string, TournamentEntry[]>();
      for (const entry of podium) {
        byMember.set(entry.member, [...(byMember.get(entry.member) ?? []), entry]);
      }
      return new Map([...byMember].map(([member, entries]) => [member, medalsFrom(entries)]));
    },
    new Map(),
    'medalsByMember',
  );
}

export async function listTournaments(status?: Tournament['status']): Promise<Tournament[]> {
  return safely(
    () =>
      status
        ? all<Tournament>(
            'tournaments',
            'SELECT * FROM tournaments WHERE status = ? ORDER BY start_date',
            status,
          )
        : all<Tournament>('tournaments', 'SELECT * FROM tournaments ORDER BY start_date'),
    [],
    'listTournaments',
  );
}

export async function getTournamentBySlug(slug: string): Promise<Tournament | null> {
  return safely(
    () => first<Tournament>('tournaments', 'SELECT * FROM tournaments WHERE slug = ?', slug),
    null,
    'getTournamentBySlug',
  );
}

export async function listEntriesForTournament(id: string): Promise<TournamentEntry[]> {
  return safely(
    async () => {
      const entries = await all<TournamentEntry>(
        'tournament_entries',
        'SELECT * FROM tournament_entries WHERE tournament = ? ORDER BY event',
        id,
      );
      await expand(entries, 'member', 'members');
      return expand(entries, 'partner', 'members');
    },
    [],
    'listEntriesForTournament',
  );
}

export async function listMatchesForTournament(id: string): Promise<Match[]> {
  return safely(
    async () => {
      // Bracket columns are ordered in code — `round` is a code like "QF", so
      // sorting on it here would be alphabetical, not chronological.
      const matches = await all<Match>(
        'matches',
        'SELECT * FROM matches WHERE tournament = ? ORDER BY slot',
        id,
      );
      await expand(matches, 'side_a_member', 'members');
      return expand(matches, 'side_b_member', 'members');
    },
    [],
    'listMatchesForTournament',
  );
}

/**
 * Entry counts and our best finish per tournament, for the index table. One
 * read over a small table beats a query per row.
 */
export async function tournamentSummaries(): Promise<
  Map<string, { entries: number; best?: TournamentResult }>
> {
  return safely(
    async () => {
      const rows = await all<TournamentEntry>(
        'tournament_entries',
        'SELECT tournament, result FROM tournament_entries',
      );

      const rank: TournamentResult[] = [
        'winner',
        'runner-up',
        'semi-final',
        'quarter-final',
        'round-of-16',
        'group-stage',
        'participated',
      ];

      const summaries = new Map<string, { entries: number; best?: TournamentResult }>();
      for (const entry of rows) {
        const current = summaries.get(entry.tournament) ?? { entries: 0 };
        current.entries++;
        if (!current.best || rank.indexOf(entry.result) < rank.indexOf(current.best)) {
          current.best = entry.result;
        }
        summaries.set(entry.tournament, current);
      }
      return summaries;
    },
    new Map(),
    'tournamentSummaries',
  );
}

export async function listPlans(): Promise<MembershipPlan[]> {
  return safely(
    () =>
      all<MembershipPlan>(
        'membership_plans',
        'SELECT * FROM membership_plans WHERE is_active = 1 ORDER BY amount',
      ),
    [],
    'listPlans',
  );
}

export async function listPaymentsFor(memberId: string): Promise<Payment[]> {
  return safely(
    async () =>
      expand(
        await all<Payment>(
          'payments',
          'SELECT * FROM payments WHERE member = ? ORDER BY created DESC',
          memberId,
        ),
        'plan',
        'membership_plans',
      ),
    [],
    'listPaymentsFor',
  );
}

/** The paid membership row for a member and month, if there is one. */
export const findDuesPayment = (memberId: string, period: string) =>
  first<Payment>(
    'payments',
    `SELECT * FROM payments
     WHERE member = ? AND type = 'membership' AND period = ? AND status = 'paid'`,
    memberId,
    period,
  );

/** Whether this member has settled the given month (defaults to the current one). */
export async function duesStatusFor(
  memberId: string,
  period = periodKey(),
): Promise<{ period: string; paid: boolean; payment: Payment | null }> {
  const payment = await safely(() => findDuesPayment(memberId, period), null, 'duesStatusFor');
  return { period, paid: Boolean(payment), payment };
}

const expandPosts = async (posts: Post[]) => {
  await expand(posts, 'tournament', 'tournaments');
  return expand(posts, 'author', 'members');
};

export async function listPosts(
  options: { limit?: number; category?: PostCategory; exclude?: string } = {},
): Promise<Post[]> {
  return safely(
    async () => {
      const conditions = ["status = 'published'"];
      const params: unknown[] = [];
      if (options.category) {
        conditions.push('category = ?');
        params.push(options.category);
      }
      if (options.exclude) {
        conditions.push('id != ?');
        params.push(options.exclude);
      }
      if (options.limit) params.push(options.limit);

      return expandPosts(
        await all<Post>(
          'posts',
          `SELECT * FROM posts WHERE ${conditions.join(' AND ')}
           ORDER BY is_pinned DESC, published_at DESC${options.limit ? ' LIMIT ?' : ''}`,
          ...params,
        ),
      );
    },
    [],
    'listPosts',
  );
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  return safely(
    async () => {
      const post = await first<Post>(
        'posts',
        "SELECT * FROM posts WHERE slug = ? AND status = 'published'",
        slug,
      );
      return post ? (await expandPosts([post]))[0] : null;
    },
    null,
    'getPostBySlug',
  );
}

/** How many published stories sit in each category, for the filter chips. */
export async function postCounts(): Promise<Map<PostCategory, number>> {
  return safely(
    async () => {
      const rows = await all<{ category: PostCategory; count: number }>(
        'posts',
        "SELECT category, COUNT(*) AS count FROM posts WHERE status = 'published' GROUP BY category",
      );
      return new Map(rows.map((row) => [row.category, row.count]));
    },
    new Map(),
    'postCounts',
  );
}

/* ============================================================================
   What's happening right now
   ========================================================================== */

/**
 * Tournaments on now and the ones coming next, in one read. A separate query
 * per status would be two round trips for a strip that has to render fast.
 */
export async function fixtureBoard(limit = 4): Promise<{
  ongoing: Tournament[];
  upcoming: Tournament[];
}> {
  return safely(
    async () => {
      const rows = await all<Tournament>(
        'tournaments',
        "SELECT * FROM tournaments WHERE status IN ('ongoing', 'upcoming') ORDER BY start_date",
      );

      return {
        ongoing: rows.filter((row) => row.status === 'ongoing'),
        upcoming: rows.filter((row) => row.status === 'upcoming').slice(0, limit),
      };
    },
    { ongoing: [], upcoming: [] },
    'fixtureBoard',
  );
}

/** Matches currently in play, across every tournament. Usually empty. */
export async function listLiveMatches(limit = 6): Promise<Match[]> {
  return safely(
    async () => {
      const matches = await all<Match>(
        'matches',
        "SELECT * FROM matches WHERE status = 'live' ORDER BY scheduled_at LIMIT ?",
        limit,
      );
      await expand(matches, 'tournament', 'tournaments');
      await expand(matches, 'side_a_member', 'members');
      return expand(matches, 'side_b_member', 'members');
    },
    [],
    'listLiveMatches',
  );
}

/**
 * Our most recent finishes worth reporting — a podium or better. `participated`
 * and the early rounds are filtered out: a results rail that lists every first
 * round exit is not a results rail.
 */
export async function recentResults(limit = 4): Promise<TournamentEntry[]> {
  return safely(
    async () => {
      const entries = await all<TournamentEntry>(
        'tournament_entries',
        `SELECT e.* FROM tournament_entries e
         LEFT JOIN tournaments t ON t.id = e.tournament
         WHERE e.${PODIUM} ORDER BY t.start_date DESC LIMIT ?`,
        limit,
      );
      await expand(entries, 'tournament', 'tournaments');
      await expand(entries, 'member', 'members');
      return expand(entries, 'partner', 'members');
    },
    [],
    'recentResults',
  );
}
