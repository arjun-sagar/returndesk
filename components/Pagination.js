'use client';

const BUTTON =
  'inline-flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white';

// Prev / Next controls with "Page X of Y". Buttons are disabled at the ends; the parent owns the page number.
export default function Pagination({ page, totalPages, onPageChange }) {
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
      <button type="button" className={BUTTON} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Previous
      </button>
      <span className="text-sm text-slate-600">
        Page {page} of {totalPages}
      </span>
      <button type="button" className={BUTTON} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}
