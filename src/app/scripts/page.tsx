import { EmptyState, PageHeading, Panel } from "@/components/ui";
import { ScriptStatusActions } from "@/components/script-status-actions";
import { productionWorkflowsForOwner, scriptDraftsForOwner } from "@/lib/data/script-drafts";
import { ScriptDraftForm } from "@/components/script-draft-form";
import { AiScriptDraftForm } from "@/components/ai-script-draft-form";
import { WorkflowEvents } from "@/components/workflow-events";

export const metadata = { title: "Script drafts" };

function LoadError({ section }: { section: string }) {
  return (
    <div className="error-text" role="alert">
      <p>We couldn&apos;t load {section} right now.</p>
      <a className="text-link" href="/scripts">Try again →</a>
    </div>
  );
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

export default async function ScriptsPage() {
  const [draftsResult, workflowsResult] = await Promise.allSettled([
    scriptDraftsForOwner(),
    productionWorkflowsForOwner(),
  ]);
  const drafts = draftsResult.status === "fulfilled" ? draftsResult.value : [];
  const workflows = workflowsResult.status === "fulfilled" ? workflowsResult.value : [];
  if (draftsResult.status === "rejected") {
    console.error("scripts drafts load failed", draftsResult.reason instanceof Error ? draftsResult.reason.message : "unknown error");
  }
  if (workflowsResult.status === "rejected") {
    console.error("scripts workflows load failed", workflowsResult.reason instanceof Error ? workflowsResult.reason.message : "unknown error");
  }
  return (
    <>
      <PageHeading
        eyebrow="HUMAN REVIEW QUEUE"
        title="Script drafts"
        description="Review evidence-backed drafts and prepare briefs for external editing tools."
      />
      <Panel title="Generate with AI provider" description="Optional server-side AI integration. Every result stays a draft until you review it.">
        <AiScriptDraftForm />
      </Panel>
      {draftsResult.status === "rejected" ? <Panel title="Drafts unavailable"><LoadError section="your drafts" /></Panel> : null}
      {draftsResult.status === "fulfilled" && !drafts.length ? (
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
              description={`${draft.source === "codex_mcp" ? "Codex/MCP draft" : draft.source === "ai_provider" ? "AI provider draft" : "Human draft"} · ${dateLabel(draft.createdAt)}`}
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
      {workflowsResult.status === "rejected" ? <Panel title="Archived production records unavailable"><LoadError section="archived production records" /></Panel> : null}
      {workflows.length ? <Panel title="Archived production records" description="Historical records are read-only. Internal rendering, upload, and publishing are retired.">
        <div className="stack-md">{workflows.map((workflow) => <div className="workflow-row" key={workflow.id}>
          <div><strong>{workflow.title}</strong><p className="muted">{workflow.currentStep} · attempt {workflow.attempts}/10</p></div>
          <span className={`badge ${workflow.status === "failed" ? "danger" : "neutral"}`}>{workflow.status}</span>
          {workflow.errorCode ? <span className="error-text">{workflow.errorCode}</span> : null}
          <WorkflowEvents id={workflow.id} />
        </div>)}</div>
      </Panel> : null}
    </>
  );
}
