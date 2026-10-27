// H1-H8: server-side list, search, filter, sort and paging.
import { beforeAll, describe, expect, it } from 'vitest';
import { STATUSES, api, createRequest, expectError, expectOk, moveTo, randomLetters, runId } from './helpers.js';

const TAG = `${runId()}-HS`;
const lifecycleIndex = (status) => STATUSES.indexOf(status);

// Seven requests of ours: names chosen so lowercase sorting differs from case-sensitive sorting.
const DATASET = [
  { name: 'alice', status: 'Open', reason: 'Damaged' },
  { name: 'Bob', status: 'Open', reason: 'Wrong Item' },
  { name: 'carol', status: 'In Review', reason: 'Damaged' },
  { name: 'Dave', status: 'Approved', reason: 'Size Issue' },
  { name: 'eve', status: 'Rejected', reason: 'Damaged' },
  { name: 'Frank', status: 'Completed', reason: 'Not As Described' },
  { name: 'grace', status: 'In Review', reason: 'Changed Mind' },
];
const created = [];

async function list(query) {
  const res = await api('GET', `/api/requests?${query}`);
  expect(res.status, res.text.slice(0, 200)).toBe(200);
  expect(res.headers.get('content-type') || '').toContain('application/json');
  expect(Array.isArray(res.json.data)).toBe(true);
  expect(res.json.meta).toBeTypeOf('object');
  return res.json;
}

beforeAll(async () => {
  for (const [i, row] of DATASET.entries()) {
    const req = await createRequest({
      customerName: row.name,
      customerEmail: `${row.name.toLowerCase()}.${TAG.toLowerCase()}@example.com`,
      orderNumber: `${TAG}-${i + 1}`,
      itemSku: `HS-${i + 1}`,
      reason: row.reason,
    });
    if (row.status !== 'Open') await moveTo(req.id, 'In Review');
    if (row.status === 'Rejected') await moveTo(req.id, 'Rejected');
    if (row.status === 'Approved' || row.status === 'Completed') {
      await moveTo(req.id, 'Approved', { resolution: 'Store Credit' });
    }
    if (row.status === 'Completed') await moveTo(req.id, 'Completed');
    created.push(req);
  }
});

