import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/docs/layout/Breadcrumb";
import { RightRail } from "@/components/docs/layout/RightRail";
import { CodeBlock } from "@/components/docs/content/CodeBlock";
import { HeadingWithAnchor } from "@/components/docs/content/HeadingWithAnchor";
import { getAgentTemplates, getAgentByName } from "@/lib/docs-data";
import { getBuildMeta } from "@/lib/docs-data/meta";

const GITHUB_BASE = "https://github.com/TettoLabs/anatomia/blob/main/packages/cli/templates/.claude/agents/";

interface AgentDetailProps {
  params: Promise<{ name: string }>;
}

export function generateStaticParams(): { name: string }[] {
  return getAgentTemplates().map((a) => ({ name: a.name }));
}

export async function generateMetadata({ params }: AgentDetailProps): Promise<Metadata> {
  const { name } = await params;
  const agent = getAgentByName(name);
  if (!agent) return { title: "Agent not found" };
  return {
    title: agent.name,
    description: agent.description,
  };
}

export default async function AgentDetailPage({ params }: AgentDetailProps) {
  const { name } = await params;
  const agent = getAgentByName(name);
  if (!agent) notFound();

  const meta = getBuildMeta();
  const githubUrl = `${GITHUB_BASE}${agent.name}.md`;

  const tocItems = [
    { title: "What it reads, writes, and cannot touch", url: "#reads-writes", depth: 2 },
    { title: "The actual template", url: "#template", depth: 2 },
  ];

  return (
    <div style={{ display: "flex" }}>
      <article className="docs-prose docs-content-area min-w-0 flex-1" style={{ padding: "32px 120px 96px 40px" }}>
        <Breadcrumb segments={[
          { name: "Reference", url: "/docs/reference/cli" },
          { name: "Agent templates", url: "/docs/reference/agents" },
          { name: agent.name },
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
          {agent.name}
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
          {agent.description}
        </p>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--ink-60)",
            display: "flex",
            gap: "16px",
            marginBottom: "24px",
            flexWrap: "wrap",
          }}
        >
          <span><b>Model</b> · {agent.model}</span>
          <span><b>Role</b> · {agent.role}</span>
          <span><b>Template</b> · .claude/agents/{agent.name}.md</span>
          <span>
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--ink-60)", textDecoration: "none", borderBottom: "1px solid var(--ink-25)" }}
            >
              View on GitHub ↗
            </a>
          </span>
        </div>

        <HeadingWithAnchor id="reads-writes">What it reads, writes, and cannot touch</HeadingWithAnchor>
        <table>
          <thead>
            <tr>
              <th>Reads</th>
              <th>Writes</th>
              <th>Forbidden</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{agent.reads.map((r) => <code key={r}>{r}</code>).reduce<React.ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, ", ", el]), [])}</td>
              <td>{agent.writes.map((w) => <code key={w}>{w}</code>).reduce<React.ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, ", ", el]), [])}</td>
              <td style={{ color: "var(--fail)" }}>
                {agent.forbidden.length > 0
                  ? agent.forbidden.map((f) => <code key={f}>{f}</code>).reduce<React.ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, ", ", el]), [])
                  : "—"}
              </td>
            </tr>
          </tbody>
        </table>

        <HeadingWithAnchor id="template">The actual template</HeadingWithAnchor>
        <p>
          This is the real <code>{agent.name}.md</code> that ships into your
          repo. Not a summary — the actual instructions the agent reads.
        </p>
        <CodeBlock data-language="markdown">
          <code>{agent.bodyMarkdown}</code>
        </CodeBlock>
        <p style={{ fontSize: "12px", color: "var(--ink-40)" }}>
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--ink-60)", textDecoration: "none", borderBottom: "1px dotted var(--ink-25)" }}
          >
            View on GitHub ↗
          </a>
        </p>
      </article>
      <RightRail
        toc={tocItems}
        commitSha={meta.commitSha}
        buildTimestamp={meta.buildTimestamp}
      />
    </div>
  );
}
