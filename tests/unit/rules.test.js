// Unit tests for lib/rules.js: the status graph, edit/remove locks, approval rule and allowed actions.

import { describe, expect, it } from 'vitest';
import { STATUSES } from '../../lib/constants.js';
import { AppError } from '../../lib/errors.js';
import {
  TRANSITIONS,
  assertEditable,
  assertRemovable,
  assertTransitionAllowed,
  canEdit,
  canRemove,
  canTransition,
  getAllowedActions,
  normalizeApproval,
} from '../../lib/rules.js';

// Runs fn and returns the AppError it throws (fails the test if nothing is thrown).
function catchError(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected the function to throw');
}

const LEGAL = new Set(['Open>In Review', 'In Review>Approved', 'In Review>Rejected', 'Approved>Completed']);

describe('status transitions', () => {
  const pairs = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to]));

  it('covers all 25 from -> to pairs', () => {
    expect(pairs).toHaveLength(25);
  });

  it.each(pairs)('%s -> %s', (from, to) => {
    const legal = LEGAL.has(`${from}>${to}`);
    expect(canTransition(from, to)).toBe(legal);
    if (legal) {
      expect(() => assertTransitionAllowed(from, to)).not.toThrow();
    } else {
      const err = catchError(() => assertTransitionAllowed(from, to));
      expect(err).toBeInstanceOf(AppError);
      expect(err.status).toBe(409);
      expect(err.code).toBe('INVALID_STATUS_TRANSITION');
      expect(err.details).toEqual({ from, to, allowed: TRANSITIONS[from] });
    }
  });

  it('has exactly 4 legal pairs', () => {
    expect(pairs.filter(([from, to]) => canTransition(from, to))).toHaveLength(4);
  });

  it('treats same-state moves as illegal', () => {
    for (const status of STATUSES) expect(canTransition(status, status)).toBe(false);
  });

  it('gives final states no exits', () => {
    expect(TRANSITIONS.Rejected).toEqual([]);
    expect(TRANSITIONS.Completed).toEqual([]);
    for (const to of STATUSES) {
      expect(canTransition('Rejected', to)).toBe(false);
      expect(canTransition('Completed', to)).toBe(false);
    }
  });

  it('names the allowed next steps in the error message', () => {
    const err = catchError(() => assertTransitionAllowed('Open', 'Completed'));
    expect(err.message).toBe('A request cannot move from Open to Completed. Allowed next steps: In Review.');
  });

  it('rejects unknown statuses without throwing a TypeError', () => {
    expect(canTransition('Bogus', 'Open')).toBe(false);
    expect(canTransition('constructor', 'Open')).toBe(false);
    expect(canTransition('Open', 'Bogus')).toBe(false);
  });
});

describe('edit and remove locks', () => {
  const expected = {
    'Open': { edit: true, remove: true },
    'In Review': { edit: true, remove: false },
    'Approved': { edit: false, remove: false },
    'Rejected': { edit: false, remove: true },
    'Completed': { edit: false, remove: false },
  };

  it.each(STATUSES)('%s', (status) => {
    expect(canEdit(status)).toBe(expected[status].edit);
    expect(canRemove(status)).toBe(expected[status].remove);

    if (expected[status].edit) {
      expect(() => assertEditable(status)).not.toThrow();
    } else {
      const err = catchError(() => assertEditable(status));
      expect(err.status).toBe(409);
      expect(err.code).toBe('REQUEST_LOCKED');
      expect(err.details).toEqual({ status });
    }

    if (expected[status].remove) {
      expect(() => assertRemovable(status)).not.toThrow();
    } else {
      const err = catchError(() => assertRemovable(status));
      expect(err.status).toBe(409);
      expect(err.code).toBe('REMOVAL_NOT_ALLOWED');
      expect(err.details).toEqual({ status, removableStatuses: ['Open', 'Rejected'] });
    }
  });
});

describe('normalizeApproval', () => {
  it('requires a resolution', () => {
    for (const input of [{}, { resolution: null }, { resolution: '' }, { refundAmount: '10.00' }]) {
      const err = catchError(() => normalizeApproval(input));
      expect(err.status).toBe(422);
      expect(err.code).toBe('RESOLUTION_REQUIRED');
    }
  });

  it('requires a refund amount greater than zero for Refund', () => {
    for (const refundAmount of [undefined, null, '', '0.00', 0, '-5.00', -1]) {
      const err = catchError(() => normalizeApproval({ resolution: 'Refund', refundAmount }));
      expect(err.status).toBe(422);
      expect(err.code).toBe('REFUND_AMOUNT_REQUIRED');
      expect(err.message).toBe('A refund needs an amount greater than zero.');
    }
  });

  it('accepts a valid refund and returns a 2-decimal string', () => {
    expect(normalizeApproval({ resolution: 'Refund', refundAmount: '123.4' })).toEqual({ resolution: 'Refund', refundAmount: '123.40' });
    expect(normalizeApproval({ resolution: 'Refund', refundAmount: 500 })).toEqual({ resolution: 'Refund', refundAmount: '500.00' });
    expect(normalizeApproval({ resolution: 'Refund', refundAmount: '0.01' })).toEqual({ resolution: 'Refund', refundAmount: '0.01' });
  });

  it.each(['Replacement', 'Store Credit'])('rejects any amount (including 0) for %s', (resolution) => {
    for (const refundAmount of ['10.00', 10, '0.00', 0]) {
      const err = catchError(() => normalizeApproval({ resolution, refundAmount }));
      expect(err.status).toBe(422);
      expect(err.code).toBe('REFUND_AMOUNT_NOT_ALLOWED');
    }
  });

  it.each(['Replacement', 'Store Credit'])('accepts %s with no amount and returns refundAmount null', (resolution) => {
    for (const refundAmount of [undefined, null, '']) {
      expect(normalizeApproval({ resolution, refundAmount })).toEqual({ resolution, refundAmount: null });
    }
  });

  it('rejects an unknown resolution as a 400 validation error', () => {
    const err = catchError(() => normalizeApproval({ resolution: 'Voucher' }));
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
  });
});

describe('getAllowedActions', () => {
  it.each([
    ['Open', ['In Review'], true, true],
    ['In Review', ['Approved', 'Rejected'], true, false],
    ['Approved', ['Completed'], false, false],
    ['Rejected', [], false, true],
    ['Completed', [], false, false],
  ])('%s', (status, transitions, edit, remove) => {
    expect(getAllowedActions(status)).toEqual({ transitions, canEdit: edit, canRemove: remove, canAddNote: true });
  });

  it('returns a copy, so callers cannot mutate the graph', () => {
    getAllowedActions('Open').transitions.push('Completed');
    expect(TRANSITIONS.Open).toEqual(['In Review']);
  });
});
