// /api/requests/{id}/notes: POST appends a note. Notes are append-only: no update or delete routes exist.
import { ok, readJsonBody, withErrorHandling, methodNotAllowed } from '@/lib/http.js';
import { validationError } from '@/lib/errors.js';
import { parseRequestId, validateNoteInput } from '@/lib/validation.js';
import { addNote } from '@/lib/request-service.js';

// Validates id and body, then appends the note (404 if the request is missing or removed).
export const POST = withErrorHandling(async (request, context) => {
  const { id: raw } = await context.params;
  const parsed = parseRequestId(raw);
  if (parsed.error) throw validationError({ id: parsed.error });
  const body = await readJsonBody(request);
  const { value, errors } = validateNoteInput(body);
  if (Object.keys(errors).length > 0) throw validationError(errors);
  return ok(await addNote(parsed.value, value), { status: 201 });
});

export const GET = methodNotAllowed(['POST']);
export const PUT = methodNotAllowed(['POST']);
export const PATCH = methodNotAllowed(['POST']);
export const DELETE = methodNotAllowed(['POST']);
