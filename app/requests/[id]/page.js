import { Suspense } from 'react';
import RequestDetail, { RequestDetailSkeleton } from '@/components/RequestDetail';

export const metadata = { title: 'Request · ReturnDesk' };

// Thin server page: RequestDetail reads the id with useParams, so it must sit inside Suspense.
export default function RequestPage() {
  return (
    <Suspense fallback={<RequestDetailSkeleton />}>
      <RequestDetail />
    </Suspense>
  );
}
