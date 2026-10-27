// Browser-side fetch wrapper for the ReturnDesk JSON API. Used by client components only.

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Calls the API, returns { data, meta } on 2xx and throws ApiError for any failure (including network errors).
export async function apiFetch(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.');
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(response.status, 'BAD_RESPONSE', 'The server sent a response we could not read.');
  }

  if (!response.ok) {
    const e = payload?.error;
    throw new ApiError(
      response.status,
      e?.code ?? 'UNKNOWN_ERROR',
      e?.message ?? 'The request failed.',
      e?.details,
    );
  }
  return { data: payload?.data, meta: payload?.meta };
}
