import type { Metadata } from "next";
import { Breadcrumb } from "@/components/docs/layout/Breadcrumb";
import { RightRail } from "@/components/docs/layout/RightRail";
import { CodeBlock } from "@/components/docs/content/CodeBlock";
import { Callout } from "@/components/docs/content/Callout";
import { HeadingWithAnchor } from "@/components/docs/content/HeadingWithAnchor";
import { getContextFiles } from "@/lib/docs-data";
import { getBuildMeta } from "@/lib/docs-data/meta";

export const metadata: Metadata = {
  title: "Context Files",
  description: "The files in .ana/ that give agents project-specific knowledge.",
};

export default function ContextReferencePage() {
  const files = getContextFiles();
  const meta = getBuildMeta();

  const tocItems = files.map((f) => ({
    title: f.filename,
    url: `#${f.name.replace(/\./g, "-")}`,
    depth: 2,
  }));

  return (
    <div style={{ display: "flex" }}>
      <article className="docs-prose docs-content-area min-w-0 flex-1" style={{ padding: "32px 120px 96px 40px" }}>
        <Breadcrumb segments={[
          { name: "Reference", url: "/docs/reference/cli" },
          { name: "Context files" },
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
          Context files
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
          The files in <code>.ana/</code> that give agents project-specific
          knowledge. These are from the Anatomia repo itself — the same system
          that documents your project documents ours.
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
          <span><b>Files</b> · {files.length}</span>
          <span><b>Path</b> · .ana/context/ and .ana/</span>
        </div>

        {files.map((f) => (
          <div key={f.name}>
            <HeadingWithAnchor id={f.name.replace(/\./g, "-")} style={{ scrollMarginTop: "120px" }}>
              {f.filename}
            </HeadingWithAnchor>
            <p><strong>Path:</strong> <code>{f.path}</code></p>
            <p>{f.description}</p>
            <div className="docs-context-code">
              <CodeBlock data-language={f.filename.endsWith(".json") ? "json" : "markdown"}>
                <code>{f.content}</code>
              </CodeBlock>
            </div>
          </div>
        ))}

        <Callout variant="note">
          <p>
            These are Anatomia&rsquo;s own context files. Your project&rsquo;s
            versions will reflect your stack, your architecture, your
            team&rsquo;s principles. The structure is the same — the content is
            yours.
          </p>
        </Callout>
      </article>
      <RightRail
        toc={tocItems}
        commitSha={meta.commitSha}
        buildTimestamp={meta.buildTimestamp}
        editUrl="https://github.com/TettoLabs/anatomia/tree/main/.ana/context"
        pageUrl="https://anatomia.dev/docs/reference/context"
        pageContent={`# Context Files\n\n${files.map(f => `## ${f.filename}\n**Path:** ${f.path}\n${f.description}`).join("\n\n")}`}
      />
    </div>
  );
}
