/**
 * Integration test for the deterministic read-build-report veto (Component 3,
 * verifier-verdict-honesty Spec 2).
 *
 * Exercises the WHOLE pipeline against the REAL anatrace-core engine: a verify
 * transcript that `Read`s `build_report.md` → captureComplianceAtSave
 * (parseSession + anatomiaAdapter.extract + runCompliance + projectVerdicts) →
 * assemble → evaluateReadBuildReportVeto → the force-FAIL guard blocks completion
 * even when the self-authored headline says PASS. Covers BOTH harnesses (AC8): the
 * claim id `ana-verify:verify-independence` is harness-independent.
 *
 * The mandate is built from the REAL `ana-verify.md` agent-def (copied from the
 * repo) so the adapter derives the live verify-independence claim — the same id
 * the production veto allowlists.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureComplianceAtSave } from '../../src/utils/compliance.js';
import { writePendingPointer } from '../../src/utils/forensics.js';
import { evaluateReadBuildReportVeto, VERIFY_INDEPENDENCE_CLAIM_ID } from '../../src/utils/verdict.js';
import { guardVerdictVeto } from '../../src/commands/work-proof.js';
import type { ComplianceAttestation } from '../../src/types/proof.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_AGENTS = path.resolve(here, '../../../../.claude/agents');

/** Thrown by the mocked process.exit so the test can observe the force-FAIL. */
class ExitError extends Error {
  constructor(public code: number) {
    super(`exit ${code}`);
  }
}

describe('read-build-report veto — full engine pipeline', () => {
  let tmpHome: string;
  let originalHome: string | undefined;
  let projectDir: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'veto-home-'));
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veto-proj-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = tmpHome;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = originalHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  function writeAnaJson(): void {
    const anaDir = path.join(projectDir, '.ana');
    fs.mkdirSync(anaDir, { recursive: true });
    fs.writeFileSync(path.join(anaDir, 'ana.json'), JSON.stringify({ name: 'x', processCapture: 'on' }));
  }

  function installVerifyDef(harness: 'claude' | 'codex'): void {
    const agentsDir = path.join(projectDir, harness === 'codex' ? '.codex' : '.claude', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.copyFileSync(path.join(REPO_AGENTS, 'ana-verify.md'), path.join(agentsDir, 'ana-verify.md'));
  }

  /** A claude verify transcript; reads build_report.md only when `readReport`. */
  function writeClaudeVerify(name: string, readReport: boolean): string {
    const p = path.join(projectDir, name);
    const content: unknown[] = [{ type: 'text', text: 'reviewing the diff' }];
    if (readReport) {
      content.push({
        type: 'tool_use', id: 'tu1', name: 'Read',
        input: { file_path: path.join(projectDir, '.ana/plans/active/feat/build_report.md') },
      });
    }
    const line = {
      type: 'assistant', requestId: 'r1', timestamp: '2026-06-01T00:00:00.000Z',
      message: { id: 'm1', model: 'claude-opus-4-6', usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, content },
    };
    fs.writeFileSync(p, JSON.stringify(line) + '\n', 'utf-8');
    return p;
  }

  /** A codex verify rollout; reads build_report.md via a `Read` function_call when `readReport`. */
  function writeCodexVerify(name: string, readReport: boolean): string {
    const p = path.join(projectDir, name);
    const lines: unknown[] = [
      { type: 'session_meta', timestamp: '2026-06-01T00:00:00.000Z', payload: { id: 'cx-1', model: null, cwd: '/proj' } },
      { type: 'turn_context', timestamp: '2026-06-01T00:00:01.000Z', payload: { turn_id: 't1', model: 'gpt-5.5' } },
    ];
    if (readReport) {
      lines.push({
        type: 'response_item', timestamp: '2026-06-01T00:00:03.000Z',
        payload: { type: 'function_call', name: 'Read', call_id: 'c1', arguments: JSON.stringify({ file_path: path.join(projectDir, '.ana/plans/active/feat/build_report.md') }) },
      });
    } else {
      lines.push({ type: 'response_item', timestamp: '2026-06-01T00:00:03.000Z', payload: { type: 'message', role: 'assistant', content: 'ok' } });
    }
    fs.writeFileSync(p, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf-8');
    return p;
  }

  /** Drive the real producer and return the assembled compliance records. */
  function capture(harness: 'claude' | 'codex', readReport: boolean): ComplianceAttestation[] {
    const sessionId = `${harness}-sess`;
    const transcript = harness === 'codex'
      ? writeCodexVerify(`rollout-2026-${sessionId}.jsonl`, readReport)
      : writeClaudeVerify(`${sessionId}.jsonl`, readReport);
    writePendingPointer('run-1', {
      session_id: sessionId, transcript_path: transcript, model: 'm', source: 'startup', captured_at: '2026-06-07T22:00:00.000Z',
    });
    const written = captureComplianceAtSave(projectDir, 'feat', {
      ANA_HARNESS: harness, ANA_ROLE: 'verify', ANA_RUN_ID: 'run-1', ANA_CAPTURE_BOUNDARY: 'root',
    });
    expect(written).toBeTruthy();
    return [JSON.parse(fs.readFileSync(written!, 'utf-8')) as ComplianceAttestation];
  }

  /** The effective verdict after the veto: a force-FAIL overrides the headline. */
  function effectiveResult(records: ComplianceAttestation[], headline: 'PASS' | 'FAIL'): 'PASS' | 'FAIL' {
    return evaluateReadBuildReportVeto(records).applied ? 'FAIL' : headline;
  }

  for (const harness of ['claude', 'codex'] as const) {
    // @ana A028 — a verify session that read the build report cannot complete with a PASS.
    it(`force-FAILs a PASS-headline proof when the ${harness} verify session read build_report.md`, () => {
      writeAnaJson();
      installVerifyDef(harness);

      const records = capture(harness, /* readReport */ true);

      // The real engine produced a deterministic violated verify-independence verdict.
      const indep = records[0]!.verdicts.find((v) => v.claim_id === VERIFY_INDEPENDENCE_CLAIM_ID);
      expect(indep).toBeTruthy();
      expect(indep!.status).toBe('violated');
      expect(indep!.source).toBe('deterministic');

      // The veto fires and overrides the self-authored PASS headline.
      const veto = evaluateReadBuildReportVeto(records);
      expect(veto.applied).toBe(true);
      expect(effectiveResult(records, 'PASS')).toBe('FAIL');

      // The completion guard blocks (process.exit(1)) even though the headline said PASS.
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => { throw new ExitError(code ?? 0); }) as never);
      let exitCode: number | null = null;
      try {
        guardVerdictVeto(veto);
      } catch (e) {
        if (e instanceof ExitError) exitCode = e.code;
        else throw e;
      }
      expect(exitCode).toBe(1);
    });

    // Control: a verify session that did NOT read the report does not gate (no false positive).
    it(`does not veto when the ${harness} verify session never read build_report.md`, () => {
      writeAnaJson();
      installVerifyDef(harness);

      const records = capture(harness, /* readReport */ false);
      const veto = evaluateReadBuildReportVeto(records);
      expect(veto.applied).toBe(false);
      // The headline stands — completion proceeds.
      expect(effectiveResult(records, 'PASS')).toBe('PASS');
    });
  }
});
