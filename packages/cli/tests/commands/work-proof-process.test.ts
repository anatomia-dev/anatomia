/**
 * Tests for ProcessAttestation assembly at work-complete (capture v2).
 *
 * `assembleProcessAttestation` now reads the committed per-session provenance
 * files under `.ana/plans/completed/{slug}/provenance/*.json` — no home buffer,
 * no worktree-path matching, no re-derive. Each file is a self-contained
 * SessionProvenance with its own derived counts. It is provenance ONLY —
 * counts/outcome/task-shape/churn, never findings or verdicts.
 *
 * Returns `null` ONLY when capture is off. Capture-on ALWAYS returns an
 * attestation — even with zero committed files (`sessions: []`) — so a gap is
 * recorded, never silently hidden.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { assembleProcessAttestation } from '../../src/commands/work-proof.js';
import type { SessionProvenance } from '../../src/types/proof.js';
import type { ProofSummary } from '../../src/utils/proofSummary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// @ana A017
it('work-proof.ts no longer defines the fragile worktree-path matcher', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../src/commands/work-proof.ts'), 'utf-8');
  expect(src).not.toContain('recordBelongsToWorktree');
});

describe('assembleProcessAttestation', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-proj-'));
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  /** Write a project ana.json with the given processCapture state. */
  function writeAnaJson(processCapture: 'on' | 'off'): void {
    const anaDir = path.join(projectRoot, '.ana');
    fs.mkdirSync(anaDir, { recursive: true });
    fs.writeFileSync(
      path.join(anaDir, 'ana.json'),
      JSON.stringify({ artifactBranch: 'main', processCapture }),
      'utf-8',
    );
  }

  /** Build a committed SessionProvenance object. */
  function prov(
    role: string,
    sessionId: string,
    capturedAt: string,
    over: Partial<SessionProvenance> = {},
    inputTokens = 1000,
    model = 'claude-opus-4-6',
  ): SessionProvenance {
    return {
      role,
      harness: 'claude',
      model,
      agent_def_hash: `sha256:${role}`,
      cli_version: '1.2.2',
      session_id: sessionId,
      captured_at: capturedAt,
      derived: {
        tokens: { input: inputTokens, output: 100, cache_create: 0, cache_read: 0 },
        price_table_version: '2026-06-01',
        duration_ms: 1000,
        turns: 1,
        tool_calls: 1,
        commands_run: 1,
        tests_executed: 0,
        failures_encountered: 0,
        files_touched: 1,
        model,
      },
      ...over,
    };
  }

  /** Seed one committed provenance file under completed/{slug}/provenance/. */
  function seedProvenance(slug: string, p: SessionProvenance, fileName?: string): void {
    const dir = path.join(projectRoot, '.ana', 'plans', 'completed', slug, 'provenance');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, fileName ?? `${p.role}-${p.session_id}.json`),
      JSON.stringify(p, null, 2),
      'utf-8',
    );
  }

  /** A proof summary with the given rejection_cycles and findings. */
  function makeProof(overrides: Partial<ProofSummary> = {}): ProofSummary {
    return {
      feature: 'Test',
      result: 'PASS',
      author: { name: 'T', email: 't@t.com' },
      assertions: [],
      contract: { total: 14, satisfied: 14, unsatisfied: 0, deviated: 0 },
      acceptance_criteria: { total: 4, met: 4 },
      timing: { total_minutes: 10 },
      deviations: [],
      hashes: {},
      completed_at: '2026-06-01T00:00:00.000Z',
      kind: 'feature',
      findings: [
        { category: 'code', summary: 'a', file: null, anchor: null, severity: 'debt' },
        { category: 'code', summary: 'b', file: null, anchor: null, severity: 'observation' },
        { category: 'code', summary: 'c', file: null, anchor: null, severity: 'observation' },
      ],
      rejection_cycles: 0,
      previous_failures: [],
      build_concerns: [],
      ...overrides,
    };
  }

  const SCOPE = '## Complexity Assessment\n- **Size:** large\n- **Multi-phase:** yes\n';
  const churn = { 'packages/cli/src/commands/run.ts': { added: 41, deleted: 6 } };

  it('attaches an attestation, one session per committed provenance file', () => {
    writeAnaJson('on');
    seedProvenance('feat', prov('build', 'sess-feat', '2026-06-01T01:00:00.000Z'));

    const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);

    expect(att).not.toBeNull();
    expect(att!.sessions).toHaveLength(1);
    expect(att!.sessions[0]!.session_id).toBe('sess-feat');
    expect(att!.sessions[0]!.role).toBe('build');
    expect(att!.sessions[0]!.derived!.tokens.input).toBe(1000);
    expect(att!.sessions[0]!.model).toBe('claude-opus-4-6');
    expect(att!.module_churn).toEqual(churn);
  });

  // @ana A018
  it('returns one SessionProvenance per committed file (plan + build + verify = 3)', () => {
    writeAnaJson('on');
    seedProvenance('feat', prov('plan', 'sess-plan', '2026-06-01T00:30:00.000Z'));
    seedProvenance('feat', prov('build', 'sess-build', '2026-06-01T01:00:00.000Z'));
    seedProvenance('feat', prov('verify', 'sess-verify', '2026-06-01T02:00:00.000Z', {}, 500, 'claude-sonnet-4-6'));

    const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);

    expect(att).not.toBeNull();
    expect(att!.sessions).toHaveLength(3);
    expect(att!.sessions.map((s) => s.role)).toEqual(['plan', 'build', 'verify']);
  });

  it('orders sessions by captured_at, then role (seeded out of order)', () => {
    writeAnaJson('on');
    // Seed in a non-chronological filename order; captured_at drives the result.
    seedProvenance('feat', prov('verify', 'sv', '2026-06-01T03:00:00.000Z'));
    seedProvenance('feat', prov('plan', 'sp', '2026-06-01T01:00:00.000Z'));
    seedProvenance('feat', prov('build', 'sb', '2026-06-01T02:00:00.000Z'));
    // Same captured_at as plan → role breaks the tie ('build' < 'plan').
    seedProvenance('feat', prov('build', 'sb2', '2026-06-01T01:00:00.000Z'));

    const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
    expect(att!.sessions.map((s) => s.captured_at)).toEqual([
      '2026-06-01T01:00:00.000Z',
      '2026-06-01T01:00:00.000Z',
      '2026-06-01T02:00:00.000Z',
      '2026-06-01T03:00:00.000Z',
    ]);
    // At 01:00 the tie breaks by role: 'build' (sb2) before 'plan' (sp). Then the
    // 02:00 entry is build, and the 03:00 is verify.
    expect(att!.sessions.map((s) => s.role)).toEqual(['build', 'plan', 'build', 'verify']);
  });

  it('reports first_pass_verify from rejection_cycles', () => {
    writeAnaJson('on');
    seedProvenance('feat', prov('build', 'sess-feat', '2026-06-01T01:00:00.000Z'));

    expect(
      assembleProcessAttestation(projectRoot, 'feat', makeProof({ rejection_cycles: 0 }), churn, SCOPE, true)!
        .outcome.first_pass_verify,
    ).toBe(true);
    expect(
      assembleProcessAttestation(projectRoot, 'feat', makeProof({ rejection_cycles: 2 }), churn, SCOPE, true)!
        .outcome.first_pass_verify,
    ).toBe(false);
  });

  it('joins outcome and task_shape correctly', () => {
    writeAnaJson('on');
    seedProvenance('feat', prov('build', 'sess-feat', '2026-06-01T01:00:00.000Z'));

    const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
    expect(att!.outcome.assertions_satisfied).toBe(14);
    expect(att!.outcome.assertions_total).toBe(14);
    expect(att!.outcome.findings).toEqual({ risk: 0, debt: 1, observation: 2 });
    expect(att!.task_shape).toEqual({ size: 'large', kind: 'feature', multi_phase: true });
  });

  it('keeps repeated build attempts from rejection cycles (rework is wanted data)', () => {
    writeAnaJson('on');
    seedProvenance('feat', prov('build', 'sess-build-1', '2026-06-01T01:00:00.000Z'));
    seedProvenance('feat', prov('build', 'sess-build-2', '2026-06-01T03:00:00.000Z', {}, 1200));

    const att = assembleProcessAttestation(projectRoot, 'feat', makeProof({ rejection_cycles: 1 }), churn, SCOPE, true);
    expect(att!.sessions).toHaveLength(2);
    expect(att!.sessions.map((s) => s.session_id)).toEqual(['sess-build-1', 'sess-build-2']);
  });

  it('keeps a metadata-only session (no derived block) — never dropped', () => {
    writeAnaJson('on');
    const p = prov('build', 'sess-nocounts', '2026-06-01T01:00:00.000Z');
    delete p.derived; // transcript was unreadable at capture → derived omitted
    seedProvenance('feat', p);

    const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
    expect(att!.sessions).toHaveLength(1);
    expect(att!.sessions[0]!.session_id).toBe('sess-nocounts');
    expect(att!.sessions[0]!.model).toBe('claude-opus-4-6');
    expect(att!.sessions[0]!.derived).toBeUndefined();
  });

  it('skips an unparseable provenance file, never throws', () => {
    writeAnaJson('on');
    seedProvenance('feat', prov('build', 'sess-good', '2026-06-01T01:00:00.000Z'));
    const dir = path.join(projectRoot, '.ana', 'plans', 'completed', 'feat', 'provenance');
    fs.writeFileSync(path.join(dir, 'verify-bad.json'), '{ not valid json', 'utf-8');

    const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
    expect(att!.sessions).toHaveLength(1);
    expect(att!.sessions[0]!.session_id).toBe('sess-good');
  });

  it('is deterministic — assembling twice yields JSON-identical output', () => {
    writeAnaJson('on');
    seedProvenance('feat', prov('build', 'sess-build', '2026-06-01T01:00:00.000Z'));
    seedProvenance('feat', prov('verify', 'sess-verify', '2026-06-01T02:00:00.000Z', {}, 500, 'claude-sonnet-4-6'));

    const a = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
    const b = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  // @ana A019
  it('returns null when capture is off (proof omits the field)', () => {
    writeAnaJson('off');
    seedProvenance('feat', prov('build', 'sess-feat', '2026-06-01T01:00:00.000Z'));

    expect(assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true)).toBeNull();
  });

  // @ana A020
  it('returns an attestation with sessions:[] when capture is on but no files exist', () => {
    writeAnaJson('on');
    // No provenance dir seeded at all.
    const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
    expect(att).not.toBeNull();
    expect(att!.sessions).toEqual([]);
    // The work-item-level joins are still present so the gap is recorded in context.
    expect(att!.module_churn).toEqual(churn);
    expect(att!.outcome.assertions_total).toBe(14);
  });

  it('ignores home state entirely — only committed files count', () => {
    writeAnaJson('on');
    // A pending pointer / home buffer must have zero influence on assembly.
    const home = process.env['HOME'];
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-home-'));
    fs.mkdirSync(path.join(tmpHome, '.ana', 'forensics', 'pending'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, '.ana', 'forensics', 'pending', 'run-x.json'),
      JSON.stringify({ session_id: 'ghost', transcript_path: '', model: '', source: 's', captured_at: 'x' }),
      'utf-8',
    );
    process.env['HOME'] = tmpHome;
    try {
      seedProvenance('feat', prov('build', 'sess-feat', '2026-06-01T01:00:00.000Z'));
      const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
      expect(att!.sessions.map((s) => s.session_id)).toEqual(['sess-feat']);
    } finally {
      if (home === undefined) delete process.env['HOME'];
      else process.env['HOME'] = home;
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });
});
