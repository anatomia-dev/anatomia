import { describe, it, expect, vi, afterEach } from 'vitest';
import { guardFailResult, guardVerdictVeto } from '../../src/commands/work-proof.js';
import type { ReadBuildReportVeto } from '../../src/utils/verdict.js';

/** Thrown by the mocked process.exit so a test can observe the exit and stop flow. */
class ExitError extends Error {
  constructor(public code: number) {
    super(`exit ${code}`);
  }
}

/**
 * Run guardFailResult capturing stderr and the process.exit code.
 *
 * @param result - The verdict result string
 * @param context - Optional context label
 * @param contradictions - Optional contradiction reasons
 * @returns Captured stderr lines and the exit code (null if it never exited)
 */
function runGuard(
  result: string,
  context?: string,
  contradictions?: string[],
): { stderr: string; exitCode: number | null } {
  const lines: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((msg?: unknown) => {
    lines.push(String(msg ?? ''));
  });
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ExitError(code ?? 0);
  }) as never);

  let exitCode: number | null = null;
  try {
    guardFailResult(result, context, contradictions);
  } catch (e) {
    if (e instanceof ExitError) exitCode = e.code;
    else throw e;
  }
  return { stderr: lines.join('\n'), exitCode };
}

describe('guardFailResult', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing for a PASS result', () => {
    const { stderr, exitCode } = runGuard('PASS');
    expect(exitCode).toBeNull();
    expect(stderr).toBe('');
  });

  it('exits 1 with the generic FAIL message when there are no contradictions', () => {
    const { stderr, exitCode } = runGuard('FAIL');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('The verify report says FAIL');
  });

  // @ana A017
  it('prints each contradiction reason when a coerced PASS blocks completion', () => {
    const { stderr, exitCode } = runGuard('FAIL', undefined, [
      'PASS headline contradicts UNSATISFIED row A003',
      'PASS headline contradicts UNSATISFIED row A004',
    ]);
    expect(exitCode).toBe(1);
    // The message names the contradiction, not the generic "report says FAIL" line.
    expect(stderr).toContain('contradicts');
    expect(stderr).toContain('PASS headline contradicts UNSATISFIED row A003');
    expect(stderr).toContain('PASS headline contradicts UNSATISFIED row A004');
    expect(stderr).not.toContain('The verify report says FAIL');
  });

  it('includes the context label in the error when provided', () => {
    const { stderr } = runGuard('FAIL', 'Phase 2');
    expect(stderr).toContain('Phase 2');
  });
});

/**
 * Run guardVerdictVeto capturing stderr and the process.exit code.
 *
 * @param veto - The veto outcome
 * @param context - Optional context label
 * @returns Captured stderr lines and the exit code (null if it never exited)
 */
function runVetoGuard(veto: ReadBuildReportVeto, context?: string): { stderr: string; exitCode: number | null } {
  const lines: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((msg?: unknown) => {
    lines.push(String(msg ?? ''));
  });
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ExitError(code ?? 0);
  }) as never);

  let exitCode: number | null = null;
  try {
    guardVerdictVeto(veto, context);
  } catch (e) {
    if (e instanceof ExitError) exitCode = e.code;
    else throw e;
  }
  return { stderr: lines.join('\n'), exitCode };
}

describe('guardVerdictVeto', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // @ana A028 — an applied veto force-FAILs: it blocks completion (exit 1).
  it('exits 1 with the deterministic-veto message when the veto applied', () => {
    const { stderr, exitCode } = runVetoGuard({ applied: true, reason: 'verify read build_report.md' });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Cannot complete work with a FAIL verification result');
    expect(stderr).toContain('Deterministic veto');
    expect(stderr).toContain('build_report.md');
    expect(stderr).toContain('ana-verify:verify-independence');
    expect(stderr).toContain('source: deterministic');
  });

  it('does nothing when the veto did not apply', () => {
    const { stderr, exitCode } = runVetoGuard({ applied: false, reason: 'no captured transcript' });
    expect(exitCode).toBeNull();
    expect(stderr).toBe('');
  });

  it('includes the context label in the error when provided', () => {
    const { stderr } = runVetoGuard({ applied: true, reason: 'verify read build_report.md' }, 'Phase 2');
    expect(stderr).toContain('Phase 2');
  });
});
