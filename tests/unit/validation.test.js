// Unit tests for lib/validation.js: request, update, transition and note validators, list query, id and LIKE helpers.

import { describe, expect, it } from 'vitest';
import {
  escapeLike,
  normalizeCode,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  parseListQuery,
  parseRequestId,
  validateCreateRequest,
  validateNoteInput,
  validateTransitionInput,
  validateUpdateRequest,
} from '../../lib/validation.js';

// A fully valid create body; tests override one field at a time.
function validBody(overrides = {}) {
  return {
    customerName: 'Asha Rao',
    customerEmail: 'asha@example.com',
    customerPhone: '+91 98765 43210',
    orderNumber: 'ORD-1001',
    itemSku: 'SKU-77',
    itemName: 'Blue Kettle',
    quantity: 2,
    reason: 'Damaged',
    ...overrides,
  };
}

// Returns a copy of `obj` without `key`.
function without(obj, key) {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

describe('normalizers', () => {
  it('normalizeText trims and collapses whitespace', () => {
    expect(normalizeText('  Asha   Rao \n')).toBe('Asha Rao');
  });
  it('normalizeCode trims and uppercases', () => {
    expect(normalizeCode(' ord-1 ')).toBe('ORD-1');
  });
  it('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  Asha@Example.COM ')).toBe('asha@example.com');
  });
  it('normalizePhone only trims', () => {
    expect(normalizePhone('  +91 98765 43210 ')).toBe('+91 98765 43210');
  });
  it('pass non-strings through unchanged', () => {
    expect(normalizeText(5)).toBe(5);
    expect(normalizeCode(null)).toBe(null);
    expect(normalizeEmail(undefined)).toBe(undefined);
    expect(normalizePhone(7)).toBe(7);
  });
});

