// Application error type and factories. Route handlers throw these; lib/http.js turns them into JSON responses.

// An error that carries the HTTP status and machine-readable code the API should answer with.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// 400 for malformed input; `fields` is a { field: message } object, exposed as details.fields.
export function validationError(fields) {
  return new AppError(400, 'VALIDATION_ERROR', 'Some fields need attention.', { fields });
}

// 400 for a body that is not valid JSON (or not a JSON object).
export function invalidJson(message = 'Request body must be valid JSON.') {
  return new AppError(400, 'INVALID_JSON', message);
}

// 404 for a request that does not exist or has been removed.
export function notFound(message = 'Return request not found.') {
  return new AppError(404, 'NOT_FOUND', message);
}

// 409 when the request conflicts with the record's current state.
export function conflict(code, message, details) {
  return new AppError(409, code, message, details);
}

// 422 for a well-formed request that breaks a business rule.
export function unprocessable(code, message, details) {
  return new AppError(422, code, message, details);
}
