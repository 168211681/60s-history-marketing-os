import { EmptyState, PageHeading, Panel } from "@/components/ui";
import { ExperimentResultForm } from "@/components/experiment-result-form";
import { contentExperimentsForOwner, nextExperimentMessage } from "@/lib/data/experiments";

export const metadata = { title: "Experiments" };

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

export default async function ExperimentsPage() {
  let experiments: Awaited<ReturnType<typeof contentExperimentsForOwner>> = [];
  let loadError = false;
  try {
    experiments = await contentExperimentsForOwner();
  } catch (error) {
    loadError = true;
    console.error("experiments load failed", error instanceof Error ? error.message : "unknown error");
  }
  return (
    <>
      <PageHeading
        eyebrow="MEASURED CONTENT TESTS"
        title="Content experiments"
        description="Turn marketing hypotheses into comparable tests and record observed results."
      />
      <Panel title="Next recommendation" description="Evidence-led guidance from stored analytics and experiment memory.">
        {loadError ? <p className="error-text" role="alert">We couldn&apos;t load experiments right now. Try again after checking the database connection and migration.</p> : <>
          <p>{nextExperimentMessage(experiments)}</p>
          <p className="muted text-sm">AI hypotheses remain hypotheses until you record observed metrics.</p>
        </>}
      </Panel>
      {!loadError && !experiments.length ? (
        <Panel title="No experiments yet">
          <EmptyState title="Your experiment log is empty">
            <p>Use the MCP tool <code>create_content_experiment</code> after reviewing channel insights.</p>
          </EmptyState>
        </Panel>
      ) : (
        <div className="stack-lg">
          {experiments.map((experiment) => (
            <Panel key={experiment.id} title={experiment.topic} description={`${experiment.hookFormat} · created ${dateLabel(experiment.createdAt)}`}>
              <div className="draft-grid">
                <div><p className="eyebrow">STATUS</p><p><span className="badge neutral">{experiment.status}</span></p></div>
                <div><p className="eyebrow">HYPOTHESIS</p><p>{experiment.hypothesis}</p></div>
                {experiment.resultSummary ? <div><p className="eyebrow">OBSERVED RESULT</p><p>{experiment.resultSummary}</p></div> : null}
                {experiment.recommendation ? <div><p className="eyebrow">RECOMMENDATION</p><p>{experiment.recommendation}</p></div> : null}
                <div><p className="eyebrow">METRICS</p><p className="muted">Views: {experiment.observedViews ?? "Not recorded"} · Likes: {experiment.observedLikes ?? "Not recorded"} · Comments: {experiment.observedComments ?? "Not recorded"}</p></div>
                {experiment.status === "planned" || experiment.status === "running" ? <div><p className="eyebrow">RECORD RESULT</p><ExperimentResultForm id={experiment.id} /></div> : null}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