describe('validateCreateRequest', () => {
  it('accepts a valid body and returns normalized values', () => {
    const { value, errors } = validateCreateRequest(validBody({
      customerName: '  Asha   Rao ',
      customerEmail: ' Asha@Example.com ',
      orderNumber: ' ord-1 ',
      itemSku: 'sku-77',
    }));
    expect(errors).toEqual({});
    expect(value).toEqual({
      customerName: 'Asha Rao',
      customerEmail: 'asha@example.com',
      customerPhone: '+91 98765 43210',
      orderNumber: 'ORD-1',
      itemSku: 'SKU-77',
      itemName: 'Blue Kettle',
      quantity: 2,
      reason: 'Damaged',
    });
  });

  it('accepts email only, or phone only', () => {
    expect(validateCreateRequest(without(validBody(), 'customerPhone')).errors).toEqual({});
    expect(validateCreateRequest(without(validBody(), 'customerEmail')).errors).toEqual({});
    const { value } = validateCreateRequest(validBody({ customerEmail: '', customerPhone: null }));
    expect(value.customerEmail).toBe(null);
  });

  it.each(['customerName', 'orderNumber', 'itemSku', 'itemName', 'quantity', 'reason'])('requires %s', (field) => {
    const { errors } = validateCreateRequest(without(validBody(), field));
    expect(Object.keys(errors)).toEqual([field]);
  });

  it('treats blank required strings as missing', () => {
    const { errors } = validateCreateRequest(validBody({ customerName: '   ', orderNumber: '' }));
    expect(Object.keys(errors).sort()).toEqual(['customerName', 'orderNumber']);
  });

  it('requires at least one contact method under the key "contact"', () => {
    const { errors } = validateCreateRequest(validBody({ customerEmail: '', customerPhone: '' }));
    expect(Object.keys(errors)).toEqual(['contact']);
    const missing = validateCreateRequest(without(without(validBody(), 'customerEmail'), 'customerPhone'));
    expect(Object.keys(missing.errors)).toEqual(['contact']);
  });

  it('does not add a contact error when a supplied contact is merely malformed', () => {
    const { errors } = validateCreateRequest(validBody({ customerEmail: 'nope', customerPhone: null }));
    expect(Object.keys(errors)).toEqual(['customerEmail']);
  });

  it.each(['plainaddress', 'a@b', 'a b@c.com', '@c.com', 'a@@c.com'])('rejects email %s', (email) => {
    expect(validateCreateRequest(validBody({ customerEmail: email })).errors.customerEmail).toBeTruthy();
  });

  it('rejects an email longer than 254 characters', () => {
    const long = `${'a'.repeat(250)}@x.com`;
    expect(validateCreateRequest(validBody({ customerEmail: long })).errors.customerEmail).toBeTruthy();
  });

  it.each(['abc', '12345', '123-45', '+', '(091) 123456', '9'.repeat(21), '+91 98765 abc'])('rejects phone %s', (phone) => {
    expect(validateCreateRequest(validBody({ customerPhone: phone })).errors.customerPhone).toBeTruthy();
  });

  it.each(['9876543', '+919876543210', '080 (1234) 5678', '080-1234-5678'])('accepts phone %s', (phone) => {
    expect(validateCreateRequest(validBody({ customerPhone: phone })).errors).toEqual({});
  });

  it('rejects order numbers and SKUs with spaces or bad characters', () => {
    const { errors } = validateCreateRequest(validBody({ orderNumber: 'ORD 1', itemSku: 'SKU@1' }));
    expect(Object.keys(errors).sort()).toEqual(['itemSku', 'orderNumber']);
  });

  it('enforces length limits', () => {
    expect(validateCreateRequest(validBody({ customerName: 'a'.repeat(101) })).errors.customerName).toBeTruthy();
    expect(validateCreateRequest(validBody({ customerName: 'a'.repeat(100) })).errors).toEqual({});
    expect(validateCreateRequest(validBody({ itemName: 'a'.repeat(201) })).errors.itemName).toBeTruthy();
    expect(validateCreateRequest(validBody({ orderNumber: 'A'.repeat(41) })).errors.orderNumber).toBeTruthy();
    expect(validateCreateRequest(validBody({ orderNumber: 'A'.repeat(40) })).errors).toEqual({});
  });

  it.each([0, -1, 1.5, '2', 1000, null, true, NaN])('rejects quantity %s', (quantity) => {
    expect(validateCreateRequest(validBody({ quantity })).errors.quantity).toBeTruthy();
  });

  it.each([1, 999])('accepts quantity %s', (quantity) => {
    expect(validateCreateRequest(validBody({ quantity })).errors).toEqual({});
  });

  it('requires reason to be an exact member of REASONS', () => {
    expect(validateCreateRequest(validBody({ reason: 'damaged' })).errors.reason).toBeTruthy();
    expect(validateCreateRequest(validBody({ reason: 'Other' })).errors.reason).toBeTruthy();
    expect(validateCreateRequest(validBody({ reason: 'Not As Described' })).errors).toEqual({});
  });

  it('rejects non-string text fields', () => {
    expect(validateCreateRequest(validBody({ customerName: 42 })).errors.customerName).toBeTruthy();
    expect(validateCreateRequest(validBody({ customerEmail: 42 })).errors.customerEmail).toBeTruthy();
  });

  it('rejects unknown fields with the specific messages', () => {
    const { errors } = validateCreateRequest(validBody({
      reference: 'RD-9',
      status: 'Approved',
      resolution: 'Refund',
      refundAmount: 5,
      id: 1,
      createdAt: 'x',
      updatedAt: 'x',
      removedAt: 'x',
      extra: 1,
    }));
    expect(errors.reference).toBe('reference is generated by the system and cannot be set');
    for (const key of ['status', 'resolution', 'refundAmount']) {
      expect(errors[key]).toBe('use POST /api/requests/:id/transitions to change status');
    }
    for (const key of ['id', 'createdAt', 'updatedAt', 'removedAt']) {
      expect(errors[key]).toBe(`${key} is read-only`);
    }
    expect(errors.extra).toBe('extra is not a recognised field');
  });

  it('rejects a body that is not an object', () => {
    for (const body of [null, undefined, [], 'text', 5]) {
      expect(validateCreateRequest(body).errors.body).toBeTruthy();
    }
  });
});

describe('validateUpdateRequest', () => {
  it('rejects an empty body', () => {
    const { errors } = validateUpdateRequest({});
    expect(Object.keys(errors)).toEqual(['body']);
  });

  it('accepts a partial body and returns only the supplied fields, normalized', () => {
    const { value, errors } = validateUpdateRequest({ quantity: 3, orderNumber: ' ord-2 ' });
    expect(errors).toEqual({});
    expect(value).toEqual({ quantity: 3, orderNumber: 'ORD-2' });
  });

  it('allows clearing email or phone (the service re-checks the contact rule)', () => {
    const { value, errors } = validateUpdateRequest({ customerEmail: '' });
    expect(errors).toEqual({});
    expect(value).toEqual({ customerEmail: null });
  });

  it('applies the same per-field rules', () => {
    const { errors } = validateUpdateRequest({ quantity: 0, customerName: '  ', reason: 'Nope', customerPhone: 'abc' });
    expect(Object.keys(errors).sort()).toEqual(['customerName', 'customerPhone', 'quantity', 'reason']);
  });

  it('rejects forbidden keys', () => {
    const { errors } = validateUpdateRequest({ reference: 'RD-1', status: 'Open', id: 3, quantity: 2 });
    expect(errors.reference).toBe('reference is generated by the system and cannot be set');
    expect(errors.status).toBe('use POST /api/requests/:id/transitions to change status');
    expect(errors.id).toBe('id is read-only');
    expect(errors.quantity).toBeUndefined();
  });

  it('does not add the "at least one field" error when only unknown fields are sent', () => {
    const { errors } = validateUpdateRequest({ bogus: 1 });
    expect(Object.keys(errors)).toEqual(['bogus']);
  });
});

