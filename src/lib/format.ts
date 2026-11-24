/** Display helpers. Amounts arrive in paise and leave as rupee strings. */

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export function money(paise: number): string {
  return INR.format(paise / 100);
}

export function shortDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function dayMonth(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** "Aug 2026" from a "2026-08" period key. */
export function periodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

/** The "2026-08" key for a given date, defaulting to now. */
export function periodKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** 570 -> "9:30 AM" */
export function minuteToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/** "09:30" -> 570 */
export function timeToMinute(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function age(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) years--;
  return years;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** The ISO date key ("2026-08-30") in local time — not UTC, which shifts the day. */
export function dateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * Half-open bounds for a single day, for PocketBase date filters.
 *
 * PocketBase stores dates with millisecond precision and a trailing Z
 * ("2026-08-31 00:00:00.000Z"), so `date = "2026-08-31 00:00:00"` never
 * matches. Always compare against a range instead of testing equality.
 */
export function dayBounds(date: string): { start: string; end: string } {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + 1);
  return { start: `${date} 00:00:00`, end: `${dateKey(next)} 00:00:00` };
}
