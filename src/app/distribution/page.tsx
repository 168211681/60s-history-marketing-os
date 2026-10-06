import Link from "next/link";
import { EmptyState, PageHeading, Panel } from "@/components/ui";
import { currentOwner } from "@/lib/auth/server";
import { listDistribution, listProjects } from "@/lib/clipforge/data";
import { distributionSummary, isPlatform, platforms, platformStatuses, queueMembership, type Platform, type PlatformStatus } from "@/lib/clipforge/distribution";
import { clipforgeLabel } from "@/lib/clipforge/labels";
import { isUuid } from "@/lib/clipforge/model";
import { signStoredObjects } from "@/lib/clipforge/storage";
import { databaseConfigured } from "@/lib/database";

export const metadata = { title: "Distribution" };

export default async function DistributionPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; platform?: string; status?: string }>;
}) {
  const owner = await currentOwner();
  if (!owner) {
    return (
      <>
        <PageHeading eyebrow="CLIPFORGE" title="Cross-post queue" description="Manual distribution for your content. This page does not publish anywhere." />
        <Panel title="Distribution is private"><p>Sign in as the channel owner to see what still needs posting. <Link href="/settings">Open settings →</Link></p></Panel>
      </>
    );
  }
  if (!databaseConfigured()) {
    return (
      <>
        <PageHeading eyebrow="CLIPFORGE" title="Cross-post queue" description="Manual distribution for your content. This page does not publish anywhere." />
        <Panel title="Distribution unavailable"><p>Database is not configured.</p></Panel>
      </>
    );
  }
  const params = await searchParams;
  const projectId = params.project && isUuid(params.project) ? params.project : undefined;
  const platform = params.platform && isPlatform(params.platform) ? params.platform as Platform : undefined;
  const status = platformStatuses.includes(params.status as PlatformStatus) ? params.status as PlatformStatus : undefined;
  let projects;
  let cards;
  try {
    [projects, cards] = await Promise.all([
      listProjects(owner.id),
      listDistribution(owner.id, { projectId, platform, status }),
    ]);
  } catch {
    return <Panel title="Distribution unavailable"><p role="alert">We could not load the queue. <Link href="/distribution">Try again</Link>.</p></Panel>;
  }
  const thumbs = await signStoredObjects(cards.flatMap((card) => card.thumbnailPath ? [card.thumbnailPath] : []));
  const needsAction = cards.filter((card) => queueMembership(card.posts).needsAction);
  const scheduled = cards.filter((card) => queueMembership(card.posts).scheduled);
  const published = cards.filter((card) => queueMembership(card.posts).recentlyPublished);
  return (
    <>
      <PageHeading
        eyebrow="CLIPFORGE"
        title="Cross-post queue"
        description="See which platforms still need a post. Saving a status does not publish the video."
      />
      <Panel title="Filter">
        <form className="filters" method="get">
          <label>Project
            <select name="project" defaultValue={projectId ?? ""}>
              <option value="">All projects</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label>Platform
            <select name="platform" defaultValue={platform ?? ""}>
              <option value="">All platforms</option>
              {platforms.map((value) => <option key={value} value={value}>{clipforgeLabel(value)}</option>)}
            </select>
          </label>
          <label>Status
            <select name="status" defaultValue={status ?? ""}>
              <option value="">Any status</option>
              {platformStatuses.map((value) => <option key={value} value={value}>{clipforgeLabel(value)}</option>)}
            </select>
          </label>
          <button className="button" type="submit">Apply</button>
        </form>
      </Panel>
      <QueueSection title="Needs action" cards={needsAction} thumbs={thumbs} empty="Nothing is waiting in not started or ready." />
      <QueueSection title="Scheduled" cards={scheduled} thumbs={thumbs} empty="No platform is scheduled." />
      <QueueSection title="Recently published" cards={published} thumbs={thumbs} empty="No platform was published in the last 30 days." />
    </>
  );
}

function QueueSection({
  title,
  cards,
  thumbs,
  empty,
}: {
  title: string;
  cards: Awaited<ReturnType<typeof listDistribution>>;
  thumbs: Map<string, string>;
  empty: string;
}) {
  return (
    <Panel title={title}>
      {cards.length ? (
        <ul className="content-cards">
          {cards.map((card) => {
            const progress = distributionSummary(card.posts.map((post) => post.status));
            const thumb = card.thumbnailPath ? thumbs.get(card.thumbnailPath) : undefined;
            return (
              <li key={`${title}-${card.id}`}>
                <div>
                  {thumb ? (
                    // Signed URLs expire and are not a configured image host.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="thumb-preview" src={thumb} alt="" />
                  ) : <p className="muted">{card.hasThumbnail ? "Thumbnail stored" : "No thumbnail"}</p>}
                  <p className="eyebrow">{card.contentKey ?? "No key"}</p>
                  <h3><Link href={`/library/${card.id}`}>{card.title}</Link></h3>
                  <p className="muted">{card.projectName}</p>
                  <p className="content-meta">
                    {card.posts.map((post) => (
                      <span key={post.platform} className="badge neutral">{clipforgeLabel(post.platform)} {clipforgeLabel(post.status)}</span>
                    ))}
                  </p>
                  <p className="muted">{progress.remaining} distributions remaining · {progress.label} complete</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : <EmptyState title="Nothing in this section"><p>{empty}</p></EmptyState>}
    </Panel>
  );
}