describe('validateNoteInput', () => {
  it('accepts a valid note and keeps internal newlines', () => {
    const { value, errors } = validateNoteInput({ author: '  Priya   S ', body: '  Line one\nLine two  \n' });
    expect(errors).toEqual({});
    expect(value).toEqual({ author: 'Priya S', body: 'Line one\nLine two' });
  });

  it('requires author and body', () => {
    expect(Object.keys(validateNoteInput({}).errors).sort()).toEqual(['author', 'body']);
    expect(Object.keys(validateNoteInput({ author: ' ', body: '\n ' }).errors).sort()).toEqual(['author', 'body']);
  });

  it('enforces length limits', () => {
    expect(validateNoteInput({ author: 'a'.repeat(81), body: 'ok' }).errors.author).toBeTruthy();
    expect(validateNoteInput({ author: 'a'.repeat(80), body: 'ok' }).errors).toEqual({});
    expect(validateNoteInput({ author: 'a', body: 'b'.repeat(2001) }).errors.body).toBeTruthy();
    expect(validateNoteInput({ author: 'a', body: 'b'.repeat(2000) }).errors).toEqual({});
  });

  it('rejects non-string values and unknown fields', () => {
    expect(validateNoteInput({ author: 5, body: 'ok' }).errors.author).toBeTruthy();
    expect(validateNoteInput({ author: 'a', body: 'ok', status: 'Open' }).errors.status).toBe('status is not a recognised field');
    expect(validateNoteInput({ author: 'a', body: 'ok', id: 1 }).errors.id).toBe('id is read-only');
  });
});

describe('validateTransitionInput', () => {
  it('accepts a plain status change', () => {
    const { value, errors } = validateTransitionInput({ status: 'In Review' });
    expect(errors).toEqual({});
    expect(value).toEqual({ status: 'In Review', resolution: null, refundAmount: null });
  });

  it('requires a status', () => {
    expect(validateTransitionInput({}).errors.status).toBeTruthy();
  });

  it('rejects an unknown status', () => {
    expect(validateTransitionInput({ status: 'Shipped' }).errors.status).toBeTruthy();
    expect(validateTransitionInput({ status: 'open' }).errors.status).toBeTruthy();
    expect(validateTransitionInput({ status: 3 }).errors.status).toBeTruthy();
  });

  it('accepts Approved with a resolution and normalizes the amount', () => {
    const { value, errors } = validateTransitionInput({ status: 'Approved', resolution: 'Refund', refundAmount: '123.4' });
    expect(errors).toEqual({});
    expect(value).toEqual({ status: 'Approved', resolution: 'Refund', refundAmount: '123.40' });
    expect(validateTransitionInput({ status: 'Approved', resolution: 'Refund', refundAmount: 99 }).value.refundAmount).toBe('99.00');
  });

  it('accepts Approved with no resolution (the 422 rule lives in rules.js)', () => {
    const { value, errors } = validateTransitionInput({ status: 'Approved' });
    expect(errors).toEqual({});
    expect(value.resolution).toBe(null);
  });

  it.each(['In Review', 'Rejected', 'Completed', 'Open'])('rejects resolution and refundAmount when status is %s', (status) => {
    const { errors } = validateTransitionInput({ status, resolution: 'Refund', refundAmount: '10.00' });
    expect(errors.resolution).toBeTruthy();
    expect(errors.refundAmount).toBeTruthy();
  });

  it('rejects an unknown resolution', () => {
    expect(validateTransitionInput({ status: 'Approved', resolution: 'Voucher' }).errors.resolution).toBeTruthy();
  });

  it.each(['abc', '12.345', '1e3', '$10', '1,000', {}, true, Infinity])('rejects malformed amount %s', (refundAmount) => {
    expect(validateTransitionInput({ status: 'Approved', resolution: 'Refund', refundAmount }).errors.refundAmount).toBeTruthy();
  });

  it('rejects an amount above the maximum but allows the maximum', () => {
    expect(validateTransitionInput({ status: 'Approved', resolution: 'Refund', refundAmount: '1000000.01' }).errors.refundAmount).toBeTruthy();
    expect(validateTransitionInput({ status: 'Approved', resolution: 'Refund', refundAmount: '1000000' }).errors).toEqual({});
  });

  it('leaves zero and negative amounts to the business rule (format is valid)', () => {
    expect(validateTransitionInput({ status: 'Approved', resolution: 'Refund', refundAmount: '0' })).toEqual({
      value: { status: 'Approved', resolution: 'Refund', refundAmount: '0.00' },
      errors: {},
    });
    expect(validateTransitionInput({ status: 'Approved', resolution: 'Refund', refundAmount: -5 }).value.refundAmount).toBe('-5.00');
  });

  it('rejects unknown fields', () => {
    const { errors } = validateTransitionInput({ status: 'Open', reference: 'RD-1', foo: 1 });
    expect(errors.reference).toBeTruthy();
    expect(errors.foo).toBe('foo is not a recognised field');
  });
});

