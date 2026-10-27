// C1-C8 (status transitions) and D1-D8 (rule 2: approval needs a resolution).
import { describe, expect, it } from 'vitest';
import {
  LEGAL_TRANSITIONS,
  STATUSES,
  api,
  createRequest,
  expectError,
  expectOk,
  expectValidation,
  getRequest,
  moveTo,
  requestInState,
  transition,
} from './helpers.js';

describe('Status transitions (C)', () => {
  it('C1: Open -> In Review -> 200', async () => {
    const req = await createRequest();
    const data = expectOk(await transition(req.id, { status: 'In Review' }));
    expect(data.status).toBe('In Review');
    expect(data.id).toBe(req.id);
    expect((await getRequest(req.id)).status).toBe('In Review');
  });

  it('C2: In Review -> Approved (Refund, "49.90") -> 200, refundAmount "49.90"', async () => {
    const req = await requestInState('In Review');
    const data = expectOk(await transition(req.id, { status: 'Approved', resolution: 'Refund', refundAmount: '49.90' }));
    expect(data.status).toBe('Approved');
    expect(data.resolution).toBe('Refund');
    expect(data.refundAmount).toBe('49.90');
    // A numeric amount is normalized to two decimals too.
    const other = await requestInState('In Review');
    const numeric = expectOk(await transition(other.id, { status: 'Approved', resolution: 'Refund', refundAmount: 12.5 }));
    expect(numeric.refundAmount).toBe('12.50');
  });

  it('C3: In Review -> Approved with Replacement / Store Credit -> 200, refundAmount null', async () => {
    for (const resolution of ['Replacement', 'Store Credit']) {
      const req = await requestInState('In Review');
      const data = expectOk(await transition(req.id, { status: 'Approved', resolution }));
      expect(data.status).toBe('Approved');
      expect(data.resolution).toBe(resolution);
      expect(data.refundAmount).toBeNull();
    }
  });

  it('C4: Approved -> Completed -> 200, resolution kept', async () => {
    const req = await requestInState('In Review');
    await moveTo(req.id, 'Approved', { resolution: 'Refund', refundAmount: '75.00' });
    const data = expectOk(await transition(req.id, { status: 'Completed' }));
    expect(data.status).toBe('Completed');
    expect(data.resolution).toBe('Refund');
    expect(data.refundAmount).toBe('75.00');
  });

  it('C5: In Review -> Rejected -> 200, no resolution', async () => {
    const req = await requestInState('In Review');
    const data = expectOk(await transition(req.id, { status: 'Rejected' }));
    expect(data.status).toBe('Rejected');
    expect(data.resolution ?? null).toBeNull();
    expect(data.refundAmount ?? null).toBeNull();
  });

  it('C6: every illegal pair (incl. same-state) -> 409 INVALID_STATUS_TRANSITION and status unchanged', async () => {
    let illegalCount = 0;
    for (const from of STATUSES) {
      const req = await requestInState(from);
      for (const to of STATUSES) {
        if (LEGAL_TRANSITIONS[from].includes(to)) continue;
        illegalCount += 1;
        // Approval fields are supplied for Approved so the refusal can only come from the transition graph.
        const body = to === 'Approved' ? { status: to, resolution: 'Replacement' } : { status: to };
        const error = expectError(await transition(req.id, body), 409, 'INVALID_STATUS_TRANSITION');
        expect(error.message, `${from} -> ${to}`).toBeTypeOf('string');
        expect((await getRequest(req.id)).status, `${from} -> ${to} must not change the status`).toBe(from);
      }
    }
    expect(illegalCount).toBe(21);
  });

  it('C7: every attempt out of Rejected and out of Completed -> 409', async () => {
    for (const from of ['Rejected', 'Completed']) {
      const req = await requestInState(from);
      for (const to of STATUSES) {
        const body = to === 'Approved' ? { status: to, resolution: 'Refund', refundAmount: '10.00' } : { status: to };
        expectError(await transition(req.id, body), 409, 'INVALID_STATUS_TRANSITION');
      }
      expect((await getRequest(req.id)).status).toBe(from);
    }
  });

  it('C8: unknown status "Closed" -> 400', async () => {
    const req = await createRequest();
    expectValidation(await transition(req.id, { status: 'Closed' }), ['status']);
    expectValidation(await transition(req.id, {}), ['status']);
    expectValidation(await transition(req.id, { status: 'in review' }), ['status']);
    expect((await getRequest(req.id)).status).toBe('Open');
  });
});

