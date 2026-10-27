// HTTP helpers shared by every route handler (server only): success envelope, JSON body reading,
// error mapping and 405 responses. Keeps every /api response JSON, with no SQL or stack traces leaking.
import { NextResponse } from 'next/server';
import { AppError, invalidJson } from './errors.js';

// Builds a success response in the { data, meta? } envelope.
export function ok(data, { status = 200, meta, headers } = {}) {
  const body = meta ? { data, meta } : { data };
  return NextResponse.json(body, { status, headers });
}

// Reads the request body as JSON and requires a plain object (not an array, string or null).
export async function readJsonBody(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw invalidJson('Request body must be valid JSON.');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw invalidJson('Request body must be a JSON object.');
  }
  return body;
}

// Builds the { error: { code, message, details? } } JSON response.
function errorJson(status, code, message, details, headers) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return NextResponse.json({ error }, { status, headers });
}

// Logs an unexpected failure in a safe form: method, path, error code and first message line only
// (never SQL text, stack traces or connection strings).
function logUnexpected(err, request) {
  const method = request?.method ?? '-';
  let path = '-';
  try {
    path = new URL(request.url).pathname;
  } catch {
    // request missing or malformed: keep the placeholder
  }
  const code = err?.code ?? err?.name ?? 'UNKNOWN';
  const message = String(err?.message ?? '').split('\n')[0].slice(0, 200);
  console.error(`[api] ${method} ${path} ${code} ${message}`);
}

// Maps any thrown value to a JSON error response: AppError as-is, known Postgres errors to 4xx,
// everything else to a generic 500.
export function errorResponse(err, request) {
  if (err instanceof AppError) {
    return errorJson(err.status, err.code, err.message, err.details);
  }

  // Fallback only: the service normally catches this first to add the existing reference.
  if (err?.code === '23505' && err?.constraint === 'return_requests_one_live_per_item') {
    return errorJson(
      409,
      'DUPLICATE_LIVE_REQUEST',
      'A live return request already exists for this order and item.',
    );
  }

  // Check violation, invalid text representation, numeric overflow: the input slipped past validation.
  if (err?.code === '23514' || err?.code === '22P02' || err?.code === '22003') {
    console.error(
      `[api] ${request?.method ?? '-'} database rejected input ${err.code} ${err.constraint ?? ''}`.trim(),
    );
    return errorJson(400, 'VALIDATION_ERROR', 'The request contains a value that is not allowed.');
  }

  logUnexpected(err, request);
  return errorJson(
    500,
    'INTERNAL_ERROR',
    'Something went wrong on our side. Please try again.',
  );
}

// Wraps a route handler so any thrown error becomes a JSON error response.
export function withErrorHandling(handler) {
  return async function wrapped(request, context) {
    try {
      return await handler(request, context);
    } catch (err) {
      return errorResponse(err, request);
    }
  };
}

// Returns a handler that answers 405 METHOD_NOT_ALLOWED as JSON with an Allow header.
export function methodNotAllowed(allowed) {
  const allow = allowed.join(', ');
  return function handler(request) {
    // Reading request.url keeps this a request-time handler (not prerendered) under Cache Components.
    const path = new URL(request.url).pathname;
    return errorJson(
      405,
      'METHOD_NOT_ALLOWED',
      `${request.method} is not supported on ${path}. Allowed methods: ${allow}.`,
      { allowed },
      { Allow: allow },
    );
  };
}
