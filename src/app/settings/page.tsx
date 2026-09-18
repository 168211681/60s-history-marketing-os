import { EmptyState, PageHeading, Panel } from "@/components/ui";
export const metadata = { title: "Settings" };
export default function SettingsPage() {
  return (
    <>
      <PageHeading
        eyebrow="YOUR WORKSPACE"
        title="Settings & connections"
        description="Connection status for the Phase 1 demo. No credentials are needed."
      />
      <Panel
        title="YouTube channel"
        action={<span className="badge neutral">Not connected</span>}
      >
        <EmptyState title="Your channel connection comes next">
          <p>
            Google OAuth and YouTube data synchronization are not implemented
            yet.
          </p>
          <p>The workspace displays only fictional, bundled sample data.</p>
        </EmptyState>
      </Panel>
      <div className="content-grid">
        <Panel title="Application settings">
          <dl className="definition-list">
            <div>
              <dt>Data source</dt>
              <dd>Sample fixtures</dd>
            </div>
            <div>
              <dt>Reporting timezone</dt>
              <dd>UTC</dd>
            </div>
            <div>
              <dt>AI provider</dt>
              <dd>Not configured</dd>
            </div>
            <div>
              <dt>Database</dt>
              <dd>Not connected</dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Before connecting real data">
          <p className="muted">
            A later milestone must add owner authentication, access control,
            encrypted token storage, and a secure Google connection flow before
            private analytics can be displayed.
          </p>
          <p className="footnote">
            This demo is publicly accessible. Do not place private analytics or
            credentials in sample files.
          </p>
        </Panel>
      </div>
      <Panel title="Production roadmap">
        <ol className="roadmap">
          <li>
            <strong>01 · Analytics foundation</strong>
            <span className="badge">Current milestone</span>
          </li>
          <li>
            <strong>02 · Secure storage & owner access</strong>
            <span className="muted">Not implemented</span>
          </li>
          <li>
            <strong>03 · Real YouTube analytics</strong>
            <span className="muted">Not implemented</span>
          </li>
          <li>
            <strong>04 · Verified marketing insights</strong>
            <span className="muted">Not implemented</span>
          </li>
        </ol>
      </Panel>
    </>
  );
}
