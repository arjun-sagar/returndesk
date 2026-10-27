'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { formatDateTime, formatMoney } from '@/lib/format';
import Alert from '@/components/Alert';
import StatusBadge from '@/components/StatusBadge';
import StatusActions from '@/components/StatusActions';
import NotesPanel from '@/components/NotesPanel';
import RemoveRequestButton from '@/components/RemoveRequestButton';
import RequestForm from '@/components/RequestForm';
import { SECONDARY_BUTTON } from '@/components/ui.js';

const LINK_CLASS =
  'rounded font-medium text-indigo-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600';

// Placeholder shown while the request loads (also the Suspense fallback of the page).
export function RequestDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading request" className="animate-pulse space-y-4">
      <div className="h-9 w-64 max-w-full rounded bg-slate-200" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="h-72 rounded-lg bg-slate-200" />
        <div className="h-72 rounded-lg bg-slate-200" />
      </div>
    </div>
  );
}

// A titled card holding a list of label/value pairs.
function DetailSection({ title, rows }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <dl className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="mt-0.5 break-words text-sm text-slate-900">{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// Text for the Resolution section: the chosen resolution and its refund amount, if any.
function resolutionRows(request) {
  return [
    ['Resolution', request.resolution],
    ['Refund amount', request.refundAmount === null ? 'No refund amount' : formatMoney(request.refundAmount)],
  ];
}

/**
 * Detail screen for one request (id read from the URL). The server's `allowedActions` decide which buttons exist;
 * every mutation goes through runMutation, which shows the server's message and then refetches the request.
 */
export default function RequestDetail() {
  const { id } = useParams();
  const justCreated = useSearchParams().get('created') === '1';
  const [request, setRequest] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Fetches the request and reports what the server said: { request }, { notFound } or { error }. Returns null
  // when the fetch was aborted (the component moved on), so stale responses are never applied.
  const fetchRequest = useCallback(
    async (signal) => {
      try {
        const { data } = await apiFetch(`/api/requests/${id}`, { signal });
        return { request: data };
      } catch (err) {
        if (err.name === 'AbortError') return null;
        return err.status === 404 ? { notFound: true } : { error: err.message };
      }
    },
    [id],
  );

  // Stores a fetch outcome in state so the screen shows the server's truth.
  const applyResult = useCallback((result) => {
    if (!result) return;
    if (result.request) {
      setRequest(result.request);
      setNotFound(false);
      setLoadError(null);
    } else if (result.notFound) {
      setRequest(null);
      setNotFound(true);
    } else {
      setLoadError(result.error);
    }
  }, []);

  // Fetches and applies the request; used for every refetch after a mutation and for Retry.
  const load = useCallback(async () => applyResult(await fetchRequest()), [fetchRequest, applyResult]);

  useEffect(() => {
    const controller = new AbortController();
    fetchRequest(controller.signal).then(applyResult);
    return () => controller.abort();
  }, [fetchRequest, applyResult]);

  // Retry button for a failed load: clears the error (back to the skeleton) and fetches again.
  function retry() {
    setLoadError(null);
    load();
  }

  /**
   * Runs one mutation for all child components: disables every action while it is in flight, shows the server's
   * message (success or error), then refetches so the screen matches the server. Resolves to { ok, data, error }.
   * Pass { refetchOnSuccess: false } when the caller navigates away on success.
   */
  async function runMutation(call, successMessage, { refetchOnSuccess = true } = {}) {
    setBusy(true);
    setNotice(null);
    let outcome;
    try {
      const { data } = await call();
      setNotice({ tone: 'success', message: successMessage });
      outcome = { ok: true, data };
    } catch (err) {
      setNotice({ tone: 'error', message: err.message });
      outcome = { ok: false, error: err };
    }
    if (!outcome.ok || refetchOnSuccess) {
      await load();
      setBusy(false);
    }
    return outcome;
  }

  if (notFound) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Request not found</h1>
        <p className="mt-2 text-slate-600">This request doesn&apos;t exist or has been removed from the desk.</p>
        <Link href="/requests" className={`${LINK_CLASS} mt-4 inline-block`}>
          Back to the desk
        </Link>
      </div>
    );
  }

  if (loadError && !request) {
    return (
      <Alert
        tone="error"
        actions={
          <button type="button" onClick={retry} className={SECONDARY_BUTTON}>
            Retry
          </button>
        }
      >
        {loadError}
      </Alert>
    );
  }

  if (!request) return <RequestDetailSkeleton />;

  const { allowedActions: allowed } = request;
  const hasActions = allowed.transitions.length > 0 || allowed.canEdit || allowed.canRemove;

  return (
    <div className="space-y-4">
      <Link href="/requests" className={`${LINK_CLASS} inline-flex min-h-10 items-center text-sm`}>
        ← All requests
      </Link>

      {justCreated ? <Alert tone="success">Request created. It starts as Open.</Alert> : null}
      {notice ? (
        <div className="sticky top-2 z-10 shadow-sm">
          <Alert tone={notice.tone}>{notice.message}</Alert>
        </div>
      ) : null}
      {loadError ? (
        <Alert
          tone="error"
          actions={
            <button type="button" onClick={() => load()} className={SECONDARY_BUTTON}>
              Retry
            </button>
          }
        >
          Could not refresh this request: {loadError}
        </Alert>
      ) : null}

      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">{request.reference}</h1>
        <StatusBadge status={request.status} />
        <p className="w-full text-sm text-slate-600">
          Created {formatDateTime(request.createdAt)} · Updated {formatDateTime(request.updatedAt)}
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          {editing && allowed.canEdit ? (
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-base font-semibold text-slate-900">Edit details</h2>
              <RequestForm
                mode="edit"
                request={request}
                busy={busy}
                onMutate={runMutation}
                onDone={() => setEditing(false)}
                onCancel={() => setEditing(false)}
              />
            </section>
          ) : (
            <>
              <DetailSection
                title="Customer"
                rows={[
                  ['Name', request.customerName],
                  ['Email', request.customerEmail],
                  ['Phone', request.customerPhone],
                ]}
              />
              <DetailSection
                title="Item"
                rows={[
                  ['Order number', request.orderNumber],
                  ['SKU', request.itemSku],
                  ['Item name', request.itemName],
                  ['Quantity', String(request.quantity)],
                  ['Reason', request.reason],
                ]}
              />
              {request.resolution ? <DetailSection title="Resolution" rows={resolutionRows(request)} /> : null}
            </>
          )}
        </div>

        <div className="space-y-4">
          <section aria-labelledby="actions-heading" className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 id="actions-heading" className="text-base font-semibold text-slate-900">
              Actions
            </h2>
            <div className="mt-3 space-y-3">
              {hasActions ? null : (
                <p className="text-sm text-slate-600">No further actions are available for a {request.status} request.</p>
              )}
              <StatusActions requestId={request.id} transitions={allowed.transitions} busy={busy} onMutate={runMutation} />
              {allowed.canEdit && !editing ? (
                <button type="button" disabled={busy} onClick={() => setEditing(true)} className={SECONDARY_BUTTON}>
                  Edit details
                </button>
              ) : null}
              {allowed.canRemove ? (
                <RemoveRequestButton requestId={request.id} reference={request.reference} busy={busy} onMutate={runMutation} />
              ) : null}
            </div>
          </section>

          <NotesPanel
            requestId={request.id}
            notes={request.notes}
            canAddNote={allowed.canAddNote}
            busy={busy}
            onMutate={runMutation}
          />
        </div>
      </div>
    </div>
  );
}
