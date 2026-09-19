import Link from "next/link";
export default function NotFound() {
  return (
    <section className="panel">
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p className="muted">This page doesn’t exist in your workspace.</p>
      <Link className="text-link" href="/">
        Return to dashboard →
      </Link>
    </section>
  );
}
