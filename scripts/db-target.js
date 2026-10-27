// Helpers that describe and classify a database connection string without ever exposing its password.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

// Parses a connection string, or returns null when it is missing or malformed (never throws, never echoes the input).
function parseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

// Returns "host/database" for a connection string, with no user name, password or query string.
export function describeTarget(url) {
  const parsed = parseUrl(url);
  if (!parsed) return 'unknown target (DATABASE_URL is missing or not a valid URL)';
  const host = parsed.hostname.replace(/^\[|\]$/g, '') || 'local socket';
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, '')) || '(default)';
  return `${host}/${database}`;
}

// True only when the connection string points at this machine (localhost, 127.0.0.1, ::1 or a local socket).
export function isLocalDatabase(url) {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (host) return LOCAL_HOSTS.has(host);
  // No host in the URL: the driver uses a unix socket unless a ?host= parameter names a remote machine.
  const socketHost = parsed.searchParams.get('host');
  return !socketHost || socketHost.startsWith('/');
}
