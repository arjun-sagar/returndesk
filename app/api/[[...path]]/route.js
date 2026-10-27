// Optional catch-all (also matches bare /api) for unknown /api paths: every method gets a JSON 404 instead of an HTML page.
import { NextResponse } from 'next/server';

// Builds the ROUTE_NOT_FOUND response. Reading request.url keeps it a request-time handler.
function notFoundHandler(request) {
  const path = new URL(request.url).pathname;
  return NextResponse.json(
    { error: { code: 'ROUTE_NOT_FOUND', message: `No API route matches ${request.method} ${path}.` } },
    { status: 404 },
  );
}

export const GET = notFoundHandler;
export const POST = notFoundHandler;
export const PUT = notFoundHandler;
export const PATCH = notFoundHandler;
export const DELETE = notFoundHandler;
