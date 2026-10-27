'use client';

import { useId, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { FIELD_LIMITS } from '@/lib/constants';
import { validateNoteInput } from '@/lib/validation';
import { formatDateTime } from '@/lib/format';

const CONTROL_CLASS =
  'mt-1 block w-full rounded-md border bg-white px-3 py-2 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 sm:text-sm';

/**
 * Notes for one request: a chronological list plus an add form (shown while `canAddNote`). The text is kept
 * when the API call fails and cleared only after the server accepted the note. `onMutate` is the detail
 * page's mutation runner (shows the outcome, refetches).
 */
export default function NotesPanel({ requestId, notes, canAddNote, busy, onMutate }) {
  const uid = useId();
  const [author, setAuthor] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState({});

  // Validates with the shared validator, posts the note, and clears the text only on success.
  async function handleSubmit(event) {
    event.preventDefault();
    const { value, errors: validationErrors } = validateNoteInput({ author, body });
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    const result = await onMutate(
      () => apiFetch(`/api/requests/${requestId}/notes`, { method: 'POST', body: value }),
      'Note added.',
    );
    if (result.ok) setBody('');
    else if (result.error.details?.fields) setErrors(result.error.details.fields);
  }

  return (
    <section aria-labelledby={`${uid}-heading`} className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 id={`${uid}-heading`} className="text-base font-semibold text-slate-900">
        Notes <span className="font-normal text-slate-500">({notes.length})</span>
      </h2>

      {notes.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">No notes yet.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-md bg-slate-50 p-3">
              <p className="text-xs text-slate-500">
                <span className="font-medium text-slate-700">{note.author}</span> · {formatDateTime(note.createdAt)}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{note.body}</p>
            </li>
          ))}
        </ol>
      )}

      {canAddNote ? (
        <form onSubmit={handleSubmit} noValidate aria-busy={busy} className="mt-4 border-t border-slate-200 pt-4">
          <fieldset disabled={busy} className="min-w-0 space-y-3">
            <legend className="sr-only">New note</legend>
            <div>
              <label htmlFor={`${uid}-author`} className="block text-sm font-medium text-slate-800">
                Your name
              </label>
              <input
                id={`${uid}-author`}
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                maxLength={FIELD_LIMITS.author}
                autoComplete="off"
                aria-invalid={errors.author ? 'true' : undefined}
                aria-describedby={errors.author ? `${uid}-author-error` : undefined}
                className={`${CONTROL_CLASS} min-h-10 ${errors.author ? 'border-rose-400' : 'border-slate-300'}`}
              />
              {errors.author ? (
                <p id={`${uid}-author-error`} className="mt-1 text-sm text-rose-700">
                  {errors.author}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor={`${uid}-body`} className="block text-sm font-medium text-slate-800">
                Add a note
              </label>
              <textarea
                id={`${uid}-body`}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={FIELD_LIMITS.noteBody}
                rows={4}
                aria-invalid={errors.body ? 'true' : undefined}
                aria-describedby={`${uid}-body-hint${errors.body ? ` ${uid}-body-error` : ''}`}
                className={`${CONTROL_CLASS} ${errors.body ? 'border-rose-400' : 'border-slate-300'}`}
              />
              <p id={`${uid}-body-hint`} className="mt-1 text-xs text-slate-500">
                {body.length} / {FIELD_LIMITS.noteBody} characters
              </p>
              {errors.body ? (
                <p id={`${uid}-body-error`} className="mt-1 text-sm text-rose-700">
                  {errors.body}
                </p>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Add note'}
            </button>
          </fieldset>
        </form>
      ) : null}
    </section>
  );
}