describe('parseListQuery', () => {
  it('applies defaults for an empty query', () => {
    expect(parseListQuery(new URLSearchParams(''))).toEqual({
      value: { q: null, status: null, reason: null, sort: 'createdAt', order: 'desc', page: 1, pageSize: 20 },
      errors: {},
    });
  });

  it('parses every param when valid', () => {
    const { value, errors } = parseListQuery(new URLSearchParams(
      'q=%20kettle%20%20blue&status=In%20Review&reason=Damaged&sort=customerName&order=asc&page=3&pageSize=50',
    ));
    expect(errors).toEqual({});
    expect(value).toEqual({
      q: 'kettle blue', status: 'In Review', reason: 'Damaged', sort: 'customerName', order: 'asc', page: 3, pageSize: 50,
    });
  });

  it('treats blank params as absent (the UI sends empty filters)', () => {
    const { value, errors } = parseListQuery(new URLSearchParams('q=&status=&reason=&sort=&order=&page=&pageSize='));
    expect(errors).toEqual({});
    expect(value.status).toBe(null);
    expect(value.sort).toBe('createdAt');
    expect(value.page).toBe(1);
  });

  it('ignores unknown params', () => {
    expect(parseListQuery(new URLSearchParams('foo=bar&limit=5')).errors).toEqual({});
  });

  it.each([
    ['status', 'Shipped'],
    ['status', 'open'],
    ['reason', 'Other'],
    ['sort', 'reference'],
    ['order', 'DESC'],
    ['order', 'up'],
    ['page', '0'],
    ['page', '-1'],
    ['page', '1.5'],
    ['page', 'abc'],
    ['page', '99999999999999999999'],
    ['pageSize', '0'],
    ['pageSize', '101'],
    ['pageSize', 'abc'],
    ['pageSize', '2.5'],
    ['q', 'a'.repeat(101)],
  ])('rejects %s=%s', (key, raw) => {
    const { errors } = parseListQuery(new URLSearchParams({ [key]: raw }));
    expect(Object.keys(errors)).toEqual([key]);
  });

  it('rejects a sort-injection string and never echoes it into value', () => {
    const injection = 'createdAt; DROP TABLE return_requests;--';
    const { value, errors } = parseListQuery(new URLSearchParams({ sort: injection, order: 'asc; DELETE FROM x' }));
    expect(errors.sort).toBeTruthy();
    expect(errors.order).toBeTruthy();
    expect(value.sort).toBe('createdAt');
    expect(value.order).toBe('desc');
  });

  it('accepts the boundary values', () => {
    expect(parseListQuery(new URLSearchParams('pageSize=1&page=1')).errors).toEqual({});
    expect(parseListQuery(new URLSearchParams('pageSize=100')).errors).toEqual({});
    expect(parseListQuery(new URLSearchParams({ q: 'a'.repeat(100) })).errors).toEqual({});
  });
});

describe('parseRequestId', () => {
  it.each(['1', '42', '2147483647', 7])('accepts %s', (raw) => {
    const result = parseRequestId(raw);
    expect(result.error).toBe(null);
    expect(result.value).toBe(Number(raw));
  });

  it.each(['abc', '0', '-1', '99999999999999999999', '2147483648', '', ' 1', '1.5', '01', '1e3', null, undefined, {}])('rejects %s', (raw) => {
    const result = parseRequestId(raw);
    expect(result.value).toBe(null);
    expect(typeof result.error).toBe('string');
  });
});

describe('escapeLike', () => {
  it('escapes %, _ and backslash', () => {
    expect(escapeLike('50%_off\\now')).toBe('50\\%\\_off\\\\now');
  });
  it('leaves ordinary text alone', () => {
    expect(escapeLike('kettle blue')).toBe('kettle blue');
  });
});
