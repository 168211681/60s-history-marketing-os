"use client";
import Link from "next/link";
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="panel" role="alert">
      <h1>We couldn’t load this page.</h1>
      <p className="muted">
        Try again. If the issue continues, return to the dashboard.
      </p>
      {error.digest ? <p className="muted text-xs">Error reference: {error.digest}</p> : null}
      <button className="button" onClick={reset}>
        Try again
      </button>
      <Link className="text-link" href="/">
        Return to dashboard
      </Link>
    </section>
  );
}
