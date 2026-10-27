// Non-mutating smoke test against any running ReturnDesk server: node scripts/smoke.js <baseUrl>
// Each check prints PASS or FAIL; the exit code is 1 if any check fails.
const baseUrl = (process.argv[2] || process.env.TEST_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

let failures = 0;
const leaks = [];

/** Fetches a path and returns { status, contentType, text, json }. Also records any HTML body. */
async function call(method, path, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  const contentType = res.headers.get('content-type') || '';
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!contentType.includes('application/json') || text.trimStart().startsWith('<')) {
    leaks.push(`${method} ${path} -> ${res.status} ${contentType || '(no content type)'}`);
  }
  return { status: res.status, contentType, text, json };
}

/** Runs one named check; a thrown error or false-y result is a FAIL. */
async function check(name, fn) {
  try {
    const detail = await fn();
    console.log(`PASS  ${name}${detail ? ` (${detail})` : ''}`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL  ${name}: ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function total() {
  const res = await call('GET', '/api/requests?pageSize=1');
  assert(res.status === 200, `list status ${res.status}`);
  return res.json.meta.total;
}

console.log(`Smoke test against ${baseUrl}`);

let firstId = null;
let totalBefore = null;

await check('GET /api/requests lists at least 30 requests', async () => {
  const res = await call('GET', '/api/requests');
  assert(res.status === 200, `expected 200, got ${res.status}`);
  assert(res.contentType.includes('application/json'), `content type ${res.contentType}`);
  assert(Array.isArray(res.json?.data) && res.json.data.length > 0, 'data is not a non-empty array');
  assert(res.json.meta.total >= 30, `meta.total is ${res.json.meta.total}, expected >= 30`);
  totalBefore = res.json.meta.total;
  firstId = res.json.data[0].id;
  return `total ${res.json.meta.total}`;
});

await check('GET /api/requests/{id} returns detail with notes and allowedActions', async () => {
  assert(firstId !== null, 'no id available from the list check');
  const res = await call('GET', `/api/requests/${firstId}`);
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const data = res.json?.data;
  assert(data && data.id === firstId, 'detail id mismatch');
  assert(/^RD-\d{6,}$/.test(data.reference), `bad reference ${data.reference}`);
  assert(Array.isArray(data.notes), 'notes is not an array');
  assert(data.allowedActions && typeof data.allowedActions === 'object', 'allowedActions missing');
  return data.reference;
});

await check('Illegal transition on a Completed request -> 409 and nothing changes', async () => {
  const list = await call('GET', '/api/requests?status=Completed&pageSize=1');
  assert(list.status === 200 && list.json.data.length === 1, 'no Completed request found (is the database seeded?)');
  const target = list.json.data[0];
  const res = await call('POST', `/api/requests/${target.id}/transitions`, { status: 'In Review' });
  assert(res.status === 409, `expected 409, got ${res.status}`);
  assert(res.json?.error?.code === 'INVALID_STATUS_TRANSITION', `code ${res.json?.error?.code}`);
  const after = await call('GET', `/api/requests/${target.id}`);
  assert(after.json.data.status === 'Completed', `status is now ${after.json.data.status}`);
  assert(after.json.data.updatedAt === target.updatedAt, 'updatedAt changed');
  return target.reference;
});

await check('POST create with an invalid body -> 400 and inserts nothing', async () => {
  const before = await total();
  const res = await call('POST', '/api/requests', { customerName: '', quantity: 0, reason: 'Broken' });
  assert(res.status === 400, `expected 400, got ${res.status}`);
  assert(res.json?.error?.code === 'VALIDATION_ERROR', `code ${res.json?.error?.code}`);
  const bad = await call('POST', '/api/requests', '{not json');
  assert(bad.status === 400 && bad.json?.error?.code === 'INVALID_JSON', `malformed JSON gave ${bad.status}`);
  const after = await total();
  assert(after === before, `total changed from ${before} to ${after}`);
});

await check('GET /api/nope -> 404 JSON', async () => {
  const res = await call('GET', '/api/nope');
  assert(res.status === 404, `expected 404, got ${res.status}`);
  assert(res.contentType.includes('application/json'), `content type ${res.contentType}`);
  assert(res.json?.error?.code === 'ROUTE_NOT_FOUND', `code ${res.json?.error?.code}`);
});

await check('Bad id and bad list query -> 400 JSON', async () => {
  const id = await call('GET', '/api/requests/abc');
  assert(id.status === 400 && id.json?.error?.code === 'VALIDATION_ERROR', `id: ${id.status}`);
  const query = await call('GET', '/api/requests?sort=password');
  assert(query.status === 400 && query.json?.error?.code === 'VALIDATION_ERROR', `sort: ${query.status}`);
});

await check('Total unchanged after all checks (nothing was mutated)', async () => {
  const after = await total();
  assert(after === totalBefore, `total changed from ${totalBefore} to ${after}`);
});

await check('No response leaked HTML or a non-JSON content type', async () => {
  assert(leaks.length === 0, leaks.join('; '));
});

console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} smoke check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
