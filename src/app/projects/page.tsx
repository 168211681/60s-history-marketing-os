import Link from "next/link";
import { EmptyState, PageHeading, Panel } from "@/components/ui";
import { ProjectForm } from "@/components/project-form";
import { currentOwner } from "@/lib/auth/server";
import { listProjects } from "@/lib/clipforge/data";
import { clipforgeLabel, clipforgeTime } from "@/lib/clipforge/labels";
import { databaseConfigured } from "@/lib/database";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const owner = await currentOwner();
  if (!owner) {
    return (
      <>
        <PageHeading eyebrow="CLIPFORGE" title="Projects" description="Owner workspaces for series and channels. A project does not require a YouTube channel." />
        <Panel title="Projects are private"><p>Sign in as the channel owner to manage projects. <Link href="/settings">Open settings →</Link></p></Panel>
      </>
    );
  }
  if (!databaseConfigured()) {
    return (
      <>
        <PageHeading eyebrow="CLIPFORGE" title="Projects" description="Owner workspaces for series and channels. A project does not require a YouTube channel." />
        <Panel title="Projects unavailable"><p>Database is not configured.</p></Panel>
      </>
    );
  }
  let projects;
  try {
    projects = await listProjects(owner.id);
  } catch {
    return <Panel title="Projects unavailable"><p role="alert">We could not load projects right now. <Link href="/projects">Try again</Link>.</p></Panel>;
  }
  return (
    <>
      <PageHeading
        eyebrow="CLIPFORGE"
        title="Projects"
        description="Create the workspaces you actually use. Names such as History in 60s (H60), Chronicles of Suvarnabhumi (COS), or Affiliate (AFF) are entered here; they are not stored until you save them."
      />
      <Panel title={projects.length ? "Your projects" : "No projects yet"} description="Only this owner can see these records.">
        {projects.length ? (
          <ul className="content-cards">
            {projects.map((project) => (
              <li key={project.id}>
                <div>
                  <h3><Link href={`/projects/${project.id}`}>{project.name}</Link></h3>
                  <p className="muted">{project.code ?? "No code"} · Updated {clipforgeTime(project.updatedAt)} UTC</p>
                </div>
                <span className="badge neutral">{clipforgeLabel(project.status)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No projects yet">
            <p>Nothing is saved yet. Add a project when you are ready.</p>
          </EmptyState>
        )}
      </Panel>
      <Panel title="Create project" description="Code is optional and unique to you. Leave it blank if you do not need one.">
        <ProjectForm />
      </Panel>
    </>
  );
}
