'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { FIELD_LIMITS, QUANTITY_MAX, QUANTITY_MIN, REASONS } from '@/lib/constants';
import { validateCreateRequest } from '@/lib/validation';
import Alert from '@/components/Alert';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/ui.js';

// Fields in on-screen order; used to focus the first invalid field.
const FIELD_ORDER = ['customerName', 'customerEmail', 'customerPhone', 'contact', 'orderNumber', 'itemSku', 'itemName', 'quantity', 'reason'];

const CONTROL_CLASS =
  'mt-1 block min-h-10 w-full rounded-md border bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 sm:text-sm';

// Converts a stored request (or nothing) into the string values the inputs hold.
function toFormValues(request) {
  return {
    customerName: request?.customerName ?? '',
    customerEmail: request?.customerEmail ?? '',
    customerPhone: request?.customerPhone ?? '',
    orderNumber: request?.orderNumber ?? '',
    itemSku: request?.itemSku ?? '',
    itemName: request?.itemName ?? '',
    quantity: request ? String(request.quantity) : '1',
    reason: request?.reason ?? '',
  };
}

// Builds the JSON body from the input strings. Quantity must be a JSON integer, so digit-only text becomes a
// number; anything else is passed through as text so the shared validator can reject it with its own message.
function toRequestBody(values) {
  const quantity = values.quantity.trim();
  return { ...values, quantity: /^\d+$/.test(quantity) ? Number(quantity) : quantity };
}

// One labelled control (input or select) with an optional hint and an inline error wired up for screen readers.
function Field({ id, label, hint, error, as: Tag = 'input', className = '', children, ...controlProps }) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <Tag
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        className={`${CONTROL_CLASS} ${error ? 'border-rose-400' : 'border-slate-300'}`}
        {...controlProps}
      >
        {children}
      </Tag>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Create / edit form for a return request.
 * - mode "create": posts a new request itself, then navigates to its detail page.
 * - mode "edit": needs `request`, `busy`, `onMutate` (the detail page's mutation runner, which refetches
 *   afterwards), `onDone` (called after a successful save) and `onCancel`. Only changed fields are PATCHed.
 */
export default function RequestForm({ mode, request, busy = false, onMutate, onDone, onCancel }) {
  const router = useRouter();
  const uid = useId();
  const isEdit = mode === 'edit';
  const [values, setValues] = useState(() => toFormValues(request));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [duplicate, setDuplicate] = useState(null);
  const [createPending, setCreatePending] = useState(false);
  const pending = isEdit ? busy : createPending;

  const idOf = (name) => `${uid}-${name}`;

  // Returns the props shared by every text-like control: controlled value and change handler.
  function bind(name) {
    return {
      id: idOf(name),
      value: values[name],
      error: errors[name],
      onChange: (event) => setValues((current) => ({ ...current, [name]: event.target.value })),
    };
  }

  // Shows field errors and moves keyboard focus to the first field that has one.
  function showFieldErrors(fieldErrors) {
    setErrors(fieldErrors);
    const first = FIELD_ORDER.find((name) => fieldErrors[name]);
    if (first) document.getElementById(idOf(first === 'contact' ? 'customerEmail' : first))?.focus();
  }

  // Turns a failed API call into inline field errors, a form-level message and, for duplicates, a link.
  function showServerError(err, orderNumber) {
    setFormError(err.message);
    if (err.details?.fields) showFieldErrors(err.details.fields);
    if (err.code === 'DUPLICATE_LIVE_REQUEST') {
      setDuplicate({ search: err.details?.existingReference ?? orderNumber });
    }
  }

  // Creates the request, or PATCHes only the fields that differ from the loaded request when editing.
  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);
    setDuplicate(null);

    const { value, errors: validationErrors } = validateCreateRequest(toRequestBody(values));
    if (Object.keys(validationErrors).length > 0) {
      showFieldErrors(validationErrors);
      return;
    }
    setErrors({});

    if (!isEdit) {
      setCreatePending(true);
      try {
        const { data } = await apiFetch('/api/requests', { method: 'POST', body: value });
        router.push(`/requests/${data.id}?created=1`);
      } catch (err) {
        showServerError(err, value.orderNumber);
        setCreatePending(false);
      }
      return;
    }

    const changes = Object.fromEntries(Object.entries(value).filter(([key, next]) => next !== request[key]));
    if (Object.keys(changes).length === 0) {
      setFormError('No changes to save.');
      return;
    }
    const result = await onMutate(
      () => apiFetch(`/api/requests/${request.id}`, { method: 'PATCH', body: changes }),
      'Details updated.',
    );
    if (result.ok) onDone();
    else showServerError(result.error, value.orderNumber);
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={pending} className="space-y-4">
      {formError ? (
        <Alert
          tone="error"
          actions={
            duplicate ? (
              <Link
                href={`/requests?q=${encodeURIComponent(duplicate.search)}`}
                className="rounded font-medium underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
              >
                View the existing request
              </Link>
            ) : null
          }
        >
          {formError}
        </Alert>
      ) : null}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Customer</legend>
        <Field {...bind('customerName')} label="Customer name" maxLength={FIELD_LIMITS.customerName} autoComplete="off" className="sm:col-span-2" />
        <Field {...bind('customerEmail')} label="Email" type="email" maxLength={FIELD_LIMITS.email} autoComplete="off" />
        <Field {...bind('customerPhone')} label="Phone" type="tel" maxLength={FIELD_LIMITS.phone} autoComplete="off" />
        <div className="sm:col-span-2">
          <p id={idOf('contact')} className={errors.contact ? 'text-sm text-rose-700' : 'text-xs text-slate-500'}>
            {errors.contact ?? 'An email or a phone number is required.'}
          </p>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Order and item</legend>
        <Field {...bind('orderNumber')} label="Order number" maxLength={FIELD_LIMITS.code} autoCapitalize="characters" autoComplete="off" />
        <Field {...bind('itemSku')} label="Item SKU" maxLength={FIELD_LIMITS.code} autoCapitalize="characters" autoComplete="off" />
        <Field {...bind('itemName')} label="Item name" maxLength={FIELD_LIMITS.itemName} autoComplete="off" className="sm:col-span-2" />
        <Field
          {...bind('quantity')}
          label="Quantity"
          type="number"
          inputMode="numeric"
          min={QUANTITY_MIN}
          max={QUANTITY_MAX}
          step={1}
        />
        <Field {...bind('reason')} as="select" label="Reason for return">
          <option value="">Select a reason</option>
          {REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {reason}
            </option>
          ))}
        </Field>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {isEdit ? (pending ? 'Saving…' : 'Save changes') : pending ? 'Creating…' : 'Create request'}
        </button>
        {isEdit ? (
          <button type="button" onClick={onCancel} disabled={pending} className={SECONDARY_BUTTON}>
            Cancel
          </button>
        ) : (
          <Link href="/requests" className={SECONDARY_BUTTON}>
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
