import type { Metadata } from "next";
import { Breadcrumb } from "@/components/docs/layout/Breadcrumb";
import { RightRail } from "@/components/docs/layout/RightRail";
import { ReferenceGrid } from "@/components/docs/reference/ReferenceGrid";
import { AgentCard } from "@/components/docs/reference/AgentCard";
import { Callout } from "@/components/docs/content/Callout";
import { HeadingWithAnchor } from "@/components/docs/content/HeadingWithAnchor";
import { getAgentTemplates } from "@/lib/docs-data";
import { getBuildMeta } from "@/lib/docs-data/meta";

export const metadata: Metadata = {
  title: "Agent Templates",
  description: "The actual agent definitions that ship into your repo on ana init.",
};

const PIPELINE_AGENTS = ["ana", "ana-plan", "ana-build", "ana-verify"];
const SYSTEM_AGENTS = ["ana-learn", "ana-setup"];

export default function AgentIndexPage() {
  const agents = getAgentTemplates();
  const meta = getBuildMeta();

  const pipelineAgents = agents.filter((a) => PIPELINE_AGENTS.includes(a.name));
  const systemAgents = agents.filter((a) => SYSTEM_AGENTS.includes(a.name));

  const tocItems = [
    { title: "Pipeline agents", url: "#pipeline-agents", depth: 2 },
    { title: "System agents", url: "#system-agents", depth: 2 },
  ];

  return (
    <div style={{ display: "flex" }}>
      <article className="docs-prose docs-content-area min-w-0 flex-1" style={{ padding: "32px 120px 96px 40px" }}>
        <Breadcrumb segments={[
          { name: "Reference", url: "/docs/reference/cli" },
          { name: "Agent templates" },
        ]} />
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 500,
            fontSize: "36px",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            marginBottom: "14px",
            textWrap: "balance",
            color: "var(--fg)",
          }}
        >
          Agent templates
        </h1>
        <p
          style={{
            fontSize: "15.5px",
            lineHeight: 1.55,
            color: "var(--ink-75)",
            marginBottom: "24px",
            maxWidth: "62ch",
            textWrap: "pretty",
          }}
        >
          These are the actual agent definitions that ship into your repo on{" "}
          <code>ana init</code>. Six markdown files, each defining a role, a
          model, and behavioral instructions.
        </p>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--ink-60)",
            display: "flex",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <span><b>Agents</b> · {agents.length}</span>
          <span><b>Template path</b> · .claude/agents/</span>
        </div>

        <Callout variant="note">
          <p>
            These are the same templates every user gets. Your project&rsquo;s
            agents will have identical instructions — the project-specific
            behavior comes from context files and skills, not from agent
            customization. Model assignments are fully configurable via{" "}
            <code>ana agents model</code>.
          </p>
        </Callout>

        <HeadingWithAnchor id="pipeline-agents">Pipeline agents</HeadingWithAnchor>
        <p>The four agents that run in sequence during every pipeline cycle.</p>
        <ReferenceGrid>
          {pipelineAgents.map((a) => (
            <AgentCard
              key={a.name}
              name={a.name}
              model={a.model}
              role={a.role}
              description={a.displayDescription}
            />
          ))}
        </ReferenceGrid>

        <HeadingWithAnchor id="system-agents">System agents</HeadingWithAnchor>
        <p>Agents that run outside the pipeline — between cycles or during setup.</p>
        <ReferenceGrid>
          {systemAgents.map((a) => (
            <AgentCard
              key={a.name}
              name={a.name}
              model={a.model}
              role={a.role}
              description={a.displayDescription}
            />
          ))}
        </ReferenceGrid>
      </article>
      <RightRail
        toc={tocItems}
        commitSha={meta.commitSha}
        buildTimestamp={meta.buildTimestamp}
        editUrl="https://github.com/TettoLabs/anatomia/tree/main/packages/cli/templates/.claude/agents"
        pageUrl="https://anatomia.dev/docs/reference/agents"
        pageContent={`# Agent Templates\n\n${agents.map(a => `## ${a.name}\n**${a.role}** · ${a.model}\n${a.displayDescription}`).join("\n\n")}`}
      />
    </div>
  );
}
