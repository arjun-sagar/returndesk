// Data access for return requests (server only). All SQL lives here, together with the rule checks
// that must run inside a transaction. Every query is parameterized; user text never reaches SQL text.
import { query, withTransaction } from './db.js';
import { conflict, notFound, validationError } from './errors.js';
import {
  LIVE_STATUSES,
  assertEditable,
  assertRemovable,
  assertTransitionAllowed,
  getAllowedActions,
  normalizeApproval,
} from './rules.js';
import { escapeLike } from './validation.js';

const LIVE_UNIQUE_INDEX = 'return_requests_one_live_per_item';

// Columns returned for a request, shared by every SELECT so the mapped shape never drifts.
const REQUEST_COLUMNS = `r.id, r.reference, r.customer_name, r.customer_email, r.customer_phone,
  r.order_number, r.item_sku, r.item_name, r.quantity, r.reason, r.status, r.resolution,
  r.refund_amount, r.created_at, r.updated_at`;

// ORDER BY expressions per public sort key. Only these fixed strings are ever interpolated into SQL.
const SORT_SQL = Object.freeze({
  createdAt: 'r.created_at',
  updatedAt: 'r.updated_at',
  customerName: 'lower(r.customer_name)',
  status:
    "array_position(ARRAY['Open','In Review','Approved','Rejected','Completed']::text[], r.status)",
});
const ORDER_SQL = Object.freeze({ asc: 'ASC', desc: 'DESC' });

// API field name -> database column for PATCH. Only these columns can ever be written by an edit.
const UPDATABLE_COLUMNS = Object.freeze({
  customerName: 'customer_name',
  customerEmail: 'customer_email',
  customerPhone: 'customer_phone',
  orderNumber: 'order_number',
  itemSku: 'item_sku',
  itemName: 'item_name',
  quantity: 'quantity',
  reason: 'reason',
});

