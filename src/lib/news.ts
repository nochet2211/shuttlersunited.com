import type { Post, PostCategory } from './types';
import { fileUrl } from './files';

/**
 * Newsroom presentation helpers: how a category is labelled, how a body string
 * becomes blocks, and how a publication date reads in a feed.
 *
 * DESIGN.md keeps the *product-state* palette off marketing surfaces — state
 * colour means "settled / overdue / error" and stays in dashboards. Taxonomy is
 * a separate ladder (Deviation 6): every category owns a hue, because a feed
 * that renders six kinds of post as six identical grey badges gives a reader
 * nothing to scan. The source credit still carries provenance; the hue carries
 * kind.
 */

export const CATEGORY_LABELS: Record<PostCategory, string> = {
  club: 'Club',
  tournament: 'Tournament',
  result: 'Result',
  'governing-body': 'Governing body',
  facility: 'Facility',
  notice: 'Notice',
};

/** Feed filter order — the two people scan for first, then the rest. */
export const CATEGORY_ORDER: PostCategory[] = [
  'tournament',
  'result',
  'governing-body',
  'club',
  'facility',
  'notice',
];

export function categoryLabel(category: PostCategory): string {
  return CATEGORY_LABELS[category] ?? 'News';
}

/**
 * The CSS custom properties a category contributes to a subtree. Components
 * spread these onto a wrapper and the chromatic utilities (`card-feature`,
 * `accent-rule`) read them, so the hue is chosen once here rather than in a
 * class-name lookup repeated per component.
 */
export function categoryVars(category: PostCategory): string {
  return [
    `--cat: var(--color-cat-${category})`,
    `--cat-tint: var(--color-cat-${category}-tint)`,
    `--cat-on-tint: var(--color-cat-${category}-on-tint)`,
  ].join('; ');
}

/**
 * Tailwind classes for a category badge — tinted fill, hue-matched label.
 * Written out in full because Tailwind scans source statically and cannot see
 * a class name assembled from a template literal.
 */
export const CATEGORY_BADGE: Record<PostCategory, string> = {
  club: 'bg-cat-club-tint text-cat-club-on-tint border-cat-club-tint',
  tournament:
    'bg-cat-tournament-tint text-cat-tournament-on-tint border-cat-tournament-tint',
  result: 'bg-cat-result-tint text-cat-result-on-tint border-cat-result-tint',
  'governing-body':
    'bg-cat-governing-body-tint text-cat-governing-body-on-tint border-cat-governing-body-tint',
  facility:
    'bg-cat-facility-tint text-cat-facility-on-tint border-cat-facility-tint',
  notice: 'bg-cat-notice-tint text-cat-notice-on-tint border-cat-notice-tint',
};

/** The full-strength hue as a background — dots, rules, filter chips. */
export const CATEGORY_DOT: Record<PostCategory, string> = {
  club: 'bg-cat-club',
  tournament: 'bg-cat-tournament',
  result: 'bg-cat-result',
  'governing-body': 'bg-cat-governing-body',
  facility: 'bg-cat-facility',
  notice: 'bg-cat-notice',
};


export function isCategory(value: string | null | undefined): value is PostCategory {
  return !!value && value in CATEGORY_LABELS;
}

export const postCover = (post: Post, thumb = '1200x630'): string | null =>
  fileUrl('posts', post.id, post.cover, thumb);

/**
 * A post's attachments, each with a readable name. Storage holds
 * "registration_form_x7k2m9q1ab.pdf"; readers see "Registration form". Images
 * are shown on the page as photos; anything else is offered as a download.
 */
export interface PostAttachment {
  /** The file itself, for an <img> or a link to the full size. */
  url: string;
  /** The same file sent as a download. */
  downloadUrl: string;
  name: string;
  /** "PDF", "JPEG"… */
  type: string;
  isImage: boolean;
}

