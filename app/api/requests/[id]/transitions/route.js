// /api/requests/{id}/transitions: POST changes the status (the only way status can change).
import { ok, readJsonBody, withErrorHandling, methodNotAllowed } from '@/lib/http.js';
import { validationError } from '@/lib/errors.js';
import { parseRequestId, validateTransitionInput } from '@/lib/validation.js';
import { transitionRequest } from '@/lib/request-service.js';

// Order of checks: id (400) -> body (400) -> existence (404) -> legality (409) -> approval rule (422).
export const POST = withErrorHandling(async (request, context) => {
  const { id: raw } = await context.params;
  const parsed = parseRequestId(raw);
  if (parsed.error) throw validationError({ id: parsed.error });
  const body = await readJsonBody(request);
  const { value, errors } = validateTransitionInput(body);
  if (Object.keys(errors).length > 0) throw validationError(errors);
  return ok(await transitionRequest(parsed.value, value));
});

export const GET = methodNotAllowed(['POST']);
export const PUT = methodNotAllowed(['POST']);
export const PATCH = methodNotAllowed(['POST']);
export const DELETE = methodNotAllowed(['POST']);
