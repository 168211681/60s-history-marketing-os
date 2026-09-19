import Link from "next/link";
import { EmptyState, PageHeading, Panel } from "@/components/ui";
import { AiAnalysisPanel } from "@/components/ai-analysis-panel";
import { workspaceData } from "@/lib/data/workspace";
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
