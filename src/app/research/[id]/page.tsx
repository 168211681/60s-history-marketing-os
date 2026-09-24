import Link from "next/link";
import { PageHeading, Panel } from "@/components/ui";
import { ResearchActions } from "@/components/research-actions";
import { currentOwner } from "@/lib/auth/server";
import { databaseConfigured } from "@/lib/database";
import { researchLinkOptionsForOwner, researchProjectForOwner } from "@/lib/research/data";
import { evidenceStatus } from "@/lib/research/model";
import { z } from "zod";

export default async function ResearchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const owner = await currentOwner();
  if (!owner) return <Panel title="Research is private"><p>Sign in as the channel owner to view research.</p></Panel>;
  if (!databaseConfigured()) return <Panel title="Research unavailable"><p>Database is not configured.</p></Panel>;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return <Panel title="Research not found"><Link href="/research">Back to research</Link></Panel>;
  let data;
  try { data = await Promise.all([researchProjectForOwner(id, owner.id), researchLinkOptionsForOwner(owner.id)]); }
  catch { return <Panel title="Research unavailable"><p role="alert">We couldn&apos;t load research right now. <Link href="/research">Back to research</Link>.</p></Panel>; }
  const [project, options] = data;
  if (!project) return <Panel title="Research not found"><Link href="/research">Back to research</Link></Panel>;
  return <>
    <PageHeading eyebrow="SOURCE REVIEW" title={project.topic} description={`Research status: ${project.status} · Evidence: ${evidenceStatus(project)}`} action={<Link className="text-link" href="/research">All research</Link>} />
    <Panel title="Linked content" description="Links are restricted to this channel."><p>Idea: {project.contentIdeaId ?? "none"} · Experiment: {project.experimentId ?? "none"} · Script: {project.scriptDraftId ?? "none"}</p></Panel>
    <Panel title="Sources" description="A source category is provenance, not a truth score.">
      {project.sources.length ? <div className="stack-md">{project.sources.map((source) => <article key={source.id}><h3>{source.title}</h3>
        <p className="muted">{source.sourceType} · {source.publisher || "publisher unknown"} · {source.publishedAt ?? "date unknown"}</p>
        <p>{source.citationText}</p>{source.reliabilityNote && <p className="muted">Limitations: {source.reliabilityNote}</p>}
        {source.url && <a className="text-link" href={source.url} target="_blank" rel="noopener noreferrer">Open source</a>}
      </article>)}</div> : <p className="muted">No sources recorded. Claims remain insufficient.</p>}
    </Panel>
    <Panel title="Claims and review" description="Legend, disputed chronology and interpretation need explicit qualifications.">
      <ResearchActions project={project} options={options} />
    </Panel>
  </>;
}
