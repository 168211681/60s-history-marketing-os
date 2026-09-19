import { PageHeading, Panel, MetricCards } from "@/components/ui";
import { TrendChart } from "@/components/trend-chart";
import { formatNumber } from "@/lib/analytics";
import { workspaceData } from "@/lib/data/workspace";
export const metadata = { title: "Analytics" };
export default async function AnalyticsPage() {
  const data = await workspaceData();
  const totals = data.summary;
  return (
    <>
      <PageHeading
        eyebrow="UNDERSTAND YOUR AUDIENCE"
        title="Channel analytics"
        description={`${data.source === "sample" ? "Sample" : "Synced"} period: ${data.period}. ${data.source === "sample" ? "All totals are fictional." : "Channel totals come from private daily Analytics reports."}`}
      />
      <MetricCards metrics={totals} periodLabel={data.period} />
      <div className="content-grid">
        <Panel
          title="Views over time"
          description={`Weekly ${data.source === "sample" ? "sample" : "channel"} totals · no previous-period comparison`}
        >
          <TrendChart values={data.weeklyViews} source={data.source} />
        </Panel>
        <Panel
          title="Audience actions"
          description={`${data.source === "sample" ? "Sample" : "Synced"} engagement during the selected period`}
        >
          <dl className="definition-list">
            {([
              ["Likes", totals.likes],
              ["Comments", totals.comments],
              ["Subscribers gained", totals.gained],
              ["Subscribers lost", totals.lost],
            ] satisfies [string, number | null][]).map(([label, count]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{formatNumber(count)}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
      <Panel title="How to read these metrics">
        <div className="explanation-grid">
          <div>
            <h3>Calculated from the {data.source === "sample" ? "sample" : "synced reports"}</h3>
            <p className="muted">
              Watch time is estimated minutes watched ÷ 60. Average view
              duration is total watch seconds ÷ total views. Subscriber growth
              is gained minus lost.
            </p>
          </div>
          <div>
            <h3>Not collected</h3>
            <p className="muted">
              Retention curves, impressions CTR, revenue, and causal explanations
              are not collected or inferred in this MVP.
            </p>
          </div>
        </div>
      </Panel>
    </>
  );
}
