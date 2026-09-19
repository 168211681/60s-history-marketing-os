import { EmptyState, PageHeading, Panel } from "@/components/ui";
import { ScriptStatusActions } from "@/components/script-status-actions";
import { productionWorkflowsForOwner, scriptDraftsForOwner } from "@/lib/data/script-drafts";
import { ScriptDraftForm } from "@/components/script-draft-form";
import { RunWorkerButton } from "@/components/run-worker-button";
import { RetryWorkflowButton } from "@/components/retry-workflow-button";

export const metadata = { title: "Script drafts" };

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

export default async function ScriptsPage() {
  const drafts = await scriptDraftsForOwner();
  const workflows = await productionWorkflowsForOwner();
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
            <ScriptDraftForm />
            <p>หรือใช้ MCP tool <code>save_script_draft</code> หลังวิเคราะห์ข้อมูลช่อง</p>
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
              action={<div className="script-panel-actions"><span className="badge neutral">{draft.status}</span><ScriptStatusActions id={draft.id} status={draft.status} /></div>}
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
      {workflows.length ? <Panel title="Production workflows" description="Private rendering and upload status" action={<RunWorkerButton />}>
        <div className="stack-md">{workflows.map((workflow) => <div className="workflow-row" key={workflow.id}>
          <div><strong>{workflow.title}</strong><p className="muted">{workflow.currentStep} · attempt {workflow.attempts}/10</p></div>
          <span className={`badge ${workflow.status === "failed" ? "danger" : "neutral"}`}>{workflow.status}</span>
          {workflow.youtubeVideoId ? <a className="text-link" href={`https://youtu.be/${workflow.youtubeVideoId}`} target="_blank" rel="noreferrer">Open private video →</a> : null}
          {workflow.errorCode ? <span className="error-text">{workflow.errorCode}</span> : null}
          {workflow.status === "failed" && workflow.attempts < 10 ? <RetryWorkflowButton id={workflow.id} /> : workflow.status === "failed" ? <span className="error-text">Retry limit reached</span> : null}
        </div>)}</div>
      </Panel> : null}
    </>
  );
}
