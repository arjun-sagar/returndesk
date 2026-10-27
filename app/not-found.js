import Link from "next/link";

// Friendly 404 for unknown pages.
export default function NotFound() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-slate-600">That page doesn&apos;t exist.</p>
      <Link href="/requests" className="mt-4 inline-block text-indigo-600 underline">
        Back to the desk
      </Link>
    </div>
  );
}
