import Link from "next/link";
import { EmptyState, PageHeading, Panel } from "@/components/ui";
import { formatDuration, summarize } from "@/lib/analytics";
import { sampleVideos } from "@/lib/sample-data";
export const metadata = { title: "Insights" };
export default function InsightsPage() {
  const warfare = summarize(
    sampleVideos.filter((video) => video.topic === "Warfare"),
  );
  const baseline = summarize(sampleVideos);
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
        title="An example of evidence-led thinking"
        description="Illustrative example using fictional data. Handwritten copy, not an AI-generated report."
      >
        <ol className="insight-steps">
          <li>
            <span className="step-number">01</span>
            <div>
              <p className="eyebrow">SAMPLE OBSERVATION</p>
              <h3>Two sample videos explore warfare.</h3>
              <p className="muted">
                This is a topic label in the fixture dataset, not a finding
                about your channel.
              </p>
            </div>
          </li>
          <li>
            <span className="step-number">02</span>
            <div>
              <p className="eyebrow">CALCULATED COMPARISON</p>
              <h3>
                {formatDuration(warfare.averageViewSeconds)} average duration
                vs. {formatDuration(baseline.averageViewSeconds)} overall.
              </h3>
              <p className="muted">
                Both values are weighted by views. Two videos are too few to
                establish a reliable topic pattern.
              </p>
            </div>
          </li>
          <li>
            <span className="step-number">03</span>
            <div>
              <p className="eyebrow">
                ILLUSTRATIVE HYPOTHESIS · NOT AI-GENERATED
              </p>
              <h3>Could the opening question matter?</h3>
              <p className="muted">
                Hook style could be one explanation. Topic, audience, timing,
                and other factors may also matter; this comparison establishes
                no cause.
              </p>
            </div>
          </li>
          <li>
            <span className="step-number">04</span>
            <div>
              <p className="eyebrow">SUGGESTED EXPERIMENT</p>
              <h3>Compare two opening formats.</h3>
              <p className="muted">
                Try a question-led and a scene-led hook on comparable future
                topics. Record duration and viewing context before drawing
                conclusions.
              </p>
            </div>
          </li>
        </ol>
      </Panel>
    </>
  );
}
