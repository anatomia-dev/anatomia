import type { Metadata } from "next";
import {
  getProofEntries,
  getProofStats,
  getAgentCount,
  getCommandCount,
  getSkillCount,
} from "@/lib/docs-data";
import { StatsStrip } from "@/components/docs/content/StatsStrip";
import { PipelineDiagram } from "@/components/docs/content/PipelineDiagram";
import { AudienceCards } from "@/components/docs/content/AudienceCards";
import { CuratedProofs } from "@/components/docs/content/CuratedProofs";
import { ResourceStrip } from "@/components/docs/content/ResourceStrip";

export const metadata: Metadata = {
  title: "Anatomia Documentation",
  description:
    "Verified AI development. Five agents scope, plan, build, verify, and learn from every change.",
};

export default function DocsOverview() {
  const proofStats = getProofStats();
  const proofEntries = getProofEntries();
  const agentCount = getAgentCount();
  const commandCount = getCommandCount();
  const skillCount = getSkillCount();

  const stats = [
    { value: String(proofStats.entries), label: "verified proofs" },
    { value: String(agentCount), label: "sealed agents" },
    { value: String(commandCount), label: "CLI commands" },
    { value: String(skillCount), label: "stack-matched skills" },
  ];

  return (
    <article className="docs-prose min-w-0 flex-1">
      <h1>Anatomia Documentation</h1>
      <p
        className="text-[15px] leading-relaxed"
        style={{ color: "var(--ink-60)" }}
      >
        Verified AI development. Five agents scope, plan, build, verify, and
        learn from every change. Contracts are sealed before code is written.
        Every run produces a proof chain entry.
      </p>

      <StatsStrip items={stats} />
      <PipelineDiagram />

      <h2>Where to start</h2>
      <AudienceCards />

      <h2>Proof chain</h2>
      <p
        className="text-[14px] leading-relaxed"
        style={{ color: "var(--ink-60)" }}
      >
        Every pipeline run produces a proof chain entry — what was asserted, what
        was found, what shipped. These are real proofs from this project.
      </p>
      <CuratedProofs entries={proofEntries} totalCount={proofStats.entries} />

      <h2>Resources</h2>
      <ResourceStrip />
    </article>
  );
}
