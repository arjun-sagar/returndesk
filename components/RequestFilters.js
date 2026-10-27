'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_ORDER, DEFAULT_PAGE_SIZE, DEFAULT_SORT, FIELD_LIMITS, PAGE_SIZE_OPTIONS, REASONS, STATUSES } from '@/lib/constants.js';

const SEARCH_DEBOUNCE_MS = 350;

// Sort presets shown in the select. The value is "sort:order", the pair the API expects.
const SORT_PRESETS = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'customerName:asc', label: 'Customer A–Z' },
  { value: 'customerName:desc', label: 'Customer Z–A' },
  { value: 'status:asc', label: 'Status' },
];
const DEFAULT_PRESET = `${DEFAULT_SORT}:${DEFAULT_ORDER}`;

const FIELD = 'block w-full min-h-10 rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 sm:text-sm';
const LABEL = 'mb-1 block text-xs font-medium text-slate-600';

// Search, status, reason, sort and page-size controls. The URL values arrive in `params`; every change goes
// to `onChange`, which writes the URL (and resets paging). Only the debounced search text is ever sent up.
export default function RequestFilters({ params, hasFilters, onChange, onClear }) {
  const urlQ = params.q;
  const [text, setText] = useState(urlQ);
  const [appliedQ, setAppliedQ] = useState(urlQ);
  const [syncedUrlQ, setSyncedUrlQ] = useState(urlQ);

  // Applies the search text to the URL right away (used by Enter and by the debounce timer).
  function applySearch(value) {
    const trimmed = value.trim();
    if (trimmed === appliedQ) return;
    setAppliedQ(trimmed);
    onChange({ q: trimmed });
  }

  // When the URL's q changes for a reason other than our own apply (Back button, Clear filters), show it in the box.
  if (urlQ !== syncedUrlQ) {
    setSyncedUrlQ(urlQ);
    if (urlQ !== appliedQ) {
      setText(urlQ);
      setAppliedQ(urlQ);
    }
  }

  // Debounce: wait 350 ms after the last keystroke before the search reaches the URL and the API.
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === appliedQ) return undefined;
    const timer = setTimeout(() => {
      setAppliedQ(trimmed);
      onChange({ q: trimmed });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, appliedQ, onChange]);

  // Enter submits the form and applies the search without waiting for the debounce.
  function handleSubmit(event) {
    event.preventDefault();
    applySearch(text);
  }

  // "sort:order" preset -> two URL params; the default preset leaves the URL clean.
  function handleSort(event) {
    const value = event.target.value;
    if (value === DEFAULT_PRESET) onChange({ sort: '', order: '' });
    else {
      const [sort, order] = value.split(':');
      onChange({ sort, order });
    }
  }

  // Page size 20 is the default, so it is omitted from the URL.
  function handlePageSize(event) {
    const value = event.target.value;
    onChange({ pageSize: value === String(DEFAULT_PAGE_SIZE) ? '' : value });
  }

  return (
    <form role="search" aria-label="Filter return requests" onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
      <div className="sm:col-span-2 lg:col-span-4">
        <label htmlFor="filter-q" className={LABEL}>Search</label>
        <input
          id="filter-q"
          type="search"
          value={text}
          maxLength={FIELD_LIMITS.search}
          placeholder="Reference, customer, email, phone, order"
          autoComplete="off"
          onChange={(event) => setText(event.target.value)}
          className={FIELD}
        />
      </div>
      <div className="lg:col-span-2">
        <label htmlFor="filter-status" className={LABEL}>Status</label>
        <select id="filter-status" value={params.status} onChange={(event) => onChange({ status: event.target.value })} className={FIELD}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="lg:col-span-2">
        <label htmlFor="filter-reason" className={LABEL}>Reason</label>
        <select id="filter-reason" value={params.reason} onChange={(event) => onChange({ reason: event.target.value })} className={FIELD}>
          <option value="">All reasons</option>
          {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="lg:col-span-2">
        <label htmlFor="filter-sort" className={LABEL}>Sort by</label>
        <select id="filter-sort" value={`${params.sort || DEFAULT_SORT}:${params.order || DEFAULT_ORDER}`} onChange={handleSort} className={FIELD}>
          {SORT_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>
      <div className="lg:col-span-2">
        <label htmlFor="filter-page-size" className={LABEL}>Per page</label>
        <select id="filter-page-size" value={params.pageSize || String(DEFAULT_PAGE_SIZE)} onChange={handlePageSize} className={FIELD}>
          {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={String(n)}>{n}</option>)}
        </select>
      </div>
      {hasFilters ? (
        <div className="sm:col-span-2 lg:col-span-12">
          <button
            type="button"
            onClick={onClear}
            className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-indigo-700 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
          >
            Clear filters
          </button>
        </div>
      ) : null}
    </form>
  );
}