describe('Rule 2: approval needs a resolution (D)', () => {
  it('D1: approve without resolution -> 422 RESOLUTION_REQUIRED, status still In Review', async () => {
    const req = await requestInState('In Review');
    expectError(await transition(req.id, { status: 'Approved' }), 422, 'RESOLUTION_REQUIRED');
    expect((await getRequest(req.id)).status).toBe('In Review');
  });

  it('D2: Refund with no amount / 0 / -5 -> 422 REFUND_AMOUNT_REQUIRED', async () => {
    const req = await requestInState('In Review');
    const attempts = [
      { status: 'Approved', resolution: 'Refund' },
      { status: 'Approved', resolution: 'Refund', refundAmount: 0 },
      { status: 'Approved', resolution: 'Refund', refundAmount: -5 },
      { status: 'Approved', resolution: 'Refund', refundAmount: '0.00' },
    ];
    for (const body of attempts) {
      expectError(await transition(req.id, body), 422, 'REFUND_AMOUNT_REQUIRED');
    }
    const after = await getRequest(req.id);
    expect(after.status).toBe('In Review');
    expect(after.refundAmount ?? null).toBeNull();
  });

  it('D3: Replacement with an amount -> 422 REFUND_AMOUNT_NOT_ALLOWED; Store Credit with 0 -> 422', async () => {
    const req = await requestInState('In Review');
    expectError(
      await transition(req.id, { status: 'Approved', resolution: 'Replacement', refundAmount: '20.00' }),
      422,
      'REFUND_AMOUNT_NOT_ALLOWED',
    );
    expectError(
      await transition(req.id, { status: 'Approved', resolution: 'Store Credit', refundAmount: 0 }),
      422,
      'REFUND_AMOUNT_NOT_ALLOWED',
    );
    expect((await getRequest(req.id)).status).toBe('In Review');
  });

  it('D4: amount "abc" / 12.345 -> 400', async () => {
    const req = await requestInState('In Review');
    expectValidation(await transition(req.id, { status: 'Approved', resolution: 'Refund', refundAmount: 'abc' }), ['refundAmount']);
    expectValidation(await transition(req.id, { status: 'Approved', resolution: 'Refund', refundAmount: 12.345 }), ['refundAmount']);
    expect((await getRequest(req.id)).status).toBe('In Review');
  });

  it('D5: resolution "Cash" -> 400', async () => {
    const req = await requestInState('In Review');
    expectValidation(await transition(req.id, { status: 'Approved', resolution: 'Cash' }), ['resolution']);
    expect((await getRequest(req.id)).status).toBe('In Review');
  });

  it('D6: resolution sent with an In Review target -> 400', async () => {
    const req = await createRequest();
    expectValidation(await transition(req.id, { status: 'In Review', resolution: 'Refund' }), ['resolution']);
    expectValidation(await transition(req.id, { status: 'In Review', refundAmount: '10.00' }), ['refundAmount']);
    expect((await getRequest(req.id)).status).toBe('Open');
  });

  it('D7: Open -> Approved with a valid resolution -> 409 (transition checked first)', async () => {
    const req = await createRequest();
    expectError(
      await transition(req.id, { status: 'Approved', resolution: 'Refund', refundAmount: '30.00' }),
      409,
      'INVALID_STATUS_TRANSITION',
    );
    // Even the invalid approval is a 409 from Open, because legality is checked before rule 2.
    expectError(await transition(req.id, { status: 'Approved' }), 409, 'INVALID_STATUS_TRANSITION');
    expect((await getRequest(req.id)).status).toBe('Open');
  });

  it('D8: concurrent approve and reject on the same In Review request -> one 200, one 409', async () => {
    const req = await requestInState('In Review');
    const [approve, reject] = await Promise.all([
      transition(req.id, { status: 'Approved', resolution: 'Store Credit' }),
      transition(req.id, { status: 'Rejected' }),
    ]);
    expect([approve.status, reject.status].sort()).toEqual([200, 409]);
    const loser = approve.status === 409 ? approve : reject;
    expectError(loser, 409, 'INVALID_STATUS_TRANSITION');
    const final = await getRequest(req.id);
    expect(final.status).toBe(approve.status === 200 ? 'Approved' : 'Rejected');
    if (final.status === 'Approved') expect(final.resolution).toBe('Store Credit');
    else expect(final.resolution ?? null).toBeNull();
    // Unknown id on the transitions route is a JSON 404 as well.
    expectError(await api('POST', '/api/requests/999999999/transitions', { status: 'In Review' }), 404, 'NOT_FOUND');
  });
});
