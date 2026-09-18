import { PageHeading, Panel, MetricCards } from "@/components/ui";
import { TrendChart } from "@/components/trend-chart";
import { formatNumber, summarize } from "@/lib/analytics";
import { samplePeriod, sampleVideos } from "@/lib/sample-data";
export const metadata = { title: "Analytics" };
export default function AnalyticsPage() {
  const totals = summarize(sampleVideos);
  return (
    <>
      <PageHeading
        eyebrow="UNDERSTAND YOUR AUDIENCE"
        title="Channel analytics"
        description={`Sample period: ${samplePeriod}. All totals are derived from the six fictional videos.`}
      />
      <MetricCards videos={sampleVideos} />
      <div className="content-grid">
        <Panel
          title="Views over time"
          description="Weekly sample totals · no previous-period comparison"
        >
          <TrendChart />
        </Panel>
        <Panel
          title="Audience actions"
          description="Sample engagement during the selected period"
        >
          <dl className="definition-list">
            {[
              ["Likes", totals.likes],
              ["Comments", totals.comments],
              ["Subscribers gained", totals.gained],
              ["Subscribers lost", totals.lost],
            ].map(([label, count]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{formatNumber(Number(count))}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
      <Panel title="How to read these metrics">
        <div className="explanation-grid">
          <div>
            <h3>Calculated from the sample</h3>
            <p className="muted">
              Watch time is estimated minutes watched ÷ 60. Average view
              duration is total watch seconds ÷ total views. Subscriber growth
              is gained minus lost.
            </p>
          </div>
          <div>
            <h3>Not available yet</h3>
            <p className="muted">
              Real channel analytics, retention curves, impressions CTR,
              revenue, and causal explanations are not provided in this MVP.
            </p>
          </div>
        </div>
      </Panel>
    </>
  );
}
