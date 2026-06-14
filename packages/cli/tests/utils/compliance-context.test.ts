/**
 * Adversarial soundness suite for {@link buildRootLaneContext} (Phase 2, Step 1).
 *
 * This is the definition of done for the correctness hinge. Each test runs the
 * REAL `anatrace-core` engine — `anatomiaAdapter.extract` to build the mandate
 * from a real agent-def (`.claude/agents/ana-verify.md`) plus a `contract.yaml`
 * with a runtime assertion, `parseSession` over an inline fixture, and
 * `runCompliance` with the context this module builds — and asserts the engine
 * NEVER over-states coverage:
 *
 *  - a delegate-inclusive negative claim resolves `unverifiable` (AC11/A014);
 *  - a channel absent from the captured root transcript never resolves
 *    `satisfied` (AC8/A015) — exercised on a Codex fixture (`codex-blind`);
 *  - a runtime-scoped `contract-matcher` claim never resolves `satisfied`
 *    (AC16/A016);
 *  - the constructed coverage marks NO delegate lane `captured: true`
 *    (AC14/A017 — the fail-closed guard);
 *  - the `unverifiable` reason varies by subject — we assert MEMBERSHIP of a set,
 *    never a single literal (the AC8 trap).
 *
 * Build note / delta from spec: `anatomiaAdapter` does not emit a
 * `subject.delegates: 'include'` claim from the current Anatomia agent-defs (all
 * extracted claims carry an absent subject — the legacy flat session union). To
 * exercise the delegate-inclusive arm against the SAME real adapter output, we
 * take a real extracted command-run claim and set its `subject` to the
 * delegate-inclusive value the published `ClaimSubject` type defines. The base
 * mandate is genuine adapter output; only the WHO-axis of one claim is set to the
 * value under test. This follows core's actual reconciliation behavior (verified:
 * the same claim is `satisfied` when scoped to the observed root and flips to
 * `unverifiable` once it claims delegate coverage we did not capture).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  anatomiaAdapter,
  parseSession,
  runCompliance,
  transcriptContentResolver,
} from 'anatrace-core';
import type {
  ComplianceVerdict,
  Mandate,
  NamedBlob,
  NormalizedSession,
} from 'anatrace-core';
import { buildRootLaneContext } from '../../src/utils/compliance-context.js';

const enc = new TextEncoder();
const here = path.dirname(fileURLToPath(import.meta.url));
/** Repo root agent-def — a real, structured Anatomia agent-def the adapter recognizes. */
const VERIFY_AGENT_DEF = path.resolve(here, '../../../../.claude/agents/ana-verify.md');

/** A `contract.yaml` carrying one runtime (`contract-matcher`) assertion — the AC16 subject. */
const CONTRACT_YAML = `version: "1.0"
assertions:
  - id: A001
    says: "Tests pass"
    target: "x"
    matcher: "equals"
    value: "1"
`;

/** Build the real mandate from the verify agent-def + a runtime contract assertion. */
function buildMandate(): Mandate {
  const agentDef = fs.readFileSync(VERIFY_AGENT_DEF);
  const mandate = anatomiaAdapter.extract([
    { name: 'ana-verify.md', bytes: new Uint8Array(agentDef) },
    { name: 'contract.yaml', bytes: enc.encode(CONTRACT_YAML) },
  ]);
  if (!mandate) throw new Error('adapter returned null for a real agent-def');
  return mandate;
}

/**
 * A Claude root transcript that DISPATCHES a sub-agent (a `Task` tool_use) but
 * carries no child transcript — so `extractLineage` observes a delegate that was
 * never captured. This is the adversarial case for delegate-inclusive claims.
 */
