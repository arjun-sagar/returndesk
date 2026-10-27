// A1-A8 (create validation) and B1-B7 (rule 3: one live request per order + item).
import { describe, expect, it } from 'vitest';
import {
  api,
  createRequest,
  expectError,
  expectOk,
  expectValidation,
  getRequest,
  newPayload,
  requestInState,
  uniqueOrder,
} from './helpers.js';

describe('Create (A)', () => {
  it('A1: valid create -> 201, reference RD-nnnnnn, status Open, Location header, codes normalized', async () => {
    const order = uniqueOrder('A1');
    const res = await api(
      'POST',
      '/api/requests',
      newPayload({
        customerName: '  Asha   Rao ',
        customerEmail: ' Asha.Rao@Example.COM ',
        orderNumber: ` ${order.toLowerCase()} `,
        itemSku: ' tsh-m-blk ',
        itemName: ' Black   T-shirt ',
        quantity: 2,
        reason: 'Size Issue',
      }),
    );
    const data = expectOk(res, 201);
    expect(data.reference).toMatch(/^RD-\d{6,}$/);
    expect(data.status).toBe('Open');
    expect(data.orderNumber).toBe(order);
    expect(data.itemSku).toBe('TSH-M-BLK');
    expect(data.customerName).toBe('Asha Rao');
    expect(data.itemName).toBe('Black T-shirt');
    expect(data.customerEmail).toBe('asha.rao@example.com');
    expect(data.quantity).toBe(2);
    expect(data.reason).toBe('Size Issue');
    expect(data.resolution ?? null).toBeNull();
    expect(data.refundAmount ?? null).toBeNull();
    expect(Number.isInteger(data.id)).toBe(true);
    const location = res.headers.get('location');
    expect(location).toBeTruthy();
    expect(location.endsWith(`/api/requests/${data.id}`)).toBe(true);
    // The record is really stored: a fetch returns the same reference.
    const fetched = await getRequest(data.id);
    expect(fetched.reference).toBe(data.reference);
  });

  it('A2: body containing reference -> 400 VALIDATION_ERROR (fields.reference)', async () => {
    const res = await api('POST', '/api/requests', newPayload({ reference: 'RD-000001' }));
    expectValidation(res, ['reference']);
  });

  it('A3: missing fields -> 400 listing each field', async () => {
    const res = await api('POST', '/api/requests', {});
    expectValidation(res, ['customerName', 'orderNumber', 'itemSku', 'itemName', 'quantity', 'reason', 'contact']);
    // Each required field on its own is reported by name.
    for (const field of ['customerName', 'orderNumber', 'itemSku', 'itemName', 'quantity', 'reason']) {
      const body = newPayload();
      delete body[field];
      expectValidation(await api('POST', '/api/requests', body), [field]);
    }
  });

  it('A4: reason "Broken" -> 400', async () => {
    expectValidation(await api('POST', '/api/requests', newPayload({ reason: 'Broken' })), ['reason']);
    expectValidation(await api('POST', '/api/requests', newPayload({ reason: 'damaged' })), ['reason']);
  });

  it('A5: bad quantities -> 400', async () => {
    for (const quantity of [0, -1, 1.5, '2', 1000, null, 'abc']) {
      const res = await api('POST', '/api/requests', newPayload({ quantity }));
      expectValidation(res, ['quantity']);
    }
  });

  it('A6: neither email nor phone -> 400; bad email -> 400', async () => {
    const none = newPayload();
    delete none.customerEmail;
    expectValidation(await api('POST', '/api/requests', none), ['contact']);
    expectValidation(await api('POST', '/api/requests', newPayload({ customerEmail: '  ' })), ['contact']);
    expectValidation(await api('POST', '/api/requests', newPayload({ customerEmail: 'not-an-email' })), ['customerEmail']);
    expectValidation(await api('POST', '/api/requests', newPayload({ customerEmail: 'a@b' })), ['customerEmail']);
    // A phone alone is a valid contact.
    const phoneOnly = newPayload({ customerPhone: '+91 98765 43210' });
    delete phoneOnly.customerEmail;
    expectOk(await api('POST', '/api/requests', phoneOnly), 201);
  });

  it('A7: malformed JSON -> 400 INVALID_JSON; JSON array body -> 400 INVALID_JSON', async () => {
    expectError(await api('POST', '/api/requests', undefined, { raw: '{"customerName": ' }), 400, 'INVALID_JSON');
    expectError(await api('POST', '/api/requests', undefined, { raw: 'not json at all' }), 400, 'INVALID_JSON');
    expectError(await api('POST', '/api/requests', undefined, { raw: '[1, 2, 3]' }), 400, 'INVALID_JSON');
    expectError(await api('POST', '/api/requests', undefined, { raw: '"just a string"' }), 400, 'INVALID_JSON');
    expectError(await api('POST', '/api/requests', undefined, { raw: 'null' }), 400, 'INVALID_JSON');
  });

  it('A8: create with status "Approved" -> 400', async () => {
    expectValidation(await api('POST', '/api/requests', newPayload({ status: 'Approved' })), ['status']);
    expectValidation(await api('POST', '/api/requests', newPayload({ resolution: 'Refund' })), ['resolution']);
    expectValidation(await api('POST', '/api/requests', newPayload({ bogusField: 1 })), ['bogusField']);
  });
});