export function postAttachments(post: Post): PostAttachment[] {
  return (post.attachments ?? []).flatMap((filename) => {
    const url = fileUrl('posts', post.id, filename);
    if (!url) return [];
    const match = filename.match(/^(.*?)(?:_[a-z0-9]{10})?\.([a-z0-9]+)$/i);
    const base = (match?.[1] ?? filename).replace(/[_-]+/g, ' ').trim();
    const ext = (match?.[2] ?? '').toUpperCase();
    const type = ext === 'JPG' ? 'JPEG' : ext;
    return [
      {
        url,
        // ?download=1 makes the file route send it as an attachment, with
        // the stored filename rather than whatever the browser would pick.
        downloadUrl: `${url}?download=1`,
        name: base.charAt(0).toUpperCase() + base.slice(1),
        type,
        isImage: ['JPEG', 'PNG', 'WEBP'].includes(type),
      },
    ];
  });
}

/**
 * A block from a post body. Bodies are plain text — no markdown dependency and
 * no raw HTML, so nothing an editor types can inject markup into the page.
 *
 * The three shapes an announcement actually needs: paragraphs, a subheading
 * ("## "), and a bullet list ("- ").
 */
export type PostBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

export function renderPostBody(body: string | undefined): PostBlock[] {
  if (!body) return [];

  const blocks: PostBlock[] = [];

  for (const chunk of body.split(/\n\s*\n/)) {
    const lines = chunk
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    // A chunk is a list when every line is a bullet; a stray bullet inside a
    // paragraph stays part of the paragraph.
    if (lines.every((line) => line.startsWith('- '))) {
      blocks.push({ kind: 'list', items: lines.map((line) => line.slice(2).trim()) });
      continue;
    }

    for (const line of lines) {
      if (line.startsWith('## ')) {
        blocks.push({ kind: 'heading', text: line.slice(3).trim() });
      } else if (line.startsWith('- ')) {
        blocks.push({ kind: 'list', items: [line.slice(2).trim()] });
      } else {
        blocks.push({ kind: 'paragraph', text: line });
      }
    }
  }

  return blocks;
}

/** Roughly 200 words a minute, floored at a minute so nothing reads "0 min". */
export function readingMinutes(post: Post): number {
  const words = `${post.summary} ${post.body ?? ''}`.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

const RELATIVE = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' });

/**
 * "2 hours ago" for anything inside a week, an absolute date beyond it. A feed
 * that says "43 days ago" makes the reader do arithmetic.
 */
export function timeAgo(value: string | Date, now = new Date()): string {
  const then = new Date(value);
  const seconds = Math.round((then.getTime() - now.getTime()) / 1000);
  const absolute = Math.abs(seconds);

  if (absolute < 60) return 'just now';
  if (absolute < 3600) return RELATIVE.format(Math.round(seconds / 60), 'minute');
  if (absolute < 86_400) return RELATIVE.format(Math.round(seconds / 3600), 'hour');
  if (absolute < 604_800) return RELATIVE.format(Math.round(seconds / 86_400), 'day');

  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * "In 3 weeks", "Starts tomorrow", "On now" — the line a fixture strip needs.
 * `end` matters: a tournament that started yesterday and runs until tomorrow is
 * on now, not three days ago.
 */
export function fixtureTiming(start: string, end?: string, now = new Date()): string {
  const startsAt = new Date(start);
  const endsAt = end ? new Date(end) : startsAt;

  if (now >= startsAt && now <= endsAt) return 'On now';
  // Past a week timeAgo falls back to a date, which would only repeat the date
  // range printed beside this line.
  if (now > endsAt) {
    return now.getTime() - endsAt.getTime() < 604_800_000 ? timeAgo(endsAt, now) : 'Finished';
  }

  const days = Math.ceil((startsAt.getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 14) return `In ${days} days`;
  if (days < 60) return `In ${Math.round(days / 7)} weeks`;
  return `In ${Math.round(days / 30)} months`;
}

/** "19–21 Sep 2026", collapsing a same-day range to a single date. */
export function dateRange(start: string, end?: string): string {
  const startsAt = new Date(start);
  const endsAt = end ? new Date(end) : null;

  const full = (date: Date) =>
    date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  if (!endsAt || startsAt.toDateString() === endsAt.toDateString()) return full(startsAt);

  const sameMonth =
    startsAt.getMonth() === endsAt.getMonth() && startsAt.getFullYear() === endsAt.getFullYear();

  return sameMonth
    ? `${startsAt.getDate()}–${full(endsAt)}`
    : `${startsAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${full(endsAt)}`;
}
