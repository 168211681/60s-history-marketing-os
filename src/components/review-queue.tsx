import Link from "next/link";
import { EmptyState, PageHeading, Panel } from "./ui";
import { clipforgeLabel } from "@/lib/clipforge/labels";
import { reviewConfidence, reviewHref, reviewLabels, reviewStates, type ReviewFilters, type ReviewItem, type ReviewQueueData } from "@/lib/clipforge/review-queue";

export function ReviewQueueHeading() {
  return <PageHeading eyebrow="CLIPFORGE" title="Metadata review queue" description="Inspect AI suggestions across your library. Open a clip to review its metadata." action={<Link className="text-link" href="/library">Back to Library →</Link>} />;
}

export function ReviewQueueUnavailable({ invalid = false }: { invalid?: boolean }) {
  return <><ReviewQueueHeading /><Panel title={invalid ? "Check your filters" : "Review queue unavailable"}>
    <p role="alert">{invalid ? "Choose a valid review state, project, and page. Search is limited to 200 characters." : "We could not load your review queue. Try again in a moment."}</p>
    <Link className="button" href="/review" prefetch={false}>{invalid ? "Clear filters" : "Try again"}</Link>
  </Panel></>;
}

export function ReviewQueueLoading() {
  return <div className="loading-state" role="status" aria-live="polite" aria-busy="true">
    <p>Loading metadata review queue…</p><div className="loading-block" /><div className="loading-block" />
  </div>;
}

function ReviewCard({ item }: { item: ReviewItem }) {
  const suggestion = item.suggestion;
  const reviewed = suggestion?.status === "accepted" || suggestion?.status === "rejected";
  return <li className="review-card">
    <div className="review-card-heading">
      <div><p className="eyebrow">{item.projectName}</p><h3>{item.title}</h3></div>
      <span className="badge neutral">{reviewLabels[item.state]}</span>
    </div>
    {suggestion?.status === "superseded" ? <p className="review-note">Historical suggestion — superseded, not pending review.</p> : null}
    {suggestion?.stale ? <p className="review-note"><strong>Source changed.</strong>{" "}{reviewed ? "The recorded review decision is retained; these suggestions describe earlier source metadata." : "These suggestions describe earlier source metadata. Inspect the clip before making a separate decision."}</p> : null}
    {suggestion ? <dl className="review-fields">
      {([
        ["Suggested topic", suggestion.suggestedTopic, suggestion.topicConfidence, suggestion.topicRationale],
        ["Suggested content pillar", suggestion.suggestedContentPillar, suggestion.pillarConfidence, suggestion.pillarRationale],
        ["Suggested production type", clipforgeLabel(suggestion.suggestedProductionType), suggestion.productionTypeConfidence, suggestion.productionTypeRationale],
      ] as const).map(([label, value, confidence, rationale]) => <div key={label} className="review-field">
        <dt>{label}</dt>
        <dd className="review-value">{value ?? "No suggestion"}</dd>
        <dd className="muted">Confidence: <strong>{reviewConfidence(confidence)}</strong></dd>
        <dd className="muted review-rationale">{rationale}</dd>
      </div>)}
    </dl> : <p className="muted">No current suggestion is stored for this clip.</p>}
    <Link className="button review-clip-link" href={`/library/${item.id}`} prefetch={false} aria-label={`Review clip: ${item.title}`}>Review clip →</Link>
  </li>;
}

export function ReviewQueue({ filters, data }: { filters: ReviewFilters; data: ReviewQueueData }) {
  const count = data.totals[filters.state];
  return <><ReviewQueueHeading />
    <Panel title="Find suggestions" description="Suggestions are read-only here. Accept, Reject, and Regenerate remain on each clip.">
      <form className="filters review-filters" method="get" action="/review">
        <label className="search-label">Search title<input name="q" defaultValue={filters.q} maxLength={200} type="search" /></label>
        <label>Project<select name="project" defaultValue={filters.project}>
          <option value="">All projects</option>
          {filters.project && !data.projects.some((project) => project.id === filters.project) ? <option value={filters.project}>Unavailable project</option> : null}
          {data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select></label>
        <label>Review state<select name="state" defaultValue={filters.state}>
          {reviewStates.map((state) => <option key={state} value={state}>{reviewLabels[state]}</option>)}
        </select></label>
        <button className="button" type="submit">Apply filters</button>
        <Link className="text-link" href="/review" prefetch={false}>Clear filters</Link>
      </form>
      <p className="muted review-filter-note">Totals reflect your project and title filters. Stale means a pending suggestion has changed source metadata. Accepted and rejected suggestions keep their reviewed status.</p>
      <nav aria-label="Review state totals" className="review-totals">
        {reviewStates.map((state) => <Link key={state} href={reviewHref(filters, { state, page: 1 })} prefetch={false} aria-current={state === filters.state ? "page" : undefined}>
          <span>{reviewLabels[state]}</span><strong>{data.totals[state]}</strong>
        </Link>)}
      </nav>
    </Panel>
    <Panel title="Suggestions" description={`${count} ${count === 1 ? "clip" : "clips"} · ${reviewLabels[filters.state]}`}>
      {data.items.length ? <ul className="review-cards">{data.items.map((item) => <ReviewCard key={item.id} item={item} />)}</ul> : <EmptyState title={count ? "No clips on this page" : "No matching clips"}>
        <p>{count ? "Return to the first page to see this selection." : "Try another review state, project, or title. Only your content appears here."}</p>
        <Link className="text-link" href={count ? reviewHref(filters, { page: 1 }) : "/review"} prefetch={false}>{count ? "First page" : "Clear filters"}</Link>
      </EmptyState>}
      <nav className="review-pagination" aria-label="Review queue pages">
        {filters.page > 1 ? <Link className="button" prefetch={false} href={reviewHref(filters, { page: filters.page - 1 })}>Previous page</Link> : null}
        <p>{filters.page <= data.pageCount ? `Page ${filters.page} of ${data.pageCount}` : "Page out of range"}</p>
        {filters.page < data.pageCount ? <Link className="button" prefetch={false} href={reviewHref(filters, { page: filters.page + 1 })}>Next page</Link> : null}
      </nav>
    </Panel>
  </>;
}
