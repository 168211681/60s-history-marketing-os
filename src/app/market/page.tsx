import { EmptyState, PageHeading, Panel } from "@/components/ui";
import { MarketChannelForm } from "@/components/market-channel-form";
import { marketChannelsForOwner } from "@/lib/data/market";

export const metadata = { title: "Market intelligence" };

function number(value: number | null) { return value === null ? "Unavailable" : new Intl.NumberFormat("en-US").format(value); }

export default async function MarketPage() {
  let channels = [] as Awaited<ReturnType<typeof marketChannelsForOwner>>;
  let error = false;
  try { channels = [...await marketChannelsForOwner()]; } catch (cause) { error = true; console.error("market load failed", cause instanceof Error ? cause.message : "unknown error"); }
  const videos = channels.flatMap((channel) => channel.videos).sort((a, b) => (b.views ?? -1) - (a.views ?? -1));
  return <>
    <PageHeading eyebrow="PUBLIC MARKET INTELLIGENCE" title="Market intelligence" description="Track public competitor snapshots and turn them into evidence for the next content experiment." />
    <Panel title="Track a YouTube channel" description="Only public channel and video metadata is collected. Competitor private analytics are never available."><MarketChannelForm /><p className="footnote">Requires server-side YOUTUBE_DATA_API_KEY. Paste a Channel ID, /channel/ URL, or /@handle URL.</p></Panel>
    {error ? <Panel title="Market data unavailable"><p className="error-text" role="alert">Could not load market data. Check the database migration and owner session.</p></Panel> : !channels.length ? <Panel title="No market sources yet"><EmptyState title="Add your first public channel"><p>Use a competitor channel or a reference channel to create a comparison set.</p></EmptyState></Panel> : <>
      <Panel title="Tracked channels" description="Public snapshots, most recently synced first."><div className="stack-md">{channels.map((channel) => <div className="workflow-row" key={channel.id}><div><strong>{channel.title}</strong><p className="muted">{channel.youtubeChannelId} · {channel.videos.length} videos</p></div><a className="text-link" href={channel.channelUrl} target="_blank" rel="noreferrer">Open channel →</a></div>)}</div></Panel>
      <Panel title="Top public videos" description="Ranked by latest collected public view count. This is a snapshot, not a prediction."><div className="stack-md">{videos.slice(0, 20).map((video, index) => <div className="workflow-row" key={video.id}><div><strong>{index + 1}. {video.title}</strong><p className="muted">{video.channelTitle} · {number(video.views)} views · {number(video.likes)} likes · {number(video.comments)} comments</p></div><a className="text-link" href={`https://youtu.be/${video.youtubeVideoId}`} target="_blank" rel="noreferrer">Open video →</a></div>)}</div></Panel>
    </>}
  </>;
}
