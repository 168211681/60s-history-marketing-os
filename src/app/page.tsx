import Link from "next/link";
import { PageHeading, Panel, MetricCards } from "@/components/ui";
import { TrendChart } from "@/components/trend-chart";
import { VideoList } from "@/components/video-list";
import { selectVideos, topVideos } from "@/lib/analytics";
import { workspaceData } from "@/lib/data/workspace";

export default async function Dashboard() {
  const data = await workspaceData();
  const sourceName = data.source === "sample" ? "sample" : "synced";
  return (
    <>
      <PageHeading
        eyebrow="YOUR CHANNEL AT A GLANCE"
        title="Make every second count."
        description="A clearer view of your channel. A more thoughtful next story."
        action={<span className="period">{data.period}</span>}
      />
      <section className="channel-overview">
        <div className="channel-avatar" aria-hidden="true">
          60s
        </div>
        <div>
          <h2>{data.channelTitle}</h2>
          <p className="muted">
            History, one minute at a time · {data.source === "sample" ? "Sample channel" : "Private owner analytics"}
          </p>
        </div>
        <span className="badge neutral">{data.videos.length} {sourceName} videos</span>
      </section>
      <MetricCards metrics={data.summary} periodLabel={data.period} />
      <div className="content-grid">
        <Panel
          title="Performance trends"
          description={`Weekly views · ${data.source === "sample" ? "fictional" : "private synced"} 28-day dataset`}
        >
          <TrendChart values={data.weeklyViews} source={data.source} />
        </Panel>
        <Panel
          title="Marketing insights"
          description="Evidence first. Experiments next."
        >
          <span className="badge neutral">AI unavailable</span>
          <h3 className="insight-title">Good questions start with data.</h3>
          <p className="muted">
            Explore an illustrative observation and experiment. Automated analysis
            over stored channel analytics is the next milestone.
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
        description={`Most recently published in the ${sourceName} dataset`}
        action={
          <Link className="text-link" href="/videos">
            All videos →
          </Link>
        }
      >
        <VideoList
          videos={selectVideos(data.videos, "", "recent").slice(0, 3)}
        />
      </Panel>
      <Panel
        title="Top performing videos"
        description={`Ranked by views within the ${sourceName} period`}
      >
        <VideoList videos={topVideos(data.videos)} />
      </Panel>
    </>
  );
}
