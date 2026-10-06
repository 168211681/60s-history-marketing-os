import Link from "next/link";
import { PageHeading, Panel } from "@/components/ui";

export const metadata = { title: "Distribution" };

const platforms = [
  ["YouTube", "Analytics sync already lives in Settings. Upload and publishing are not implemented."],
  ["Facebook", "No connection and no posting."],
  ["TikTok", "No connection and no posting."],
  ["Instagram", "No connection and no posting."],
] as const;

export default function DistributionPage() {
  return (
    <>
      <PageHeading
        eyebrow="CLIPFORGE"
        title="Distribution"
        description="Cross-platform posting is not available. This page cannot connect an account or publish anything."
        action={<span className="badge neutral">Not yet implemented</span>}
      />
      <Panel
        title="Platforms"
        description="Status is informational only. There is no queue, draft post, or publish action."
      >
        <ul className="planned-list">
          {platforms.map(([name, detail]) => (
            <li key={name}>
              <div>
                <h3>{name}</h3>
                <p className="muted">{detail}</p>
              </div>
              <span className="badge neutral">Not yet implemented</span>
            </li>
          ))}
        </ul>
        <p>
          <Link className="text-link" href="/settings">
            YouTube connection status →
          </Link>
        </p>
      </Panel>
    </>
  );
}
