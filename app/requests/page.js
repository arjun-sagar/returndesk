import { Suspense } from 'react';
import RequestList, { RequestListSkeleton } from '@/components/RequestList.js';

// The list page is a thin server component: the client list reads the URL, so it must sit inside Suspense.
export default function RequestsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Return requests</h1>
      <Suspense fallback={<RequestListSkeleton />}>
        <RequestList />
      </Suspense>
    </div>
  );
}
