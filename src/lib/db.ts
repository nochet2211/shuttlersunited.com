import { env } from 'cloudflare:workers';
import { randomBytes } from 'node:crypto';

/**
 * The club database: Cloudflare D1, with the schema in migrations/.
 *
 * Rows keep PocketBase's shape (the data came from there): unset text is '',
 * unset numbers are 0, dates are "2026-11-27 03:30:00.000Z". SQLite has no
 * boolean or JSON type, so those columns are listed here and converted on the
 * way in and out; everything else passes through untouched.
 *
 * There are no per-row access rules in the database. Every caller is server
 * code and must apply its own visibility filter — `is_public`, ownership, or
 * admin — before handing rows to a page.
 */

export type Table =
  | 'members'
  | 'otp_codes'
  | 'gear'
  | 'tournaments'
  | 'posts'
  | 'tournament_entries'
  | 'matches'
  | 'courts'
  | 'bookings'
  | 'membership_plans'
  | 'payments';

const BOOLEAN_COLUMNS: Partial<Record<Table, string[]>> = {
  members: ['is_public'],
  otp_codes: ['consumed'],
  gear: ['is_current'],
  posts: ['is_pinned'],
  courts: ['is_active'],
  membership_plans: ['is_active'],
};

const JSON_COLUMNS: Partial<Record<Table, string[]>> = {
  members: ['preferred_events', 'honours'],
  tournaments: ['prize_distribution'],
  posts: ['attachments'],
  matches: ['scores'],
  membership_plans: ['benefits'],
};

export function db(): D1Database {
  return env.DB;
}

/** "2026-11-27 03:30:00.000Z" — the stored date shape, which sorts as text. */
export const timestamp = (date = new Date()) => date.toISOString().replace('T', ' ');

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** A 15-character lowercase alphanumeric id, the same shape as the imported rows. */
export function newId(): string {
  let id = '';
  for (const byte of randomBytes(15)) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

function decode<T>(table: Table, row: Record<string, unknown>): T {
  for (const column of BOOLEAN_COLUMNS[table] ?? []) {
    if (column in row) row[column] = Boolean(row[column]);
  }
  for (const column of JSON_COLUMNS[table] ?? []) {
    const value = row[column];
    if (typeof value === 'string') row[column] = value ? JSON.parse(value) : null;
  }
  return row as T;
}

/** Drops undefined (the column keeps its value or default) and blanks null. */
function encode(table: Table, data: Record<string, unknown>): Record<string, unknown> {
  const booleans = BOOLEAN_COLUMNS[table] ?? [];
  const json = JSON_COLUMNS[table] ?? [];
  const out: Record<string, unknown> = {};

  for (const [column, value] of Object.entries(data)) {
    if (value === undefined || column === 'expand') continue;
    if (json.includes(column)) out[column] = value === null ? null : JSON.stringify(value);
    else if (booleans.includes(column)) out[column] = value ? 1 : 0;
    else out[column] = value ?? '';
  }
  return out;
}

/** Rows from `sql`, decoded as `table`. Select that table's columns (`t.*`) only. */
export async function all<T>(table: Table, sql: string, ...params: unknown[]): Promise<T[]> {
  const { results } = await db()
    .prepare(sql)
    .bind(...params)
    .all<Record<string, unknown>>();
  return results.map((row) => decode<T>(table, row));
}

export async function first<T>(table: Table, sql: string, ...params: unknown[]): Promise<T | null> {
  const row = await db()
    .prepare(sql)
    .bind(...params)
    .first<Record<string, unknown>>();
  return row ? decode<T>(table, row) : null;
}

export const getById = <T>(table: Table, id: string) =>
  first<T>(table, `SELECT * FROM ${table} WHERE id = ?`, id);

export async function insert<T>(table: Table, data: Record<string, unknown>): Promise<T> {
  const now = timestamp();
  const row = encode(table, { id: newId(), created: now, updated: now, ...data });
  const columns = Object.keys(row);

  await db()
    .prepare(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    )
    .bind(...Object.values(row))
    .run();

  return decode<T>(table, (await getById<Record<string, unknown>>(table, row.id as string))!);
}

export async function update(
  table: Table,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const row = encode(table, { ...data, updated: timestamp() });
  delete row.id;
  const columns = Object.keys(row);

  await db()
    .prepare(`UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`)
    .bind(...Object.values(row), id)
    .run();
}

export async function remove(table: Table, id: string): Promise<void> {
  await db().prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
}

/**
 * Attaches related rows under `row.expand[field]`, the way PocketBase's
 * `expand` did, with one query per relation however many rows there are.
 * Rows whose relation is empty or dangling get nothing.
 */
export async function expand<R extends { expand?: object }>(
  rows: R[],
  field: keyof R & string,
  table: Table,
): Promise<R[]> {
  const ids = [...new Set(rows.map((row) => row[field]).filter(Boolean))] as string[];
  if (!ids.length) return rows;

  // One JSON parameter rather than one per id: D1 caps a query at 100 bindings.
  const related = await all<{ id: string }>(
    table,
    `SELECT * FROM ${table} WHERE id IN (SELECT value FROM json_each(?))`,
    JSON.stringify(ids),
  );
  const byId = new Map(related.map((row) => [row.id, row]));

  for (const row of rows) {
    const match = byId.get(row[field] as string);
    if (match) row.expand = { ...row.expand, [field]: match };
  }
  return rows;
}
