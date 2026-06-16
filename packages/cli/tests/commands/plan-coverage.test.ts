import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { Command } from 'commander';
import { runPlanCoverage, registerPlanCommand } from '../../src/commands/plan.js';

/**
 * Tests for `ana plan coverage <slug>`.
 *
 * The read-only, never-gating plan-time mirror of the pre-seal coverage gate.
 * Uses a temp project (git repo + .ana/ana.json) so findProjectRoot resolves.
 */

describe('ana plan coverage', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plan-coverage-test-'));
    originalCwd = process.cwd();
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
    await fs.mkdir(path.join(tempDir, '.ana'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.ana', 'ana.json'), JSON.stringify({ name: 'tmp' }));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  /**
   * Write a scope.md + contract.yaml fixture for a slug.
   */
  async function writeFixture(slug: string, scope: string, contract: string): Promise<void> {
    const dir = path.join(tempDir, '.ana/plans/active', slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'scope.md'), scope);
    await fs.writeFile(path.join(dir, 'contract.yaml'), contract);
  }

  /**
   * Run runPlanCoverage capturing stdout/stderr and the process.exit code.
   */
  function runCoverage(slug: string): { stdout: string; stderr: string; exitCode: number } {
    const originalLog = console.log;
    const originalError = console.error;
    const originalExit = process.exit;
    const stdout: string[] = [];
    const stderr: string[] = [];
    let exitCode = -1;

    console.log = (...args: unknown[]) => { stdout.push(args.map(String).join(' ')); };
    console.error = (...args: unknown[]) => { stderr.push(args.map(String).join(' ')); };
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`__exit__${exitCode}`);
    }) as typeof process.exit;

    try {
      runPlanCoverage(slug);
    } catch (error) {
      if (!(error instanceof Error && error.message.startsWith('__exit__'))) throw error;
    } finally {
      console.log = originalLog;
      console.error = originalError;
      process.exit = originalExit;
    }

    return { stdout: stdout.join('\n'), stderr: stderr.join('\n'), exitCode };
  }

  const MIXED_SCOPE = `# Scope

## Acceptance Criteria
- AC1: the feature works
- AC2: the response is correct
- AC3: the value exists
- AC4: the error message is helpful
- AC5: superseded behaviour
- AC6: the dropped one
`;

  const MIXED_CONTRACT = `version: "1.1"
sealed_by: "AnaPlan"
feature: "Mixed Coverage"
assertions:
  - id: A001
    ac: AC1
    says: "feature works"
    matcher: "equals"
  - id: A002
    ac: AC2
    says: "response correct"
    matcher: "equals"
  - id: A003
    ac: AC3
    says: "value exists"
    matcher: "exists"
coverage_waivers:
  - ac: AC4
    kind: judgment
    reason: "helpfulness is human-judged"
  - ac: AC5
    kind: retired
    reason: "superseded by AC2 after scope correction"
`;

  // @ana A028
  it('lists each acceptance criterion (per-AC rows)', async () => {
    await writeFixture('mixed', MIXED_SCOPE, MIXED_CONTRACT);
    const { stdout } = runCoverage('mixed');
    expect(stdout).toContain('AC1');
    expect(stdout).toContain('AC2');
    expect(stdout).toContain('AC6');
  });

  // @ana A029
  it('marks an uncovered AC as UNCOVERED', async () => {
    await writeFixture('mixed', MIXED_SCOPE, MIXED_CONTRACT);
    const { stdout } = runCoverage('mixed');
    expect(stdout).toContain('UNCOVERED');
  });

  // @ana A030
  it('exits 0 even when acceptance criteria are uncovered', async () => {
    await writeFixture('mixed', MIXED_SCOPE, MIXED_CONTRACT);
    const { exitCode } = runCoverage('mixed');
    expect(exitCode).toBe(0);
  });

  it('marks judgment-only and retired waivers distinctly', async () => {
    await writeFixture('mixed', MIXED_SCOPE, MIXED_CONTRACT);
    const { stdout } = runCoverage('mixed');
    expect(stdout).toContain('judgment-only');
    expect(stdout).toContain('retired');
    expect(stdout).toContain('helpfulness is human-judged');
  });

  it('notes a weak-matcher-only pinned AC as info', async () => {
    await writeFixture('mixed', MIXED_SCOPE, MIXED_CONTRACT);
    const { stdout } = runCoverage('mixed');
    // AC3 is pinned only by an `exists` matcher.
    expect(stdout).toContain('weak matcher only');
  });

  it('reports the gate active header for a 1.1 contract', async () => {
    await writeFixture('mixed', MIXED_SCOPE, MIXED_CONTRACT);
    const { stdout } = runCoverage('mixed');
    expect(stdout).toContain('gate active');
  });

  it('renders a fully-covered contract with a passing preview note', async () => {
    const scope = `# Scope\n\n## Acceptance Criteria\n- AC1: works\n`;
    const contract = `version: "1.1"\nfeature: "Full"\nassertions:\n  - id: A001\n    ac: AC1\n    says: "works"\n    matcher: "equals"\n`;
    await writeFixture('full', scope, contract);
    const { stdout, exitCode } = runCoverage('full');
    expect(stdout).toContain('gate active');
    expect(stdout).not.toContain('UNCOVERED');
    expect(stdout).toContain('the seal will pass');
    expect(exitCode).toBe(0);
  });

  it('renders a legacy 1.0 contract as gate inactive', async () => {
    const scope = `# Scope\n\n## Acceptance Criteria\n- AC1: works\n- AC2: also works\n`;
    const contract = `version: "1.0"\nfeature: "Legacy"\nassertions:\n  - id: A001\n    says: "works"\n    matcher: "equals"\n`;
    await writeFixture('legacy', scope, contract);
    const { stdout, exitCode } = runCoverage('legacy');
    expect(stdout).toContain('gate inactive');
    expect(stdout).toContain('legacy');
    expect(stdout).toContain('unlinked');
    expect(exitCode).toBe(0);
  });

  it('guards a missing contract and still exits 0', async () => {
    const dir = path.join(tempDir, '.ana/plans/active', 'no-contract');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'scope.md'), '# Scope\n');
    const { stdout, exitCode } = runCoverage('no-contract');
    expect(stdout).toContain('No contract found');
    expect(exitCode).toBe(0);
  });

  it('guards a missing slug and still exits 0', async () => {
    const { stderr, exitCode } = runCoverage('does-not-exist');
    expect(stderr).toContain('No active work found');
    expect(exitCode).toBe(0);
  });

  it('handles a build-only scope (no acceptance criteria)', async () => {
    const scope = `# Scope\n\n## Intent\nRefactor internals — no user-facing criteria.\n`;
    const contract = `version: "1.1"\nfeature: "Build only"\nassertions:\n  - id: A001\n    says: "internal"\n    matcher: "equals"\n`;
    await writeFixture('build-only', scope, contract);
    const { stdout, exitCode } = runCoverage('build-only');
    expect(stdout).toContain('no acceptance criteria');
    expect(exitCode).toBe(0);
  });

  // @ana A031
  it('registers the plan command group on the CLI', () => {
    const program = new Command();
    registerPlanCommand(program);
    const names = program.commands.map(c => c.name());
    expect(names).toContain('plan');
    const planCmd = program.commands.find(c => c.name() === 'plan');
    expect(planCmd?.commands.map(c => c.name())).toContain('coverage');
  });
});
