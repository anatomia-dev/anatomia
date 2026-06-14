/**
 * Behavioral attestation lifecycle (Phase 2) — the save-time producer and the
 * complete-time reader.
 *
 * This is the MIRROR of the provenance pipeline, one layer over: where forensics
 * derives deterministic COUNTS from a transcript, this derives deterministic,
 * coverage-aware VERDICTS about how the session behaved (did Verify avoid the
 * build report, did Build stay in file scope, was there egress). The judging is
 * done entirely by the published `anatrace-core` engine; Anatomia's only job is to
 * hand core a SOUND coverage context (see {@link buildRootLaneContext}) and to
 * persist core's verdict as a compact, scrubbed, committed record.
 *
 *  1. {@link captureComplianceAtSave} runs at `ana artifact save`, while the
 *     transcript is still on disk, and writes one
 *     `.ana/plans/active/{slug}/compliance/{role}-{session_id}.json` per
 *     transcript. It is TOTAL — any failure returns `null` and the save completes
 *     with the record simply absent. It runs BEFORE `captureProvenanceAtSave` at
 *     each save site, because provenance consumes (deletes) the pending pointer.
 *  2. {@link assembleComplianceAttestations} runs at `ana work complete` and reads
 *     the committed records onto the proof entry — skip-unparseable, never throws.
 *
 * The record is EVIDENCE, never a gate: a `violated` verdict is stored and
 * rendered but never changes a proof's PASS/FAIL.
 */

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  anatomiaAdapter,
  parseSession,
  runCompliance,
  scrubDeep,
  transcriptContentResolver,
} from 'anatrace-core';
import type { Harness, Mandate, NamedBlob } from 'anatrace-core';
import {
  isProcessCaptureEnabled,
  readPendingPointer,
  resolveTranscriptPath,
} from './forensics.js';
import { buildRootLaneContext } from './compliance-context.js';
import type { ComplianceAttestation, ComplianceVerdictRecord } from '../types/proof.js';

/**
 * Resolve the installed `anatrace-core` version from its package.json (never hardcoded).
 *
 * @returns The core version string, or `''` if it cannot be read
 */
function readCoreVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('anatrace-core/package.json') as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : '';
  } catch {
    return '';
  }
}

/**
 * The agent-def filename for a pipeline role.
 *
 * Think runs as `ana.md`; every other role runs as `ana-{role}.md`. Mirrors
 * `run.ts resolveAgentDefPath`'s `{agentName}.md` convention.
 *
 * @param role - Pipeline role (`build` | `verify` | `plan` | `ana` | …)
 * @returns The agent-def basename (e.g. `ana-build.md`)
 */
function agentDefFilename(role: string): string {
  return role === 'ana' ? 'ana.md' : `ana-${role}.md`;
}

/**
 * Read the role's agent-def `.md` and the work item's `contract.yaml` into core
 * {@link NamedBlob}s, keyed by filename (the adapter keys mandates by filename).
 *
 * The agent-def is REQUIRED — without it there is no behavioral mandate, so the
 * caller writes no record. The contract is OPTIONAL: when present it contributes
 * the runtime `contract-matcher` claims (which core always resolves
 * `unverifiable`/`runtime-scoped` — never a faked behavioral pass).
 *
 * @param projectRoot - Project root directory (the save cwd / worktree)
 * @param slug - Work-item slug being saved
 * @param role - Pipeline role whose agent-def defines the mandate
 * @param harness - Harness that ran (`claude` reads `.claude/agents`, `codex` reads `.codex/agents`)
 * @returns The mandate-source blobs, or `null` when the agent-def is unreadable
 */
