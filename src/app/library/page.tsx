import Link from "next/link";
import { PageHeading, Panel } from "@/components/ui";

export const metadata = { title: "Library" };

const existing = [
  ["Videos", "/videos", "Existing performance explorer for synced or sample videos."],
  ["Scripts", "/scripts", "Existing human-reviewed script drafts."],
  ["Research", "/research", "Existing source and claim review."],
] as const;

export default function LibraryPage() {
  return (
    <>
      <PageHeading
        eyebrow="CLIPFORGE"
        title="Library"
        description="A unified library for master video, thumbnail, script, prompts, captions, and posts is not available yet."
        action={<span className="badge neutral">Not yet implemented</span>}
      />
      <Panel
        title="Not stored yet"
        description="No asset upload, storage bucket, or content-item record exists in this version."
      >
        <p className="muted">
          Use the working tools below. They are the current videos, drafts, and research pages, not a new library.
        </p>
        <ul className="planned-list">
          {existing.map(([label, href, detail]) => (
            <li key={href}>
              <div>
                <h3>{label}</h3>
                <p className="muted">{detail}</p>
              </div>
              <Link className="text-link" href={href}>
                Open {label.toLowerCase()} →
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
