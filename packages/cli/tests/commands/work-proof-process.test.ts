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
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { assembleProcessAttestation, computeCompleteness } from '../../src/commands/work-proof.js';
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
      derive_version: '3',
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

  /** Seed a saved report file under completed/{slug}/ (drives expected counts). */
  function seedReport(slug: string, fileName: string): void {
    const dir = path.join(projectRoot, '.ana', 'plans', 'completed', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fileName), '# report', 'utf-8');
  }

  /** A proof summary with the given rejection_cycles and findings. */
  function makeProof(overrides: Partial<ProofSummary> = {}): ProofSummary {
    return {
      feature: 'Test',
      result: 'PASS',
      author: { name: 'T', email: 't@t.com' },
      assertions: [],
      contract: { total: 14, satisfied: 14, unsatisfied: 0, deviated: 0 },
      acceptance_criteria: { total: 4, met: 4, partial: 0, coverage: { pinned: 0, judgment: 0, retired: 0, uncovered: 0, weak_only: 0 } },
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

  // @ana A007
  it('reads a legacy provenance record written before derive_version/transcript_hash', () => {
    writeAnaJson('on');
    // A record committed before this change: no transcript_hash on the wrapper and
    // no derive_version inside derived. Written as raw JSON (not via prov()) so the
    // absent fields are genuinely missing, not undefined keys.
    const dir = path.join(projectRoot, '.ana', 'plans', 'completed', 'feat', 'provenance');
    fs.mkdirSync(dir, { recursive: true });
    const legacy = {
      role: 'build',
      harness: 'claude',
      model: 'claude-opus-4-6',
      agent_def_hash: 'sha256:build',
      cli_version: '1.1.0',
      session_id: 'sess-legacy',
      captured_at: '2026-05-01T00:00:00.000Z',
      derived: {
        tokens: { input: 900, output: 100, cache_create: 0, cache_read: 0 },
        price_table_version: '2026-05-01',
        // NOTE: no derive_version, no transcript_hash — predates this change.
        duration_ms: 1000,
        turns: 1,
        tool_calls: 1,
        commands_run: 1,
        tests_executed: 0,
        failures_encountered: 0,
        files_touched: 1,
        model: 'claude-opus-4-6',
      },
    };
    fs.writeFileSync(path.join(dir, 'build-sess-legacy.json'), JSON.stringify(legacy, null, 2), 'utf-8');

    // Reads without error and surfaces the legacy session intact.
    const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
    expect(att).not.toBeNull();
    expect(att!.sessions).toHaveLength(1);
    expect(att!.sessions[0]!.session_id).toBe('sess-legacy');
    expect(att!.sessions[0]!.derived!.tokens.input).toBe(900);
    expect(att!.sessions[0]!.transcript_hash).toBeUndefined();
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

  describe('completeness (via assembleProcessAttestation)', () => {
    // @ana A022
    it('reads complete when plan, build, and verify are all present', () => {
      writeAnaJson('on');
      seedReport('feat', 'build_report.md');
      seedReport('feat', 'verify_report.md');
      seedProvenance('feat', prov('plan', 'sp', '2026-06-01T00:30:00.000Z'));
      seedProvenance('feat', prov('build', 'sb', '2026-06-01T01:00:00.000Z'));
      seedProvenance('feat', prov('verify', 'sv', '2026-06-01T02:00:00.000Z'));

      const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
      expect(att!.completeness.complete).toBe(true);
      expect(att!.completeness.expected).toEqual({ plan: 1, build: 1, verify: 1 });
      expect(att!.completeness.present).toEqual({ plan: 1, build: 1, verify: 1 });
      expect(att!.completeness.gaps).toEqual([]);
    });

    // @ana A021
    it('ties expected.build/verify to the count of saved report files', () => {
      writeAnaJson('on');
      seedReport('feat', 'build_report_1.md');
      seedReport('feat', 'build_report_2.md');
      seedReport('feat', 'verify_report_1.md');
      // No provenance seeded — only the expected counts matter here.
      const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
      expect(att!.completeness.expected.build).toBe(2);
      expect(att!.completeness.expected.verify).toBe(1);
      expect(att!.completeness.expected.plan).toBe(1);
    });

    // @ana A023, A024
    it('reads incomplete and names the missing verify role when its session is absent', () => {
      writeAnaJson('on');
      seedReport('feat', 'build_report.md');
      seedReport('feat', 'verify_report.md');
      seedProvenance('feat', prov('plan', 'sp', '2026-06-01T00:30:00.000Z'));
      seedProvenance('feat', prov('build', 'sb', '2026-06-01T01:00:00.000Z'));
      // verify session missing

      const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
      expect(att!.completeness.complete).toBe(false);
      expect(att!.completeness.present.verify).toBe(0);
      expect(att!.completeness.gaps).toHaveLength(1);
      expect(att!.completeness.gaps[0]).toContain('verify');
      expect(att!.completeness.gaps[0]).toBe('verify: 0 of 1 expected session(s) present');
    });

    // @ana A025
    it('does not false-fail legitimate rework — extra build reports with matching sessions read complete', () => {
      writeAnaJson('on');
      seedReport('feat', 'build_report.md');
      seedReport('feat', 'build_report_2_r1.md'); // rework attempt
      seedReport('feat', 'verify_report.md');
      seedReport('feat', 'verify_report_2_r1.md');
      seedProvenance('feat', prov('plan', 'sp', '2026-06-01T00:30:00.000Z'));
      seedProvenance('feat', prov('build', 'sb1', '2026-06-01T01:00:00.000Z'));
      seedProvenance('feat', prov('build', 'sb2', '2026-06-01T01:30:00.000Z'));
      seedProvenance('feat', prov('verify', 'sv1', '2026-06-01T02:00:00.000Z'));
      seedProvenance('feat', prov('verify', 'sv2', '2026-06-01T02:30:00.000Z'));

      const att = assembleProcessAttestation(projectRoot, 'feat', makeProof({ rejection_cycles: 1 }), churn, SCOPE, true);
      expect(att!.completeness.expected).toEqual({ plan: 1, build: 2, verify: 2 });
      expect(att!.completeness.present).toEqual({ plan: 1, build: 2, verify: 2 });
      expect(att!.completeness.complete).toBe(true);
    });

    // @ana A026
    it('never requires ana/learn — an extra learn session creates no gap', () => {
      writeAnaJson('on');
      seedReport('feat', 'build_report.md');
      seedReport('feat', 'verify_report.md');
      seedProvenance('feat', prov('plan', 'sp', '2026-06-01T00:30:00.000Z'));
      seedProvenance('feat', prov('build', 'sb', '2026-06-01T01:00:00.000Z'));
      seedProvenance('feat', prov('verify', 'sv', '2026-06-01T02:00:00.000Z'));
      seedProvenance('feat', prov('learn', 'sl', '2026-06-01T03:00:00.000Z'));

      const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
      expect(att!.completeness.complete).toBe(true);
      // learn is in the dataset but never an expected/present-counted bucket.
      expect(att!.completeness.expected).toEqual({ plan: 1, build: 1, verify: 1 });
      expect(att!.completeness.present).toEqual({ plan: 1, build: 1, verify: 1 });
      expect(att!.sessions.map((s) => s.role)).toContain('learn');
    });

    it('zero provenance files + capture on → all-gaps completeness (loud, not null)', () => {
      writeAnaJson('on');
      seedReport('feat', 'build_report.md');
      seedReport('feat', 'verify_report.md');
      // No provenance seeded.
      const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
      expect(att).not.toBeNull();
      expect(att!.completeness.complete).toBe(false);
      expect(att!.completeness.present).toEqual({ plan: 0, build: 0, verify: 0 });
      expect(att!.completeness.gaps).toHaveLength(3);
    });
  });

  describe('computeCompleteness (pure helper)', () => {
    /** Seed report files into a standalone reportsDir and return its path. */
    function seedReportsDir(files: string[]): string {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-reports-'));
      for (const f of files) fs.writeFileSync(path.join(dir, f), '# report', 'utf-8');
      return dir;
    }

    // @ana A021
    it('expected counts come from report-file globs; plan is always 1', () => {
      const dir = seedReportsDir(['build_report_1.md', 'build_report_2.md', 'verify_report.md']);
      try {
        const c = computeCompleteness(dir, []);
        expect(c.expected).toEqual({ plan: 1, build: 2, verify: 1 });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    // @ana A022
    it('complete is true only when every bucket meets its floor', () => {
      const dir = seedReportsDir(['build_report.md', 'verify_report.md']);
      try {
        const sessions: SessionProvenance[] = [
          prov('plan', 'p', '2026-06-01T00:00:00.000Z'),
          prov('build', 'b', '2026-06-01T01:00:00.000Z'),
          prov('verify', 'v', '2026-06-01T02:00:00.000Z'),
        ];
        expect(computeCompleteness(dir, sessions).complete).toBe(true);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    // @ana A023, A024
    it('a missing role yields complete:false with a named gap', () => {
      const dir = seedReportsDir(['build_report.md', 'verify_report.md']);
      try {
        const sessions: SessionProvenance[] = [
          prov('plan', 'p', '2026-06-01T00:00:00.000Z'),
          prov('build', 'b', '2026-06-01T01:00:00.000Z'),
        ];
        const c = computeCompleteness(dir, sessions);
        expect(c.complete).toBe(false);
        expect(c.gaps).toEqual(['verify: 0 of 1 expected session(s) present']);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('an ana/learn-only dataset gaps plan/build/verify; ana/learn never required', () => {
      const dir = seedReportsDir(['build_report.md', 'verify_report.md']);
      try {
        const sessions: SessionProvenance[] = [
          prov('ana', 'a', '2026-06-01T00:00:00.000Z'),
          prov('learn', 'l', '2026-06-01T01:00:00.000Z'),
        ];
        const c = computeCompleteness(dir, sessions);
        expect(c.complete).toBe(false);
        expect(c.gaps).toHaveLength(3); // plan, build, verify all short
        expect(c.present).toEqual({ plan: 0, build: 0, verify: 0 });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('a missing reportsDir degrades to zero expected build/verify (never throws)', () => {
      const c = computeCompleteness(path.join(os.tmpdir(), 'cc-does-not-exist-xyz'), []);
      expect(c.expected).toEqual({ plan: 1, build: 0, verify: 0 });
      // plan still expected → still a gap with zero sessions.
      expect(c.complete).toBe(false);
    });
  });

  describe('cross-machine fixture (AC2/AC6)', () => {
    // @ana A036
    it('assembles a complete process block from files authored on different machines', () => {
      writeAnaJson('on');
      seedReport('feat', 'build_report.md');
      seedReport('feat', 'verify_report.md');
      // Each session is authored as if from a DIFFERENT machine: distinct
      // session_ids, harnesses, cli versions, agent-def hashes — and crucially no
      // shared home/buffer state (assembly reads only committed files).
      seedProvenance('feat', prov('plan', 'm1-plan', '2026-06-01T00:30:00.000Z', {
        harness: 'claude', cli_version: '1.2.0', agent_def_hash: 'sha256:machineA-plan',
      }));
      seedProvenance('feat', prov('build', 'm2-build', '2026-06-01T01:00:00.000Z', {
        harness: 'claude', cli_version: '1.2.2', agent_def_hash: 'sha256:machineB-build',
      }));
      seedProvenance('feat', prov('verify', 'm3-verify', '2026-06-01T02:00:00.000Z', {
        harness: 'codex', cli_version: '1.3.0', agent_def_hash: 'sha256:machineC-verify',
      }, 500, 'gpt-5'));

      const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
      expect(att).not.toBeNull();
      expect(att!.sessions).toHaveLength(3);
      // Machine-independent: the verdict is complete regardless of origin host.
      expect(att!.completeness.complete).toBe(true);
      expect(att!.sessions.map((s) => s.harness)).toEqual(['claude', 'claude', 'codex']);
    });
  });

  describe('squash-merge survival fixture (AC6)', () => {
    // @ana A037
    it('keeps every distinct provenance file through a squash merge (union, no loss)', () => {
      const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-squash-'));
      try {
        const run = (cmd: string): void => { execSync(cmd, { cwd: repo, stdio: 'ignore' }); };
        // Force a clean main branch (git init -b main per the build brief).
        run('git init -b main');
        run('git config user.email "t@t.com"');
        run('git config user.name "T"');
        fs.writeFileSync(path.join(repo, 'README.md'), '# base', 'utf-8');
        run('git add -A && git commit -m base');

        // Feature branch: three distinct per-session provenance files committed
        // across separate commits (as the pipeline would across machines/sessions).
        run('git checkout -b feature/x');
        const provDir = path.join(repo, '.ana', 'plans', 'active', 'x', 'provenance');
        fs.mkdirSync(provDir, { recursive: true });
        const names = ['plan-sp.json', 'build-sb.json', 'verify-sv.json'];
        names.forEach((name, i) => {
          fs.writeFileSync(path.join(provDir, name), JSON.stringify({ session_id: name, n: i }), 'utf-8');
          run(`git add -A && git commit -m add-${name}`);
        });

        // Squash-merge the whole branch into one commit on main. Squash is the risk
        // case (a single flattened commit) — a merge-commit fixture would not prove
        // this. Distinct filenames must all survive the flatten with no collision.
        run('git checkout main');
        run('git merge --squash feature/x');
        run('git commit -m "squash merge feature/x"');

        const survived = fs.readdirSync(provDir).filter((f) => f.endsWith('.json'));
        expect(survived).toHaveLength(3);
        expect(survived.sort()).toEqual(['build-sb.json', 'plan-sp.json', 'verify-sv.json']);
      } finally {
        fs.rmSync(repo, { recursive: true, force: true });
      }
    });
  });
});