function readMandateBlobs(
  projectRoot: string,
  slug: string,
  role: string,
  harness: string,
): { blobs: NamedBlob[]; mandateHash: string } | null {
  const agentsDir = harness === 'codex' ? '.codex' : '.claude';
  const agentDefName = agentDefFilename(role);
  const agentDefPath = path.join(projectRoot, agentsDir, 'agents', agentDefName);

  let agentDefBytes: Uint8Array;
  try {
    agentDefBytes = fs.readFileSync(agentDefPath);
  } catch {
    return null; // no agent-def → no mandate → no record
  }

  const blobs: NamedBlob[] = [{ name: agentDefName, bytes: agentDefBytes }];
  const hash = createHash('sha256').update(agentDefBytes);

  // Contract is optional — fold it in when readable so its runtime assertions are
  // present in the mandate (and in the byte-identity mandate hash).
  const contractPath = path.join(projectRoot, '.ana', 'plans', 'active', slug, 'contract.yaml');
  try {
    const contractBytes = fs.readFileSync(contractPath);
    blobs.push({ name: 'contract.yaml', bytes: contractBytes });
    hash.update(contractBytes);
  } catch {
    // No contract — agent-def-only mandate is still meaningful.
  }

  return { blobs, mandateHash: 'sha256:' + hash.digest('hex') };
}

/**
 * Capture one session's behavioral attestation at `ana artifact save` time.
 *
 * TOTAL — wrapped in a single outer try-catch so a malformed transcript, an
 * adapter exception, or a `runCompliance` failure all return `null`: the save
 * completes and the record is simply absent (never breaks a save or the live
 * session). Resolves the session like {@link captureProvenanceAtSave} but does
 * NOT consume the pending pointer (provenance deletes it; this MUST run first).
 *
 * Pipeline: resolve session → read transcript bytes (+ `transcript_hash`) →
 * `parseSession` → assemble the mandate from the role's agent-def + the work
 * item's contract → {@link buildRootLaneContext} (sound, root-only coverage) →
 * `runCompliance` → build one {@link ComplianceAttestation}, `scrubDeep` it,
 * write `.ana/plans/active/{slug}/compliance/{role}-{session_id}.json`.
 *
 * No record is written when: capture is off, there is no role, the session is
 * unresolvable, the transcript is unreadable/unparsable, the agent-def is
 * missing, or the mandate has no claims.
 *
 * @param projectRoot - Project root directory
 * @param slug - Work-item slug being saved
 * @param env - Process environment (carries the injected `ANA_*` vars)
 * @returns The absolute path of the written compliance file, or `null` if none was written
 */
