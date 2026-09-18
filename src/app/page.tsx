import Link from "next/link";
import { PageHeading, Panel, MetricCards } from "@/components/ui";
import { TrendChart } from "@/components/trend-chart";
import { VideoList } from "@/components/video-list";
import { selectVideos, topVideos } from "@/lib/analytics";
import { samplePeriod, sampleVideos } from "@/lib/sample-data";

export default function Dashboard() {
  return (
    <>
      <PageHeading
        eyebrow="YOUR CHANNEL AT A GLANCE"
        title="Make every second count."
        description="A clearer view of your channel. A more thoughtful next story."
        action={<span className="period">{samplePeriod}</span>}
      />
      <section className="channel-overview">
        <div className="channel-avatar" aria-hidden="true">
          60s
        </div>
        <div>
          <h2>60s History</h2>
          <p className="muted">
            History, one minute at a time · Sample channel
          </p>
        </div>
        <span className="badge neutral">6 sample videos</span>
      </section>
      <MetricCards videos={sampleVideos} />
      <div className="content-grid">
        <Panel
          title="Performance trends"
          description="Weekly views · fictional 28-day dataset"
        >
          <TrendChart />
        </Panel>
        <Panel
          title="Marketing insights"
          description="Evidence first. Experiments next."
        >
          <span className="badge neutral">AI unavailable</span>
          <h3 className="insight-title">Good questions start with data.</h3>
          <p className="muted">
            Explore an illustrative observation and experiment. Live analysis
            will require stored channel analytics.
          </p>
          <Link className="text-link" href="/insights">
            Explore insights →
          </Link>
          <p className="footnote">
            No AI provider is connected. No report has been generated.
          </p>
        </Panel>
      </div>
      <Panel
        title="Recent videos"
        description="Most recently published in the sample dataset"
        action={
          <Link className="text-link" href="/videos">
            All videos →
          </Link>
        }
      >
        <VideoList
          videos={selectVideos(sampleVideos, "", "recent").slice(0, 3)}
        />
      </Panel>
      <Panel
        title="Top performing videos"
        description="Ranked by views within the sample period"
      >
        <VideoList videos={topVideos(sampleVideos)} />
      </Panel>
    </>
  );
}
