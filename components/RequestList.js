'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-client.js';
import { formatDateTime } from '@/lib/format.js';
import Alert from '@/components/Alert.js';
import Pagination from '@/components/Pagination.js';
import RequestFilters from '@/components/RequestFilters.js';
import StatusBadge from '@/components/StatusBadge.js';

// Query-string keys that make up the list's state. They are forwarded to the API unchanged.
const LIST_PARAMS = ['q', 'status', 'reason', 'sort', 'order', 'page', 'pageSize'];
const REMOVED_PATTERN = /^RD-\d{1,10}$/;

const BUTTON =
  'inline-flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600';
const PRIMARY_LINK =
  'inline-flex min-h-10 items-center rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2';
// The reference link is stretched over its whole row/card, so the entire row is one real link.
const ROW_LINK =
  'inline-flex min-h-10 items-center whitespace-nowrap rounded font-medium text-indigo-700 after:absolute after:inset-0 after:content-[""] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-indigo-600';

// Placeholder rows shown while the first page loads (also the Suspense fallback on the page).
export function RequestListSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-3">
      <span className="sr-only">Loading requests…</span>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} aria-hidden="true" className="h-16 animate-pulse rounded-lg border border-slate-200 bg-white" />
      ))}
    </div>
  );
}

// "Showing 21–40 of 36"-style summary for the current page of results.
function summarize(meta, count) {
  if (count === 0) return meta.total === 0 ? 'No results' : `No results on page ${meta.page}`;
  const start = (meta.page - 1) * meta.pageSize + 1;
  return `Showing ${start}–${start + count - 1} of ${meta.total}`;
}

