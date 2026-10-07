const labels: Record<string, string> = {
  active: "Active",
  archived: "Archived",
  idea: "Idea",
  generating: "Generating",
  editing: "Editing",
  ready: "Ready",
  scheduled: "Scheduled",
  published: "Published",
  skipped: "Skipped",
  not_started: "Not started",
  short_form: "Short form",
  long_form: "Long form",
  other: "Other",
  unknown: "Unknown",
  new: "New",
  remaster: "Remaster",
  repurpose: "Repurpose",
  youtube: "YouTube",
  facebook: "Facebook",
  tiktok: "TikTok",
  instagram: "Instagram",
  master_video: "Master video",
  thumbnail: "Thumbnail",
};

export function clipforgeLabel(value: string) {
  return labels[value] ?? value;
}

export function clipforgeTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
}
