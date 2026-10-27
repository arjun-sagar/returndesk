// Business rules for return requests. The single home of every rule: transitions, edit/remove locks, approval details.
// Pure functions only, so the API, the UI and the unit tests all share them.

import { RESOLUTIONS } from './constants.js';
import { conflict, unprocessable, validationError } from './errors.js';

// The status graph: each status lists the only statuses it may move to.
export const TRANSITIONS = {
  'Open': ['In Review'],
  'In Review': ['Approved', 'Rejected'],
  'Approved': ['Completed'],
  'Rejected': [],
  'Completed': [],
};

// Statuses that still occupy an order+item pair (a second request for it is a duplicate).
export const LIVE_STATUSES = ['Open', 'In Review', 'Approved'];
// Details may be corrected only while the request is still being reviewed.
export const EDITABLE_STATUSES = ['Open', 'In Review'];
// A request may be removed from the desk only before review starts, or after rejection.
export const REMOVABLE_STATUSES = ['Open', 'Rejected'];

// Returns the statuses a request may move to next (empty for unknown or final statuses).
function nextStatuses(from) {
  return Object.hasOwn(TRANSITIONS, from) ? TRANSITIONS[from] : [];
}

// True when `from` -> `to` is an edge of the graph. Same-state moves are never legal.
export function canTransition(from, to) {
  return nextStatuses(from).includes(to);
}

// Throws 409 INVALID_STATUS_TRANSITION (with the allowed next steps) when the move is not in the graph.
export function assertTransitionAllowed(from, to) {
  if (canTransition(from, to)) return;
  const allowed = [...nextStatuses(from)];
  const next = allowed.length > 0 ? allowed.join(', ') : 'none, this is a final status';
  throw conflict(
    'INVALID_STATUS_TRANSITION',
    `A request cannot move from ${from} to ${to}. Allowed next steps: ${next}.`,
    { from, to, allowed },
  );
}

// True when request details may still be corrected in this status.
export function canEdit(status) {
  return EDITABLE_STATUSES.includes(status);
}

// Throws 409 REQUEST_LOCKED when the request can no longer be edited.
export function assertEditable(status) {
  if (canEdit(status)) return;
  throw conflict(
    'REQUEST_LOCKED',
    `A request that is ${status} can no longer be edited.`,
    { status },
  );
}

// True when the request may be removed from the desk in this status.
export function canRemove(status) {
  return REMOVABLE_STATUSES.includes(status);
}

// Throws 409 REMOVAL_NOT_ALLOWED unless the request is Open or Rejected.
export function assertRemovable(status) {
  if (canRemove(status)) return;
  throw conflict(
    'REMOVAL_NOT_ALLOWED',
    `A request that is ${status} cannot be removed. Only ${REMOVABLE_STATUSES.join(' or ')} requests can be removed.`,
    { status, removableStatuses: [...REMOVABLE_STATUSES] },
  );
}

// True when the caller supplied a value (null, undefined and blank strings count as "not supplied"; 0 counts as supplied).
function isSupplied(value) {
  if (value === undefined || value === null) return false;
  return !(typeof value === 'string' && value.trim() === '');
}

// Applies the approval rule to already format-validated input; throws 422 on a violation.
// Returns { resolution, refundAmount } with refundAmount as a 2-decimal string, or null for non-refund resolutions.
export function normalizeApproval({ resolution, refundAmount } = {}) {
  if (!isSupplied(resolution)) {
    throw unprocessable('RESOLUTION_REQUIRED', 'Choose a resolution (Refund, Replacement or Store Credit) before approving.');
  }
  if (!RESOLUTIONS.includes(resolution)) {
    throw validationError({ resolution: `resolution must be one of: ${RESOLUTIONS.join(', ')}` });
  }

  const hasAmount = isSupplied(refundAmount);

  if (resolution === 'Refund') {
    const amount = hasAmount ? Number(refundAmount) : NaN;
    if (!(amount > 0)) {
      throw unprocessable('REFUND_AMOUNT_REQUIRED', 'A refund needs an amount greater than zero.');
    }
    return { resolution, refundAmount: amount.toFixed(2) };
  }

  if (hasAmount) {
    throw unprocessable(
      'REFUND_AMOUNT_NOT_ALLOWED',
      `A ${resolution} cannot have a refund amount. Remove the amount or choose Refund.`,
    );
  }
  return { resolution, refundAmount: null };
}

// What the UI may offer for a status: the next statuses, edit/remove permission, and notes (always allowed).
export function getAllowedActions(status) {
  return {
    transitions: [...nextStatuses(status)],
    canEdit: canEdit(status),
    canRemove: canRemove(status),
    canAddNote: true,
  };
}
