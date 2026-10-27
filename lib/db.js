// PostgreSQL access for ReturnDesk: one lazily created, shared connection pool plus query and transaction helpers.
// Plain Node compatible on purpose (no 'server-only' import) so the migrate/seed scripts and tests can use it too.
import pg from 'pg';

const { Pool } = pg;

// In development, hot reloads re-evaluate this module, so the pool is cached on globalThis to avoid leaking pools.
const POOL_KEY = Symbol.for('returndesk.pgPool');
const cacheOnGlobal = process.env.NODE_ENV !== 'production';

let pool = null;

// Returns the shared pool, creating it on first use. Throws a clear error when DATABASE_URL is missing.
function getPool() {
  if (pool) return pool;
  if (cacheOnGlobal && globalThis[POOL_KEY]) {
    pool = globalThis[POOL_KEY];
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. See .env.example / DB.md.');
  }

  // SSL behaviour comes from the connection string (for example sslmode=verify-full on Neon); nothing is hard-coded.
  pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  // Hosted databases close idle connections; without this listener an idle-client error would crash the process.
  // Only the message is logged, never the connection string.
  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err.message);
  });

  if (cacheOnGlobal) globalThis[POOL_KEY] = pool;
  return pool;
}

// Runs one parameterised statement on the pool and resolves with the pg result object.
export function query(text, params) {
  return getPool().query(text, params);
}

// Runs callback(client) inside BEGIN/COMMIT, rolls back on any error, and always releases the client.
export async function withTransaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('PostgreSQL rollback failed:', rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

// Ends the pool (used by scripts and tests so Node can exit); a later query would create a fresh pool.
export async function closePool() {
  const current = pool ?? (cacheOnGlobal ? globalThis[POOL_KEY] : null);
  pool = null;
  if (cacheOnGlobal) delete globalThis[POOL_KEY];
  if (current) await current.end();
}
