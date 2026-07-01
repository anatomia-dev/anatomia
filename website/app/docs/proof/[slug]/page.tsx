import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/docs/layout/Breadcrumb";
import { RightRail } from "@/components/docs/layout/RightRail";
import { ProofHero } from "@/components/docs/proof/ProofHero";
import { PipelineGantt } from "@/components/docs/proof/PipelineGantt";
import { AssertionLedger } from "@/components/docs/proof/AssertionLedger";
import { FindingsList } from "@/components/docs/proof/FindingsList";
import { IntegritySeal } from "@/components/docs/proof/IntegritySeal";
import { ProvenanceTable } from "@/components/docs/proof/ProvenanceTable";
import { SessionAttestation } from "@/components/docs/proof/SessionAttestation";
import type { ProofEntry } from "@/lib/docs-data/types";
import { getProofEntries, getProofBySlug } from "@/lib/docs-data";
import { provenanceTocItem, provenanceMarkdownLines } from "@/lib/docs-data/provenance";
import { attestationTocItem, attestationMarkdownLines } from "@/lib/docs-data/attestation";
import { getBuildMeta } from "@/lib/docs-data/meta";
import { HeadingWithAnchor } from "@/components/docs/content/HeadingWithAnchor";

export const dynamicParams = true;
export const revalidate = 3600;

const GITHUB_BASE = "https://github.com/anatomia-dev/anatomia/tree/main/.ana/plans/completed/";

const PROOF_CHAIN_URL =
  "https://raw.githubusercontent.com/anatomia-dev/anatomia/main/.ana/proof_chain.json";

interface ProofChainRawEntry {
  slug: string;
  feature: string;
  result: string;
  contract: { total: number; satisfied: number };
  completed_at: string;
}

async function fetchProofChainEntry(slug: string): Promise<ProofChainRawEntry | null> {
  try {
    const res = await fetch(PROOF_CHAIN_URL, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": "anatomia-web" },
    });
    if (!res.ok) return null;

    const data: { entries: ProofChainRawEntry[] } = await res.json();
    if (!data.entries) return null;

    return data.entries.find(e => e.slug === slug) ?? null;
  } catch {
    return null;
  }
}

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
    ...provenanceMarkdownLines(entry),
    ...attestationMarkdownLines(entry),
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
  if (entry) {
    return {
      title: `${entry.feature} — Proof`,
      description: entry.scopeSummary ?? `Proof chain entry for ${entry.feature}`,
    };
  }

  const rawEntry = await fetchProofChainEntry(slug);
  if (rawEntry) {
    return {
      title: `${rawEntry.feature} — Proof`,
      description: `Proof chain entry for ${rawEntry.feature}`,
    };
  }

  return { title: "Proof not found" };
}

export default async function ProofDetailPage({ params }: ProofDetailProps) {
  const { slug } = await params;
  const entry = getProofBySlug(slug);

  if (!entry) {
    const rawEntry = await fetchProofChainEntry(slug);
    if (!rawEntry) notFound();

    const date = new Date(rawEntry.completed_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const resultLabel = rawEntry.result === "PASS" ? "PASS" : "FAIL";
    const githubUrl = `${GITHUB_BASE}${slug}`;

    return (
      <div style={{ display: "flex" }}>
        <article className="docs-prose docs-content-area min-w-0 flex-1" style={{ padding: "32px 120px 96px 40px" }}>
          <Breadcrumb segments={[
            { name: "Proof Chain", url: "/docs/proof" },
            { name: slug },
          ]} />

          <h1 style={{ fontSize: "28px", fontWeight: 700, marginTop: "24px", marginBottom: "8px" }}>
            {rawEntry.feature}
          </h1>
          <p style={{ fontSize: "14px", color: "var(--ink-60)", marginBottom: "32px" }}>
            {resultLabel} · {rawEntry.contract.satisfied}/{rawEntry.contract.total} assertions · {date}
          </p>

          <div style={{
            padding: "20px 24px",
            borderRadius: "8px",
            background: "color-mix(in oklch, var(--brand-soft) 20%, transparent)",
            border: "1px solid var(--hairline)",
            fontSize: "13.5px",
            color: "var(--ink-60)",
            lineHeight: 1.6,
          }}>
            <p style={{ margin: 0 }}>
              Full verification details will appear on the next site build.
              This page shows a summary from the proof chain.
            </p>
            <p style={{ margin: "12px 0 0 0" }}>
              <a
                href={githubUrl}
                style={{ color: "var(--ink-75)", textDecoration: "none", borderBottom: "1px solid var(--ink-25)" }}
              >
                → View source on GitHub
              </a>
            </p>
          </div>
        </article>
      </div>
    );
  }

  const meta = getBuildMeta();
  const githubUrl = `${GITHUB_BASE}${entry.slug}`;

  const tocItems = [
    { title: "Pipeline timeline", url: "#timeline", depth: 2 },
    { title: "Assertion ledger", url: "#assertions", depth: 2 },
    { title: "Findings", url: "#findings", depth: 2 },
    provenanceTocItem(entry),
    attestationTocItem(entry),
    { title: "Integrity seal", url: "#integrity", depth: 2 },
  ].filter((item): item is { title: string; url: string; depth: number } => item !== null);

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
          Intent to proven code in {formatDuration(entry.duration)}{" "}
          {entry.timing.segments && entry.timing.segments.some(s => s.phase != null)
            ? `across Think, Plan, and ${Math.max(...entry.timing.segments.filter(s => s.stage === "build" && s.phase != null).map(s => s.phase!))} Build\u2192Verify phases.`
            : "across Think, Plan, Build, and Verify."}
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

        {entry.provenance && (
          <>
            <HeadingWithAnchor id="provenance" style={{ scrollMarginTop: "120px" }}>Provenance</HeadingWithAnchor>
            <p style={{ fontSize: "13.5px", color: "var(--ink-60)", maxWidth: "none" }}>
              Who ran what, and what it cost. Recomputable estimates from the shared price table — subordinate to the verdict, never gating.
            </p>
            <ProvenanceTable provenance={entry.provenance} />
          </>
        )}

        {(entry.attestation || entry.verdictVeto) && (
          <>
            <HeadingWithAnchor id="attestation" style={{ scrollMarginTop: "120px" }}>Session attestation</HeadingWithAnchor>
            <p style={{ fontSize: "13.5px", color: "var(--ink-60)", maxWidth: "none" }}>
              How each agent session behaved, coverage-aware. Evidence, not a gate — unverifiable is honest abstention, not a failure.
            </p>
            <SessionAttestation attestation={entry.attestation} verdictVeto={entry.verdictVeto} />
          </>
        )}

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
