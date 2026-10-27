// /api/requests: GET lists requests (search/filter/sort/page), POST creates one.
import { ok, readJsonBody, withErrorHandling, methodNotAllowed } from '@/lib/http.js';
import { validationError } from '@/lib/errors.js';
import { parseListQuery, validateCreateRequest } from '@/lib/validation.js';
import { createRequest, listRequests } from '@/lib/request-service.js';

// Validates the query string, then runs the server-side list query.
export const GET = withErrorHandling(async (request) => {
  const { value, errors } = parseListQuery(new URL(request.url).searchParams);
  if (Object.keys(errors).length > 0) throw validationError(errors);
  const { items, meta } = await listRequests(value);
  return ok(items, { meta });
});

// Validates the body, inserts the request and answers 201 with a Location header.
export const POST = withErrorHandling(async (request) => {
  const body = await readJsonBody(request);
  const { value, errors } = validateCreateRequest(body);
  if (Object.keys(errors).length > 0) throw validationError(errors);
  const created = await createRequest(value);
  return ok(created, { status: 201, headers: { Location: `/api/requests/${created.id}` } });
});

export const PUT = methodNotAllowed(['GET', 'POST']);
export const PATCH = methodNotAllowed(['GET', 'POST']);
export const DELETE = methodNotAllowed(['GET', 'POST']);
