import { EmptyState, PageHeading, Panel } from "@/components/ui";
import { scriptDraftsForOwner } from "@/lib/data/script-drafts";

export const metadata = { title: "Script drafts" };

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

export default async function ScriptsPage() {
  const drafts = await scriptDraftsForOwner();
  return (
    <>
      <PageHeading
        eyebrow="HUMAN REVIEW QUEUE"
        title="Script drafts"
        description="Review structured 60-second drafts before any production or publishing step."
      />
      {!drafts.length ? (
        <Panel title="No drafts yet">
          <EmptyState title="Your review queue is empty">
            <p>Use the MCP tool <code>save_script_draft</code> after analyzing synced channel data.</p>
            <p>Drafts are never published automatically and are not sample analytics.</p>
          </EmptyState>
        </Panel>
      ) : (
        <div className="stack-lg">
          {drafts.map((draft) => (
            <Panel
              key={draft.id}
              title={draft.title}
              description={`${draft.source === "codex_mcp" ? "Codex/MCP draft" : "Human draft"} · ${dateLabel(draft.createdAt)}`}
              action={<span className="badge neutral">{draft.status}</span>}
            >
              <div className="draft-grid">
                <div><p className="eyebrow">HOOK</p><p>{draft.hook}</p></div>
                <div><p className="eyebrow">VOICEOVER</p><p className="pre-wrap">{draft.scriptBody}</p></div>
                {draft.sceneCues ? <div><p className="eyebrow">SCENE CUES</p><p className="pre-wrap">{draft.sceneCues}</p></div> : null}
                {draft.captionText ? <div><p className="eyebrow">CAPTIONS</p><p className="pre-wrap">{draft.captionText}</p></div> : null}
                {draft.callToAction ? <div><p className="eyebrow">CALL TO ACTION</p><p>{draft.callToAction}</p></div> : null}
                {draft.researchNotes ? <div><p className="eyebrow">RESEARCH NOTES</p><p className="pre-wrap">{draft.researchNotes}</p></div> : null}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
