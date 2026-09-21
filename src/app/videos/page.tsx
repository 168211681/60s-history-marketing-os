import { PageHeading, Panel } from "@/components/ui";
import { VideoExplorer } from "@/components/video-explorer";
import { workspaceData } from "@/lib/data/workspace";
export const metadata = { title: "Videos" };
export default async function VideosPage() {
  const data = await workspaceData();
  return (
    <>
      <PageHeading
        eyebrow="THE STORIES BEHIND THE NUMBERS"
        title="Video performance"
        description={`Explore ${data.videos.length} ${data.source === "sample" ? "fictional" : "synced"} Shorts · ${data.period}. Metrics cover this period, not lifetime performance.`}
      />
      <Panel
        title="Video library"
        description={`Search titles or topics and compare ${data.source === "sample" ? "sample" : "synced"} performance.`}
      >
        <VideoExplorer videos={data.videos} source={data.source} />
      </Panel>
    </>
  );
}
