import { currentOwner } from "@/lib/auth/server";
import { database, databaseConfigured } from "@/lib/database";
import { fetchPublicMarketChannel } from "@/lib/youtube/public-market";

export type MarketVideo = {
  id: string; youtubeVideoId: string; title: string; publishedAt: string; durationSeconds: number | null;
  views: number | null; likes: number | null; comments: number | null; channelTitle: string; channelId: string;
};

export type MarketChannel = { id: string; youtubeChannelId: string; title: string; channelUrl: string; lastSyncedAt: string | null; videos: MarketVideo[] };

export async function marketChannelsForOwner(ownerOverride?: string): Promise<readonly MarketChannel[]> {
  const owner = ownerOverride ? { id: ownerOverride } : await currentOwner();
  if (!owner || !databaseConfigured()) return [];
  const result = await database().query<{
    id: string; youtube_channel_id: string; title: string; channel_url: string; last_synced_at: Date | null;
    video_id: string | null; youtube_video_id: string | null; video_title: string | null; published_at: Date | null;
    duration_seconds: number | null; views: number | null; likes: number | null; comments: number | null;
  }>(`select c.id, c.youtube_channel_id, c.title, c.channel_url, c.last_synced_at,
             v.id as video_id, v.youtube_video_id, v.title as video_title, v.published_at,
             v.duration_seconds, v.views, v.likes, v.comments
        from public.market_channels c
        left join public.market_videos v on v.market_channel_id = c.id
       where c.owner_id = $1
       order by c.created_at desc, v.views desc nulls last, v.published_at desc`, [owner.id]);
  const channels = new Map<string, MarketChannel>();
  for (const row of result.rows) {
    const channel = channels.get(row.id) ?? { id: row.id, youtubeChannelId: row.youtube_channel_id, title: row.title, channelUrl: row.channel_url, lastSyncedAt: row.last_synced_at?.toISOString() ?? null, videos: [] };
    if (row.video_id && row.youtube_video_id && row.video_title && row.published_at) channel.videos.push({ id: row.video_id, youtubeVideoId: row.youtube_video_id, title: row.video_title, publishedAt: row.published_at.toISOString(), durationSeconds: row.duration_seconds, views: row.views, likes: row.likes, comments: row.comments, channelTitle: row.title, channelId: row.id });
    channels.set(row.id, channel);
  }
  return [...channels.values()];
}

export async function syncPublicMarketChannel(ownerId: string, youtubeChannelId: string) {
  const channel = await fetchPublicMarketChannel(youtubeChannelId);
  const saved = await database().query<{ id: string }>(`insert into public.market_channels (owner_id, youtube_channel_id, title, channel_url, last_synced_at)
    values ($1, $2, $3, $4, now()) on conflict (owner_id, youtube_channel_id) do update set title = excluded.title, channel_url = excluded.channel_url, last_synced_at = now(), updated_at = now() returning id`, [ownerId, channel.youtubeChannelId, channel.title, channel.channelUrl]);
  const marketChannelId = saved.rows[0].id;
  for (const video of channel.videos) {
    await database().query(`insert into public.market_videos (market_channel_id, youtube_video_id, title, published_at, duration_seconds, views, likes, comments, collected_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, now()) on conflict (market_channel_id, youtube_video_id) do update set title = excluded.title, published_at = excluded.published_at, duration_seconds = excluded.duration_seconds, views = excluded.views, likes = excluded.likes, comments = excluded.comments, collected_at = now(), updated_at = now()`, [marketChannelId, video.youtubeVideoId, video.title, video.publishedAt, video.durationSeconds, video.views, video.likes, video.comments]);
  }
  return { ...channel, id: marketChannelId, syncedVideos: channel.videos.length };
}
