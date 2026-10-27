// DESTRUCTIVE: drops every ReturnDesk table, re-applies the migrations and re-seeds the demo data.
// Guarded by --confirm and by a local-host check so it cannot wipe a hosted database by accident.
import { pathToFileURL } from 'node:url';
import { closePool, query } from '../lib/db.js';
import { describeTarget, isLocalDatabase } from './db-target.js';
import { runMigrations } from './migrate.js';
import { runSeed } from './seed.js';

const REMOTE_OVERRIDE = 'I_UNDERSTAND_THIS_DELETES_DATA';

// Checks every guard before any connection is opened; exits with code 1 and a message when a guard fails.
function assertResetAllowed(url, args, env) {
  if (!url) {
    console.error('Refusing to reset: DATABASE_URL is not set. See .env.example / DB.md.');
    process.exit(1);
  }
  if (!args.includes('--confirm')) {
    console.error('Refusing to reset: this deletes ALL data. Re-run with --confirm:  npm run db:reset -- --confirm');
    process.exit(1);
  }
  if (!isLocalDatabase(url) && env.ALLOW_REMOTE_RESET !== REMOTE_OVERRIDE) {
    console.error(
      `Refusing to reset a non-local database (${describeTarget(url)}). ` +
        `To override, set ALLOW_REMOTE_RESET=${REMOTE_OVERRIDE}.`,
    );
    process.exit(1);
  }
}

// Drops tables and the trigger function, then migrates and seeds from scratch.
async function main() {
  const url = process.env.DATABASE_URL;
  console.log(`Target: ${describeTarget(url)}`);
  assertResetAllowed(url, process.argv.slice(2), process.env);

  try {
    console.log('Dropping tables and functions...');
    await query('DROP TABLE IF EXISTS request_notes, return_requests, schema_migrations CASCADE');
    await query('DROP FUNCTION IF EXISTS forbid_row_change()');
    console.log('Applying migrations...');
    await runMigrations();
    console.log('Seeding...');
    await runSeed();
  } finally {
    await closePool();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Reset failed: ${error.message}`);
    process.exit(1);
  });
}
