import RequestForm from '@/components/RequestForm';

export const metadata = { title: 'New request · ReturnDesk' };

// Thin server page: renders the client-side create form inside a card.
export default function NewRequestPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-900">New return request</h1>
      <p className="mt-1 text-sm text-slate-600">Log a customer&apos;s return. It starts as Open.</p>
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
        <RequestForm mode="create" />
      </div>
    </div>
  );
}
