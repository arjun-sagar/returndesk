// E1-E6 (rule 4: locked once decided), F1-F5 (notes), G1-G5 (rule 5: removal).
import { afterAll, describe, expect, it } from 'vitest';
import {
  api,
  closeDb,
  createRequest,
  db,
  expectError,
  expectOk,
  expectValidation,
  getRequest,
  newPayload,
  requestInState,
  sleep,
  uniqueOrder,
} from './helpers.js';

afterAll(async () => {
  await closeDb();
});

const patch = (id, body) => api('PATCH', `/api/requests/${id}`, body);
const addNote = (id, body) => api('POST', `/api/requests/${id}/notes`, body);

describe('Rule 4: edit only while Open / In Review (E)', () => {
  it('E1: PATCH while Open -> 200, normalized, updatedAt advances', async () => {
    const req = await createRequest();
    await sleep(25);
    const order = uniqueOrder('E1');
    const data = expectOk(
      await patch(req.id, {
        customerName: '  New    Name ',
        orderNumber: ` ${order.toLowerCase()} `,
        itemSku: ' abc-9 ',
        quantity: 3,
        reason: 'Wrong Item',
      }),
    );
    expect(data.customerName).toBe('New Name');
    expect(data.orderNumber).toBe(order);
    expect(data.itemSku).toBe('ABC-9');
    expect(data.quantity).toBe(3);
    expect(data.reason).toBe('Wrong Item');
    expect(data.status).toBe('Open');
    expect(data.reference).toBe(req.reference);
    expect(new Date(data.updatedAt).getTime()).toBeGreaterThan(new Date(req.updatedAt).getTime());
    expect(data.createdAt).toBe(req.createdAt);
    // Untouched fields stay as they were.
    expect(data.itemName).toBe(req.itemName);
    expect(data.customerEmail).toBe(req.customerEmail);
    const fetched = await getRequest(req.id);
    expect(fetched.customerName).toBe('New Name');
  });

  it('E2: PATCH while In Review -> 200', async () => {
    const req = await requestInState('In Review');
    const data = expectOk(await patch(req.id, { itemName: 'Corrected item name', customerPhone: '+91 98765 43210' }));
    expect(data.itemName).toBe('Corrected item name');
    expect(data.customerPhone).toBe('+91 98765 43210');
    expect(data.status).toBe('In Review');
  });

  it('E3: PATCH on Approved / Rejected / Completed -> 409 REQUEST_LOCKED, data unchanged', async () => {
    for (const state of ['Approved', 'Rejected', 'Completed']) {
      const req = await requestInState(state);
      expectError(await patch(req.id, { customerName: 'Should Not Apply' }), 409, 'REQUEST_LOCKED');
      const after = await getRequest(req.id);
      expect(after.customerName).toBe(req.customerName);
      expect(after.updatedAt).toBe(req.updatedAt);
      expect(after.status).toBe(state);
    }
  });

  it('E4: PATCH with status / reference / resolution -> 400', async () => {
    const req = await createRequest();
    expectValidation(await patch(req.id, { status: 'Approved' }), ['status']);
    expectValidation(await patch(req.id, { reference: 'RD-999999' }), ['reference']);
    expectValidation(await patch(req.id, { resolution: 'Refund' }), ['resolution']);
    expectValidation(await patch(req.id, { customerName: 'Fine', status: 'Open' }), ['status']);
    const after = await getRequest(req.id);
    expect(after.customerName).toBe(req.customerName);
    expect(after.reference).toBe(req.reference);
  });

  it('E5: PATCH {} -> 400', async () => {
    const req = await createRequest();
    expectValidation(await patch(req.id, {}));
  });

  it('E6: PATCH clearing both contacts -> 400', async () => {
    const req = await createRequest({ customerEmail: 'both@example.com', customerPhone: '+91 98765 43210' });
    expectValidation(await patch(req.id, { customerEmail: '', customerPhone: '' }));
    const emailOnly = await createRequest({ customerEmail: 'only@example.com' });
    expectValidation(await patch(emailOnly.id, { customerEmail: '' }));
    const after = await getRequest(emailOnly.id);
    expect(after.customerEmail).toBe('only@example.com');
    // Clearing just one of two contacts is fine.
    const cleared = expectOk(await patch(req.id, { customerEmail: '' }));
    expect(cleared.customerEmail ?? null).toBeNull();
    expect(cleared.customerPhone).toBe('+91 98765 43210');
  });
});

