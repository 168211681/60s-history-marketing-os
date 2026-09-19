import { EmptyState, PageHeading, Panel } from "@/components/ui";
import { SignInButton, SignOutButton } from "@/components/auth-buttons";
import { appOrigin, ownerId, supabaseConfig } from "@/lib/auth/config";
import { serverAuth } from "@/lib/auth/server";
import { googleConfig } from "@/lib/youtube/google";
import { connectionForOwner, databaseConfigured } from "@/lib/youtube/store";

export const metadata = { title: "Settings" };

const messages: Record<string, string> = {
  connected: "YouTube channel connected. Run a manual sync to import the latest complete 28-day window.",
  disconnected: "Channel disconnected. Its stored data and local token were removed.",
  "revocation-pending": "Local data and token were removed, but Google did not confirm revocation. Revoke the app in your Google Account security settings.",
  failed: "Connection failed. Please try again or check the Google OAuth setup.",
  "sync-succeeded": "YouTube metadata and analytics were synced successfully. Owner dashboard pages now use the stored reporting window.",
  "sync-current": "This reporting window is already synced. A new window becomes available after the next UTC day.",
  "sync-running": "A sync for this reporting window is already running. Check again shortly.",
  "sync-failed": "Analytics sync failed. Check the connection, Google API access, quota, and server logs before retrying.",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ youtube?: string; auth?: string }> }) {
  const params = await searchParams;
  const authReady = Boolean(supabaseConfig() && appOrigin());
  const auth = authReady ? await serverAuth() : null;
  const { data } = auth ? await auth.auth.getUser() : { data: { user: null } };
  const user = data.user;
  const isOwner = Boolean(user && ownerId() && user.id.toLowerCase() === ownerId());
  const googleReady = Boolean(googleConfig());
  const databaseReady = databaseConfigured();
  const connectionReady = Boolean(isOwner && googleReady && databaseReady);
  let connection: Awaited<ReturnType<typeof connectionForOwner>> = null;
  let connectionError = false;
  if (connectionReady && user) {
    try {
      connection = await connectionForOwner(user.id);
    } catch {
      connectionError = true;
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="YOUR WORKSPACE"
        title="Settings & connections"
        description="Owner access, read-only YouTube connection, and manual analytics synchronization."
      />
      {params.youtube && messages[params.youtube] ? <p className="settings-notice" role="status">{messages[params.youtube]}</p> : null}
      {params.auth === "failed" ? <p className="settings-notice" role="alert">Sign-in failed. Please try again.</p> : null}
      {params.auth === "denied" ? <p className="settings-notice" role="alert">This Google account is not the configured owner.</p> : null}
      <Panel title="Owner access" action={<span className="badge neutral">{isOwner ? "Owner signed in" : "Private"}</span>}>
        {!authReady ? (
          <EmptyState title="Authentication is not configured">
            <p>Set the Supabase public URL and publishable key plus APP_ORIGIN to enable sign-in.</p>
          </EmptyState>
        ) : !user ? (
          <EmptyState title="Sign in as the channel owner">
            <p>Only the configured owner can connect a YouTube channel or view private connection details.</p>
            <SignInButton />
          </EmptyState>
        ) : !isOwner ? (
          <EmptyState title="Owner access is unavailable">
            <p>Set OWNER_USER_ID to this account&apos;s Supabase Auth user ID before connecting a channel.</p>
            <SignOutButton />
          </EmptyState>
        ) : (
          <div className="settings-actions">
            <p>Signed in as the configured owner.</p>
            <SignOutButton />
          </div>
        )}
      </Panel>
      <Panel title="YouTube channel" action={<span className="badge neutral">{connection ? "Connected" : "Not connected"}</span>}>
        {!isOwner ? (
          <EmptyState title="Owner sign-in required">
            <p>Connection details are available only to the verified owner.</p>
          </EmptyState>
        ) : !connectionReady ? (
          <EmptyState title="YouTube connection is not configured">
            <p>Configure the missing server settings before connecting YouTube.</p>
            <ul className="check-list">
              <li className={googleReady ? "check-pass" : "check-fail"}>Google OAuth: {googleReady ? "ready" : "missing or invalid"}</li>
              <li className={databaseReady ? "check-pass" : "check-fail"}>Database and token encryption: {databaseReady ? "ready" : "missing or invalid"}</li>
            </ul>
          </EmptyState>
        ) : connectionError ? (
          <EmptyState title="Connection status unavailable">
            <p>The database could not be reached. No connection status is being inferred.</p>
          </EmptyState>
        ) : connection ? (
          <div className="settings-actions">
            <p><strong>{connection.title}</strong> · {connection.youtube_channel_id}</p>
            <p className="muted">
              Read-only access. Last successful sync: {connection.last_synced_at ? connection.last_synced_at.toISOString().replace("T", " ").slice(0, 19) + " UTC" : "Never"}.
              Signed-in owner dashboard pages use the latest successful sync; anonymous visitors see fictional sample data.
            </p>
            <form action="/api/youtube/sync" method="post">
              <button className="button" type="submit">Sync latest 28 complete days</button>
            </form>
            <form action="/api/youtube/disconnect" method="post">
              <button className="button secondary" type="submit">Disconnect and delete stored channel data</button>
            </form>
          </div>
        ) : (
          <div className="settings-actions">
            <p>Grant read-only access to channel details and Analytics reports.</p>
            <form action="/api/youtube/connect" method="post">
              <button className="button" type="submit">Connect YouTube channel</button>
            </form>
          </div>
        )}
      </Panel>
      <div className="content-grid">
        <Panel title="Application settings">
          <dl className="definition-list">
            <div><dt>Dashboard data</dt><dd>{connection?.last_synced_at ? "Private synced analytics" : "Fictional samples"}</dd></div>
            <div><dt>Reporting timezone</dt><dd>UTC</dd></div>
            <div><dt>AI provider</dt><dd>Not configured</dd></div>
            <div><dt>Database</dt><dd>{databaseConfigured() ? "Configured" : "Not configured"}</dd></div>
          </dl>
        </Panel>
        <Panel title="What connection enables">
          <p className="muted">The connection saves a channel identity and an encrypted refresh token on the server. Manual sync imports video metadata and supported daily metrics for the authenticated owner dashboard.</p>
          <p className="footnote">No real channel analytics are exposed on public routes.</p>
        </Panel>
      </div>
    </>
  );
}