export function captureComplianceAtSave(
  projectRoot: string,
  slug: string,
  env: Record<string, string | undefined>,
): string | null {
  try {
    if (!isProcessCaptureEnabled(projectRoot)) return null;

    const role = env['ANA_ROLE'] ?? '';
    if (!role) return null; // no role → nothing to attribute

    const harness = env['ANA_HARNESS'] || 'claude';
    const runId = env['ANA_RUN_ID'] ?? '';
    // Read the pointer but DO NOT delete it — captureProvenanceAtSave (which runs
    // AFTER this at each save site) owns pointer consumption. Codex has no env
    // fallback once the pointer is gone, so order matters.
    const pointer = runId ? readPendingPointer(runId) : null;

    let sessionId = pointer?.session_id ?? '';
    let transcriptPath = pointer?.transcript_path ?? '';

    // Claude fallback: recover the session id from the harness env when no pointer
    // was written. Codex has no such env → no fallback.
    if (!sessionId && harness !== 'codex') {
      sessionId = env['CLAUDE_CODE_SESSION_ID'] ?? '';
    }
    if (!sessionId) return null; // unresolvable session → nothing to write

    if (!transcriptPath) {
      transcriptPath = resolveTranscriptPath(env, sessionId, '', harness);
    }
    if (!transcriptPath) return null; // no transcript bytes → nothing to judge

    // Read the transcript bytes ONCE so the verdicts and the transcript_hash
    // attest the exact same bytes.
    let bytes: Uint8Array;
    try {
      bytes = fs.readFileSync(transcriptPath);
    } catch {
      return null; // unreadable transcript → no record
    }
    const transcriptHash = 'sha256:' + createHash('sha256').update(bytes).digest('hex');

    const transcriptName = path.basename(transcriptPath);
    const sessionBlobs: NamedBlob[] = [{ name: transcriptName, bytes }];
    const session = parseSession(sessionBlobs, harness as Harness);
    if (session === null) return null; // unparsable transcript → no record

    const mandateSource = readMandateBlobs(projectRoot, slug, role, harness);
    if (mandateSource === null) return null; // no agent-def → no mandate
    const mandate: Mandate | null = anatomiaAdapter.extract(mandateSource.blobs);
    if (mandate === null || mandate.claims.length === 0) return null; // empty mandate → no record

    const context = buildRootLaneContext(session, sessionBlobs, env['ANA_CAPTURE_BOUNDARY']);
    const result = runCompliance(
      mandate,
      session,
      transcriptContentResolver(session),
      undefined,
      projectRoot,
      context,
    );

    // Project verdicts to the compact, scrubbed record shape. `says` comes from
    // the mandate claim (NEVER from transcript bytes); evidence pointers are
    // dropped entirely.
    const saysById = new Map<string, string>();
    for (const c of mandate.claims) saysById.set(c.id, c.says);
    const verdicts: ComplianceVerdictRecord[] = result.verdicts.map((v) => ({
      claim_id: v.claimId,
      says: saysById.get(v.claimId) ?? '',
      status: v.status,
      reason: v.reason,
    }));

    const cov = result.verificationCoverage;
    const unverifiable = cov.unverifiableClaims.length;
    const record: ComplianceAttestation = {
      role,
      harness,
      session_id: sessionId,
      captured_at: pointer?.captured_at || new Date().toISOString(),
      anatrace_core_version: readCoreVersion(),
      framework: mandate.framework,
      mandate_hash: mandateSource.mandateHash,
      transcript_hash: transcriptHash,
      coverage: {
        total: cov.totalClaims,
        fully_checked: cov.fullyCheckedClaims,
        unverifiable,
      },
      complete: unverifiable === 0,
      verdicts,
    };

    // Scrub is mandatory — the whole record passes scrubDeep before write so no
    // token-bearing string can ever land in committed git history.
    const scrubbed = scrubDeep(record);

    const dir = path.join(projectRoot, '.ana', 'plans', 'active', slug, 'compliance');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${role}-${sessionId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(scrubbed, null, 2) + '\n', 'utf-8');
    return filePath;
  } catch {
    return null; // Total: a capture failure must never break a save.
  }
}

/**
 * Assemble the committed behavioral attestations for a completed work item.
 *
 * Reads every `.ana/plans/completed/{slug}/compliance/*.json` (the active dir is
 * copied to `completed/` at `ana work complete`), skipping any unparseable file,
 * and returns them in a deterministic order (by `captured_at`, then role). Never
 * throws — a missing dir yields an empty array. Mirrors
 * `assembleProcessAttestation`'s committed-record read loop; capture-on gating is
 * the caller's responsibility.
 *
 * @param projectRoot - Project root directory
 * @param slug - Completed work-item slug
 * @returns The committed behavioral records, deterministically ordered (possibly empty)
 */
export function assembleComplianceAttestations(
  projectRoot: string,
  slug: string,
): ComplianceAttestation[] {
  const dir = path.join(projectRoot, '.ana', 'plans', 'completed', slug, 'compliance');
  const records: ComplianceAttestation[] = [];
  try {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as unknown;
        if (typeof parsed === 'object' && parsed !== null) {
          records.push(parsed as ComplianceAttestation);
        }
      } catch {
        // an unparseable compliance file is skipped, never thrown
      }
    }
  } catch {
    // No compliance dir → zero committed records.
  }

  records.sort((a, b) => {
    const at = a.captured_at ?? '';
    const bt = b.captured_at ?? '';
    if (at !== bt) return at < bt ? -1 : 1;
    return a.role < b.role ? -1 : a.role > b.role ? 1 : 0;
  });
  return records;
}
