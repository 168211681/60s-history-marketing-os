import Link from "next/link";
import { EmptyState, PageHeading, Panel } from "@/components/ui";
import { ContentItemForm } from "@/components/content-item-form";
import { currentOwner } from "@/lib/auth/server";
import { listContentItems, listProjects } from "@/lib/clipforge/data";
import { clipforgeLabel, clipforgeTime } from "@/lib/clipforge/labels";
import { contentStatuses, isUuid } from "@/lib/clipforge/model";
import type { ContentStatus } from "@/lib/clipforge/model";
import { databaseConfigured } from "@/lib/database";

export const metadata = { title: "Library" };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string; project?: string; status?: string }> }) {
  const owner = await currentOwner();
  if (!owner) {
    return (
      <>
        <PageHeading eyebrow="CLIPFORGE" title="Library" description="Content items, private files, and manual platform copy belong to your projects." />
        <Panel title="Library is private"><p>Sign in as the channel owner to manage content. <Link href="/settings">Open settings →</Link></p></Panel>
      </>
    );
  }
  if (!databaseConfigured()) {
    return (
      <>
        <PageHeading eyebrow="CLIPFORGE" title="Library" description="Content items, private files, and manual platform copy belong to your projects." />
        <Panel title="Library unavailable"><p>Database is not configured.</p></Panel>
      </>
    );
  }
  const params = await searchParams;
  const projectId = params.project && isUuid(params.project) ? params.project : undefined;
  const status = contentStatuses.includes(params.status as ContentStatus) ? params.status as ContentStatus : undefined;
  const query = params.q?.trim() ?? "";
  let projects;
  let items;
  try {
    [projects, items] = await Promise.all([
      listProjects(owner.id),
      listContentItems(owner.id, { projectId, status, query: query || undefined }),
    ]);
  } catch {
    return <Panel title="Library unavailable"><p role="alert">We could not load content right now. <Link href="/library">Try again</Link>.</p></Panel>;
  }
  return (
    <>
      <PageHeading eyebrow="CLIPFORGE" title="Library" description="Search content, file status, and how many platforms are already published or skipped." />
      <Panel title="Filter" description="Filters apply to your records only.">
        <form className="filters" method="get">
          <label className="search-label">Search title, topic, or key
            <input name="q" defaultValue={query} maxLength={200} />
          </label>
          <label>Project
            <select name="project" defaultValue={projectId ?? ""}>
              <option value="">All projects</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label>Status
            <select name="status" defaultValue={status ?? ""}>
              <option value="">Any status</option>
              {contentStatuses.map((value) => <option key={value} value={value}>{clipforgeLabel(value)}</option>)}
            </select>
          </label>
          <button className="button" type="submit">Apply</button>
        </form>
      </Panel>
      <Panel title={items.length ? "Content items" : "No matching content"} description={query || projectId || status ? "Change the filter if this is narrower than you expected." : "Saved items appear here."}>
        {items.length ? (
          <ul className="content-cards">
            {items.map((item) => (
              <li key={item.id}>
                <div>
                  <p className="eyebrow">{item.contentKey ?? "No key"}</p>
                  <h3><Link href={`/library/${item.id}`}>{item.title}</Link></h3>
                  <p className="muted">{item.projectCode ? `${item.projectCode} · ` : ""}{item.projectName}</p>
                  <p className="content-meta">
                    <span className="badge neutral">{clipforgeLabel(item.format)}</span>
                    <span className="badge neutral">{clipforgeLabel(item.productionType)}</span>
                    <span className="badge neutral">{clipforgeLabel(item.status)}</span>
                    <span className="badge neutral">{item.distributionComplete}/4 complete</span>
                    <span className="badge neutral">{item.hasMasterVideo ? "Master video" : "No master video"}</span>
                    <span className="badge neutral">{item.hasThumbnail ? "Thumbnail" : "No thumbnail"}</span>
                    <span className="muted">Updated {clipforgeTime(item.updatedAt)} UTC</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No content items yet">
            <p>{projects.length ? "Create one below. Nothing is invented for you." : "Create a project before adding content."}</p>
            {projects.length ? null : <Link className="text-link" href="/projects">Open projects →</Link>}
          </EmptyState>
        )}
      </Panel>
      {projects.length ? (
        <Panel title="Create content item" description="Four platform rows are created with the item. Nothing is published.">
          <ContentItemForm projects={projects} defaultProjectId={projectId} />
        </Panel>
      ) : null}
    </>
  );
}
