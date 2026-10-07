import Link from "next/link";
import { notFound } from "next/navigation";
import { AssetManager } from "@/components/asset-manager";
import { ContentItemForm } from "@/components/content-item-form";
import { PlatformMatrix } from "@/components/platform-matrix";
import { PageHeading, Panel } from "@/components/ui";
import { currentOwner } from "@/lib/auth/server";
import { getContentItem, listAssets, listPlatformPosts, listProjects } from "@/lib/clipforge/data";
import { distributionSummary } from "@/lib/clipforge/distribution";
import { clipforgeLabel, clipforgeTime } from "@/lib/clipforge/labels";
import { isUuid } from "@/lib/clipforge/model";
import { signStoredObjects } from "@/lib/clipforge/r2";
import { databaseConfigured } from "@/lib/database";

const unfinished = [
  ["Script", "A script is not attached to this content item yet."],
  ["AI Prompts", "Prompt storage and generation are not implemented."],
];

export default async function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const owner = await currentOwner();
  if (!owner) return <Panel title="Library is private"><p>Sign in as the channel owner to view content.</p></Panel>;
  if (!databaseConfigured()) return <Panel title="Library unavailable"><p>Database is not configured.</p></Panel>;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  let item;
  let projects;
  let assets;
  let posts;
  try {
    [item, projects, assets, posts] = await Promise.all([
      getContentItem(owner.id, id),
      listProjects(owner.id),
      listAssets(owner.id, id),
      listPlatformPosts(owner.id, id),
    ]);
  } catch {
    return <Panel title="Content unavailable"><p role="alert">We could not load this content item. <Link href="/library">Back to library</Link>.</p></Panel>;
  }
  if (!item || !posts) notFound();
  const urls = await signStoredObjects(assets.map((asset) => asset.storagePath));
  const signedUrls = Object.fromEntries(urls);
  const progress = distributionSummary(posts.map((post) => post.status));
  return (
    <>
      <PageHeading
        eyebrow={item.contentKey ?? "NO KEY"}
        title={item.title}
        description={`${item.projectName} · ${clipforgeLabel(item.status)} · ${progress.remaining} distributions remaining · Updated ${clipforgeTime(item.updatedAt)} UTC`}
        action={<Link className="text-link" href="/library">All content</Link>}
      />
      <Panel title="Saved metadata">
        <dl className="definition-list">
          <div><dt>Content key</dt><dd>{item.contentKey ?? "None"}</dd></div>
          <div><dt>Project</dt><dd><Link href={`/projects/${item.projectId}`}>{item.projectName}</Link></dd></div>
          <div><dt>Topic</dt><dd>{item.topic || "None"}</dd></div>
          <div><dt>Format</dt><dd>{clipforgeLabel(item.format)}</dd></div>
          <div><dt>Production type</dt><dd>{clipforgeLabel(item.productionType)}</dd></div>
          <div><dt>Status</dt><dd>{clipforgeLabel(item.status)}</dd></div>
          <div><dt>Language</dt><dd>{item.languageCode}</dd></div>
          <div><dt>Duration</dt><dd>{item.durationSeconds === null ? "No duration" : `${item.durationSeconds} seconds`}</dd></div>
          <div><dt>Distribution</dt><dd>{progress.label}</dd></div>
        </dl>
        {item.notes ? <p className="pre-wrap">{item.notes}</p> : <p className="muted">No notes.</p>}
      </Panel>
      <Panel title="Edit metadata">
        <ContentItemForm key={item.updatedAt} item={item} projects={projects} />
      </Panel>
      <Panel title="Assets" description="Files stay in private R2 storage. Links expire and are not stored.">
        <AssetManager contentItemId={item.id} assets={assets} signedUrls={signedUrls} />
      </Panel>
      <Panel title="Platform distribution" description="Copy is saved here. Nothing is posted to YouTube, Facebook, TikTok, or Instagram.">
        <PlatformMatrix contentItemId={item.id} posts={posts} />
      </Panel>
      <Panel title="Not available yet" description="These sections are disabled. They do not contain generated text.">
        <div className="future-blocks">
          {unfinished.map(([title, detail]) => (
            <fieldset key={title} disabled>
              <legend>{title}</legend>
              <span className="badge neutral">Not yet implemented</span>
              <p className="muted">{detail}</p>
            </fieldset>
          ))}
        </div>
      </Panel>
    </>
  );
}