describe('Notes (F)', () => {
  it('F1: three notes are returned in creation order', async () => {
    const req = await createRequest();
    const bodies = ['first note', 'second note\nwith a newline', 'third note'];
    for (const [i, body] of bodies.entries()) {
      const note = expectOk(await addNote(req.id, { author: `Agent ${i + 1}`, body }), 201);
      expect(note.author).toBe(`Agent ${i + 1}`);
      expect(note.body).toBe(body);
      expect(note.createdAt).toBeTypeOf('string');
      expect(Number.isInteger(note.id)).toBe(true);
    }
    const detail = await getRequest(req.id);
    expect(detail.notes.map((n) => n.body)).toEqual(bodies);
    expect(detail.notes.map((n) => n.author)).toEqual(['Agent 1', 'Agent 2', 'Agent 3']);
    // Adding notes does not touch the request's own fields.
    expect(detail.status).toBe('Open');
    expect(detail.allowedActions).toBeTypeOf('object');
  });

  it('F2: notes accepted on Approved, Rejected and Completed requests -> 201', async () => {
    for (const state of ['Approved', 'Rejected', 'Completed']) {
      const req = await requestInState(state);
      expectOk(await addNote(req.id, { author: 'Support', body: `note on ${state}` }), 201);
      const detail = await getRequest(req.id);
      expect(detail.notes.at(-1).body).toBe(`note on ${state}`);
    }
  });

  it('F3: empty body / missing author -> 400', async () => {
    const req = await createRequest();
    expectValidation(await addNote(req.id, {}), ['author', 'body']);
    expectValidation(await addNote(req.id, { author: 'Support' }), ['body']);
    expectValidation(await addNote(req.id, { body: 'no author' }), ['author']);
    expectValidation(await addNote(req.id, { author: 'Support', body: '   ' }), ['body']);
    expectValidation(await addNote(req.id, { author: '   ', body: 'text' }), ['author']);
    expectValidation(await addNote(req.id, { author: 'Support', body: 'x'.repeat(2001) }), ['body']);
    expectError(await api('POST', `/api/requests/${req.id}/notes`, undefined, { raw: '' }), 400, 'INVALID_JSON');
    expect((await getRequest(req.id)).notes).toHaveLength(0);
  });

  it('F4: PUT/PATCH/DELETE on /notes -> 405 JSON; DELETE /notes/{noteId} -> 404 JSON', async () => {
    const req = await createRequest();
    const note = expectOk(await addNote(req.id, { author: 'Support', body: 'keep me' }), 201);
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const res = await api(method, `/api/requests/${req.id}/notes`, method === 'DELETE' ? undefined : { body: 'x' });
      expectError(res, 405, 'METHOD_NOT_ALLOWED');
    }
    expectError(await api('DELETE', `/api/requests/${req.id}/notes/${note.id}`), 404, 'ROUTE_NOT_FOUND');
    expectError(await api('PATCH', `/api/requests/${req.id}/notes/${note.id}`, { body: 'x' }), 404, 'ROUTE_NOT_FOUND');
    const detail = await getRequest(req.id);
    expect(detail.notes).toHaveLength(1);
    expect(detail.notes[0].body).toBe('keep me');
  });

  it('F5: note on a removed request -> 404; on a nonexistent id -> 404', async () => {
    const req = await createRequest();
    expectOk(await api('DELETE', `/api/requests/${req.id}`));
    expectError(await addNote(req.id, { author: 'Support', body: 'too late' }), 404, 'NOT_FOUND');
    expectError(await addNote(999999999, { author: 'Support', body: 'nobody home' }), 404, 'NOT_FOUND');
  });
});

