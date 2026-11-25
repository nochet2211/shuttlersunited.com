#!/usr/bin/env node
/**
 * One-time move of the club's data from a PocketBase data directory into D1
 * and R2. Run it after the schema migration:
 *
 *   node scripts/import-pocketbase.mjs --local          # into the dev database
 *   node scripts/import-pocketbase.mjs --remote         # into production
 *   node scripts/import-pocketbase.mjs --remote --dir=path/to/pb_data
 *
 * Every table it imports is emptied first, so re-running it gives the same
 * result rather than duplicates. PocketBase's auth columns (password,
 * tokenKey, email…) are dropped: members sign in by OTP and never had one.
 */
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const target = args.includes('--remote') ? '--remote' : args.includes('--local') ? '--local' : null;
const dir = args.find((arg) => arg.startsWith('--dir='))?.slice(6) ?? 'pb_data';

if (!target) {
  console.error('Pass --local or --remote.');
  process.exit(1);
}

const DATABASE = 'shuttlersunited';
const BUCKET = 'shuttlersunited-files';
const TABLES = [
  'members',
  'otp_codes',
  'gear',
  'tournaments',
  'posts',
  'tournament_entries',
  'matches',
  'courts',
  'bookings',
  'membership_plans',
  'payments',
];
const DROPPED = new Set(['email', 'emailVisibility', 'password', 'tokenKey', 'verified']);
const CONTENT_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

const source = new DatabaseSync(join(dir, 'data.db'), { readOnly: true });

const literal = (value) =>
  value === null
    ? 'NULL'
    : typeof value === 'number' || typeof value === 'bigint'
      ? String(value)
      : `'${String(value).replaceAll("'", "''")}'`;

// --- rows --------------------------------------------------------------------

const statements = [];
for (const table of TABLES) {
  const columns = source
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((column) => column.name)
    .filter((name) => !DROPPED.has(name));
  const rows = source.prepare(`SELECT ${columns.join(', ')} FROM ${table}`).all();

  statements.push(`DELETE FROM ${table};`);
  for (const row of rows) {
    statements.push(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns
        .map((column) => literal(row[column]))
        .join(', ')});`,
    );
  }
  console.log(`  ${String(rows.length).padStart(4)}  ${table}`);
}

const sqlFile = join(mkdtempSync(join(tmpdir(), 'su-import-')), 'import.sql');
writeFileSync(sqlFile, statements.join('\n'));
execFileSync('npx', ['wrangler', 'd1', 'execute', DATABASE, target, '--file', sqlFile, '--yes'], {
  stdio: 'inherit',
});

// --- files -------------------------------------------------------------------
// PocketBase keeps them at storage/<collection id>/<record id>/<filename>, with
// generated thumbnails in thumbs_* folders and metadata in *.attrs; only the
// originals move, keyed by collection name instead of id.

const collections = new Map(
  source
    .prepare('SELECT id, name FROM _collections')
    .all()
    .map((row) => [row.id, row.name]),
);
const storage = join(dir, 'storage');
let uploaded = 0;

for (const collectionId of existsSync(storage) ? readdirSync(storage) : []) {
  const collection = collections.get(collectionId);
  if (!collection || !TABLES.includes(collection)) continue;

  for (const recordId of readdirSync(join(storage, collectionId))) {
    const recordDir = join(storage, collectionId, recordId);
    for (const filename of readdirSync(recordDir)) {
      const path = join(recordDir, filename);
      if (filename.endsWith('.attrs') || statSync(path).isDirectory()) continue;

      const ext = filename.split('.').pop().toLowerCase();
      execFileSync(
        'npx',
        [
          'wrangler',
          'r2',
          'object',
          'put',
          `${BUCKET}/${collection}/${recordId}/${filename}`,
          '--file',
          path,
          '--content-type',
          CONTENT_TYPES[ext] ?? 'application/octet-stream',
          target,
        ],
        { stdio: 'ignore' },
      );
      uploaded++;
      console.log(`  file  ${collection}/${recordId}/${filename}`);
    }
  }
}

console.log(`\nImported into ${target.slice(2)} D1, with ${uploaded} files in R2.`);
