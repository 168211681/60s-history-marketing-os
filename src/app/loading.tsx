export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="loading-state">
      <p>Loading workspace…</p>
      <div className="loading-block" />
      <div className="loading-block" />
    </div>
  );
}
