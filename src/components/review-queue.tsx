"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { BulkReview } from "./bulk-review";
import { BULK_REVIEW_LIMIT, bulkEligible } from "@/lib/clipforge/bulk-review";
import { EmptyState, PageHeading, Panel } from "./ui";
import { clipforgeLabel } from "@/lib/clipforge/labels";
import { reviewConfidence, reviewHref, reviewLabels, reviewStates, type ReviewFilters, type ReviewItem, type ReviewQueueData } from "@/lib/clipforge/review-queue";

export function ReviewQueueHeading() {
  return <PageHeading eyebrow="CLIPFORGE" title="Metadata review queue" description="Inspect AI suggestions. Review clips individually or select up to ten for an explicit batch review." action={<Link className="text-link" href="/library">Back to Library →</Link>} />;
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

function ReviewCard({ item, selection }: { item: ReviewItem; selection: ReactNode }) {
  const suggestion = item.suggestion;
  const reviewed = suggestion?.status === "accepted" || suggestion?.status === "rejected";
  return <li className="review-card">
    {selection}
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
  // New page/filter/snapshot => a fresh selection and no reusable confirmation.
  return <ReviewQueuePage key={JSON.stringify([filters, data])} filters={filters} data={data} />;
}

function ReviewQueuePage({ filters, data }: { filters: ReviewFilters; data: ReviewQueueData }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);
  const count = data.totals[filters.state];
  return <><ReviewQueueHeading />
    <Panel title="Find suggestions" description="Select pending, non-stale suggestions on this page for human-controlled bulk review. Individual review remains available on each clip.">
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
      {data.items.length ? <><BulkReview key={selected.join(",")} ids={selected} lockSelection={setLocked} /><ul className="review-cards">{data.items.map((item) => <ReviewCard key={item.id} item={item} selection={bulkEligible(item) ? <label className="bulk-checkbox"><input type="checkbox" aria-label={`Select ${item.title}`} checked={selected.includes(item.id)} disabled={locked || (!selected.includes(item.id) && selected.length >= BULK_REVIEW_LIMIT)} onChange={(event) => setSelected((ids) => event.target.checked ? (ids.length < BULK_REVIEW_LIMIT && !ids.includes(item.id) ? [...ids, item.id] : ids) : ids.filter((id) => id !== item.id))} />Select for bulk review</label> : null} />)}</ul></> : <EmptyState title={count ? "No clips on this page" : "No matching clips"}>
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
