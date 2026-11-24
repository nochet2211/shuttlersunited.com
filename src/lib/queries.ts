import { getAdminClient, isNotFound } from './pocketbase';
import { periodKey, dayBounds } from './format';
import type {
  Booking,
  Court,
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
 * Read helpers shared by pages. These use the superuser client, so every one of
 * them must apply its own visibility filter — `is_public`, ownership, or admin.
 *
 * A page that renders member-scoped data is responsible for passing the right
 * member id; these functions never infer it.
 */

/** Empty results rather than a 500 when PocketBase is unreachable. */
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
    async () => {
      const pb = await getAdminClient();
      return pb.collection('members').getFullList<Member>({
        filter: 'is_public = true && status = "active"',
        sort: 'name',
      });
    },
    [],
    'listPublicMembers',
  );
}

export async function getMemberBySlug(slug: string): Promise<Member | null> {
  try {
    const pb = await getAdminClient();
    return await pb
      .collection('members')
      .getFirstListItem<Member>(pb.filter('slug = {:slug}', { slug }));
  } catch (error) {
    if (isNotFound(error)) return null;
    console.error('[query:getMemberBySlug]', error);
    return null;
  }
}

export async function listGearFor(memberId: string): Promise<Gear[]> {
  return safely(
    async () => {
      const pb = await getAdminClient();
      return pb.collection('gear').getFullList<Gear>({
        filter: pb.filter('member = {:member}', { member: memberId }),
        sort: '-is_current,category',
      });
    },
    [],
    'listGearFor',
  );
}

export async function listEntriesFor(memberId: string): Promise<TournamentEntry[]> {
  return safely(
    async () => {
      const pb = await getAdminClient();
      return pb.collection('tournament_entries').getFullList<TournamentEntry>({
        filter: pb.filter('member = {:member}', { member: memberId }),
        expand: 'tournament,partner',
        sort: '-tournament.start_date',
      });
    },
    [],
    'listEntriesFor',
  );
}

export async function listTournaments(status?: Tournament['status']): Promise<Tournament[]> {
  return safely(
    async () => {
      const pb = await getAdminClient();
      return pb.collection('tournaments').getFullList<Tournament>({
        filter: status ? pb.filter('status = {:status}', { status }) : '',
        sort: 'start_date',
      });
    },
    [],
    'listTournaments',
  );
}

export async function getTournamentBySlug(slug: string): Promise<Tournament | null> {
  try {
    const pb = await getAdminClient();
    return await pb
      .collection('tournaments')
      .getFirstListItem<Tournament>(pb.filter('slug = {:slug}', { slug }));
  } catch (error) {
    if (isNotFound(error)) return null;
    console.error('[query:getTournamentBySlug]', error);
    return null;
  }
}

export async function listEntriesForTournament(id: string): Promise<TournamentEntry[]> {
  return safely(
    async () => {
      const pb = await getAdminClient();
      return pb.collection('tournament_entries').getFullList<TournamentEntry>({
        filter: pb.filter('tournament = {:id}', { id }),
        expand: 'member,partner',
        sort: 'event',
      });
    },
    [],
    'listEntriesForTournament',
  );
}

export async function listMatchesForTournament(id: string): Promise<Match[]> {
  return safely(
    async () => {
      const pb = await getAdminClient();
      return pb.collection('matches').getFullList<Match>({
        filter: pb.filter('tournament = {:id}', { id }),
        expand: 'side_a_member,side_b_member',
        // Bracket columns are ordered in code — `round` is a select, so
        // PocketBase would sort it alphabetically, not chronologically.
        sort: 'slot',
      });
    },
    [],
    'listMatchesForTournament',
  );
}

/**
 * Entry counts and our best finish per tournament, for the index table. One
 * read over a small collection beats a query per row.
 */
export async function tournamentSummaries(): Promise<
  Map<string, { entries: number; best?: TournamentResult }>