describe('Rule 3: one live request per order + item (B)', () => {
  it('B1: duplicate of a live Open (different case/padding) -> 409 DUPLICATE_LIVE_REQUEST with existingReference', async () => {
    const order = uniqueOrder('B1');
    const first = await createRequest({ orderNumber: order, itemSku: 'DUP-1' });
    const res = await api(
      'POST',
      '/api/requests',
      newPayload({ orderNumber: `  ${order.toLowerCase()}  `, itemSku: ' dup-1 ' }),
    );
    const error = expectError(res, 409, 'DUPLICATE_LIVE_REQUEST');
    expect(error.details.existingReference).toBe(first.reference);
  });

  it('B2: duplicate while the existing one is In Review -> 409; while Approved -> 409', async () => {
    const reviewing = await requestInState('In Review', { itemSku: 'DUP-2' });
    const dupReview = await api(
      'POST',
      '/api/requests',
      newPayload({ orderNumber: reviewing.orderNumber, itemSku: reviewing.itemSku }),
    );
    expect(expectError(dupReview, 409, 'DUPLICATE_LIVE_REQUEST').details.existingReference).toBe(reviewing.reference);

    const approved = await requestInState('Approved', { itemSku: 'DUP-2' });
    const dupApproved = await api(
      'POST',
      '/api/requests',
      newPayload({ orderNumber: approved.orderNumber, itemSku: approved.itemSku }),
    );
    expect(expectError(dupApproved, 409, 'DUPLICATE_LIVE_REQUEST').details.existingReference).toBe(approved.reference);
  });

  it('B3: allowed after the existing one is Rejected -> 201; after Completed -> 201', async () => {
    const rejected = await requestInState('Rejected', { itemSku: 'DUP-3' });
    const again = await api(
      'POST',
      '/api/requests',
      newPayload({ orderNumber: rejected.orderNumber, itemSku: rejected.itemSku }),
    );
    expect(expectOk(again, 201).status).toBe('Open');

    const completed = await requestInState('Completed', { itemSku: 'DUP-3' });
    const againCompleted = await api(
      'POST',
      '/api/requests',
      newPayload({ orderNumber: completed.orderNumber, itemSku: completed.itemSku }),
    );
    expect(expectOk(againCompleted, 201).status).toBe('Open');
  });

  it('B4: same order with a different SKU -> 201; same SKU on a different order -> 201', async () => {
    const base = await createRequest({ itemSku: 'DUP-4A' });
    expectOk(await api('POST', '/api/requests', newPayload({ orderNumber: base.orderNumber, itemSku: 'DUP-4B' })), 201);
    expectOk(await api('POST', '/api/requests', newPayload({ itemSku: 'DUP-4A' })), 201);
  });

  it('B5: 5 parallel identical creates -> exactly one 201, four 409, zero 500', async () => {
    const body = newPayload({ itemSku: 'DUP-5' });
    const results = await Promise.all(Array.from({ length: 5 }, () => api('POST', '/api/requests', body)));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409]);
    for (const res of results.filter((r) => r.status === 409)) {
      expectError(res, 409, 'DUPLICATE_LIVE_REQUEST');
    }
  });

  it('B6: PATCH a request onto another live request\'s order/item pair -> 409 DUPLICATE_LIVE_REQUEST', async () => {
    const first = await createRequest({ itemSku: 'DUP-6' });
    const second = await createRequest({ itemSku: 'DUP-6' });
    const res = await api('PATCH', `/api/requests/${second.id}`, { orderNumber: first.orderNumber });
    const error = expectError(res, 409, 'DUPLICATE_LIVE_REQUEST');
    expect(error.details.existingReference).toBe(first.reference);
    // Same for moving only the SKU onto an occupied pair.
    const third = await createRequest({ orderNumber: first.orderNumber, itemSku: 'DUP-6-OTHER' });
    expectError(await api('PATCH', `/api/requests/${third.id}`, { itemSku: 'dup-6' }), 409, 'DUPLICATE_LIVE_REQUEST');
    // The refused edit changed nothing.
    expect((await getRequest(second.id)).orderNumber).toBe(second.orderNumber);
  });

  it('B7: after removing an Open request, a new request for the same pair -> 201', async () => {
    const first = await createRequest({ itemSku: 'DUP-7' });
    expectOk(await api('DELETE', `/api/requests/${first.id}`));
    const again = await api('POST', '/api/requests', newPayload({ orderNumber: first.orderNumber, itemSku: first.itemSku }));
    const data = expectOk(again, 201);
    expect(data.id).not.toBe(first.id);
  });
});
