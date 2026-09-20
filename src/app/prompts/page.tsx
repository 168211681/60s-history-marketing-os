import { PageHeading, Panel } from "@/components/ui";
import { PromptFactory } from "@/components/prompt-factory";

export const metadata = { title: "Prompt factory" };

export default function PromptsPage() {
  return <>
    <PageHeading eyebrow="CODEX / GPT PLUS HANDOFF" title="Prompt factory" description="Turn your stored channel analytics and evidence-labeled insights into a prompt you can paste into GPT Plus or another AI app." />
    <Panel title="Create a content prompt" description="This page does not call an AI provider. It packages evidence for the next tool and keeps human review in the loop."><PromptFactory /></Panel>
      <Panel title="Recommended handoff" description="Use the generated prompt as a brief, then review facts and claims before saving a draft. You can also call the MCP tool create_content_generation_prompt from Codex."><p className="muted">The prompt uses your connected channel&apos;s stored analytics and evidence-labeled insights. Use the Experiments page or MCP experiment tools to track tests separately. It is a planning aid, not a guarantee of performance.</p></Panel>
  </>;
}
