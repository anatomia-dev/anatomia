/**
 * Pure session-attestation shaping helpers for the web proof page.
 *
 * These mirror the CLI's `renderSessionAttestation` and `renderVerdictVeto`
 * (packages/cli/src/commands/proof.ts) — same per-agent counting, same coverage
 * ratio, same rework-indexed labels, both veto branches — with no CLI import.
 * The neutral-palette semantics (unverifiable is abstention, not failure) live
 * in the component; this layer just supplies honest counts.
 */

import type {
  ProofEntry,
  ProofAttestation,
  ProofAttestationAgent,
  ProofAttestationVerdict,
  ProofVerdictVeto,
} from './types';

/** One serialized behavioral verdict in a compliance record (subset consumed here). */
export interface AttestationVerdictInput {
  claim_id: string;
  says: string;
  status: string;
  reason: string;
}

/** One serialized compliance record in `entry.compliance` (subset consumed here). */
export interface AttestationRecordInput {
  role: string;
  anatrace_core_version?: string;
  framework?: string;
  mandate_hash?: string;
  transcript_hash?: string;
  coverage: { total: number; fully_checked: number; unverifiable: number };
  complete: boolean;
  verdicts: AttestationVerdictInput[];
}

/** The serialized `entry.verdict_veto` shape. */
export interface VetoInput {
  applied: boolean;
  reason?: string;
}

const MAX_NOTABLE = 3;

/**
 * Shape serialized compliance records into the render-ready attestation view.
 *
 * Per agent: counts the three verdict states, exposes the coverage ratio, keeps
 * up to 3 notable (non-satisfied) verdicts, and preserves the mandate/transcript
 * hashes. Labels carry a stable rework index (`build 2`) in dataset order,
 * matching the Provenance section and the CLI.
 *
 * @param compliance - The serialized `entry.compliance` records
 * @returns The render-ready {@link ProofAttestation}
 */
export function summarizeAttestation(
  compliance: AttestationRecordInput[],
): ProofAttestation {
  const first = compliance[0];
  const roleSeen: Record<string, number> = {};
  const agents: ProofAttestationAgent[] = [];
  let incompleteCount = 0;

  for (const rec of compliance) {
    const n = (roleSeen[rec.role] = (roleSeen[rec.role] ?? 0) + 1);
    const label = n > 1 ? `${rec.role} ${n}` : rec.role;

    let satisfied = 0;
    let violated = 0;
    let unverifiable = 0;
    for (const v of rec.verdicts) {
      if (v.status === 'satisfied') satisfied += 1;
      else if (v.status === 'violated') violated += 1;
      else unverifiable += 1;
    }

    const notable: ProofAttestationVerdict[] = rec.verdicts
      .filter((v) => v.status !== 'satisfied')
      .slice(0, MAX_NOTABLE)
      .map((v) => ({
        claimId: v.claim_id,
        says: v.says,
        status: v.status,
        reason: v.reason,
      }));

    if (!rec.complete) incompleteCount += 1;

    agents.push({
      label,
      role: rec.role,
      satisfied,
      violated,
      unverifiable,
      coverage: {
        checked: rec.coverage.fully_checked,
        total: rec.coverage.total,
        unverifiable: rec.coverage.unverifiable,
      },
      complete: rec.complete,
      mandateHash: rec.mandate_hash ?? '',
      transcriptHash: rec.transcript_hash ?? '',
      notable,
    });
  }

  return {
    coreVersion: first?.anatrace_core_version ?? '',
    framework: first?.framework ?? '',
    agents,
    incompleteCount,
  };
}

/**
 * Map a serialized verdict-veto record to the render-ready shape, or `null` when
 * no veto was evaluated. The reason is passed through verbatim.
 *
 * @param verdictVeto - The serialized `entry.verdict_veto`, or undefined
 * @returns The {@link ProofVerdictVeto}, or `null` when absent
 */
export function summarizeVeto(verdictVeto?: VetoInput | null): ProofVerdictVeto | null {
  if (!verdictVeto) return null;
  return { applied: verdictVeto.applied, reason: verdictVeto.reason ?? '' };
}

/**
 * The table-of-contents entry for the Session Attestation section, or `null`
 * when the proof carries neither attestation records nor a veto outcome (so
 * pre-1.3.0 proofs get no dead TOC link). Mirrors the page's render condition.
 *
 * @param entry - The proof entry
 * @returns The TOC item, or `null` when neither attestation nor veto is present
 */
export function attestationTocItem(
  entry: ProofEntry,
): { title: string; url: string; depth: number } | null {
  if (!entry.attestation && !entry.verdictVeto) return null;
  return { title: "Session Attestation", url: "#attestation", depth: 2 };
}

/**
 * The copy-as-markdown lines for the Session Attestation section — empty when the
 * proof carries neither attestation nor a veto (so old proofs' copyable content
 * stays byte-identical). Mirrors the page's render condition.
 *
 * @param entry - The proof entry
 * @returns The markdown lines (empty array when neither attestation nor veto is present)
 */
export function attestationMarkdownLines(entry: ProofEntry): string[] {
  const a = entry.attestation;
  const veto = entry.verdictVeto;
  if (!a && !veto) return [];

  const lines: string[] = ["", "## Session Attestation"];
  if (a) {
    if (a.coreVersion || a.framework) {
      lines.push(`core v${a.coreVersion || "?"} · framework ${a.framework || "?"}`);
    }
    for (const agent of a.agents) {
      lines.push(
        `- ${agent.label}: ${agent.coverage.total} claims · ${agent.satisfied} satisfied · ${agent.violated} violated · ${agent.unverifiable} unverifiable`,
      );
      lines.push(
        `  coverage ${agent.coverage.checked}/${agent.coverage.total} checked · ${agent.coverage.unverifiable} unverifiable`,
      );
    }
  }
  if (veto) {
    lines.push(
      veto.applied
        ? `verdict veto: APPLIED — ${veto.reason || "verify read build_report.md"} (forward-only)`
        : `verdict veto: not applied — ${veto.reason || "no captured transcript"}`,
    );
  }
  return lines;
}
