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

/** "state" → "State": stored select values are lowercase, labels are not. */
export const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
