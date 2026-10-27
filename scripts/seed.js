// Seeds the demo data into an EMPTY database, in one transaction. Re-running changes nothing.
import { pathToFileURL } from 'node:url';
import { closePool, withTransaction } from '../lib/db.js';
import { describeTarget } from './db-target.js';
import { buildSeedData } from './seed-data.js';

const INSERT_REQUEST = `
  INSERT INTO return_requests (
    customer_name, customer_email, customer_phone, order_number, item_sku, item_name, quantity,
    reason, status, resolution, refund_amount, created_at, updated_at, removed_at
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
    now() - $12::numeric * interval '1 hour',
    now() - $13::numeric * interval '1 hour',
    CASE WHEN $14::numeric IS NULL THEN NULL ELSE now() - $14::numeric * interval '1 hour' END
  ) RETURNING id`;

const INSERT_NOTE = `
  INSERT INTO request_notes (request_id, author, body, created_at)
  VALUES ($1, $2, $3, now() - $4::numeric * interval '1 hour')`;

// Counts rows by one column and prints them as "Value n, Value n" on a single line.
function formatCounts(rows, key) {
  const counts = new Map();
  for (const row of rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
  return [...counts].map(([value, count]) => `${value} ${count}`).join(', ');
}

// Inserts the demo data when return_requests is completely empty (removed rows count as data). Returns true if seeded.
export async function runSeed() {
  const rows = buildSeedData();

  const seeded = await withTransaction(async (client) => {
    // Block concurrent seeders/writers so the emptiness check and the inserts are one atomic step.
    await client.query('LOCK TABLE return_requests IN SHARE ROW EXCLUSIVE MODE');
    const existing = await client.query('SELECT count(*)::int AS total FROM return_requests');
    if (existing.rows[0].total > 0) return false;

    for (const row of rows) {
      const inserted = await client.query(INSERT_REQUEST, [
        row.customerName, row.customerEmail, row.customerPhone, row.orderNumber, row.itemSku, row.itemName,
        row.quantity, row.reason, row.status, row.resolution, row.refundAmount,
        row.createdHoursAgo, row.updatedHoursAgo, row.removedHoursAgo,
      ]);
      for (const note of row.notes) {
        await client.query(INSERT_NOTE, [inserted.rows[0].id, note.author, note.body, note.hoursAgo]);
      }
    }
    return true;
  });

  if (!seeded) {
    console.log('Database is already seeded (return_requests has rows) - nothing changed.');
    return false;
  }

  const visible = rows.filter((row) => row.removedHoursAgo === null);
  const notesTotal = rows.reduce((sum, row) => sum + row.notes.length, 0);
  console.log(`Seeded ${rows.length} requests (${visible.length} visible, ${rows.length - visible.length} removed).`);
  console.log(`  Visible by status: ${formatCounts(visible, 'status')}`);
  console.log(`  Visible by reason: ${formatCounts(visible, 'reason')}`);
  console.log(`  Notes: ${notesTotal} on ${rows.filter((row) => row.notes.length > 0).length} requests`);
  return true;
}

// Command-line entry point: prints the target, seeds, and always closes the pool.
async function main() {
  console.log(`Seeding ${describeTarget(process.env.DATABASE_URL)}`);
  try {
    await runSeed();
  } finally {
    await closePool();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    if (error.code === '42P01') {
      console.error('Seed failed: tables are missing. Run `npm run db:migrate` first.');
    } else {
      console.error(`Seed failed: ${error.message}`);
    }
    process.exit(1);
  });
}
