'use client';

import { useId, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { RESOLUTIONS } from '@/lib/constants';
import { validateTransitionInput } from '@/lib/validation';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, DANGER_BUTTON } from '@/components/ui.js';

// Inline form for approving: pick a resolution; the refund amount input only exists for "Refund".
function ApproveForm({ busy, onSubmit, onCancel }) {
  const uid = useId();
  const [resolution, setResolution] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [errors, setErrors] = useState({});

  // Validates with the shared validator, then hands the transition body to the caller. Amount rules (> 0,
  // required for Refund) are left to the server, whose message is shown in the banner.
  function handleSubmit(event) {
    event.preventDefault();
    const body = { status: 'Approved' };
    if (resolution) body.resolution = resolution;
    if (resolution === 'Refund' && refundAmount.trim() !== '') body.refundAmount = refundAmount.trim();

    const { errors: validationErrors } = validateTransitionInput(body);
    if (!resolution) validationErrors.resolution = 'Choose a resolution.';
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length === 0) onSubmit(body);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <fieldset aria-describedby={errors.resolution ? `${uid}-resolution-error` : undefined}>
        <legend className="text-sm font-medium text-slate-800">Resolution</legend>
        <div className="mt-1 space-y-1">
          {RESOLUTIONS.map((option) => (
            <label key={option} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-slate-800">
              <input
                type="radio"
                name={`${uid}-resolution`}
                value={option}
                checked={resolution === option}
                onChange={() => setResolution(option)}
                className="h-4 w-4 accent-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
              />
              {option}
            </label>
          ))}
        </div>
        {errors.resolution ? (
          <p id={`${uid}-resolution-error`} className="text-sm text-rose-700">
            {errors.resolution}
          </p>
        ) : null}
      </fieldset>

      {resolution === 'Refund' ? (
        <div>
          <label htmlFor={`${uid}-amount`} className="block text-sm font-medium text-slate-800">
            Refund amount (₹)
          </label>
          <input
            id={`${uid}-amount`}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={refundAmount}
            onChange={(event) => setRefundAmount(event.target.value)}
            aria-invalid={errors.refundAmount ? 'true' : undefined}
            aria-describedby={errors.refundAmount ? `${uid}-amount-error` : undefined}
            className={`mt-1 block min-h-10 w-full max-w-48 rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 sm:text-sm ${errors.refundAmount ? 'border-rose-400' : 'border-slate-300'}`}
          />
          {errors.refundAmount ? (
            <p id={`${uid}-amount-error`} className="mt-1 text-sm text-rose-700">
              {errors.refundAmount}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
          {busy ? 'Approving…' : 'Confirm approval'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={SECONDARY_BUTTON}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Status buttons for one request. `transitions` comes straight from the server's allowedActions, so only legal
 * next steps are ever rendered. `onMutate(call, successMessage)` runs the API call, shows the outcome and
 * refetches the request (see RequestDetail).
 */
export default function StatusActions({ requestId, transitions, busy, onMutate }) {
  const [openPanel, setOpenPanel] = useState(null);

  // Sends the status change. The panel closes on success or when the request moved on (404/409); on a
  // validation or approval-rule error (400/422) it stays open so the input is kept.
  async function changeStatus(body, successMessage) {
    const result = await onMutate(
      () => apiFetch(`/api/requests/${requestId}/transitions`, { method: 'POST', body }),
      successMessage,
    );
    if (result.ok || result.error.status === 404 || result.error.status === 409) setOpenPanel(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {transitions.includes('In Review') ? (
          <button type="button" disabled={busy} onClick={() => changeStatus({ status: 'In Review' }, 'Moved to In Review.')} className={PRIMARY_BUTTON}>
            Start review
          </button>
        ) : null}
        {transitions.includes('Approved') ? (
          <button type="button" disabled={busy} aria-expanded={openPanel === 'approve'} onClick={() => setOpenPanel(openPanel === 'approve' ? null : 'approve')} className={PRIMARY_BUTTON}>
            Approve…
          </button>
        ) : null}
        {transitions.includes('Rejected') ? (
          <button type="button" disabled={busy} aria-expanded={openPanel === 'reject'} onClick={() => setOpenPanel(openPanel === 'reject' ? null : 'reject')} className={SECONDARY_BUTTON}>
            Reject
          </button>
        ) : null}
        {transitions.includes('Completed') ? (
          <button type="button" disabled={busy} onClick={() => changeStatus({ status: 'Completed' }, 'Marked as completed.')} className={PRIMARY_BUTTON}>
            Mark completed
          </button>
        ) : null}
      </div>

      {openPanel === 'approve' && transitions.includes('Approved') ? (
        <ApproveForm
          busy={busy}
          onSubmit={(body) => changeStatus(body, `Approved with resolution: ${body.resolution}.`)}
          onCancel={() => setOpenPanel(null)}
        />
      ) : null}

      {openPanel === 'reject' && transitions.includes('Rejected') ? (
        <div className="space-y-3 rounded-md border border-rose-200 bg-rose-50 p-3">
          <p className="text-sm text-rose-900">Reject this request? A rejected request cannot be reopened.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => changeStatus({ status: 'Rejected' }, 'Request rejected.')} className={DANGER_BUTTON}>
              {busy ? 'Rejecting…' : 'Yes, reject'}
            </button>
            <button type="button" disabled={busy} onClick={() => setOpenPanel(null)} className={SECONDARY_BUTTON}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
