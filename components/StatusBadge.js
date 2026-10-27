// The single place status colours are defined. Always shows a text label, never colour alone.
const STYLES = {
  'Open': { badge: 'bg-sky-50 text-sky-800 ring-sky-200', dot: 'bg-sky-500' },
  'In Review': { badge: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
  'Approved': { badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' },
  'Rejected': { badge: 'bg-rose-50 text-rose-800 ring-rose-200', dot: 'bg-rose-500' },
  'Completed': { badge: 'bg-slate-100 text-slate-700 ring-slate-300', dot: 'bg-slate-500' },
};

export default function StatusBadge({ status }) {
  const s = STYLES[status] ?? STYLES.Completed;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s.badge}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}
