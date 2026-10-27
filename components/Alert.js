// Banner for errors, successes and info. Errors use role="alert"; others role="status".
const TONES = {
  error: 'border-rose-200 bg-rose-50 text-rose-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
};

export default function Alert({ tone = 'info', children, actions }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-4 py-3 text-sm ${TONES[tone]}`}
    >
      <div>{children}</div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}