// Converts a database row (snake_case) into the camelCase API shape. refund_amount stays a string.
export function mapRequest(row) {
  return {
    id: row.id,
    reference: row.reference,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    orderNumber: row.order_number,
    itemSku: row.item_sku,
    itemName: row.item_name,
    quantity: row.quantity,
    reason: row.reason,
    status: row.status,
    resolution: row.resolution,
    refundAmount: row.refund_amount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Converts a note row into the API shape.
export function mapNote(row) {
  return { id: row.id, author: row.author, body: row.body, createdAt: row.created_at };
}

// Builds the shared WHERE clause (and its parameters) for the list rows and the list count.
function buildListFilter({ q, status, reason }) {
  const conditions = ['r.removed_at IS NULL'];
  const params = [];
  if (q) {
    params.push(`%${escapeLike(q)}%`);
    const p = `$${params.length}`;
    conditions.push(
      `(r.reference ILIKE ${p} ESCAPE '\\' OR r.customer_name ILIKE ${p} ESCAPE '\\'
        OR r.customer_email ILIKE ${p} ESCAPE '\\' OR r.customer_phone ILIKE ${p} ESCAPE '\\'
        OR r.order_number ILIKE ${p} ESCAPE '\\')`,
    );
  }
  if (status) {
    params.push(status);
    conditions.push(`r.status = $${params.length}`);
  }
  if (reason) {
    params.push(reason);
    conditions.push(`r.reason = $${params.length}`);
  }
  return { where: conditions.join(' AND '), params };
}

// Lists non-removed requests: search, filter, sort and paging all happen in SQL.
export async function listRequests({ q, status, reason, sort, order, page, pageSize }) {
  const { where, params } = buildListFilter({ q, status, reason });
  const direction = ORDER_SQL[order];
  const sortExpr = SORT_SQL[sort];
  const limitParam = `$${params.length + 1}`;
  const offsetParam = `$${params.length + 2}`;

  const rowsSql = `SELECT ${REQUEST_COLUMNS}
    FROM return_requests r
    WHERE ${where}
    ORDER BY ${sortExpr} ${direction}, r.id ${direction}
    LIMIT ${limitParam} OFFSET ${offsetParam}`;
  const countSql = `SELECT count(*)::int AS total FROM return_requests r WHERE ${where}`;

  const [rows, count] = await Promise.all([
    query(rowsSql, [...params, pageSize, (page - 1) * pageSize]),
    query(countSql, params),
  ]);
  const total = count.rows[0].total;

  return {
    items: rows.rows.map(mapRequest),
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      sort,
      order,
      q: q ?? null,
      status: status ?? null,
      reason: reason ?? null,
    },
  };
}

// Fetches one non-removed request with its notes (oldest first) and the actions allowed right now.
export async function getRequest(id) {
  const result = await query(
    `SELECT ${REQUEST_COLUMNS} FROM return_requests r WHERE r.id = $1 AND r.removed_at IS NULL`,
    [id],
  );
  if (result.rowCount === 0) throw notFound();

  const notes = await query(
    `SELECT id, author, body, created_at FROM request_notes
     WHERE request_id = $1 ORDER BY created_at ASC, id ASC`,
    [id],
  );
  const request = mapRequest(result.rows[0]);
  return {
    ...request,
    notes: notes.rows.map(mapNote),
    allowedActions: getAllowedActions(request.status),
  };
}

// Turns a live-request unique violation into a 409 naming the existing request. Must run AFTER the
// failed statement/transaction is finished (an aborted transaction cannot run further queries).
async function toDuplicateError(err, orderNumber, itemSku) {
  if (err?.code !== '23505' || err?.constraint !== LIVE_UNIQUE_INDEX) return err;
  const existing = await query(
    `SELECT reference FROM return_requests
     WHERE order_number = $1 AND item_sku = $2 AND status = ANY($3) AND removed_at IS NULL
     LIMIT 1`,
    [orderNumber, itemSku, LIVE_STATUSES],
  );
  if (existing.rowCount === 0) return err; // the other request just changed state; fall back to the generic 409
  const existingReference = existing.rows[0].reference;
  return conflict(
    'DUPLICATE_LIVE_REQUEST',
    `Order ${orderNumber} already has a live return request (${existingReference}) for item ${itemSku}.`,
    { orderNumber, itemSku, existingReference },
  );
}

// Creates a request in status Open. The partial unique index decides duplicates atomically.
export async function createRequest(input) {
  try {
    const result = await query(
      `INSERT INTO return_requests
         (customer_name, customer_email, customer_phone, order_number, item_sku, item_name, quantity, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, reference, customer_name, customer_email, customer_phone, order_number, item_sku,
                 item_name, quantity, reason, status, resolution, refund_amount, created_at, updated_at`,
      [
        input.customerName,
        input.customerEmail ?? null,
        input.customerPhone ?? null,
        input.orderNumber,
        input.itemSku,
        input.itemName,
        input.quantity,
        input.reason,
      ],
    );
    return mapRequest(result.rows[0]);
  } catch (err) {
    throw await toDuplicateError(err, input.orderNumber, input.itemSku);
  }
}

// Edits request details while Open / In Review. The row is locked so the status check and the write
// cannot be separated by a concurrent transition.
export async function updateRequest(id, changes) {
  let pair = { orderNumber: null, itemSku: null };
  try {
    return await withTransaction(async (client) => {
      const found = await client.query(
        'SELECT * FROM return_requests WHERE id = $1 AND removed_at IS NULL FOR UPDATE',
        [id],
      );
      if (found.rowCount === 0) throw notFound();
      const current = found.rows[0];
      assertEditable(current.status);

      // The contact rule depends on the stored values, so it is re-checked on the merged row.
      const email = 'customerEmail' in changes ? changes.customerEmail : current.customer_email;
      const phone = 'customerPhone' in changes ? changes.customerPhone : current.customer_phone;
      if (!email && !phone) {
        throw validationError({ contact: 'Provide at least one of email or phone.' });
      }
      pair = {
        orderNumber: changes.orderNumber ?? current.order_number,
        itemSku: changes.itemSku ?? current.item_sku,
      };

      const sets = [];
      const values = [];
      for (const [field, column] of Object.entries(UPDATABLE_COLUMNS)) {
        if (field in changes) {
          values.push(changes[field] ?? null);
          sets.push(`${column} = $${values.length}`);
        }
      }
      values.push(id);
      const updated = await client.query(
        `UPDATE return_requests SET ${sets.join(', ')}, updated_at = now()
         WHERE id = $${values.length}
         RETURNING id, reference, customer_name, customer_email, customer_phone, order_number, item_sku,
                   item_name, quantity, reason, status, resolution, refund_amount, created_at, updated_at`,
        values,
      );
      return mapRequest(updated.rows[0]);
    });
  } catch (err) {
    throw await toDuplicateError(err, pair.orderNumber, pair.itemSku);
  }
}

// Moves a request along the status graph. Legality (409) is checked before the approval rule (422).
export async function transitionRequest(id, { status, resolution, refundAmount }) {
  return withTransaction(async (client) => {
    const found = await client.query(
      'SELECT * FROM return_requests WHERE id = $1 AND removed_at IS NULL FOR UPDATE',
      [id],
    );
    if (found.rowCount === 0) throw notFound();
    const current = found.rows[0];

    assertTransitionAllowed(current.status, status);

    // Approving records the resolution; every other move keeps what the row already has.
    let nextResolution = current.resolution;
    let nextRefund = current.refund_amount;
    if (status === 'Approved') {
      const approval = normalizeApproval({ resolution, refundAmount });
      nextResolution = approval.resolution;
      nextRefund = approval.refundAmount;
    }

    const updated = await client.query(
      `UPDATE return_requests
       SET status = $1, resolution = $2, refund_amount = $3, updated_at = now()
       WHERE id = $4
       RETURNING id, reference, customer_name, customer_email, customer_phone, order_number, item_sku,
                 item_name, quantity, reason, status, resolution, refund_amount, created_at, updated_at`,
      [status, nextResolution, nextRefund, id],
    );
    return mapRequest(updated.rows[0]);
  });
}

// Soft-removes an Open/Rejected request by stamping removed_at. Rows and notes are kept.
export async function removeRequest(id) {
  return withTransaction(async (client) => {
    const found = await client.query(
      'SELECT status FROM return_requests WHERE id = $1 AND removed_at IS NULL FOR UPDATE',
      [id],
    );
    if (found.rowCount === 0) throw notFound();
    assertRemovable(found.rows[0].status);

    const removed = await client.query(
      `UPDATE return_requests SET removed_at = now(), updated_at = now()
       WHERE id = $1 RETURNING id, reference, removed_at`,
      [id],
    );
    const row = removed.rows[0];
    return { id: row.id, reference: row.reference, removedAt: row.removed_at };
  });
}

// Appends a note in one statement; the SELECT only yields a row if the request exists and is not removed.
export async function addNote(id, { author, body }) {
  const result = await query(
    `INSERT INTO request_notes (request_id, author, body)
     SELECT id, $2, $3 FROM return_requests WHERE id = $1 AND removed_at IS NULL
     RETURNING id, author, body, created_at`,
    [id, author, body],
  );
  if (result.rowCount === 0) throw notFound();
  return mapNote(result.rows[0]);
}
