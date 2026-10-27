// /api/requests/{id}: GET detail, PATCH edit details, DELETE soft-remove.
import { ok, readJsonBody, withErrorHandling, methodNotAllowed } from '@/lib/http.js';
import { validationError } from '@/lib/errors.js';
import { parseRequestId, validateUpdateRequest } from '@/lib/validation.js';
import { getRequest, removeRequest, updateRequest } from '@/lib/request-service.js';

// Parses the {id} path segment; a malformed id is a 400, never a database error.
async function readId(context) {
  const { id: raw } = await context.params;
  const { value, error } = parseRequestId(raw);
  if (error) throw validationError({ id: error });
  return value;
}

// Returns the request with its notes and allowed actions.
export const GET = withErrorHandling(async (request, context) => {
  const id = await readId(context);
  return ok(await getRequest(id));
});

// Edits request details (only while Open / In Review).
export const PATCH = withErrorHandling(async (request, context) => {
  const id = await readId(context);
  const body = await readJsonBody(request);
  const { value, errors } = validateUpdateRequest(body);
  if (Object.keys(errors).length > 0) throw validationError(errors);
  return ok(await updateRequest(id, value));
});

// Removes an Open/Rejected request from the desk (soft delete).
export const DELETE = withErrorHandling(async (request, context) => {
  const id = await readId(context);
  return ok(await removeRequest(id));
});

export const POST = methodNotAllowed(['GET', 'PATCH', 'DELETE']);
export const PUT = methodNotAllowed(['GET', 'PATCH', 'DELETE']);
