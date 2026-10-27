'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { SECONDARY_BUTTON } from '@/components/ui.js';


/**
 * "Remove from desk" with a two-step inline confirm (no window.confirm). On success it navigates to the list with
 * a banner; on failure (e.g. the request moved on, 409) the shared mutation runner shows the message and refetches.
 */
export default function RemoveRequestButton({ requestId, reference, busy, onMutate }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  // Soft-deletes the request. After success there is nothing left to refetch, so the page navigates away.
  async function handleRemove() {
    const result = await onMutate(
      () => apiFetch(`/api/requests/${requestId}`, { method: 'DELETE' }),
      `${reference} was removed from the desk.`,
      { refetchOnSuccess: false },
    );
    if (result.ok) router.push(`/requests?removed=${encodeURIComponent(result.data?.reference ?? reference)}`);
    else setConfirming(false);
  }

  if (!confirming) {
    return (
      <button type="button" disabled={busy} onClick={() => setConfirming(true)} className={SECONDARY_BUTTON}>
        Remove from desk
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-rose-200 bg-rose-50 p-3">
      <p className="text-sm text-rose-900">Remove {reference} from the desk? It will disappear from the list and can no longer be opened.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={handleRemove}
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-rose-600 px-4 text-sm font-medium text-white hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Removing…' : 'Yes, remove'}
        </button>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)} className={SECONDARY_BUTTON}>
          Cancel
        </button>
      </div>
    </div>
  );
}
