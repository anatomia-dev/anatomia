import type { Metadata } from "next";
import { Breadcrumb } from "@/components/docs/layout/Breadcrumb";
import { RightRail } from "@/components/docs/layout/RightRail";
import { ReferenceGrid } from "@/components/docs/reference/ReferenceGrid";
import { SkillCard } from "@/components/docs/reference/SkillCard";
import { getSkillTemplates } from "@/lib/docs-data";
import { getBuildMeta } from "@/lib/docs-data/meta";
import { HeadingWithAnchor } from "@/components/docs/content/HeadingWithAnchor";

export const metadata: Metadata = {
  title: "Skill Files",
  description: "Templates that ship on ana init — core and conditional skills.",
};

export default function SkillIndexPage() {
  const skills = getSkillTemplates();
  const meta = getBuildMeta();

  const coreSkills = skills.filter((s) => !s.conditional);
  const conditionalSkills = skills.filter((s) => s.conditional);

  const tocItems = [
    { title: "Core skills", url: "#core-skills", depth: 2 },
    { title: "Conditional skills", url: "#conditional-skills", depth: 2 },
  ];

  return (
    <div style={{ display: "flex" }}>
      <article className="docs-prose docs-content-area min-w-0 flex-1" style={{ padding: "32px 120px 96px 40px" }}>
        <Breadcrumb segments={[
          { name: "Reference", url: "/docs/reference/cli" },
          { name: "Skill files" },
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
          Skill files
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
          Templates that ship on <code>ana init</code>. Each has four sections:
          Detected (machine-populated), Rules (actionable constraints), Gotchas
          (stack-specific traps), Examples (code snippets). Core skills install
          for every project. Conditional skills install when the scan detects
          their triggers.
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
          <span><b>Skills</b> · {skills.length}</span>
          <span><b>Template path</b> · .claude/skills/&#123;name&#125;/SKILL.md</span>
        </div>

        <HeadingWithAnchor id="core-skills">Core skills</HeadingWithAnchor>
        <p>Installed for every project regardless of stack.</p>
        <ReferenceGrid>
          {coreSkills.map((s) => (
            <SkillCard
              key={s.name}
              name={s.name}
              conditional={s.conditional}
              description={s.description}
              rules={s.rules}
            />
          ))}
        </ReferenceGrid>

        <HeadingWithAnchor id="conditional-skills">Conditional skills</HeadingWithAnchor>
        <p>
          Installed only when the scan detects their trigger — an AI SDK, a
          database ORM, or an API framework.
        </p>
        <ReferenceGrid>
          {conditionalSkills.map((s) => (
            <SkillCard
              key={s.name}
              name={s.name}
              conditional={s.conditional}
              description={s.description}
              rules={s.rules}
            />
          ))}
        </ReferenceGrid>
      </article>
      <RightRail
        toc={tocItems}
        commitSha={meta.commitSha}
        buildTimestamp={meta.buildTimestamp}
        editUrl="https://github.com/TettoLabs/anatomia/tree/main/packages/cli/templates/.claude/skills"
        pageUrl="https://anatomia.dev/docs/reference/skills"
        pageContent={`# Skill Files\n\n${skills.map(s => `## ${s.name}\n${s.conditional ? "Conditional" : "Core"} · ${s.rules} rules\n${s.description}`).join("\n\n")}`}
      />
    </div>
  );
}
