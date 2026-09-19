import { cache } from "react";
import { summarize } from "@/lib/analytics";
import { currentOwner } from "@/lib/auth/server";
import { databaseConfigured } from "@/lib/database";
import { samplePeriod, sampleVideos, sampleWeeklyViews } from "@/lib/sample-data";
import { authenticatedAnalyticsReader } from "./postgres-reader";
import { buildLiveWorkspace, type WorkspaceData } from "./workspace-model";

export type { WeeklyViews, WorkspaceData } from "./workspace-model";

function sampleWorkspace(notice?: string): WorkspaceData {
  return {
    source: "sample",
    channelTitle: "60s History",
    period: samplePeriod,
    videos: sampleVideos,
    summary: summarize(sampleVideos),
    weeklyViews: sampleWeeklyViews,
    lastSyncedAt: null,
    notice,
  };
}

async function loadWorkspace(): Promise<WorkspaceData> {
  try {
    const owner = await currentOwner();
    if (!owner || !databaseConfigured()) return sampleWorkspace();
    const reader = authenticatedAnalyticsReader(owner.id);
    const channels = await reader.listChannels();
    const channel = channels[0];
    if (!channel) return sampleWorkspace("No connected channel is available for this owner.");
    const reportingPeriod = await reader.getLatestReportingPeriod(channel.id);
    if (!reportingPeriod) return sampleWorkspace("Connect and sync the channel to replace this sample workspace.");
    const [videos, channelMetrics, videoMetrics] = await Promise.all([
      reader.listVideos(channel.id),
      reader.getChannelMetrics(channel.id, reportingPeriod),
      reader.listVideoMetrics(channel.id, reportingPeriod),
    ]);
    return buildLiveWorkspace(channel, reportingPeriod, videos, channelMetrics, videoMetrics);
  } catch {
    return sampleWorkspace("Stored analytics are temporarily unavailable. Showing fictional sample data.");
  }
}

export const workspaceData = cache(loadWorkspace);
