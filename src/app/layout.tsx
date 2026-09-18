import type { Metadata } from "next";
import Link from "next/link";
import { Navigation } from "@/components/navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Dashboard | 60s History", template: "%s | 60s History" },
  description:
    "60s History Marketing OS — a clearly labeled sample analytics workspace.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
              Demo workspace<p>Explore the foundation for your next chapter.</p>
            </div>
          </aside>
          <div className="workspace">
            <header className="topbar">
              <span>
                Workspace <span className="muted">/ 60s History</span>
              </span>
              <span className="badge">Sample data</span>
            </header>
            <main id="main" tabIndex={-1}>
              <div className="demo-banner">
                <span>
                  <strong>Sample data only.</strong> All metrics and video
                  titles are fictional. YouTube is not connected.
                </span>
                <Link href="/settings">Connection status →</Link>
              </div>
              {children}
              <footer>
                60s History Marketing OS <span>Phase 1 · Demo workspace</span>
              </footer>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
