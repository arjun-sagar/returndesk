// I1-I3: malformed ids, unknown routes, and "no failed operation returns 2xx".
import { describe, expect, it } from 'vitest';
import { api, createRequest, expectError, expectOk, getRequest, newPayload, requestInState } from './helpers.js';

describe('Misc (I)', () => {
  it('I1: /api/requests/abc -> 400; /999999999 -> 404; /99999999999999999999 -> 400 (never 500)', async () => {
    expectError(await api('GET', '/api/requests/abc'), 400, 'VALIDATION_ERROR');
    expectError(await api('GET', '/api/requests/999999999'), 404, 'NOT_FOUND');
    expectError(await api('GET', '/api/requests/99999999999999999999'), 400, 'VALIDATION_ERROR');
    for (const id of ['0', '-1', '1.5', '2147483648', '1e3']) {
      expectError(await api('GET', `/api/requests/${id}`), 400, 'VALIDATION_ERROR');
    }
    // Every verb and sub-route treats a bad id the same way.
    expectError(await api('PATCH', '/api/requests/abc', { customerName: 'x' }), 400, 'VALIDATION_ERROR');
    expectError(await api('DELETE', '/api/requests/99999999999999999999'), 400, 'VALIDATION_ERROR');
    expectError(await api('POST', '/api/requests/abc/transitions', { status: 'In Review' }), 400, 'VALIDATION_ERROR');
    expectError(await api('POST', '/api/requests/99999999999999999999/notes', { author: 'a', body: 'b' }), 400, 'VALIDATION_ERROR');
    expectError(await api('PATCH', '/api/requests/999999999', { customerName: 'x' }), 404, 'NOT_FOUND');
    expectError(await api('DELETE', '/api/requests/999999999'), 404, 'NOT_FOUND');
  });

  it('I2: GET /api/nope -> 404 JSON', async () => {
    expectError(await api('GET', '/api/nope'), 404, 'ROUTE_NOT_FOUND');
    expectError(await api('POST', '/api/nope', {}), 404, 'ROUTE_NOT_FOUND');
    expectError(await api('GET', '/api/requests/1/unknown'), 404, 'ROUTE_NOT_FOUND');
    // Known path, unsupported method -> 405 JSON.
    expectError(await api('PUT', '/api/requests', {}), 405, 'METHOD_NOT_ALLOWED');
    expectError(await api('DELETE', '/api/requests'), 405, 'METHOD_NOT_ALLOWED');
    const req = await createRequest();
    expectError(await api('PUT', `/api/requests/${req.id}`, {}), 405, 'METHOD_NOT_ALLOWED');
    expectError(await api('GET', `/api/requests/${req.id}/transitions`), 405, 'METHOD_NOT_ALLOWED');
  });

  it('I3: no failed operation anywhere returns 2xx, and the data stays untouched', async () => {
    const inReview = await requestInState('In Review');
    const completed = await requestInState('Completed');
    const open = await createRequest();

    const failing = [
      api('POST', '/api/requests', {}),
      api('POST', '/api/requests', undefined, { raw: '{bad' }),
      api('POST', '/api/requests', newPayload({ reason: 'Nope' })),
      api('POST', '/api/requests', newPayload({ orderNumber: open.orderNumber, itemSku: open.itemSku })),
      api('PATCH', `/api/requests/${completed.id}`, { customerName: 'Nope' }),
      api('PATCH', `/api/requests/${open.id}`, {}),
      api('POST', `/api/requests/${open.id}/transitions`, { status: 'Completed' }),
      api('POST', `/api/requests/${inReview.id}/transitions`, { status: 'Approved' }),
      api('POST', `/api/requests/${inReview.id}/transitions`, { status: 'Approved', resolution: 'Refund' }),
      api('POST', `/api/requests/${inReview.id}/transitions`, { status: 'Approved', resolution: 'Refund', refundAmount: 'abc' }),
      api('POST', `/api/requests/${completed.id}/transitions`, { status: 'Open' }),
      api('POST', `/api/requests/${open.id}/notes`, { author: '', body: '' }),
      api('DELETE', `/api/requests/${inReview.id}`),
      api('DELETE', `/api/requests/${completed.id}`),
      api('GET', '/api/requests/abc'),
      api('GET', '/api/requests/999999999'),
      api('GET', '/api/requests?sort=nope'),
      api('GET', '/api/nope'),
      api('PUT', '/api/requests', {}),
    ];
    const results = await Promise.all(failing);
    for (const res of results) {
      expect(res.status, res.text.slice(0, 200)).toBeGreaterThanOrEqual(400);
      expect(res.status, res.text.slice(0, 200)).toBeLessThan(500);
      expect(res.headers.get('content-type') || '').toContain('application/json');
      expect(res.json?.error?.code).toBeTypeOf('string');
      expect(res.json?.error?.message).toBeTypeOf('string');
      expect(res.json).not.toHaveProperty('data');
      // No leaked internals in any message.
      expect(res.text).not.toMatch(/postgres(ql)?:\/\//i);
      expect(res.text).not.toMatch(/\bat .*\.js:\d+/);
      expect(res.text).not.toMatch(/SELECT |INSERT |UPDATE /);
    }
    // Nothing changed as a side effect.
    expect((await getRequest(inReview.id)).status).toBe('In Review');
    expect((await getRequest(completed.id)).status).toBe('Completed');
    expect((await getRequest(open.id)).status).toBe('Open');
    expectOk(await api('GET', `/api/requests/${open.id}`));
  });
});