describe('Listing (H)', () => {
  it('H1: defaults -> page 1, pageSize 20, correct total/totalPages, createdAt desc', async () => {
    const { data, meta } = await list('');
    expect(meta.page).toBe(1);
    expect(meta.pageSize).toBe(20);
    expect(meta.total).toBeGreaterThanOrEqual(DATASET.length);
    expect(meta.totalPages).toBe(Math.ceil(meta.total / 20));
    expect(data).toHaveLength(Math.min(20, meta.total));
    expect(meta.sort).toBe('createdAt');
    expect(meta.order).toBe('desc');
    const times = data.map((r) => new Date(r.createdAt).getTime());
    for (let i = 1; i < times.length; i += 1) expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
    // Newest first: the most recently created request of this run is on the first page.
    expect(data.map((r) => r.id)).toContain(created.at(-1).id);
    expect(data[0]).toHaveProperty('reference');
    expect(data[0]).toHaveProperty('status');
  });

  it('H2: search by exact reference, partial order number, case-insensitive customer name, email', async () => {
    const target = created[3];
    const byRef = await list(`q=${encodeURIComponent(target.reference)}`);
    expect(byRef.meta.total).toBe(1);
    expect(byRef.data[0].id).toBe(target.id);

    const byOrder = await list(`q=${encodeURIComponent(`${TAG}-`)}`);
    expect(byOrder.meta.total).toBe(DATASET.length);
    const partial = await list(`q=${encodeURIComponent(target.orderNumber.slice(2, -1))}`);
    expect(partial.data.map((r) => r.id)).toContain(target.id);

    const name = `Qz${randomLetters(10)}`;
    const named = await createRequest({ customerName: name });
    for (const q of [name.toLowerCase(), name.toUpperCase(), name]) {
      const byName = await list(`q=${encodeURIComponent(q)}`);
      expect(byName.meta.total).toBe(1);
      expect(byName.data[0].id).toBe(named.id);
    }

    const email = created[0].customerEmail;
    const byEmail = await list(`q=${encodeURIComponent(email.toUpperCase())}`);
    expect(byEmail.meta.total).toBe(1);
    expect(byEmail.data[0].id).toBe(created[0].id);
  });

  it('H3: status filter, reason filter, and q + status + reason + sort + page together', async () => {
    const q = encodeURIComponent(`${TAG}-`);
    const open = await list(`q=${q}&status=Open`);
    expect(open.meta.total).toBe(2);
    expect(open.data.every((r) => r.status === 'Open')).toBe(true);

    const damaged = await list(`q=${q}&reason=Damaged`);
    expect(damaged.meta.total).toBe(3);
    expect(damaged.data.every((r) => r.reason === 'Damaged')).toBe(true);

    const combined = await list(`q=${q}&status=Open&reason=Damaged&sort=customerName&order=asc&page=1&pageSize=10`);
    expect(combined.meta.total).toBe(1);
    expect(combined.data[0].customerName).toBe('alice');
    expect(combined.meta).toMatchObject({ page: 1, pageSize: 10, sort: 'customerName', order: 'asc', status: 'Open', reason: 'Damaged' });

    const none = await list(`q=${q}&status=Completed&reason=Damaged`);
    expect(none.meta.total).toBe(0);
    expect(none.data).toEqual([]);

    // Filters narrow within a page too: page 2 of in-review requests (size 1) is the second in-review row.
    const reviewPage2 = await list(`q=${q}&status=${encodeURIComponent('In Review')}&sort=customerName&order=asc&page=2&pageSize=1`);
    expect(reviewPage2.meta.total).toBe(2);
    expect(reviewPage2.meta.totalPages).toBe(2);
    expect(reviewPage2.data.map((r) => r.customerName)).toEqual(['grace']);
  });

  it('H4: sort customerName asc/desc; status uses lifecycle order', async () => {
    const q = encodeURIComponent(`${TAG}-`);
    const asc = await list(`q=${q}&sort=customerName&order=asc`);
    expect(asc.data.map((r) => r.customerName)).toEqual(['alice', 'Bob', 'carol', 'Dave', 'eve', 'Frank', 'grace']);
    const desc = await list(`q=${q}&sort=customerName&order=desc`);
    expect(desc.data.map((r) => r.customerName)).toEqual(['grace', 'Frank', 'eve', 'Dave', 'carol', 'Bob', 'alice']);

    const byStatus = await list(`q=${q}&sort=status&order=asc`);
    const ranks = byStatus.data.map((r) => lifecycleIndex(r.status));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(byStatus.data[0].status).toBe('Open');
    expect(byStatus.data.at(-1).status).toBe('Completed');
    const byStatusDesc = await list(`q=${q}&sort=status&order=desc`);
    const ranksDesc = byStatusDesc.data.map((r) => lifecycleIndex(r.status));
    expect(ranksDesc).toEqual([...ranksDesc].sort((a, b) => b - a));
    expect(byStatusDesc.data[0].status).toBe('Completed');

    const updated = await list(`q=${q}&sort=updatedAt&order=desc`);
    const times = updated.data.map((r) => new Date(r.updatedAt).getTime());
    for (let i = 1; i < times.length; i += 1) expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
  });

  it('H5: pageSize 5 -> page 1 and page 2 are disjoint and the total is consistent', async () => {
    const q = encodeURIComponent(`${TAG}-`);
    const page1 = await list(`q=${q}&pageSize=5&page=1`);
    const page2 = await list(`q=${q}&pageSize=5&page=2`);
    expect(page1.data).toHaveLength(5);
    expect(page2.data).toHaveLength(2);
    expect(page1.meta.total).toBe(7);
    expect(page2.meta.total).toBe(7);
    expect(page1.meta.totalPages).toBe(2);
    const ids1 = page1.data.map((r) => r.id);
    const ids2 = page2.data.map((r) => r.id);
    expect(ids1.filter((id) => ids2.includes(id))).toEqual([]);
    expect(new Set([...ids1, ...ids2]).size).toBe(7);
  });

  it('H6: invalid sort / order / page / pageSize / status / reason -> 400', async () => {
    const bad = [
      'sort=password',
      'order=sideways',
      'page=0',
      'page=abc',
      'page=-1',
      'page=1.5',
      'pageSize=1000',
      'pageSize=0',
      'pageSize=abc',
      'status=Closed',
      'reason=Foo',
      `q=${'x'.repeat(101)}`,
    ];
    for (const query of bad) {
      const res = await api('GET', `/api/requests?${query}`);
      const error = expectError(res, 400, 'VALIDATION_ERROR');
      expect(error.details?.fields, query).toBeTypeOf('object');
    }
  });

  it('H7: SQL-injection sort -> 400; q=%, q=_, q=\' -> 200 with literal matching, no 500', async () => {
    expectError(await api('GET', `/api/requests?sort=${encodeURIComponent('createdAt;DROP TABLE x')}`), 400, 'VALIDATION_ERROR');
    expectError(await api('GET', `/api/requests?order=${encodeURIComponent('asc; DROP TABLE x')}`), 400, 'VALIDATION_ERROR');

    // LIKE wildcards in q are literal: only names that really contain the characters match.
    const token = randomLetters(10);
    const percent = await createRequest({ customerName: `${token}50%off` });
    await createRequest({ customerName: `${token}50Xoff` });
    const underscore = await createRequest({ customerName: `${token}a_b` });
    await createRequest({ customerName: `${token}aXb` });

    const percentSearch = await list(`q=${encodeURIComponent(`${token}50%off`)}`);
    expect(percentSearch.data.map((r) => r.id)).toEqual([percent.id]);
    const underscoreSearch = await list(`q=${encodeURIComponent(`${token}a_b`)}`);
    expect(underscoreSearch.data.map((r) => r.id)).toEqual([underscore.id]);

    const all = await list('pageSize=1');
    for (const q of ['%', '_', "'", '\\', '"; --']) {
      const res = await list(`q=${encodeURIComponent(q)}&pageSize=100`);
      expect(res.meta.total, `q=${q}`).toBeLessThan(all.meta.total);
      for (const row of res.data) {
        const haystack = [row.reference, row.customerName, row.customerEmail, row.customerPhone, row.orderNumber]
          .filter(Boolean)
          .join('\n')
          .toLowerCase();
        expect(haystack, `q=${q}`).toContain(q.toLowerCase());
      }
    }
    const lone = await list(`q=${encodeURIComponent('%')}&pageSize=100`);
    expect(lone.data.map((r) => r.id)).toContain(percent.id);
    const loneUnderscore = await list(`q=${encodeURIComponent('_')}&pageSize=100`);
    expect(loneUnderscore.data.map((r) => r.id)).toContain(underscore.id);
  });

  it('H8: page past the end -> 200, empty data, correct total', async () => {
    const q = encodeURIComponent(`${TAG}-`);
    const res = await list(`q=${q}&page=999&pageSize=5`);
    expect(res.data).toEqual([]);
    expect(res.meta.total).toBe(7);
    expect(res.meta.totalPages).toBe(2);
    expect(res.meta.page).toBe(999);
    const defaults = await list('page=999999');
    expect(defaults.data).toEqual([]);
    expect(defaults.meta.total).toBeGreaterThanOrEqual(7);
  });
});

describe('Listing items match the detail view', () => {
  it('H2b: a listed item has the same fields as its detail', async () => {
    const target = created[1];
    const { data } = await list(`q=${encodeURIComponent(target.reference)}`);
    const detail = expectOk(await api('GET', `/api/requests/${target.id}`));
    for (const key of ['id', 'reference', 'customerName', 'orderNumber', 'itemSku', 'status', 'reason', 'quantity']) {
      expect(data[0][key]).toEqual(detail[key]);
    }
  });
});