function claudeWithDelegateBlobs(): NamedBlob[] {
  const lines = [
    {
      type: 'assistant',
      requestId: 'r1',
      timestamp: '2026-06-01T00:00:00.000Z',
      message: {
        id: 'm1',
        model: 'claude-opus-4-6',
        usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        content: [
          { type: 'tool_use', id: 'tu_task', name: 'Task', input: { subagent_type: 'Explore', description: 'go look', prompt: 'do it' } },
        ],
      },
    },
    {
      type: 'user',
      timestamp: '2026-06-01T00:00:05.000Z',
      message: { content: [{ type: 'tool_result', tool_use_id: 'tu_task', content: 'done' }] },
    },
  ];
  return [{ name: 'sess.jsonl', bytes: enc.encode(lines.map((l) => JSON.stringify(l)).join('\n') + '\n') }];
}

/** A Codex root rollout — the skill channel is unobservable here (`codex-blind`). */
function codexBlobs(): NamedBlob[] {
  const lines = [
    { type: 'session_meta', timestamp: '2026-06-01T00:00:00.000Z', payload: { id: 'cx-1', model: null, cwd: '/proj' } },
    { type: 'turn_context', timestamp: '2026-06-01T00:00:01.000Z', payload: { turn_id: 't1', model: 'gpt-5.5' } },
    { type: 'response_item', timestamp: '2026-06-01T00:00:03.000Z', payload: { type: 'message', role: 'assistant', content: 'ok' } },
  ];
  return [{ name: 'rollout-2026-cx-1.jsonl', bytes: enc.encode(lines.map((l) => JSON.stringify(l)).join('\n') + '\n') }];
}

function parse(blobs: NamedBlob[], harness: 'claude' | 'codex'): NormalizedSession {
  const s = parseSession(blobs, harness);
  if (!s) throw new Error('fixture failed to parse');
  return s;
}

function verdictFor(verdicts: ComplianceVerdict[], predicate: (v: ComplianceVerdict) => boolean): ComplianceVerdict {
  const v = verdicts.find(predicate);
  if (!v) throw new Error('expected a matching verdict');
  return v;
}

/** Reasons core may emit for an unverifiable DELEGATE-inclusive claim (membership, never a literal). */
const DELEGATE_UNVERIFIABLE_REASONS = ['delegate-coverage-incomplete', 'subject-unresolvable'];
/** Reasons core may emit for an unverifiable UNOBSERVED-CHANNEL claim (membership, never a literal). */
const CHANNEL_UNVERIFIABLE_REASONS = ['channel-coverage-incomplete', 'codex-blind', 'absent-signal'];

