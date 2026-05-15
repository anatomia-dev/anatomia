import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync, spawnSync } from 'node:child_process';
import { createPr } from '../../src/commands/pr.js';

// Mock spawnSync to enable interception of gh CLI calls in PR guard tests.
// By default passes through to the original; tests override via vi.mocked(spawnSync).
vi.mock('node:child_process', async (importOriginal) => {
  const mod = await importOriginal<typeof import('node:child_process')>();
  return { ...mod, spawnSync: vi.fn(mod.spawnSync) };
});

/**
 * Tests for `ana pr create` command
 */

describe('ana pr create', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pr-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  /**
   * Helper to create a test project with git initialized
   */
  async function createTestProject(options: {
    artifactBranch?: string;
    currentBranch?: string;
    branchPrefix?: string;
  }): Promise<void> {
    const artifactBranch = options.artifactBranch || 'main';
    const branchPrefix = options.branchPrefix;

    // Init git
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });

    // Create .ana/ana.json
    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify({ artifactBranch, ...(branchPrefix !== undefined && { branchPrefix }) }),
      'utf-8'
    );

    // Initial commit
    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });

    // Rename branch
    execSync(`git branch -M ${artifactBranch}`, { cwd: tempDir, stdio: 'ignore' });

    // Create feature branch if requested
    if (options.currentBranch && options.currentBranch !== artifactBranch) {
      execSync(`git checkout -b ${options.currentBranch}`, { cwd: tempDir, stdio: 'ignore' });
    }
  }

  /**
   * Helper to create pipeline artifacts
   */
  async function createPipelineArtifacts(slug: string, options: {
    includeVerify?: boolean;
    includeBuild?: boolean;
    includeScope?: boolean;
    includePlan?: boolean;
    verifyResult?: 'PASS' | 'FAIL';
    includePrSummary?: boolean;
  }): Promise<void> {
    const artifactPath = path.join(tempDir, '.ana/plans/active', slug);
    await fs.mkdir(artifactPath, { recursive: true });

    if (options.includeScope) {
      await fs.writeFile(
        path.join(artifactPath, 'scope.md'),
        '# Scope: Add new feature\n\n## Intent\nAdd awesome feature',
        'utf-8'
      );
    }

    if (options.includePlan) {
      await fs.writeFile(
        path.join(artifactPath, 'plan.md'),
        `# Plan\n\n## Phases\n\n- [x] Phase 1\n  - Spec: spec.md`,
        'utf-8'
      );
    }

    if (options.includeBuild) {
      const prSummarySection = options.includePrSummary
        ? '\n## PR Summary\n\n- Added new feature X\n- Updated module Y\n- Fixed edge case Z\n'
        : '';
      await fs.writeFile(
        path.join(artifactPath, 'build_report.md'),
        `# Build Report${prSummarySection}\n\nContent...`,
        'utf-8'
      );
    }

    if (options.includeVerify) {
      const result = options.verifyResult || 'PASS';
      await fs.writeFile(
        path.join(artifactPath, 'verify_report.md'),
        `# Verify Report\n\n**Result:** ${result}\n\n## Test Results\n\nTests: 42 passed`,
        'utf-8'
      );
    }
  }

  describe('happy path', () => {
    it('requires gh CLI to be available', { timeout: 30000 }, async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-feature' });
      await createPipelineArtifacts('test-feature', {
        includeScope: true,
        includePlan: true,
        includeBuild: true,
        includeVerify: true,
        verifyResult: 'PASS',
        includePrSummary: true
      });

      // This will fail if gh is not installed, which is fine for testing error path
      // In real use, gh must be available
      // Test just verifies it checks for gh before attempting PR creation
      const ghAvailable = spawnSync('gh', ['--version'], { stdio: 'pipe' }).status === 0;

      if (!ghAvailable) {
        expect(() => createPr('test-feature')).toThrow();
      }
      // If gh is available, test would create a real PR (not desired in tests)
      // We test the validation paths instead
    });
  });

  describe('configurable branchPrefix', () => {
    // @ana A015
    it('pr create warning uses slug-based check', async () => {
      // Branch is feature/test-feature — slug is test-feature. Branch matches slug, so no warning.
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-feature', branchPrefix: 'dev/' });
      await createPipelineArtifacts('test-feature', {
        includeBuild: true,
        includeVerify: true,
        verifyResult: 'PASS',
      });

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (...args: unknown[]) => { logs.push(args.join(' ')); };

      try {
        createPr('test-feature');
      } catch {
        // Expected — gh CLI may not be available, but warning is emitted before that
      }

      console.log = originalLog;
      const output = logs.join('\n');
      // Branch ends with /test-feature so slug matches — no warning emitted
      expect(output).not.toContain('Warning: Current branch');
    });

    // @ana A020
    it('pr create warns when branch does not match slug', async () => {
      // Branch is dev/other-branch — does not end with /test-feature
      await createTestProject({ artifactBranch: 'main', currentBranch: 'dev/other-branch', branchPrefix: 'dev/' });
      await createPipelineArtifacts('test-feature', {
        includeBuild: true,
        includeVerify: true,
        verifyResult: 'PASS',
      });

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (...args: unknown[]) => { logs.push(args.join(' ')); };

      try {
        createPr('test-feature');
      } catch {
        // Expected — gh CLI may not be available, but warning is emitted before that
      }

      console.log = originalLog;
      const output = logs.join('\n');
      expect(output).toContain("Warning: Current branch is 'dev/other-branch'");
      expect(output).toContain("ending with 'test-feature'");
    });
  });

  describe('missing files', () => {
    it('errors when verify report missing', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-feature' });
      await createPipelineArtifacts('test-feature', {
        includeBuild: true
      });

      expect(() => createPr('test-feature')).toThrow();
    });

    it('errors when build report missing', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-feature' });
      await createPipelineArtifacts('test-feature', {
        includeVerify: true,
        verifyResult: 'PASS'
      });

      expect(() => createPr('test-feature')).toThrow();
    });

    it('errors when ana.json missing', async () => {
      execSync('git init', { cwd: tempDir, stdio: 'ignore' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });

      expect(() => createPr('test-feature')).toThrow();
    });
  });

  describe('verification checks', () => {
    it('errors when verify result is FAIL', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-feature' });
      await createPipelineArtifacts('test-feature', {
        includeBuild: true,
        includeVerify: true,
        verifyResult: 'FAIL'
      });

      expect(() => createPr('test-feature')).toThrow();
    });
  });

  describe('compliance table', () => {
    /**
     * Helper to create full proof artifacts with contract data
     */
    async function createProofArtifacts(slug: string, options: {
      includeContract?: boolean;
      includePreCheck?: boolean;
      includeComplianceTable?: boolean;
    } = {}): Promise<void> {
      const artifactPath = path.join(tempDir, '.ana/plans/active', slug);
      await fs.mkdir(artifactPath, { recursive: true });

      // scope.md
      await fs.writeFile(
        path.join(artifactPath, 'scope.md'),
        '# Scope: Test Feature\n\n## Intent\nAdd test feature',
        'utf-8'
      );

      // plan.md
      await fs.writeFile(
        path.join(artifactPath, 'plan.md'),
        '# Plan\n\n## Phases\n\n- [x] Phase 1\n  - Spec: spec.md',
        'utf-8'
      );

      // contract.yaml
      if (options.includeContract !== false) {
        await fs.writeFile(
          path.join(artifactPath, 'contract.yaml'),
          `version: "1.0"
sealed_by: "AnaPlan"
feature: "Test Feature"

assertions:
  - id: A001
    says: "Creates item successfully"
    block: "creates item"
    target: "result"
    matcher: "equals"
    value: true
  - id: A002
    says: "Returns proper status"
    block: "returns status"
    target: "status"
    matcher: "equals"
    value: 200

file_changes:
  - path: "src/item.ts"
    action: create
`,
          'utf-8'
        );
      }

      // @ana A016
      // .saves.json with pre-check data (no ghost commit fields)
      if (options.includePreCheck !== false && options.includeContract !== false) {
        await fs.writeFile(
          path.join(artifactPath, '.saves.json'),
          JSON.stringify({
            scope: {
              saved_at: '2026-04-01T10:00:00.000Z',
              hash: 'sha256:scope123'
            },
            contract: {
              saved_at: '2026-04-01T10:30:00.000Z',
              hash: 'sha256:contract456'
            },
            'pre-check': {
              seal: 'INTACT',
              seal_hash: 'sha256:contract456',
              run_at: '2026-04-01T10:35:00.000Z'
            }
          }),
          'utf-8'
        );
      }

      // build_report.md
      await fs.writeFile(
        path.join(artifactPath, 'build_report.md'),
        `# Build Report

## PR Summary
- Added test feature
- Includes validation

## Deviations from Contract
None — contract followed exactly.
`,
        'utf-8'
      );

      // verify_report.md with compliance table
      const complianceTable = options.includeComplianceTable !== false
        ? `
## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Creates item successfully | ✅ SATISFIED | test line 10 |
| A002 | Returns proper status | ✅ SATISFIED | test line 20 |
`
        : '';

      await fs.writeFile(
        path.join(artifactPath, 'verify_report.md'),
        `# Verify Report

**Result:** PASS
${complianceTable}
## AC Walkthrough
- ✅ PASS Item creation works
- ✅ PASS Status returned correctly

## Verdict
**Shippable:** YES
`,
        'utf-8'
      );
    }

    it('includes compliance table when proof data exists', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-feature' });
      await createProofArtifacts('test-feature', {
        includeContract: true,
        includePreCheck: true,
        includeComplianceTable: true
      });

      // We can't actually run createPr without gh CLI, but we can test
      // the proof generation directly by importing generateProofSummary
      const { generateProofSummary } = await import('../../src/utils/proofSummary.js');
      const activeDir = path.join(tempDir, '.ana/plans/active/test-feature');
      const proof = generateProofSummary(activeDir);

      // Verify proof data is populated correctly
      expect(proof.feature).toBe('Test Feature');
      expect(proof.assertions.length).toBe(2);
      expect(proof.assertions[0]!.id).toBe('A001');
      expect(proof.assertions[0]!.says).toBe('Creates item successfully');
      expect(proof.assertions[0]!.verifyStatus).toBe('SATISFIED');
      expect(proof.contract.total).toBe(2);
      expect(proof.contract.satisfied).toBe(2);
    });

    it('works without proof data (graceful fallback)', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-feature' });

      // Create minimal artifacts without contract
      const artifactPath = path.join(tempDir, '.ana/plans/active/test-feature');
      await fs.mkdir(artifactPath, { recursive: true });

      await fs.writeFile(
        path.join(artifactPath, 'scope.md'),
        '# Scope: Test Feature\n\n## Intent\nAdd test feature',
        'utf-8'
      );

      await fs.writeFile(
        path.join(artifactPath, 'plan.md'),
        '# Plan\n\n## Phases\n\n- [x] Phase 1\n  - Spec: spec.md',
        'utf-8'
      );

      await fs.writeFile(
        path.join(artifactPath, 'build_report.md'),
        `# Build Report\n\n## PR Summary\n- Added feature\n`,
        'utf-8'
      );

      await fs.writeFile(
        path.join(artifactPath, 'verify_report.md'),
        `# Verify Report\n\n**Result:** PASS\n\n## Verdict\n**Shippable:** YES\n`,
        'utf-8'
      );

      // Test that generateProofSummary handles missing contract gracefully
      const { generateProofSummary } = await import('../../src/utils/proofSummary.js');
      const activeDir = path.join(tempDir, '.ana/plans/active/test-feature');
      const proof = generateProofSummary(activeDir);

      // Should return empty assertions but not crash
      expect(proof.assertions).toHaveLength(0);
      expect(proof.contract.total).toBe(0);
      expect(proof.result).toBe('PASS');
    });
  });

  describe('PR duplicate detection', () => {
    /**
     * Helper to create a mock spawnSync that intercepts gh commands
     * and passes through git commands to the real implementation.
     */
    async function mockGhCommands(ghPrListResponse: { status: number; stdout: string }) {
      const { spawnSync: realSpawnSync } = await vi.importActual<typeof import('node:child_process')>('node:child_process');
      vi.mocked(spawnSync).mockImplementation(
        ((command: string, args?: readonly string[], options?: object) => {
          if (command === 'gh') {
            if (args && args[0] === '--version') {
              return { pid: 0, status: 0, stdout: 'gh version 2.0.0\n', stderr: '', output: [null, '', ''], signal: null };
            }
            if (args && args[0] === 'pr' && args[1] === 'list') {
              return { pid: 0, status: ghPrListResponse.status, stdout: ghPrListResponse.stdout, stderr: '', output: [null, '', ''], signal: null };
            }
            if (args && args[0] === 'pr' && args[1] === 'create') {
              return { pid: 0, status: 0, stdout: 'https://github.com/org/repo/pull/42\n', stderr: '', output: [null, '', ''], signal: null };
            }
            // Other gh commands — return success
            return { pid: 0, status: 0, stdout: '', stderr: '', output: [null, '', ''], signal: null };
          }
          return realSpawnSync(command, args as string[], options);
        }) as typeof spawnSync,
      );
    }

    afterEach(() => {
      vi.mocked(spawnSync).mockRestore();
    });

    // @ana A014, A015
    it('blocks PR creation when merged PR exists', async () => {
      await createTestProject({ currentBranch: 'feature/test-feature' });
      await createPipelineArtifacts('test-feature', {
        includeScope: true, includePlan: true, includeBuild: true,
        includeVerify: true, verifyResult: 'PASS', includePrSummary: true,
      });
      execSync('git add -A && git commit -m "artifacts"', { cwd: tempDir, stdio: 'ignore' });

      await mockGhCommands({
        status: 0,
        stdout: JSON.stringify([{ state: 'MERGED', url: 'https://github.com/org/repo/pull/1' }]),
      });
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as never);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try { createPr('test-feature'); } catch { /* expected */ }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorOutput = errorSpy.mock.calls.flat().join(' ');
      expect(errorOutput).toContain('was already merged');
      expect(errorOutput).toContain('work complete');

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    // @ana A016, A017
    it('blocks PR creation when open PR exists', async () => {
      await createTestProject({ currentBranch: 'feature/test-feature' });
      await createPipelineArtifacts('test-feature', {
        includeScope: true, includePlan: true, includeBuild: true,
        includeVerify: true, verifyResult: 'PASS', includePrSummary: true,
      });
      execSync('git add -A && git commit -m "artifacts"', { cwd: tempDir, stdio: 'ignore' });

      await mockGhCommands({
        status: 0,
        stdout: JSON.stringify([{ state: 'OPEN', url: 'https://github.com/org/repo/pull/140' }]),
      });
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as never);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try { createPr('test-feature'); } catch { /* expected */ }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorOutput = errorSpy.mock.calls.flat().join(' ');
      expect(errorOutput).toContain('is already open');
      expect(errorOutput).toContain('https://github.com/org/repo/pull/140');

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    // @ana A018
    it('allows PR creation when no existing PR found', async () => {
      await createTestProject({ currentBranch: 'feature/test-feature' });
      await createPipelineArtifacts('test-feature', {
        includeScope: true, includePlan: true, includeBuild: true,
        includeVerify: true, verifyResult: 'PASS', includePrSummary: true,
      });
      execSync('git add -A && git commit -m "artifacts"', { cwd: tempDir, stdio: 'ignore' });

      await mockGhCommands({
        status: 0,
        stdout: JSON.stringify([]),
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      createPr('test-feature');

      // Guard passed — function did not exit(1) with guard messages
      const errorOutput = errorSpy.mock.calls.flat().join(' ');
      expect(errorOutput).not.toContain('was already merged');
      expect(errorOutput).not.toContain('is already open');
      // Function completed and printed PR URL
      const logOutput = logSpy.mock.calls.flat().join(' ');
      expect(logOutput).toContain('PR created');

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

});