// Client list screen. The URL query string is the only source of truth; this component reads it, fetches
// the matching page from the API, and writes the URL back (router.replace) when a control changes.
export default function RequestList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [retryCount, setRetryCount] = useState(0);
  const latestQuery = useRef(searchParams.toString());
  const [result, setResult] = useState({ key: null, items: [], meta: null, error: null });

  const params = Object.fromEntries(LIST_PARAMS.map((name) => [name, searchParams.get(name) ?? '']));
  const apiQuery = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '')).toString();
  const key = `${apiQuery}#${retryCount}`;
  const removed = searchParams.get('removed');
  const hasFilters = Boolean(params.q || params.status || params.reason);

  // Remembers the newest query string, so two quick changes (before the URL catches up) both survive.
  useEffect(() => {
    latestQuery.current = searchParams.toString();
  }, [searchParams]);

  // Writes changed params to the URL. Empty values are dropped, page resets to 1 unless it is being set,
  // and the one-off ?removed banner is cleared by any interaction.
  const updateParams = useCallback(
    (changes, { scroll = false } = {}) => {
      const next = new URLSearchParams(latestQuery.current);
      next.delete('removed');
      if (!('page' in changes)) next.delete('page');
      for (const [name, value] of Object.entries(changes)) {
        if (value) next.set(name, value);
        else next.delete(name);
      }
      const queryString = next.toString();
      latestQuery.current = queryString;
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll });
    },
    [router, pathname],
  );

  // Fetches the list whenever the URL params change. The abort in the cleanup means a slow, older response
  // can never overwrite a newer one.
  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`/api/requests${apiQuery ? `?${apiQuery}` : ''}`, { signal: controller.signal })
      .then(({ data, meta }) => setResult({ key: `${apiQuery}#${retryCount}`, items: data, meta, error: null }))
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        setResult({ key: `${apiQuery}#${retryCount}`, items: [], meta: null, error });
      });
    return () => controller.abort();
  }, [apiQuery, retryCount]);

  const loading = result.key !== key;
  const { items, meta, error } = result;

  // Removes q/status/reason (keeps sort and page size) so the list shows everything again.
  function clearFilters() {
    updateParams({ q: '', status: '', reason: '' });
  }

  // Drops every param, including a hand-edited invalid one, and returns to the default list.
  function resetAll() {
    router.replace(pathname, { scroll: false });
  }

  // Removes the ?removed banner param and nothing else.
  function dismissBanner() {
    const next = new URLSearchParams(latestQuery.current);
    next.delete('removed');
    const queryString = next.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  let body;
  if (error && !loading) {
    body = (
      <Alert
        tone="error"
        actions={
          <>
            <button type="button" className={BUTTON} onClick={() => setRetryCount((n) => n + 1)}>Retry</button>
            {error.status === 400 ? <button type="button" className={BUTTON} onClick={resetAll}>Reset filters</button> : null}
          </>
        }
      >
        <p>{error.message}</p>
        {Object.values(error.details?.fields ?? {}).map((text) => <p key={text} className="mt-1">{text}</p>)}
      </Alert>
    );
  } else if (!meta) {
    body = <RequestListSkeleton />;
  } else if (items.length === 0 && meta.total > 0) {
    body = (
      <EmptyState title="This page has no requests" text={`There are only ${meta.totalPages} page${meta.totalPages === 1 ? '' : 's'} of results.`}>
        <button type="button" className={BUTTON} onClick={() => updateParams({ page: '' }, { scroll: true })}>Go to the first page</button>
      </EmptyState>
    );
  } else if (items.length === 0 && hasFilters) {
    body = (
      <EmptyState title="No requests match these filters" text="Try a different search or remove a filter.">
        <button type="button" className={BUTTON} onClick={clearFilters}>Clear filters</button>
      </EmptyState>
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState title="No return requests yet" text="Requests you create will appear here.">
        <Link href="/requests/new" className={PRIMARY_LINK}>New request</Link>
      </EmptyState>
    );
  } else {
    body = (
      <>
        <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Reference</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Customer</th>
                <th scope="col" className="px-4 py-3 font-medium">Order / item</th>
                <th scope="col" className="px-4 py-3 font-medium">Reason</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Qty</th>
                <th scope="col" className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((r) => (
                <tr key={r.id} className="relative align-top hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/requests/${r.id}`} className={ROW_LINK}>{r.reference}</Link>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3">
                    <div className="break-words font-medium text-slate-900">{r.customerName}</div>
                    <div className="break-all text-xs text-slate-600">{r.customerEmail || r.customerPhone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-900">{r.orderNumber}</div>
                    <div className="break-words text-xs text-slate-600">{r.itemName} ({r.itemSku})</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.reason}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{r.quantity}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDateTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="space-y-3 md:hidden">
          {items.map((r) => (
            <li key={r.id} className="relative rounded-lg border border-slate-200 bg-white p-4 hover:bg-slate-50">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/requests/${r.id}`} className={ROW_LINK}>{r.reference}</Link>
                <StatusBadge status={r.status} />
              </div>
              <div className="mt-1 break-words font-medium text-slate-900">{r.customerName}</div>
              <div className="break-words text-sm text-slate-700">
                {r.orderNumber} · {r.itemName} ({r.itemSku}) × {r.quantity}
              </div>
              <div className="mt-1 text-sm text-slate-600">{r.reason} · {formatDateTime(r.createdAt)}</div>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const showResults = meta && !error;
  let summary = '';
  if (loading && meta) summary = 'Updating…';
  else if (showResults) summary = summarize(meta, items.length);

  return (
    <div className="space-y-4">
      {removed && REMOVED_PATTERN.test(removed) ? (
        <Alert
          tone="success"
          actions={<button type="button" className={BUTTON} onClick={dismissBanner}>Dismiss</button>}
        >
          {removed} was removed from the desk.
        </Alert>
      ) : null}
      <RequestFilters params={params} hasFilters={hasFilters} onChange={updateParams} onClear={clearFilters} />
      <p aria-live="polite" className="min-h-5 text-sm text-slate-600">{summary}</p>
      <div aria-busy={loading} className={loading && meta ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        {body}
      </div>
      {showResults && meta.totalPages > 0 ? (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          onPageChange={(page) => updateParams({ page: page === 1 ? '' : String(page) }, { scroll: true })}
        />
      ) : null}
    </div>
  );
}

// Centered message card used for every "nothing to show" case, with its call to action as children.
function EmptyState({ title, text, children }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{text}</p>
      <div className="mt-4 flex justify-center">{children}</div>
    </div>
  );
}
