import type { Metadata } from "next";
import Link from "next/link";
import { Navigation } from "@/components/navigation";
import { workspaceData } from "@/lib/data/workspace";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Dashboard | 60s History", template: "%s | 60s History" },
  description:
    "60s History Marketing OS — an owner analytics and content strategy workspace.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const data = await workspaceData();
  const syncedAt = data.lastSyncedAt
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(data.lastSyncedAt))
    : null;
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <div className="app-shell">
          <aside className="sidebar">
            <Link href="/" className="brand" aria-label="60s History home">
              <span className="brand-mark">60s</span>
              <span>
                HISTORY<span className="brand-sub">MARKETING OS</span>
              </span>
            </Link>
            <p className="workspace-label">WORKSPACE</p>
            <Navigation />
            <div className="sidebar-note">
              <span className="status-dot" />
              {data.source === "sample" ? "Demo workspace" : "Owner workspace"}
              <p>{data.source === "sample" ? "Explore the foundation for your next chapter." : "Private analytics from the connected channel."}</p>
            </div>
          </aside>
          <div className="workspace">
            <header className="topbar">
              <span>
                Workspace <span className="muted">/ {data.channelTitle}</span>
              </span>
              <span className="badge">{data.source === "sample" ? "Sample data" : "Private analytics"}</span>
            </header>
            <main id="main" tabIndex={-1}>
              <div className={`demo-banner${data.source === "live" ? " live-banner" : ""}`}>
                {data.source === "sample" ? (
                  <span>
                    <strong>Sample data only.</strong> All metrics and video
                    titles are fictional. {data.notice ?? "Private analytics are not active in this session."}
                  </span>
                ) : (
                  <span>
                    <strong>Private synced analytics.</strong> Visible only to the configured owner.
                    {syncedAt ? ` Last synced ${syncedAt} UTC.` : null}
                  </span>
                )}
                <Link href="/settings">Connection status →</Link>
              </div>
              {children}
              <footer>
                60s History Marketing OS <span>{data.source === "sample" ? "Demo workspace" : "Owner analytics workspace"}</span>
              </footer>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
