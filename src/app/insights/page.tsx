import Link from "next/link";
import { EmptyState, PageHeading, Panel } from "@/components/ui";
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
      <Panel
        title="AI marketing analysis"
        action={<span className="badge neutral">Unavailable</span>}
      >
        <EmptyState title="No AI report generated">
          <p>No AI provider is configured. Stored analytics, when available, are not sent to an AI service.</p>
          <p>Adding an API key alone will not enable this feature.</p>
          <Link className="text-link" href="/settings">
            View connection status →
          </Link>
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
