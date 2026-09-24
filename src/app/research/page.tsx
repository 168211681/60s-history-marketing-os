import Link from "next/link";
import { EmptyState, PageHeading, Panel } from "@/components/ui";
import { ResearchActions } from "@/components/research-actions";
import { currentOwner } from "@/lib/auth/server";
import { databaseConfigured } from "@/lib/database";
import { researchLinkOptionsForOwner, researchProjectsForOwner } from "@/lib/research/data";

export const metadata = { title: "Research" };

export default async function ResearchPage() {
  const owner = await currentOwner();
  if (!owner) return <Panel title="Research is private"><p>Sign in as the channel owner to view research.</p></Panel>;
  if (!databaseConfigured()) return <Panel title="Research unavailable"><p>Database is not configured.</p></Panel>;
  let data;
  try {
    data = await Promise.all([researchProjectsForOwner(owner.id), researchLinkOptionsForOwner(owner.id)]);
  } catch {
    return <Panel title="Research unavailable"><p role="alert">We couldn&apos;t load research right now. <Link href="/research">Try again</Link>.</p></Panel>;
  }
  const [projects, options] = data;
  return <>
    <PageHeading eyebrow="HISTORICAL EVIDENCE" title="Research workspace" description="Record sources, review historical claims and keep uncertainty visible before external production." />
    <Panel title="Start research" description="Connect a topic to an idea, experiment or script when available."><ResearchActions options={options} /></Panel>
    <Panel title="Research projects" description="Only human-reviewed claims can be treated as supported.">
      {projects.length ? <div className="stack-md">{projects.map((project) => <article key={project.id} className="workflow-row">
        <div><strong><Link className="text-link" href={`/research/${project.id}`}>{project.topic}</Link></strong><p className="muted">{project.researchQuestion || "No research question yet"}</p></div>
        <span className="badge neutral">{project.status}</span>
      </article>)}</div> : <EmptyState title="No research projects yet">Create one above. Sources and claims are never invented automatically.</EmptyState>}
    </Panel>
  </>;
}
