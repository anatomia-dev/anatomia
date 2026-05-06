/**
 * Unit tests for ana init preflight — focused on the SIGKILL recovery
 * detection path.
 *
 * The swap-based atomic rename:
 *   rename .ana/ → .ana.old-{ts}       (step 1)
 *   rename tmpDir/.ana → .ana/         (step 2)
 *   rm -rf .ana.old-{ts}               (step 3)
 *
 * If the process dies between step 1 and step 3, a stale `.ana.old-*`
 * directory survives. On the NEXT `ana init` run, preflight must detect
 * it and refuse to proceed — otherwise the user could run init again and
 * silently lose the recoverable data sitting in `.ana.old-*`.
 *
 * These tests exercise validateInitPreconditions directly by mocking
 * process.exit (same pattern used in artifact.test.ts). A stale
 * `.ana.old-*` directory is created before the call, and the assertion
 * confirms preflight:
 *   1. Calls process.exit(1)
 *   2. Prints the stale directory path
 *   3. Prints a recovery command the user can run
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { validateInitPreconditions } from '../../../src/commands/init/preflight.js';

describe('validateInitPreconditions — SIGKILL recovery detection', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-preflight-test-'));
    // Give it SOMETHING that looks like a project root so that if the
    // SIGKILL check DIDN'T fire, we'd hit the next check instead of
    // exiting for a different reason. A package.json is enough.
    await fs.writeFile(path.join(tmpDir, 'package.json'), '{"name":"test"}');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  /**
   * Helper: run preflight with mocked process.exit and captured stderr.
   * Returns the concatenated stderr and the exit code (or undefined if
   * no exit was called).
   */
  async function runPreflight(): Promise<{ errors: string; exitCode: number | undefined }> {
    const originalExit = process.exit;
    const originalError = console.error;
    const errors: string[] = [];
    let capturedExitCode: number | undefined;

    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    };
    process.exit = ((code?: number) => {
      capturedExitCode = code;
      throw new Error(`process.exit(${code})`);
    }) as typeof process.exit;

    try {
      await validateInitPreconditions(tmpDir, path.join(tmpDir, '.ana'), { yes: true });
      return { errors: errors.join('\n'), exitCode: capturedExitCode };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('process.exit')) {
        return { errors: errors.join('\n'), exitCode: capturedExitCode };
      }
      throw error;
    } finally {
      console.error = originalError;
      process.exit = originalExit;
    }
  }

  it('detects stale .ana.old-{ts} directory and refuses to proceed', async () => {
    // Simulate a prior interrupted init
    const stalePath = path.join(tmpDir, '.ana.old-1728000000000');
    await fs.mkdir(stalePath, { recursive: true });
    // Put a file inside so we know it's a real non-empty dir
    await fs.writeFile(path.join(stalePath, 'ana.json'), '{"name":"previous"}');

    const { errors, exitCode } = await runPreflight();

    expect(exitCode).toBe(1);
    // Error message must identify the problem
    expect(errors).toContain('incomplete init');
    // Must surface the stale path so the user can find it
    expect(errors).toContain('.ana.old-1728000000000');
    // Must give a recovery command
    expect(errors).toContain('mv');
  });

  it('detects multiple stale .ana.old-* directories', async () => {
    // Edge case: if init was interrupted more than once without cleanup,
    // multiple stale dirs can exist. We only need to detect one — the
    // user has to resolve them all manually before proceeding.
    await fs.mkdir(path.join(tmpDir, '.ana.old-1728000000000'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, '.ana.old-1728000001000'), { recursive: true });

    const { errors, exitCode } = await runPreflight();

    expect(exitCode).toBe(1);
    // At least one of the stale paths should appear in the error
    const mentionsAStalePath =
      errors.includes('.ana.old-1728000000000') ||
      errors.includes('.ana.old-1728000001000');
    expect(mentionsAStalePath).toBe(true);
  });

  it('ignores directories with .ana.old prefix but no hyphen-timestamp suffix', async () => {
    // Defensive: a user-created directory named ".ana.old" (no timestamp)
    // should NOT trigger the recovery check, because the swap idiom always
    // creates ".ana.old-{timestamp}". Matching just the prefix would
    // false-positive on unrelated user files.
    await fs.mkdir(path.join(tmpDir, '.ana.old'), { recursive: true });

    const { exitCode } = await runPreflight();

    // Should NOT have exited for the SIGKILL recovery reason. Depending
    // on what comes next in preflight (with just a package.json, it will
    // fall through the whole pipeline without another exit), we simply
    // check that we didn't trip the recovery path.
    // If exitCode IS 1, it means the .ana.old-no-suffix dir tripped the
    // check — which is the regression we're guarding against.
    expect(exitCode).toBeUndefined();
  });

  it('does not fire on a fresh init with no stale directories', async () => {
    // No .ana.old-* anywhere; happy path through the SIGKILL check.
    const { exitCode } = await runPreflight();
    expect(exitCode).toBeUndefined();
  });
});
