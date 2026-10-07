import { clipforgeTime } from "@/lib/clipforge/labels";

export type YoutubeSourceMetadata = {
  title: string;
  description: string;
  thumbnailUrl: string | null;
  youtubeVideoId: string;
  publishedAt: string | null;
  durationSeconds: string | null;
  defaultLanguage: string | null;
  defaultAudioLanguage: string | null;
  categoryId: string | null;
  privacyStatus: string | null;
  tags: string[];
};

function unavailable(value: string | null) {
  return value ? value : "Unavailable";
}

export function YoutubeSourceMetadataView({ source }: { source: YoutubeSourceMetadata | null }) {
  if (!source) {
    return <p className="muted">No stored YouTube source is linked to this content item.</p>;
  }
  const thumbnail = source.thumbnailUrl && /^https:\/\/\S+$/.test(source.thumbnailUrl) ? source.thumbnailUrl : null;
  const videoUrl = /^[A-Za-z0-9_-]{11}$/.test(source.youtubeVideoId)
    ? `https://www.youtube.com/watch?v=${source.youtubeVideoId}`
    : null;
  return (
    <div className="youtube-source">
      {thumbnail ? (
        // External YouTube URL only. This is not an R2 asset and must not go through image optimization.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="youtube-source-thumb" alt="" src={thumbnail} />
      ) : (
        <p className="muted">Thumbnail unavailable.</p>
      )}
      <dl className="definition-list">
        <div><dt>Source title</dt><dd>{source.title}</dd></div>
        <div><dt>YouTube URL</dt><dd>{videoUrl ? <a href={videoUrl}>{videoUrl}</a> : "Unavailable"}</dd></div>
        <div><dt>Published</dt><dd>{source.publishedAt ? `${clipforgeTime(source.publishedAt)} UTC` : "Unavailable"}</dd></div>
        <div><dt>Duration</dt><dd>{source.durationSeconds === null ? "Unavailable" : `${source.durationSeconds} seconds`}</dd></div>
        <div><dt>Language</dt><dd>{unavailable(source.defaultLanguage)}</dd></div>
        <div><dt>Audio language</dt><dd>{unavailable(source.defaultAudioLanguage)}</dd></div>
        <div><dt>Category ID</dt><dd>{unavailable(source.categoryId)}</dd></div>
        <div><dt>Privacy</dt><dd>{unavailable(source.privacyStatus)}</dd></div>
        <div><dt>Tags</dt><dd>{source.tags.length ? source.tags.join(", ") : "None"}</dd></div>
      </dl>
      <p className="pre-wrap">{source.description ? source.description : "No description stored."}</p>
    </div>
  );
}
