// Shared helpers for the API integration suite: HTTP wrapper, strict response assertions,
// unique test data, "move to a state" setup through the public API, and a pg client for DB-side checks.
import pg from 'pg';
import { expect } from 'vitest';

export const BASE_URL = (process.env.TEST_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

export const STATUSES = ['Open', 'In Review', 'Approved', 'Rejected', 'Completed'];
export const REASONS = ['Damaged', 'Wrong Item', 'Size Issue', 'Not As Described', 'Changed Mind'];

// The only legal moves; every other from -> to pair (including same-state) must be refused.
export const LEGAL_TRANSITIONS = {
  Open: ['In Review'],
  'In Review': ['Approved', 'Rejected'],
  Approved: ['Completed'],
  Rejected: [],
  Completed: [],
};

// Unique per module load, so re-running the suite never collides with earlier runs or seed data.
const RUN = `T${Date.now()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
let counter = 0;

export function runId() {
  return RUN;
}

/** A fresh, valid order number that no other test uses. */
export function uniqueOrder(tag = 'O') {
  counter += 1;
  return `${RUN}-${tag}${counter}`;
}

/** Random letters only (no digits), handy for unique customer names that sort predictably. */
export function randomLetters(length = 8) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(97 + Math.floor(Math.random() * 26));
  return out;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends a request and returns { status, headers, text, json }.
 * `body` is JSON-encoded unless `raw` is given (used for malformed JSON); `json` is null when the body is not JSON.
 */
export async function api(method, path, body, { raw } = {}) {
  const init = { method, headers: {} };
  if (raw !== undefined) {
    init.body = raw;
    init.headers['Content-Type'] = 'application/json';
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${BASE_URL}${path}`, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, text, json };
}

/** Asserts a failure response: expected status, JSON content type, { error: { code, message } } shape, expected code. */
export function expectError(res, status, code) {
  expect(res.status, `status for ${res.text.slice(0, 200)}`).toBe(status);
  expect(res.status, 'a failed operation must never be 2xx').toBeGreaterThanOrEqual(400);
  expect(res.headers.get('content-type') || '').toContain('application/json');
  expect(res.json, `response was not JSON: ${res.text.slice(0, 200)}`).not.toBeNull();
  expect(res.json.error).toBeTypeOf('object');
  expect(res.json.error.code).toBeTypeOf('string');
  expect(res.json.error.message).toBeTypeOf('string');
  expect(res.json.error.message.length).toBeGreaterThan(0);
  expect(res.text.trimStart().startsWith('<')).toBe(false);
  if (code) expect(res.json.error.code).toBe(code);
  return res.json.error;
}

/** Asserts a VALIDATION_ERROR and (optionally) that each listed field appears in details.fields. */
export function expectValidation(res, fields = []) {
  const error = expectError(res, 400, 'VALIDATION_ERROR');
  expect(error.details?.fields, 'details.fields').toBeTypeOf('object');
  for (const field of fields) {
    expect(Object.keys(error.details.fields), `fields should include ${field}`).toContain(field);
  }
  return error;
}

/** Asserts a success response with the expected status and a JSON { data } body. */
export function expectOk(res, status = 200) {
  expect(res.status, `status for ${res.text.slice(0, 200)}`).toBe(status);
  expect(res.headers.get('content-type') || '').toContain('application/json');
  expect(res.json).not.toBeNull();
  expect(res.json.data).toBeDefined();
  return res.json.data;
}

/** A valid create body with a unique order number; override any field. */
export function newPayload(overrides = {}) {
  return {
    customerName: 'Test Customer',
    customerEmail: 'test.customer@example.com',
    orderNumber: uniqueOrder(),
    itemSku: 'SKU-1',
    itemName: 'Test Item',
    quantity: 1,
    reason: 'Damaged',
    ...overrides,
  };
}

/** Creates a request (expects 201) and returns its data. */
export async function createRequest(overrides = {}) {
  return expectOk(await api('POST', '/api/requests', newPayload(overrides)), 201);
}

export async function getRequest(id) {
  return expectOk(await api('GET', `/api/requests/${id}`));
}

export function transition(id, body) {
  return api('POST', `/api/requests/${id}/transitions`, body);
}

/** Moves a request via the public API and returns the updated data (expects 200). */
export async function moveTo(id, status, extra = {}) {
  return expectOk(await transition(id, { status, ...extra }));
}

/** Creates a request and walks it to the wanted status using only legal API transitions. */
export async function requestInState(state, overrides = {}, approval = { resolution: 'Replacement' }) {
  const created = await createRequest(overrides);
  if (state === 'Open') return created;
  await moveTo(created.id, 'In Review');
  if (state === 'In Review') return getRequest(created.id);
  if (state === 'Rejected') {
    await moveTo(created.id, 'Rejected');
    return getRequest(created.id);
  }
  await moveTo(created.id, 'Approved', approval);
  if (state === 'Completed') await moveTo(created.id, 'Completed');
  return getRequest(created.id);
}

let pool = null;

/** Lazily built pg pool from DATABASE_URL, used only for DB-side assertions. */
export function db() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set; the DB-side assertions need it.');
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  }
  return pool;
}

/** Closes the pool; call from afterAll in any file that used db(). */
export async function closeDb() {
  if (pool) {
    const closing = pool;
    pool = null;
    await closing.end();
  }
}
