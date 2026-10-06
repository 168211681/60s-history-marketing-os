import Link from "next/link";
import { PageHeading, Panel } from "@/components/ui";

export const metadata = { title: "Archive" };

export default function ArchivePage() {
  return (
    <>
      <PageHeading
        eyebrow="CLIPFORGE"
        title="Archive"
        description="A ClipForge archive is not available. This page does not move, delete, or restore content."
        action={<span className="badge neutral">Not yet implemented</span>}
      />
      <Panel
        title="Existing history stays put"
        description="Read-only production records remain on the Scripts page. Internal video rendering stays retired."
      >
        <p className="muted">
          Archived workflow rows are not reopened from here and are not a new archive table.
        </p>
        <p>
          <Link className="text-link" href="/scripts">
            Open script drafts and archived records →
          </Link>
        </p>
      </Panel>
    </>
  );
}
