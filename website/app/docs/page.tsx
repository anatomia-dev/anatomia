import type { Metadata } from "next";
import Link from "next/link";
import {
  getProofEntries,
  getProofStats,
  getAgentCount,
  getCommandCount,
  getSkillCount,
} from "@/lib/docs-data";
import { StatsStrip } from "@/components/docs/content/StatsStrip";
import { PipelineDiagram } from "@/components/docs/content/PipelineDiagram";
import { DocsGrid } from "@/components/docs/content/DocsGrid";
import { AudienceCards } from "@/components/docs/content/AudienceCards";
import { CuratedProofs } from "@/components/docs/content/CuratedProofs";
import { ResourceStrip } from "@/components/docs/content/ResourceStrip";
import { RightRail } from "@/components/docs/layout/RightRail";
import { getBuildMeta } from "@/lib/docs-data/meta";

export const metadata: Metadata = {
  title: "Anatomia Documentation",
  description:
    "Verified AI development. Five agents scope, plan, build, verify, and learn from every change.",
};

/**
 * Overview page — matches supermock renderOverview() exactly.
 * Uses .home-h2 and .home-p styling (different from .docs-prose h2/p).
 */
export default function DocsOverview() {
  const proofStats = getProofStats();
  const proofEntries = getProofEntries();
  const agentCount = getAgentCount();
  const commandCount = getCommandCount();
  const skillCount = getSkillCount();
  const buildMeta = getBuildMeta();

  const stats = [
    { value: String(proofStats.entries), label: "verified proofs" },
    { value: String(agentCount), label: "sealed agents" },
    { value: String(commandCount), label: "CLI commands" },
    { value: String(skillCount), label: "stack-matched skills" },
    { value: "MIT", label: "free forever" },
  ];

  const overviewToc = [
    { title: "Welcome", url: "welcome", depth: 2 },
    { title: "The pipeline", url: "pipeline", depth: 2 },
    { title: "What\u2019s in these docs", url: "in-these-docs", depth: 2 },
    { title: "Where to start", url: "where-to-start", depth: 2 },
    { title: "From the proof chain", url: "proof-chain", depth: 2 },
  ];

  return (
    <div style={{ display: "flex" }}>
      <div className="docs-content-area min-w-0 flex-1" style={{ padding: "32px 120px 96px 40px" }}>
        {/* Breadcrumb */}
        <nav
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--ink-45)",
            marginBottom: "14px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <Link href="/docs" style={{ color: "var(--ink-60)", textDecoration: "none" }}>
            Docs
          </Link>
          <span style={{ opacity: 0.5 }}>/</span>
          <span style={{ color: "var(--ink-75)" }}>Overview</span>
        </nav>

        {/* Title — .page-title */}
        <h1
          id="welcome"
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
          Documentation
        </h1>

        {/* Lede — .lede */}
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
          Anatomia is an open-source pipeline that turns AI-generated code into{" "}
          <em style={{ color: "var(--ink-60)", fontStyle: "italic" }}>verified</em>{" "}
          code. It runs locally, installs as agents inside your repo, and produces
          a proof chain you can audit, replay, and trust — including the{" "}
          {proofStats.entries} proofs that built Anatomia itself.
        </p>

        <StatsStrip items={stats} />

        {/* Section heading — .home-h2 */}
        <h2
          id="pipeline"
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 500,
            fontSize: "24px",
            lineHeight: 1.15,
            letterSpacing: "-0.015em",
            color: "var(--fg)",
            margin: "8px 0 10px",
            scrollMarginTop: "90px",
          }}
        >
          The pipeline at a glance
        </h2>
        <p
          style={{
            fontSize: "14px",
            lineHeight: 1.6,
            color: "var(--ink-75)",
            maxWidth: "64ch",
            marginBottom: "22px",
            textWrap: "pretty",
          }}
        >
          Every shipped change passes through the same five stages. Each stage is a
          sealed agent with one job, specific inputs, and validated outputs.
          What&apos;s left behind is permanent — the artifacts between stages are
          your team&apos;s engineering memory, auditable and replayable.
        </p>
        <PipelineDiagram />

        <h2
          id="in-these-docs"
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 500,
            fontSize: "24px",
            lineHeight: 1.15,
            letterSpacing: "-0.015em",
            color: "var(--fg)",
            margin: "8px 0 10px",
            scrollMarginTop: "90px",
          }}
        >
          What&apos;s in these docs
        </h2>
        <p
          style={{
            fontSize: "14px",
            lineHeight: 1.6,
            color: "var(--ink-75)",
            maxWidth: "64ch",
            marginBottom: "22px",
            textWrap: "pretty",
          }}
        >
          The Reference section is auto-generated from the CLI source on every
          commit. Everything else is hand-written and reviewed.
        </p>
        <DocsGrid proofCount={proofStats.entries} />

        <h2
          id="where-to-start"
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 500,
            fontSize: "24px",
            lineHeight: 1.15,
            letterSpacing: "-0.015em",
            color: "var(--fg)",
            margin: "8px 0 10px",
            scrollMarginTop: "90px",
          }}
        >
          Where to start
        </h2>
        <p
          style={{
            fontSize: "14px",
            lineHeight: 1.6,
            color: "var(--ink-75)",
            maxWidth: "64ch",
            marginBottom: "22px",
            textWrap: "pretty",
          }}
        >
          Pick the door that matches what you&apos;re trying to do today.
        </p>
        <AudienceCards />

        <h3
          style={{
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--ink-45)",
            marginBottom: "14px",
          }}
        >
          Resources
        </h3>
        <ResourceStrip />

        <h2
          id="proof-chain"
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 500,
            fontSize: "24px",
            lineHeight: 1.15,
            letterSpacing: "-0.015em",
            color: "var(--fg)",
            margin: "8px 0 10px",
            scrollMarginTop: "90px",
          }}
        >
          From the proof chain
        </h2>
        <p
          style={{
            fontSize: "14px",
            lineHeight: 1.6,
            color: "var(--ink-75)",
            maxWidth: "64ch",
            marginBottom: "22px",
            textWrap: "pretty",
          }}
        >
          Anatomia is built with anatomia. {proofStats.entries} pipeline runs,{" "}
          {proofStats.assertions.toLocaleString()} assertions,{" "}
          {proofStats.findings} findings. These six show what the system produces.
        </p>
        <CuratedProofs entries={proofEntries} totalCount={proofStats.entries} />
      </div>
      <RightRail
        toc={overviewToc}
        commitSha={buildMeta.commitSha}
        buildTimestamp={buildMeta.buildTimestamp}
      />
    </div>
  );
}
