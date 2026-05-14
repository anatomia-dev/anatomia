import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/docs/layout/Breadcrumb";
import { RightRail } from "@/components/docs/layout/RightRail";
import { ProofHero } from "@/components/docs/proof/ProofHero";
import { PipelineGantt } from "@/components/docs/proof/PipelineGantt";
import { AssertionLedger } from "@/components/docs/proof/AssertionLedger";
import { FindingsList } from "@/components/docs/proof/FindingsList";
import { IntegritySeal } from "@/components/docs/proof/IntegritySeal";
import type { ProofEntry } from "@/lib/docs-data/types";
import { getProofEntries, getProofBySlug } from "@/lib/docs-data";
import { getBuildMeta } from "@/lib/docs-data/meta";
import { HeadingWithAnchor } from "@/components/docs/content/HeadingWithAnchor";

const GITHUB_BASE = "https://github.com/TettoLabs/anatomia/tree/main/.ana/plans/completed/";

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }
  return `${minutes}m`;
}

function buildProofMarkdown(entry: ProofEntry): string {
  const verdict = entry.result === "PASS" ? "PASS" : "FAIL";
  const date = entry.completedAt ? new Date(entry.completedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";
  const lines = [
    `# ${entry.feature} — ${verdict}`,
    `${entry.assertionCount}/${entry.contract.total} assertions · ${entry.findingCount} findings · ${formatDuration(entry.duration)}`,
    date ? `Shipped ${date}` : "",
    `→ https://anatomia.dev/docs/proof/${entry.slug}`,
    "",
    "## Assertions",
    ...entry.assertions.map(a => `- ${a.status === "SATISFIED" ? "✓" : "✗"} ${a.id}: ${a.says}`),
    "",
    "## Findings",
    ...entry.findings.map(f => `- [${f.severity}] ${f.summary}`),
    "",
    "## Integrity",
    ...Object.entries(entry.hashes).map(([key, hash]) => `${key}: ${hash}`),
  ];
  return lines.filter(l => l !== undefined).join("\n");
}

interface ProofDetailProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams(): { slug: string }[] {
  return getProofEntries().map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: ProofDetailProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = getProofBySlug(slug);
  if (!entry) return { title: "Proof not found" };
  return {
    title: `${entry.feature} — Proof`,
    description: entry.scopeSummary ?? `Proof chain entry for ${entry.feature}`,
  };
}

export default async function ProofDetailPage({ params }: ProofDetailProps) {
  const { slug } = await params;
  const entry = getProofBySlug(slug);
  if (!entry) notFound();

  const meta = getBuildMeta();
  const githubUrl = `${GITHUB_BASE}${entry.slug}`;

  const tocItems = [
    { title: "Pipeline timeline", url: "#timeline", depth: 2 },
    { title: "Assertion ledger", url: "#assertions", depth: 2 },
    { title: "Findings", url: "#findings", depth: 2 },
    { title: "Integrity seal", url: "#integrity", depth: 2 },
  ];

  return (
    <div style={{ display: "flex" }}>
      <article className="docs-prose docs-content-area min-w-0 flex-1" style={{ padding: "32px 120px 96px 40px" }}>
        <Breadcrumb segments={[
          { name: "Proof Chain", url: "/docs/proof" },
          { name: slug },
        ]} />

        <ProofHero entry={entry} />

        <HeadingWithAnchor id="timeline" style={{ scrollMarginTop: "120px" }}>Pipeline timeline</HeadingWithAnchor>
        <p style={{ fontSize: "13.5px", color: "var(--ink-60)", maxWidth: "none" }}>
          Intent to proven code in {formatDuration(entry.duration)} across Think, Plan, Build, and Verify.
        </p>
        <PipelineGantt timing={entry.timing} />

        <HeadingWithAnchor id="assertions" style={{ scrollMarginTop: "120px" }}>Assertion ledger</HeadingWithAnchor>
        <AssertionLedger
          assertions={entry.assertions}
          total={entry.contract.total}
        />

        <HeadingWithAnchor id="findings" style={{ scrollMarginTop: "120px" }}>
          Findings{" "}
          <span style={{ fontSize: "13px", color: "var(--ink-40)", fontWeight: 400 }}>
            {entry.findingCount} total
          </span>
        </HeadingWithAnchor>
        <FindingsList findings={entry.findings} />

        <HeadingWithAnchor id="integrity" style={{ scrollMarginTop: "120px" }}>Integrity seal</HeadingWithAnchor>
        <IntegritySeal hashes={entry.hashes} slug={entry.slug} />

        {/* Adjacent proof navigation */}
        <div style={{
          marginTop: "48px",
          display: "flex",
          gap: "14px",
          fontSize: "12.5px",
          color: "var(--ink-60)",
        }}>
          <span>Adjacent proofs:</span>
          {entry.prevSlug && (
            <a
              href={`/docs/proof/${entry.prevSlug}`}
              style={{ color: "var(--ink-60)", textDecoration: "none", borderBottom: "1px solid var(--ink-25)" }}
            >
              ← {entry.prevSlug}
            </a>
          )}
          {entry.nextSlug && (
            <a
              href={`/docs/proof/${entry.nextSlug}`}
              style={{ color: "var(--ink-60)", textDecoration: "none", borderBottom: "1px solid var(--ink-25)" }}
            >
              {entry.nextSlug} →
            </a>
          )}
        </div>
      </article>
      <RightRail
        toc={tocItems}
        commitSha={meta.commitSha}
        buildTimestamp={meta.buildTimestamp}
        editUrl={`${GITHUB_BASE}${entry.slug}`}
        variant="proof"
        proofLinks={{ githubUrl }}
        pageUrl={`https://anatomia.dev/docs/proof/${entry.slug}`}
        pageContent={buildProofMarkdown(entry)}
      />
    </div>
  );
}
