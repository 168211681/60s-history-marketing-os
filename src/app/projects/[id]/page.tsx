import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, PageHeading, Panel } from "@/components/ui";
import { ContentItemForm } from "@/components/content-item-form";
import { ProjectForm } from "@/components/project-form";
import { currentOwner } from "@/lib/auth/server";
import { getProject, listContentItems } from "@/lib/clipforge/data";
import { clipforgeLabel, clipforgeTime } from "@/lib/clipforge/labels";
import { isUuid } from "@/lib/clipforge/model";
import { databaseConfigured } from "@/lib/database";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const owner = await currentOwner();
  if (!owner) return <Panel title="Projects are private"><p>Sign in as the channel owner to manage projects.</p></Panel>;
  if (!databaseConfigured()) return <Panel title="Projects unavailable"><p>Database is not configured.</p></Panel>;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  let project;
  let items;
  try {
    [project, items] = await Promise.all([getProject(owner.id, id), listContentItems(owner.id, { projectId: id })]);
  } catch {
    return <Panel title="Project unavailable"><p role="alert">We could not load this project. <Link href="/projects">Back to projects</Link>.</p></Panel>;
  }
  if (!project) notFound();
  return (
    <>
      <PageHeading
        eyebrow={project.code ?? "PROJECT"}
        title={project.name}
        description={project.description || "No description yet."}
        action={<Link className="text-link" href="/projects">All projects</Link>}
      />
      <Panel title="Project details" description={`Status ${clipforgeLabel(project.status)} · Updated ${clipforgeTime(project.updatedAt)} UTC`}>
        <ProjectForm key={project.updatedAt} project={project} />
      </Panel>
      <Panel title="Content in this project" description="These are saved content items, not files." action={<Link className="text-link" href={`/library?project=${project.id}`}>Library filter →</Link>}>
        {items.length ? (
          <ul className="content-cards">
            {items.map((item) => (
              <li key={item.id}>
                <div>
                  <h3><Link href={`/library/${item.id}`}>{item.title}</Link></h3>
                  <p className="muted">{item.contentKey ?? "No key"} · {clipforgeLabel(item.status)} · Updated {clipforgeTime(item.updatedAt)} UTC</p>
                </div>
                <span className="badge neutral">{clipforgeLabel(item.format)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No content items yet"><p>Create the first item for this project below.</p></EmptyState>
        )}
      </Panel>
      <Panel title="Add content" description="The item stays in this project unless you later move it to another project you own.">
        <ContentItemForm projects={[project]} defaultProjectId={project.id} />
      </Panel>
    </>
  );
}
