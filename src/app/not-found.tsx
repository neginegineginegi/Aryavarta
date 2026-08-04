import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24 text-center">
      <p className="section-label">404</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
        No such record in the archive
      </h1>
      <p className="mt-3 text-ink-muted">
        The page you&rsquo;re looking for doesn&rsquo;t exist, isn&rsquo;t published yet, or has
        been removed.
      </p>
      <p className="mt-6">
        <Link href="/" className="text-accent underline-offset-2 hover:underline">
          ← Back to the map
        </Link>
      </p>
    </div>
  );
}