> {
  return safely(
    async () => {
      const pb = await getAdminClient();
      const all = await pb.collection('tournament_entries').getFullList<TournamentEntry>({
        fields: 'tournament,result',
      });

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
      for (const entry of all) {
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

export async function listCourts(): Promise<Court[]> {
  return safely(
    async () => {
      const pb = await getAdminClient();
      return pb.collection('courts').getFullList<Court>({ filter: 'is_active = true', sort: 'name' });
    },
    [],
    'listCourts',
  );
}

export async function listBookingsOn(date: string): Promise<Booking[]> {
  return safely(
    async () => {
      const pb = await getAdminClient();
      const day = dayBounds(date);
      return pb.collection('bookings').getFullList<Booking>({
        filter: pb.filter('date >= {:dayStart} && date < {:dayEnd} && status = "confirmed"', {
          dayStart: day.start,
          dayEnd: day.end,
        }),
        expand: 'court,member',
        sort: 'start_minute',
      });
    },
    [],
    'listBookingsOn',
  );
}

export async function listBookingsFor(memberId: string): Promise<Booking[]> {
  return safely(
    async () => {
      const pb = await getAdminClient();
      return pb.collection('bookings').getFullList<Booking>({
        filter: pb.filter('member = {:member}', { member: memberId }),
        expand: 'court',
        sort: '-date,-start_minute',
      });
    },
    [],
    'listBookingsFor',
  );
}

export async function listPlans(): Promise<MembershipPlan[]> {
  return safely(
    async () => {
      const pb = await getAdminClient();
      return pb
        .collection('membership_plans')
        .getFullList<MembershipPlan>({ filter: 'is_active = true', sort: 'amount' });
    },
    [],
    'listPlans',
  );
}

export async function listPaymentsFor(memberId: string): Promise<Payment[]> {
  return safely(
    async () => {
      const pb = await getAdminClient();
      return pb.collection('payments').getFullList<Payment>({
        filter: pb.filter('member = {:member}', { member: memberId }),
        expand: 'plan',
        sort: '-created',
      });
    },
    [],
    'listPaymentsFor',
  );
}

/** Whether this member has settled the given month (defaults to the current one). */
export async function duesStatusFor(
  memberId: string,
  period = periodKey(),
): Promise<{ period: string; paid: boolean; payment: Payment | null }> {
  try {
    const pb = await getAdminClient();
    const payment = await pb
      .collection('payments')
      .getFirstListItem<Payment>(
        pb.filter(
          'member = {:member} && type = "membership" && period = {:period} && status = "paid"',
          { member: memberId, period },
        ),
      );
    return { period, paid: true, payment };
  } catch (error) {
    if (!isNotFound(error)) console.error('[query:duesStatusFor]', error);
    return { period, paid: false, payment: null };
  }
}

/** Club-wide numbers for the home page. Cheap enough to compute per request. */
export async function clubStats(): Promise<{
  members: number;
  tournaments: number;
  titles: number;
}> {
  return safely(
    async () => {
      const pb = await getAdminClient();
      const [members, tournaments, titles] = await Promise.all([
        pb.collection('members').getList(1, 1, { filter: 'status = "active"' }),
        pb.collection('tournaments').getList(1, 1, {}),
        pb.collection('tournament_entries').getList(1, 1, { filter: 'result = "winner"' }),
      ]);
      return {
        members: members.totalItems,
        tournaments: tournaments.totalItems,
        titles: titles.totalItems,
      };
    },
    { members: 0, tournaments: 0, titles: 0 },
    'clubStats',
  );
}

/* ============================================================================
   Newsroom
   ========================================================================== */

/**
 * The feed. Every read here is filtered to `status = "published"` because these
 * helpers use the superuser client, which bypasses the collection's own rule —
 * without the filter a draft would be visible on the home page.
 *
 * Pinned stories sort first; within a pin group, newest first.
 */
export async function listPosts(
  options: { limit?: number; category?: PostCategory; exclude?: string } = {},
): Promise<Post[]> {
  return safely(
    async () => {
      const pb = await getAdminClient();

      const conditions = ['status = "published"'];
      const params: Record<string, string> = {};
      if (options.category) {
        conditions.push('category = {:category}');
        params.category = options.category;
      }
      if (options.exclude) {
        conditions.push('id != {:exclude}');
        params.exclude = options.exclude;
      }

      const filter = pb.filter(conditions.join(' && '), params);
      const sort = '-is_pinned,-published_at';

      if (options.limit) {
        const page = await pb
          .collection('posts')
          .getList<Post>(1, options.limit, { filter, sort, expand: 'tournament,author' });
        return page.items;
      }

      return pb
        .collection('posts')
        .getFullList<Post>({ filter, sort, expand: 'tournament,author' });
    },
    [],
    'listPosts',
  );
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  try {
    const pb = await getAdminClient();
    return await pb
      .collection('posts')
      .getFirstListItem<Post>(
        pb.filter('slug = {:slug} && status = "published"', { slug }),
        { expand: 'tournament,author' },
      );
  } catch (error) {
    if (isNotFound(error)) return null;
    console.error('[query:getPostBySlug]', error);
    return null;
  }
}

/** How many published stories sit in each category, for the filter chips. */
export async function postCounts(): Promise<Map<PostCategory, number>> {
  return safely(
    async () => {
      const pb = await getAdminClient();
      const all = await pb.collection('posts').getFullList<Post>({
        filter: 'status = "published"',
        fields: 'category',
      });

      const counts = new Map<PostCategory, number>();
      for (const post of all) {
        counts.set(post.category, (counts.get(post.category) ?? 0) + 1);
      }
      return counts;
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
      const pb = await getAdminClient();
      const rows = await pb.collection('tournaments').getFullList<Tournament>({
        filter: 'status = "ongoing" || status = "upcoming"',
        sort: 'start_date',
      });

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
      const pb = await getAdminClient();
      const page = await pb.collection('matches').getList<Match>(1, limit, {
        filter: 'status = "live"',
        expand: 'tournament,side_a_member,side_b_member',
        sort: 'scheduled_at',
      });
      return page.items;
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
      const pb = await getAdminClient();
      const page = await pb.collection('tournament_entries').getList<TournamentEntry>(1, limit, {
        filter: 'result = "winner" || result = "runner-up" || result = "semi-final"',
        expand: 'tournament,member,partner',
        sort: '-tournament.start_date',
      });
      return page.items;
    },
    [],
    'recentResults',
  );
}
