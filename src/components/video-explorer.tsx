"use client";

import { useState } from "react";
import {
  selectVideos,
  type VideoMetrics,
  type VideoSort,
} from "@/lib/analytics";
import { VideoList } from "./video-list";

export function VideoExplorer({ videos }: { videos: readonly VideoMetrics[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<VideoSort>("recent");
  const filtered = selectVideos(videos, query, sort);
  return (
    <>
      <div className="filters">
        <label className="search-label">
          Search videos
          <input
            type="search"
            placeholder="Search title or topic…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          Sort by
          <select
            value={sort}
            onChange={(event) => {
              const value = event.target.value;
              if (
                value === "recent" ||
                value === "views" ||
                value === "duration"
              )
                setSort(value);
            }}
          >
            <option value="recent">Most recent</option>
            <option value="views">Most views</option>
            <option value="duration">Avg. view duration</option>
          </select>
        </label>
      </div>
      <p className="muted text-sm result-count" role="status">
        {filtered.length} of {videos.length} sample videos
      </p>
      <VideoList videos={filtered} />
    </>
  );
}
