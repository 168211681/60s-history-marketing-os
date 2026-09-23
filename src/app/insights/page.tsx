import Link from "next/link";
import { EmptyState, PageHeading, Panel } from "@/components/ui";
import { AiAnalysisPanel } from "@/components/ai-analysis-panel";
import { workspaceData } from "@/lib/data/workspace";
import { experimentsForOwner } from "@/lib/data/experiments";
import { buildMarketingInsights, type InsightKind } from "@/lib/insights";
export const metadata = { title: "Insights" };
const labels: Record<InsightKind, string> = {
  observation: "OBSERVED DATA",
  comparison: "CALCULATED COMPARISON",
  hypothesis: "HYPOTHESIS · NOT CAUSAL",
  experiment: "SUGGESTED EXPERIMENT",
};

export default async function InsightsPage() {
  const data = await workspaceData();
  const insights = buildMarketingInsights(data.videos);
  const experiments = data.source === "live" ? await experimentsForOwner() : [];
  return (
    <>
      <PageHeading
        eyebrow="FROM EVIDENCE TO EXPERIMENT"
        title="Marketing insights"
        description="Separate what happened from what might explain it."
      />
      <AiAnalysisPanel />
      <Panel title="Provider setup" description="AI is optional and remains unavailable until a server-side provider is configured.">
        <EmptyState title="No provider? Deterministic insights still work">
          <p>Stored analytics are not sent to an AI service unless you explicitly configure one.</p>
          <Link className="text-link" href="/settings">View connection status →</Link>
        </EmptyState>
      </Panel>
      <Panel
        title="Closed-loop experiments"
        description="Published-video results are compared only across equivalent reporting windows. Missing metrics stay unavailable; hypotheses are not causal conclusions."
      >
        {experiments.length === 0 ? (
          <EmptyState title="No owner experiments yet">
            <p>Create an experiment after choosing a content idea and reviewed script. A published video and comparable metrics are required before a result can be completed.</p>
          </EmptyState>
        ) : (
          <div className="experiment-list">
            {experiments.map((experiment) => (
              <article className="experiment-card" key={experiment.id}>
                <div className="experiment-card-heading">
                  <div>
                    <p className="eyebrow">{experiment.status.toUpperCase()} · {experiment.reportingWindowDays}-DAY WINDOW</p>
                    <h3>{experiment.title}</h3>
                  </div>
                  <span className="status-badge">{experiment.evaluation.evidence}</span>
                </div>
                <dl className="experiment-details">
                  <div><dt>Content idea</dt><dd>{experiment.contentIdeaTitle ?? "No linked idea"}</dd></div>
                  <div><dt>Script</dt><dd>{experiment.scriptTitle ?? "No linked script"}</dd></div>
                  <div><dt>Published video</dt><dd>{experiment.videoTitle ?? "Not linked"}</dd></div>
                </dl>
                <div className="experiment-result">
                  <p><strong>Observation:</strong> {experiment.evaluation.observation}</p>
                  <p><strong>Comparison:</strong> {experiment.evaluation.comparison}</p>
                  <p><strong>Hypothesis:</strong> {experiment.evaluation.hypothesis}</p>
                  <p><strong>Next test:</strong> {experiment.evaluation.recommendation}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
      <Panel
        title="Evidence-led analysis"
        description={`${data.source === "sample" ? "Fictional sample data" : "Private synced analytics"}. Deterministic calculations only; no AI provider is configured.`}
      >
        <ol className="insight-steps">
          {insights.map((insight, index) => (
            <li key={`${insight.kind}-${insight.title}`}>
              <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <p className="eyebrow">{labels[insight.kind]}</p>
                <h3>{insight.title}</h3>
                <p className="muted">{insight.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </>
  );
}
