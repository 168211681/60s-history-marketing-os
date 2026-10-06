import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading, Panel } from "@/components/ui";
import { ContentItemForm } from "@/components/content-item-form";
import { currentOwner } from "@/lib/auth/server";
import { getContentItem, listProjects } from "@/lib/clipforge/data";
import { clipforgeLabel, clipforgeTime } from "@/lib/clipforge/labels";
import { isUuid } from "@/lib/clipforge/model";
import { databaseConfigured } from "@/lib/database";

const futureSections = [
  ["Master Video", "No video file is stored. Upload is not implemented."],
  ["Thumbnail", "No image is stored. Thumbnail upload is not implemented."],
  ["Script", "A script is not attached to this content item yet."],
  ["AI Prompts", "Prompt storage and generation are not implemented."],
  ["Platform Distribution", "Posting to YouTube, Facebook, TikTok, or Instagram is not implemented."],
];

export default async function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const owner = await currentOwner();
  if (!owner) return <Panel title="Library is private"><p>Sign in as the channel owner to view content.</p></Panel>;
  if (!databaseConfigured()) return <Panel title="Library unavailable"><p>Database is not configured.</p></Panel>;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  let item;
  let projects;
  try {
    [item, projects] = await Promise.all([getContentItem(owner.id, id), listProjects(owner.id)]);
  } catch {
    return <Panel title="Content unavailable"><p role="alert">We could not load this content item. <Link href="/library">Back to library</Link>.</p></Panel>;
  }
  if (!item) notFound();
  return (
    <>
      <PageHeading
        eyebrow={item.contentKey ?? "NO KEY"}
        title={item.title}
        description={`${item.projectName} · ${clipforgeLabel(item.status)} · Updated ${clipforgeTime(item.updatedAt)} UTC`}
        action={<Link className="text-link" href="/library">All content</Link>}
      />
      <Panel title="Saved metadata" description="These are the only stored fields. There is no file, thumbnail, or post URL.">
        <dl className="definition-list">
          <div><dt>Content key</dt><dd>{item.contentKey ?? "None"}</dd></div>
          <div><dt>Project</dt><dd><Link href={`/projects/${item.projectId}`}>{item.projectName}</Link></dd></div>
          <div><dt>Topic</dt><dd>{item.topic || "None"}</dd></div>
          <div><dt>Format</dt><dd>{clipforgeLabel(item.format)}</dd></div>
          <div><dt>Production type</dt><dd>{clipforgeLabel(item.productionType)}</dd></div>
          <div><dt>Status</dt><dd>{clipforgeLabel(item.status)}</dd></div>
          <div><dt>Language</dt><dd>{item.languageCode}</dd></div>
          <div><dt>Duration</dt><dd>{item.durationSeconds === null ? "No duration" : `${item.durationSeconds} seconds`}</dd></div>
        </dl>
        {item.notes ? <p className="pre-wrap">{item.notes}</p> : <p className="muted">No notes.</p>}
      </Panel>
      <Panel title="Edit metadata">
        <ContentItemForm key={item.updatedAt} item={item} projects={projects} />
      </Panel>
      <Panel title="Not available yet" description="These sections are disabled. They do not contain files or links.">
        <div className="future-blocks">
          {futureSections.map(([title, detail]) => (
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
