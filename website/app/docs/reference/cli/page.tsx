import type { Metadata } from "next";
import { Breadcrumb } from "@/components/docs/layout/Breadcrumb";
import { RightRail } from "@/components/docs/layout/RightRail";
import { CommandGroup } from "@/components/docs/reference/CommandGroup";
import { getCommandGroups, getCommandCount } from "@/lib/docs-data";
import { getBuildMeta } from "@/lib/docs-data/meta";

export const metadata: Metadata = {
  title: "CLI Commands",
  description: "Every command in the ana CLI, grouped by category.",
};

export default function CLIReferencePage() {
  const groups = getCommandGroups();
  const commandCount = getCommandCount();
  const meta = getBuildMeta();

  const tocItems = groups.map((g) => ({
    title: g.name,
    url: `#${g.name.toLowerCase().replace(/\s+/g, "-")}`,
    depth: 2,
  }));

  return (
    <div style={{ display: "flex" }}>
      <article className="docs-prose docs-content-area min-w-0 flex-1" style={{ padding: "32px 120px 96px 40px" }}>
        <Breadcrumb segments={[
          { name: "Reference", url: "/docs/reference/cli" },
          { name: "CLI commands" },
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
          CLI commands
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
          Every command in the <code>ana</code> CLI, grouped by category. Run{" "}
          <code>ana --help</code> or <code>ana &lt;command&gt; --help</code> for
          flags and usage.
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
          <span><b>Commands</b> · {commandCount}</span>
          <span><b>Last reviewed</b> · 2026-05-11</span>
        </div>

        {groups.map((group) => (
          <CommandGroup key={group.name} name={group.name} commands={group.commands} />
        ))}
      </article>
      <RightRail
        toc={tocItems}
        commitSha={meta.commitSha}
        buildTimestamp={meta.buildTimestamp}
        editUrl="https://github.com/TettoLabs/anatomia/blob/main/packages/cli/src/index.ts"
        pageUrl="https://anatomia.dev/docs/reference/cli"
        pageContent={`# CLI Commands\n\n${groups.map(g => `## ${g.name}\n${g.commands.map(c => `- **${c.name}**: ${c.description}`).join("\n")}`).join("\n\n")}`}
      />
    </div>
  );
}
