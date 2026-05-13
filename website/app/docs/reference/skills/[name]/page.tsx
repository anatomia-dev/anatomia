import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/docs/layout/Breadcrumb";
import { RightRail } from "@/components/docs/layout/RightRail";
import { CodeBlock } from "@/components/docs/content/CodeBlock";
import { Callout } from "@/components/docs/content/Callout";
import { HeadingWithAnchor } from "@/components/docs/content/HeadingWithAnchor";
import { getSkillTemplates, getSkillByName } from "@/lib/docs-data";
import { getBuildMeta } from "@/lib/docs-data/meta";

const GITHUB_BASE = "https://github.com/TettoLabs/anatomia/blob/main/packages/cli/templates/.claude/skills/";

interface SkillDetailProps {
  params: Promise<{ name: string }>;
}

export function generateStaticParams(): { name: string }[] {
  return getSkillTemplates().map((s) => ({ name: s.name }));
}

export async function generateMetadata({ params }: SkillDetailProps): Promise<Metadata> {
  const { name } = await params;
  const skill = getSkillByName(name);
  if (!skill) return { title: "Skill not found" };
  return {
    title: skill.name,
    description: skill.description,
  };
}

export default async function SkillDetailPage({ params }: SkillDetailProps) {
  const { name } = await params;
  const skill = getSkillByName(name);
  if (!skill) notFound();

  const meta = getBuildMeta();
  const githubUrl = `${GITHUB_BASE}${skill.name}/SKILL.md`;

  const tocItems = [
    { title: "The SKILL.md template", url: "#template", depth: 2 },
  ];

  return (
    <div style={{ display: "flex" }}>
      <article className="docs-prose docs-content-area min-w-0 flex-1" style={{ padding: "32px 120px 96px 40px" }}>
        <Breadcrumb segments={[
          { name: "Reference", url: "/docs/reference/cli" },
          { name: "Skill files", url: "/docs/reference/skills" },
          { name: skill.name },
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
          {skill.name}
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
          {skill.description}
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
          <span><b>Type</b> · {skill.conditional ? "Conditional" : "Core"} skill</span>
          <span><b>Rules</b> · {skill.rules}</span>
          <span><b>Template</b> · .claude/skills/{skill.name}/SKILL.md</span>
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

        <HeadingWithAnchor id="template">The SKILL.md template</HeadingWithAnchor>
        <p>
          {skill.conditional
            ? "Conditional skill — installs when the scan detects its trigger. Your edits to Rules, Gotchas, and Examples are preserved across re-initialization."
            : "Core skill — installs for every project. Your edits to Rules, Gotchas, and Examples are preserved across re-initialization."}
        </p>
        <CodeBlock data-language="markdown">
          <code>{skill.content}</code>
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

        <Callout variant="note">
          <p>
            This is the template that ships with <code>ana init</code>. Your
            project&rsquo;s version will have the Detected section populated by
            scan and may have additional rules promoted from findings.
          </p>
        </Callout>
      </article>
      <RightRail
        toc={tocItems}
        commitSha={meta.commitSha}
        buildTimestamp={meta.buildTimestamp}
      />
    </div>
  );
}
