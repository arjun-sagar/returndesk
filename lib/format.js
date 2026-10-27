// Display formatting for the UI. Call only after data has loaded in a client component (avoids hydration mismatch).

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

// Formats a numeric string like "1499.00" as ₹1,499.00.
export function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '—';
  return money.format(Number(value));
}

// Formats an ISO timestamp for display, e.g. "26 Oct 2026, 11:05 pm".
export function formatDateTime(iso) {
  if (!iso) return '—';
  return dateTime.format(new Date(iso));
}
