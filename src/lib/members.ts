import { EVENT_NAMES } from './tournament';
import type {
  CompetitiveLevel,
  Honour,
  Member,
  Office,
  TournamentEntry,
  TournamentResult,
} from './types';

/**
 * Club offices, most senior first. The order is the roster order: office
 * bearers lead the members list by rank, and everyone else follows by name.
 * Mirrors the values the `office` column holds (migrations/0001_init.sql).
 */
export const OFFICES: Office[] = [
  'President',
  'Vice President',
  'General Secretary',
  'Secretary',
  'Joint Secretary',
  'Treasurer',
  'Finance Secretary',
  'Finance Convenor',
  'Finance Member',
  'Executive Member',
];

const rank = (member: Member) =>
  member.office ? OFFICES.indexOf(member.office) : OFFICES.length;

/** Office bearers by rank, then everyone alphabetically. */
export function byOfficeThenName(a: Member, b: Member): number {
  return rank(a) - rank(b) || a.name.localeCompare(b.name);
}

/** "State player", "National player"… for a member who competes for the club. */
export const competitiveLabel = (level: CompetitiveLevel) =>
  `${level[0].toUpperCase()}${level.slice(1)} player`;

/**
 * Which ring an avatar wears. Office outranks playing level, so someone who is
 * both keeps the gold.
 */
export const haloFor = (member: Member): 'office' | 'pro' | undefined =>
  member.office ? 'office' : member.competes_at ? 'pro' : undefined;

// --- medals -------------------------------------------------------------------

export type Medal = 'gold' | 'silver' | 'bronze';

/** Most precious first; the order medals are shown in. */
export const MEDAL_ORDER: Medal[] = ['gold', 'silver', 'bronze'];

/**
 * The medal a finish earns. Badminton gives a bronze to both losing
 * semi-finalists, so a semi-final finish is bronze; anything earlier is none.
 */
export const MEDAL_FOR: Partial<Record<TournamentResult, Medal>> = {
  winner: 'gold',
  'runner-up': 'silver',
  'semi-final': 'bronze',
};

/** One medal won: its colour, and where it was won (the tooltip text). */
export interface MedalWin {
  medal: Medal;
  label: string;
}

const byMedal = (a: MedalWin, b: MedalWin) =>
  MEDAL_ORDER.indexOf(a.medal) - MEDAL_ORDER.indexOf(b.medal);

/** The medals in a set of entries, gold first. */
export function medalsFrom(entries: TournamentEntry[]): MedalWin[] {
  return entries
    .flatMap((entry) => {
      const medal = MEDAL_FOR[entry.result];
      const tournament = entry.expand?.tournament?.name ?? 'Tournament';
      return medal ? [{ medal, label: `${tournament} · ${EVENT_NAMES[entry.event]}` }] : [];
    })
    .sort(byMedal);
}

/** A member's honours as medals, one per time won, for those that carry one. */
export function medalsFromHonours(honours: Honour[] | undefined): MedalWin[] {
  return (Array.isArray(honours) ? honours : [])
    .flatMap((honour) =>
      honour.medal
        ? Array.from({ length: Math.max(1, honour.count ?? 1) }, () => ({
            medal: honour.medal!,
            // The partner shows in the Honours list, not in the medal tooltip.
            label: honour.title,
          }))
        : [],
    )
    .sort(byMedal);
}

/** Every medal a member holds, from results and honours together, gold first. */
export const allMedals = (fromEntries: MedalWin[], honours: Honour[] | undefined) =>
  [...fromEntries, ...medalsFromHonours(honours)].sort(byMedal);
