/**
 * Tests for Phase-2 ProcessAttestation assembly (AC9) at work-complete.
 *
 * assembleProcessAttestation produces the optional `entry.process` (attached via
 * a typechecked `...(x ? { process: x } : {})` spread in writeProofChain). It is
 * provenance ONLY — counts/cost/outcome/task-shape/churn, never findings or
 * verdicts. Capture off, or no session record tied to the worktree → null →
 * the proof omits the field and stays valid.
 *
 * Covers the human-approved DEVIATION from spec-2: Build/Verify records carry an
 * EMPTY slug (they launch from the main repo), so they are recovered by matching
 * the worktree path against the transcript's own cwd entries — not the slug.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { assembleProcessAttestation } from '../../src/commands/work-proof.js';
import { getForensicsBufferPath, type SessionRecord } from '../../src/utils/forensics.js';
import type { ProofSummary } from '../../src/utils/proofSummary.js';

describe('assembleProcessAttestation', () => {
  let tmpHome: string;
  let projectRoot: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-home-'));
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-proj-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = tmpHome;
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = originalHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
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

  /** Write a minimal Claude transcript whose cwd is INSIDE the worktree (mid-session cd). */
  function writeWorktreeTranscript(slug: string): string {
    const worktree = path.join(projectRoot, '.ana', 'worktrees', slug);
    const transcriptPath = path.join(projectRoot, `transcript-${slug}.jsonl`);
    const lines = [
      // First line: cwd is the MAIN repo (session started there).
      { type: 'user', timestamp: '2026-06-01T00:00:00.000Z', cwd: projectRoot, message: { content: 'hi' } },
      // Later: agent has cd'd into the worktree — this is the recovery signal.
      {
        type: 'assistant',
        requestId: 'req_1',
        timestamp: '2026-06-01T00:01:00.000Z',
        cwd: worktree,
        message: {
          model: 'claude-opus-4-6',
          usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          content: [{ type: 'tool_use', name: 'Bash', input: { command: 'pnpm test' } }],
        },
      },
    ];
    fs.writeFileSync(transcriptPath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf-8');
    return transcriptPath;
  }

  /** Seed the forensics buffer with one record. */
  function seedBuffer(record: SessionRecord): void {
    const bufferPath = getForensicsBufferPath();
    fs.mkdirSync(path.dirname(bufferPath), { recursive: true });
    fs.appendFileSync(bufferPath, JSON.stringify(record) + '\n', 'utf-8');
  }

  /** Write a worktree-cwd transcript with a given model + input tokens; returns the path. */
  function writeRoleTranscript(slug: string, tag: string, model: string, inputTokens: number): string {
    const worktree = path.join(projectRoot, '.ana', 'worktrees', slug);
    const p = path.join(projectRoot, `transcript-${slug}-${tag}.jsonl`);
    const lines = [
      {
        type: 'assistant',
        requestId: `req-${tag}`,
        timestamp: '2026-06-01T00:00:00.000Z',
        cwd: worktree,
        message: {
          model,
          usage: { input_tokens: inputTokens, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          content: [],
        },
      },
    ];
    fs.writeFileSync(p, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf-8');
    return p;
  }

  /** A session record (empty slug — the deviation case) for an arbitrary role/model. */
  function roleRecord(role: string, model: string, sessionId: string, transcriptPath: string, timestamp: string): SessionRecord {
    return {
      session_id: sessionId,
      transcript_path: transcriptPath,
      harness: 'claude',
      harness_version: '',
      role,
      slug: '',
      model,
      agent_def_hash: `sha256:${role}`,
      cli_version: '1.2.2',
      cwd: projectRoot,
      source: 'startup',
      os: 'darwin',
      node: 'v20',
      timestamp,
    };
  }

  /** A build session record with an EMPTY slug (the deviation's central case). */
  function buildRecord(slug: string, transcriptPath: string): SessionRecord {
    return {
      session_id: `sess-${slug}`,
      transcript_path: transcriptPath,
      harness: 'claude',
      harness_version: '',
      role: 'build',
      slug: '', // ← empty: Build launches from the main repo, slug unknowable at spawn
      model: 'claude-opus-4-6',
      agent_def_hash: 'sha256:abc',
      cli_version: '1.2.2',
      cwd: projectRoot, // session started in the main repo
      source: 'startup',
      os: 'darwin',
      node: 'v20',
      timestamp: '2026-06-01T00:00:00.000Z',
    };
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

  it('attaches an attestation when capture is on and a worktree session matches', () => {
    // @ana A031
    writeAnaJson('on');
    const transcript = writeWorktreeTranscript('feat');
    seedBuffer(buildRecord('feat', transcript));

    const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);

    expect(att).not.toBeNull();
    expect(att!.sessions).toHaveLength(1);
    expect(att!.sessions[0]!.session_id).toBe('sess-feat');
    expect(att!.sessions[0]!.role).toBe('build');
    expect(att!.sessions[0]!.derived.tokens.input).toBe(1000);
    expect(att!.sessions[0]!.model).toBe('claude-opus-4-6');
    expect(att!.module_churn).toEqual(churn);
  });

  it('reports first_pass_verify from rejection_cycles (0 → true)', () => {
    // @ana A032
    writeAnaJson('on');
    const transcript = writeWorktreeTranscript('feat');
    seedBuffer(buildRecord('feat', transcript));

    const att = assembleProcessAttestation(projectRoot, 'feat', makeProof({ rejection_cycles: 0 }), churn, SCOPE, true);
    expect(att!.outcome.first_pass_verify).toBe(true);
  });

  it('reports first_pass_verify false when there were rejection cycles', () => {
    // @ana A032
    writeAnaJson('on');
    const transcript = writeWorktreeTranscript('feat');
    seedBuffer(buildRecord('feat', transcript));

    const att = assembleProcessAttestation(projectRoot, 'feat', makeProof({ rejection_cycles: 2 }), churn, SCOPE, true);
    expect(att!.outcome.first_pass_verify).toBe(false);
  });

  it('joins outcome and task_shape correctly', () => {
    // @ana A031
    writeAnaJson('on');
    const transcript = writeWorktreeTranscript('feat');
    seedBuffer(buildRecord('feat', transcript));

    const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
    expect(att!.outcome.assertions_satisfied).toBe(14);
    expect(att!.outcome.assertions_total).toBe(14);
    expect(att!.outcome.findings).toEqual({ risk: 0, debt: 1, observation: 2 });
    expect(att!.task_shape).toEqual({ size: 'large', kind: 'feature', multi_phase: true });
  });

  it('recovers an empty-slug Build record via the transcript cwd (the DEVIATION)', () => {
    // @ana A031 — the record.slug is '' yet it is recovered by worktree cwd match.
    writeAnaJson('on');
    const transcript = writeWorktreeTranscript('feat');
    const rec = buildRecord('feat', transcript);
    expect(rec.slug).toBe(''); // precondition: slug genuinely empty
    seedBuffer(rec);

    const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
    expect(att).not.toBeNull();
    expect(att!.sessions.map((s) => s.session_id)).toContain('sess-feat');
  });

  it('captures ALL matching sessions with correct per-role metadata (DEVIATION)', () => {
    // @ana A031 — build + verify both present, each with its own model/role/counts.
    writeAnaJson('on');
    const buildTx = writeRoleTranscript('feat', 'build', 'claude-opus-4-6', 1000);
    const verifyTx = writeRoleTranscript('feat', 'verify', 'claude-sonnet-4-6', 500);
    // Seed out of order to prove deterministic sorting by timestamp.
    seedBuffer(roleRecord('verify', 'claude-sonnet-4-6', 'sess-verify', verifyTx, '2026-06-01T02:00:00.000Z'));
    seedBuffer(roleRecord('build', 'claude-opus-4-6', 'sess-build', buildTx, '2026-06-01T01:00:00.000Z'));

    const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);

    expect(att).not.toBeNull();
    expect(att!.sessions).toHaveLength(2);
    // Deterministic order: by timestamp → build (01:00) before verify (02:00).
    expect(att!.sessions.map((s) => s.role)).toEqual(['build', 'verify']);
    expect(att!.sessions[0]!.model).toBe('claude-opus-4-6');
    expect(att!.sessions[0]!.derived.tokens.input).toBe(1000);
    expect(att!.sessions[0]!.agent_def_hash).toBe('sha256:build');
    expect(att!.sessions[1]!.model).toBe('claude-sonnet-4-6');
    expect(att!.sessions[1]!.derived.tokens.input).toBe(500);
    // outcome stays top-level (contract A032 unchanged).
    expect(att!.outcome.first_pass_verify).toBe(true);
  });

  it('keeps repeated build attempts from rejection cycles (rework is wanted data)', () => {
    writeAnaJson('on');
    const b1 = writeRoleTranscript('feat', 'build1', 'claude-opus-4-6', 1000);
    const b2 = writeRoleTranscript('feat', 'build2', 'claude-opus-4-6', 1200);
    seedBuffer(roleRecord('build', 'claude-opus-4-6', 'sess-build-1', b1, '2026-06-01T01:00:00.000Z'));
    seedBuffer(roleRecord('build', 'claude-opus-4-6', 'sess-build-2', b2, '2026-06-01T03:00:00.000Z'));

    const att = assembleProcessAttestation(projectRoot, 'feat', makeProof({ rejection_cycles: 1 }), churn, SCOPE, true);
    expect(att!.sessions).toHaveLength(2);
    expect(att!.sessions.map((s) => s.session_id)).toEqual(['sess-build-1', 'sess-build-2']);
  });

  it('is deterministic — assembling twice yields JSON-identical output', () => {
    writeAnaJson('on');
    const buildTx = writeRoleTranscript('feat', 'build', 'claude-opus-4-6', 1000);
    const verifyTx = writeRoleTranscript('feat', 'verify', 'claude-sonnet-4-6', 500);
    seedBuffer(roleRecord('build', 'claude-opus-4-6', 'sess-build', buildTx, '2026-06-01T01:00:00.000Z'));
    seedBuffer(roleRecord('verify', 'claude-sonnet-4-6', 'sess-verify', verifyTx, '2026-06-01T02:00:00.000Z'));

    const a = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
    const b = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('returns null when capture is off (proof omits the field)', () => {
    // @ana A033
    writeAnaJson('off');
    const transcript = writeWorktreeTranscript('feat');
    seedBuffer(buildRecord('feat', transcript));

    const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
    expect(att).toBeNull();
  });

  it('returns null when no session record matches the worktree', () => {
    // @ana A033
    writeAnaJson('on');
    // A Think session in the main repo, never tied to this worktree.
    const transcriptPath = path.join(projectRoot, 'think.jsonl');
    fs.writeFileSync(
      transcriptPath,
      JSON.stringify({ type: 'user', timestamp: '2026-06-01T00:00:00.000Z', cwd: projectRoot, message: {} }) + '\n',
      'utf-8',
    );
    seedBuffer({ ...buildRecord('feat', transcriptPath), role: 'think', session_id: 'think-1' });

    const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
    expect(att).toBeNull();
  });

  it('returns null when the matched transcript is unreadable (dangling pointer)', () => {
    writeAnaJson('on');
    const rec = buildRecord('feat', path.join(projectRoot, 'gone.jsonl'));
    // Force a slug match so recovery succeeds but the transcript derive fails.
    rec.slug = 'feat';
    seedBuffer(rec);

    const att = assembleProcessAttestation(projectRoot, 'feat', makeProof(), churn, SCOPE, true);
    expect(att).toBeNull();
  });
});