describe('buildRootLaneContext — sound coverage construction', () => {
  // @ana A013
  it('declares trusted-launcher capture coverage (AC13)', () => {
    const blobs = claudeWithDelegateBlobs();
    const ctx = buildRootLaneContext(parse(blobs, 'claude'), blobs);
    expect(ctx.captureCoverage?.source).toBe('trusted-launcher');
    expect(ctx.thisAgent).toEqual({ kind: 'root' });
  });

  // @ana A017
  it('never marks a delegate lane captured — even when a delegate was observed (AC14/A017 fail-closed guard)', () => {
    const blobs = claudeWithDelegateBlobs();
    const ctx = buildRootLaneContext(parse(blobs, 'claude'), blobs);
    const lanes = ctx.captureCoverage?.lanes ?? [];
    // Root is captured; NO non-root lane is ever captured: true.
    const anyDelegateCaptured = lanes.some((l) => l.agent.kind !== 'root' && l.captured);
    expect(anyDelegateCaptured).toBe(false);
    // And root itself IS captured (its bytes were checked) — otherwise everything
    // would be unverifiable and the suite would pass vacuously.
    expect(lanes.some((l) => l.agent.kind === 'root' && l.captured)).toBe(true);
  });

  // @ana A014
  it('resolves a delegate-inclusive negative to unverifiable under root-only capture (AC11/A014)', () => {
    const base = buildMandate();
    // Take a real extracted command-run negative and widen its subject to include
    // delegates (the WHO-axis value under test — see file header delta note).
    const target = base.claims.find((c) => c.id.includes('git-push---force'));
    expect(target, 'expected a real git-push--force command-run claim from the adapter').toBeTruthy();
    const mandate: Mandate = {
      ...base,
      claims: base.claims.map((c) =>
        c.id === target!.id
          ? ({ ...c, subject: { kind: 'agent', selector: 'this', delegates: 'include' } } as typeof c)
          : c,
      ),
    };

    const blobs = claudeWithDelegateBlobs();
    const session = parse(blobs, 'claude');
    const ctx = buildRootLaneContext(session, blobs);
    const res = runCompliance(mandate, session, transcriptContentResolver(session), undefined, process.cwd(), ctx);

    const v = verdictFor(res.verdicts, (x) => x.claimId === target!.id);
    // The single invariant: a claim covering sub-agents we did not capture is
    // NEVER satisfied. It MUST be unverifiable (A014 asserts equality).
    expect(v.status).toBe('unverifiable');
    expect(v.status).not.toBe('satisfied');
    expect(DELEGATE_UNVERIFIABLE_REASONS).toContain(v.reason);
  });

  // @ana A015
  it('never resolves an unobserved channel to satisfied — Codex skill channel is blind (AC8/A015)', () => {
    const mandate = buildMandate();
    const blobs = codexBlobs();
    const session = parse(blobs, 'codex');
    const ctx = buildRootLaneContext(session, blobs);
    const res = runCompliance(mandate, session, transcriptContentResolver(session), undefined, process.cwd(), ctx);

    // skill-invoked claims target a channel that cannot be observed in a Codex
    // root transcript — they must never be satisfied.
    const skillVerdicts = res.verdicts.filter((v) => v.claimId.includes(':skill:'));
    expect(skillVerdicts.length).toBeGreaterThan(0);
    for (const v of skillVerdicts) {
      expect(v.status).not.toBe('satisfied');
      expect(CHANNEL_UNVERIFIABLE_REASONS).toContain(v.reason);
    }
    // At least one carries the Codex-specific blindness reason (codex-blind),
    // proving the harness was actually exercised.
    expect(skillVerdicts.some((v) => v.reason === 'codex-blind')).toBe(true);
  });

  // @ana A016
  it('never surfaces a runtime contract assertion as a satisfied behavioral verdict (AC16/A016)', () => {
    const mandate = buildMandate();
    const blobs = claudeWithDelegateBlobs();
    const session = parse(blobs, 'claude');
    const ctx = buildRootLaneContext(session, blobs);
    const res = runCompliance(mandate, session, transcriptContentResolver(session), undefined, process.cwd(), ctx);

    const v = verdictFor(res.verdicts, (x) => x.claimId === 'contract:A001');
    expect(v.status).not.toBe('satisfied');
    expect(v.status).toBe('unverifiable');
    expect(v.reason).toBe('runtime-scoped');
  });

  it('emits subject-dependent unverifiable reasons (no single hard-coded literal — AC8 trap)', () => {
    // The runtime claim and the Codex skill claim are BOTH unverifiable but for
    // DIFFERENT reasons — proving display/tests must not hard-code one literal.
    const mandate = buildMandate();
    const cxBlobs = codexBlobs();
    const cxSession = parse(cxBlobs, 'codex');
    const cxRes = runCompliance(
      mandate,
      cxSession,
      transcriptContentResolver(cxSession),
      undefined,
      process.cwd(),
      buildRootLaneContext(cxSession, cxBlobs),
    );
    const reasons = new Set(
      cxRes.verdicts.filter((v) => v.status === 'unverifiable').map((v) => v.reason),
    );
    // runtime-scoped (contract:A001) AND codex-blind (skill channel) both present.
    expect(reasons.has('runtime-scoped')).toBe(true);
    expect(reasons.has('codex-blind')).toBe(true);
    expect(reasons.size).toBeGreaterThan(1);
  });
});
