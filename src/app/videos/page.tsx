import { PageHeading, Panel } from "@/components/ui";
import { VideoExplorer } from "@/components/video-explorer";
import { samplePeriod, sampleVideos } from "@/lib/sample-data";
export const metadata = { title: "Videos" };
export default function VideosPage() {
  return (
    <>
      <PageHeading
        eyebrow="THE STORIES BEHIND THE NUMBERS"
        title="Video performance"
        description={`Explore six fictional Shorts · ${samplePeriod}. Metrics cover this period, not lifetime performance.`}
      />
      <Panel
        title="Video library"
        description="Search titles or topics and compare sample performance."
      >
        <VideoExplorer videos={sampleVideos} />
      </Panel>
    </>
  );
}