describe('Rule 5: removal (G)', () => {
  it('G1: remove Open -> 200; detail 404; absent from list; DB row and notes still exist', async () => {
    const req = await createRequest();
    expectOk(await addNote(req.id, { author: 'Support', body: 'history stays' }), 201);
    const removed = expectOk(await api('DELETE', `/api/requests/${req.id}`));
    expect(removed.id).toBe(req.id);
    expect(removed.reference).toBe(req.reference);
    expect(removed.removedAt).toBeTypeOf('string');

    expectError(await api('GET', `/api/requests/${req.id}`), 404, 'NOT_FOUND');
    const list = await api('GET', `/api/requests?q=${encodeURIComponent(req.reference)}`);
    expect(list.status).toBe(200);
    expect(list.json.meta.total).toBe(0);
    expect(list.json.data).toEqual([]);

    const row = await db().query('SELECT status, removed_at FROM return_requests WHERE id = $1', [req.id]);
    expect(row.rowCount).toBe(1);
    expect(row.rows[0].removed_at).not.toBeNull();
    expect(row.rows[0].status).toBe('Open');
    const notes = await db().query('SELECT body FROM request_notes WHERE request_id = $1', [req.id]);
    expect(notes.rows.map((n) => n.body)).toEqual(['history stays']);
  });

  it('G2: remove Rejected -> 200', async () => {
    const req = await requestInState('Rejected');
    const removed = expectOk(await api('DELETE', `/api/requests/${req.id}`));
    expect(removed.reference).toBe(req.reference);
    expectError(await api('GET', `/api/requests/${req.id}`), 404, 'NOT_FOUND');
  });

  it('G3: remove In Review / Approved / Completed -> 409 REMOVAL_NOT_ALLOWED, still fetchable', async () => {
    for (const state of ['In Review', 'Approved', 'Completed']) {
      const req = await requestInState(state);
      expectError(await api('DELETE', `/api/requests/${req.id}`), 409, 'REMOVAL_NOT_ALLOWED');
      const after = await getRequest(req.id);
      expect(after.status).toBe(state);
      const row = await db().query('SELECT removed_at FROM return_requests WHERE id = $1', [req.id]);
      expect(row.rows[0].removed_at).toBeNull();
    }
  });

  it('G4: removing again, PATCH, transition or note on a removed request -> 404', async () => {
    const req = await createRequest();
    expectOk(await api('DELETE', `/api/requests/${req.id}`));
    expectError(await api('DELETE', `/api/requests/${req.id}`), 404, 'NOT_FOUND');
    expectError(await patch(req.id, { customerName: 'Ghost' }), 404, 'NOT_FOUND');
    expectError(await api('POST', `/api/requests/${req.id}/transitions`, { status: 'In Review' }), 404, 'NOT_FOUND');
    expectError(await addNote(req.id, { author: 'Support', body: 'hello?' }), 404, 'NOT_FOUND');
    expectError(await api('GET', `/api/requests/${req.id}`), 404, 'NOT_FOUND');
    // Nothing was written to the removed row.
    const row = await db().query('SELECT status, customer_name FROM return_requests WHERE id = $1', [req.id]);
    expect(row.rows[0].status).toBe('Open');
    expect(row.rows[0].customer_name).toBe(req.customerName);
    const notes = await db().query('SELECT 1 FROM request_notes WHERE request_id = $1', [req.id]);
    expect(notes.rowCount).toBe(0);
  });

  it('G5: raw SQL DELETE on return_requests and UPDATE/DELETE on request_notes are rejected by the trigger', async () => {
    const req = await createRequest(newPayload());
    const note = expectOk(await addNote(req.id, { author: 'Support', body: 'immutable' }), 201);

    await expect(db().query('DELETE FROM return_requests WHERE id = $1', [req.id])).rejects.toThrow(/not allowed/i);
    await expect(db().query("UPDATE request_notes SET body = 'tampered' WHERE id = $1", [note.id])).rejects.toThrow(/not allowed/i);
    await expect(db().query('DELETE FROM request_notes WHERE id = $1', [note.id])).rejects.toThrow(/not allowed/i);

    const row = await db().query('SELECT 1 FROM return_requests WHERE id = $1', [req.id]);
    expect(row.rowCount).toBe(1);
    const stored = await db().query('SELECT body FROM request_notes WHERE id = $1', [note.id]);
    expect(stored.rows[0].body).toBe('immutable');
  });
});
