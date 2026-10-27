// Applies pending SQL migrations from db/migrations in filename order. Non-destructive and safe to re-run.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { closePool, query, withTransaction } from '../lib/db.js';
import { describeTarget } from './db-target.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');

// Creates the bookkeeping table on first run, then applies every migration not yet recorded in it.
// Each migration runs in its own transaction together with its schema_migrations row, so it applies fully or not at all.
export async function runMigrations() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();
  const applied = new Set((await query('SELECT name FROM schema_migrations')).rows.map((row) => row.name));

  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skipped  ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    console.log(`  applied  ${file}`);
    appliedCount += 1;
  }

  if (appliedCount === 0) console.log('Nothing to apply: the database is up to date.');
  return appliedCount;
}

// Command-line entry point: prints the target, runs the migrations and always closes the pool.
async function main() {
  console.log(`Migrating ${describeTarget(process.env.DATABASE_URL)}`);
  try {
    await runMigrations();
  } finally {
    await closePool();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Migration failed: ${error.message}`);
    process.exit(1);
  });
}
