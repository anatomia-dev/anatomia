import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { saveArtifact, saveAllArtifacts, validateVerifyDataFormat, validateBuildDataFormat } from '../../src/commands/artifact.js';

/**
 * Tests for `ana artifact save` command
 *
 * Uses temp directories with real git repos for isolation.
 */

describe('ana artifact save', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-test-'));
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

    // Initial commit (git needs at least one commit)
    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });

    // Rename branch to match artifactBranch
    execSync(`git branch -M ${artifactBranch}`, { cwd: tempDir, stdio: 'ignore' });

    // Create feature branch if requested
    if (options.currentBranch && options.currentBranch !== artifactBranch) {
      execSync(`git checkout -b ${options.currentBranch}`, { cwd: tempDir, stdio: 'ignore' });
    }
  }

  /**
   * Helper to create an artifact file
   */
  /**
   * Create valid scope content that passes validation
   */
  function getValidScopeContent(): string {
    return `# Scope: test

## Intent
This is a test scope.

## Acceptance Criteria
- AC1: First criterion
- AC2: Second criterion
- AC3: Third criterion

### Structural Analog
work.ts — similar pattern`;
  }

  /**
   * Create valid spec content that passes validation
   */
  function getValidSpecContent(): string {
    return `# Spec: test

## Implementation
Details here.

file_changes:
  - path: src/test.ts
    action: create

## Build Brief
Rules that apply.`;
  }


  /**
   * Create valid build report content that passes validation
   */
  function getValidBuildReportContent(): string {
    return `# Build Report

## Deviations
None.

## Open Issues
None.

## Acceptance Criteria
All met.

## PR Summary
Ready to review.`;
  }

  /**
   * Create valid verify_data.yaml companion
   */
  function getValidVerifyDataContent(): string {
    return `schema: 1
findings:
  - category: code
    summary: "Test finding"
    file: "src/test.ts"
    severity: risk
    suggested_action: scope`;
  }

  /**
   * Create valid build_data.yaml companion
   */
  function getValidBuildDataContent(): string {
    return `schema: 1
concerns:
  - summary: "Test concern"
    severity: debt
    suggested_action: monitor`;
  }

  async function createArtifact(slug: string, fileName: string, content?: string): Promise<void> {
    const artifactPath = path.join(tempDir, '.ana', 'plans', 'active', slug);
    await fs.mkdir(artifactPath, { recursive: true });

    // Use validation-compliant defaults
    let fileContent = content;
    if (!fileContent) {
      if (fileName === 'scope.md') {
        fileContent = getValidScopeContent();
      } else if (fileName === 'spec.md' || fileName.match(/^spec-\d+\.md$/)) {
        fileContent = getValidSpecContent();
      } else if (fileName.startsWith('build_report')) {
        fileContent = getValidBuildReportContent();
      } else {
        fileContent = '# Test';
      }
    }

    await fs.writeFile(path.join(artifactPath, fileName), fileContent, 'utf-8');

    // Auto-create companion YAML for report artifacts (required by Foundation 2)
    if (fileName.match(/^verify_report(_\d+)?\.md$/)) {
      const companionName = fileName.replace(/_report/, '_data').replace(/\.md$/, '.yaml');
      const companionPath = path.join(artifactPath, companionName);
      if (!(await fs.stat(companionPath).catch(() => null))) {
        await fs.writeFile(companionPath, getValidVerifyDataContent(), 'utf-8');
      }
    } else if (fileName.match(/^build_report(_\d+)?\.md$/)) {
      const companionName = fileName.replace(/_report/, '_data').replace(/\.md$/, '.yaml');
      const companionPath = path.join(artifactPath, companionName);
      if (!(await fs.stat(companionPath).catch(() => null))) {
        await fs.writeFile(companionPath, getValidBuildDataContent(), 'utf-8');
      }
    }
  }

  /**
   * Helper to get the last commit message
   */
  function getLastCommitMessage(): string {
    return execSync('git log -1 --pretty=%B', { cwd: tempDir, encoding: 'utf-8' }).trim();
  }

  /**
   * Helper to check if a file is staged/committed
   */
  function isFileCommitted(filePath: string): boolean {
    try {
      execSync(`git ls-files --error-unmatch ${filePath}`, { cwd: tempDir, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  describe('type parsing', () => {
    it('parses scope type correctly', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'scope.md');

      saveArtifact('scope', 'test-slug');

      const message = getLastCommitMessage();
      expect(message).toContain('[test-slug] Scope');
      expect(message).toContain('Co-authored-by: Ana <build@anatomia.dev>');
    });

    it('parses plan type correctly', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const validPlan = `# Plan: test

## Phases

- [ ] Phase 1
  - Spec: spec.md`;
      await createArtifact('test-slug', 'plan.md', validPlan);

      saveArtifact('plan', 'test-slug');

      const message = getLastCommitMessage();
      expect(message).toContain('[test-slug] Plan');
    });

    it('parses spec type correctly', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'spec.md');

      saveArtifact('spec', 'test-slug');

      const message = getLastCommitMessage();
      expect(message).toContain('[test-slug] Spec');
    });

    it('parses spec-N type correctly', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'spec-2.md');

      saveArtifact('spec-2', 'test-slug');

      const message = getLastCommitMessage();
      expect(message).toContain('[test-slug] Spec 2');
    });

    it('parses build-report type correctly', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      await createArtifact('test-slug', 'build_report.md');

      saveArtifact('build-report', 'test-slug');

      const message = getLastCommitMessage();
      expect(message).toContain('[test-slug] Build report');
    });

    it('parses build-report-N type correctly', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      await createArtifact('test-slug', 'build_report_2.md');

      saveArtifact('build-report-2', 'test-slug');

      const message = getLastCommitMessage();
      expect(message).toContain('[test-slug] Build report 2');
    });

    it('parses verify-report type correctly', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      const validReport = `# Verify Report

**Result:** PASS

Content...`;
      await createArtifact('test-slug', 'verify_report.md', validReport);

      saveArtifact('verify-report', 'test-slug');

      const message = getLastCommitMessage();
      expect(message).toContain('[test-slug] Verify report');
    });

    it('parses verify-report-N type correctly', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      const validReport = `# Verify Report

**Result:** PASS

Content...`;
      await createArtifact('test-slug', 'verify_report_3.md', validReport);

      saveArtifact('verify-report-3', 'test-slug');

      const message = getLastCommitMessage();
      expect(message).toContain('[test-slug] Verify report 3');
    });

    it('rejects invalid type', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });

      expect(() => saveArtifact('invalid-type', 'test-slug')).toThrow();
    });
  });

  describe('branch validation', () => {
    it('allows scope save on artifact branch', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'scope.md');

      expect(() => saveArtifact('scope', 'test-slug')).not.toThrow();
    });

    it('rejects scope save on feature branch', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      await createArtifact('test-slug', 'scope.md');

      expect(() => saveArtifact('scope', 'test-slug')).toThrow();
    });

    it('allows build-report save on feature branch', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      await createArtifact('test-slug', 'build_report.md');

      expect(() => saveArtifact('build-report', 'test-slug')).not.toThrow();
    });

    it('rejects build-report save on artifact branch', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'build_report.md');

      expect(() => saveArtifact('build-report', 'test-slug')).toThrow();
    });

    it('allows verify-report save on feature branch', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      const validReport = `# Verify Report

**Result:** PASS`;
      await createArtifact('test-slug', 'verify_report.md', validReport);

      expect(() => saveArtifact('verify-report', 'test-slug')).not.toThrow();
    });

    it('rejects verify-report save on artifact branch', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'verify_report.md');

      expect(() => saveArtifact('verify-report', 'test-slug')).toThrow();
    });
  });

  describe('non-main artifact branch', () => {
    // @ana A006
    it('saveArtifact scope allowed on develop artifact branch', async () => {
      await createTestProject({ artifactBranch: 'develop', currentBranch: 'develop' });
      await createArtifact('test-slug', 'scope.md');

      expect(() => saveArtifact('scope', 'test-slug')).not.toThrow();
    });

    // @ana A007
    it('saveArtifact build-report rejected on develop artifact branch', async () => {
      await createTestProject({ artifactBranch: 'develop', currentBranch: 'develop' });
      await createArtifact('test-slug', 'build_report.md');

      expect(() => saveArtifact('build-report', 'test-slug')).toThrow();
    });

    // @ana A008
    it('saveArtifact build-report allowed on feature branch with develop artifact branch', async () => {
      await createTestProject({ artifactBranch: 'develop', currentBranch: 'feature/test-slug' });
      await createArtifact('test-slug', 'build_report.md');

      expect(() => saveArtifact('build-report', 'test-slug')).not.toThrow();
    });
  });

  describe('configurable branchPrefix', () => {
    // @ana A014
    it('artifact save error uses configured prefix in checkout hint', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main', branchPrefix: 'dev/' });
      await createArtifact('test-slug', 'build_report.md');

      const originalError = console.error;
      const errors: string[] = [];
      console.error = (...args: unknown[]) => { errors.push(args.join(' ')); };

      expect(() => saveArtifact('build-report', 'test-slug')).toThrow();

      console.error = originalError;
      const errorOutput = errors.join('\n');
      expect(errorOutput).toContain('dev/test-slug');
      expect(errorOutput).not.toContain('feature/test-slug');
    });
  });

  describe('file validation', () => {
    it('rejects when file does not exist', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });

      expect(() => saveArtifact('scope', 'test-slug')).toThrow();
    });

    it('succeeds when file exists', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'scope.md');

      expect(() => saveArtifact('scope', 'test-slug')).not.toThrow();
    });
  });

  describe('git operations', () => {
    it('creates correct commit message format', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'scope.md');

      saveArtifact('scope', 'test-slug');

      const message = getLastCommitMessage();
      expect(message).toBe('[test-slug] Scope\n\nCo-authored-by: Ana <build@anatomia.dev>');
    });

    it('commits the artifact file', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'scope.md');

      saveArtifact('scope', 'test-slug');

      expect(isFileCommitted('.ana/plans/active/test-slug/scope.md')).toBe(true);
    });
  });

  describe('special cases', () => {
    it('verify-report save also stages plan.md if it exists', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      const validReport = `# Verify Report

**Result:** PASS`;
      await createArtifact('test-slug', 'verify_report.md', validReport);
      const validPlan = `# Plan

## Phases

- [x] Phase 1
  - Spec: spec.md`;
      await createArtifact('test-slug', 'plan.md', validPlan);

      saveArtifact('verify-report', 'test-slug');

      // Both files should be committed
      expect(isFileCommitted('.ana/plans/active/test-slug/verify_report.md')).toBe(true);
      expect(isFileCommitted('.ana/plans/active/test-slug/plan.md')).toBe(true);
    });

    it('verify-report save succeeds even if plan.md does not exist', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      const validReport = `# Verify Report

**Result:** PASS`;
      await createArtifact('test-slug', 'verify_report.md', validReport);

      expect(() => saveArtifact('verify-report', 'test-slug')).not.toThrow();
      expect(isFileCommitted('.ana/plans/active/test-slug/verify_report.md')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('errors gracefully when not a git repo', async () => {
      // Create directory without git init
      const anaDir = path.join(tempDir, '.ana');
      await fs.mkdir(anaDir, { recursive: true });
      await fs.writeFile(
        path.join(anaDir, 'ana.json'),
        JSON.stringify({ artifactBranch: 'main' }),
        'utf-8'
      );
      await createArtifact('test-slug', 'scope.md');

      expect(() => saveArtifact('scope', 'test-slug')).toThrow();
    });

    it('errors when no ana.json exists', async () => {
      execSync('git init', { cwd: tempDir, stdio: 'ignore' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });

      expect(() => saveArtifact('scope', 'test-slug')).toThrow();
    });

    it('errors when artifactBranch field is missing', async () => {
      execSync('git init', { cwd: tempDir, stdio: 'ignore' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });

      const anaDir = path.join(tempDir, '.ana');
      await fs.mkdir(anaDir, { recursive: true });
      await fs.writeFile(
        path.join(anaDir, 'ana.json'),
        JSON.stringify({ version: '1.0.0' }),
        'utf-8'
      );

      expect(() => saveArtifact('scope', 'test-slug')).toThrow();
    });
  });

  describe('empty commit handling', () => {
    it('exits successfully when no changes to save', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'scope.md'); // Uses valid default

      // First save
      saveArtifact('scope', 'test-slug');
      expect(isFileCommitted('.ana/plans/active/test-slug/scope.md')).toBe(true);

      // Second save without changes should exit gracefully
      expect(() => saveArtifact('scope', 'test-slug')).toThrow();
    });
  });

  describe('create vs update messages', () => {
    it('uses plain message for first save', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'scope.md');

      saveArtifact('scope', 'test-slug');

      const message = getLastCommitMessage();
      expect(message).toContain('[test-slug] Scope');
      expect(message).not.toContain('Update:');
    });

    it('uses Update: prefix for re-save', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'scope.md'); // Uses valid default

      // First save
      saveArtifact('scope', 'test-slug');

      // Modify and re-save
      await fs.writeFile(
        path.join(tempDir, '.ana/plans/active/test-slug/scope.md'),
        getValidScopeContent().replace('This is a test scope', 'Modified scope'),
        'utf-8'
      );
      saveArtifact('scope', 'test-slug');

      const message = getLastCommitMessage();
      expect(message).toContain('[test-slug] Update: Scope');
    });
  });

  describe('plan format validation', () => {
    it('accepts valid plan.md', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const validPlan = `# Plan: test

## Phases

- [ ] Phase 1
  - Spec: spec.md`;
      await createArtifact('test-slug', 'plan.md', validPlan);

      expect(() => saveArtifact('plan', 'test-slug')).not.toThrow();
    });

    it('rejects plan.md without ## Phases heading', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const invalidPlan = `# Plan: test

- [ ] Phase 1
  - Spec: spec.md`;
      await createArtifact('test-slug', 'plan.md', invalidPlan);

      expect(() => saveArtifact('plan', 'test-slug')).toThrow();
    });

    it('rejects plan.md without checkboxes', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const invalidPlan = `# Plan: test

## Phases

Just a plain description`;
      await createArtifact('test-slug', 'plan.md', invalidPlan);

      expect(() => saveArtifact('plan', 'test-slug')).toThrow();
    });

    it('rejects plan.md with checkbox but no Spec reference', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const invalidPlan = `# Plan: test

## Phases

- [ ] Phase 1
  - Description: something`;
      await createArtifact('test-slug', 'plan.md', invalidPlan);

      expect(() => saveArtifact('plan', 'test-slug')).toThrow();
    });
  });

  describe('verify report validation', () => {
    it('accepts valid verify report with Result in first 10 lines', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      const validReport = `# Verify Report

**Result:** PASS

Other content...`;
      await createArtifact('test-slug', 'verify_report.md', validReport);

      expect(() => saveArtifact('verify-report', 'test-slug')).not.toThrow();
    });

    it('rejects verify report without Result line', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      const invalidReport = `# Verify Report

Some content without result`;
      await createArtifact('test-slug', 'verify_report.md', invalidReport);

      expect(() => saveArtifact('verify-report', 'test-slug')).toThrow();
    });

    it('rejects verify report with Result after line 10', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      const invalidReport = `# Verify Report

Line 2
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10
Line 11
**Result:** PASS`;
      await createArtifact('test-slug', 'verify_report.md', invalidReport);

      expect(() => saveArtifact('verify-report', 'test-slug')).toThrow();
    });
  });

  describe('scope format validation', () => {
    it('accepts valid scope with 3+ ACs and Structural Analog', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const validScope = `# Scope: test

## Intent
This adds a new feature.

## Acceptance Criteria
- AC1: First criterion
- AC2: Second criterion
- AC3: Third criterion

### Structural Analog
work.ts — similar command pattern`;
      await createArtifact('test-slug', 'scope.md', validScope);

      expect(() => saveArtifact('scope', 'test-slug')).not.toThrow();
    });

    it('rejects scope without sufficient ACs', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const invalidScope = `# Scope: test

## Intent
This adds a feature.

## Acceptance Criteria
- AC1: First criterion

### Structural Analog
work.ts`;
      await createArtifact('test-slug', 'scope.md', invalidScope);

      expect(() => saveArtifact('scope', 'test-slug')).toThrow();
    });

    it('rejects scope without Structural Analog', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const invalidScope = `# Scope: test

## Intent
This adds a feature.

## Acceptance Criteria
- AC1: First
- AC2: Second
- AC3: Third`;
      await createArtifact('test-slug', 'scope.md', invalidScope);

      expect(() => saveArtifact('scope', 'test-slug')).toThrow();
    });

    it('rejects scope with empty Intent', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const invalidScope = `# Scope: test

## Intent

## Acceptance Criteria
- AC1: First
- AC2: Second
- AC3: Third

### Structural Analog
work.ts`;
      await createArtifact('test-slug', 'scope.md', invalidScope);

      expect(() => saveArtifact('scope', 'test-slug')).toThrow();
    });
  });

  describe('spec format validation', () => {
    it('accepts valid spec with file_changes and Build Brief', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const validSpec = `# Spec

## Implementation
Details here.

<!-- MACHINE-READABLE -->
\`\`\`yaml
file_changes:
  - path: src/test.ts
    action: create
\`\`\`

## Build Brief
Rules that apply.`;
      await createArtifact('test-slug', 'spec.md', validSpec);

      expect(() => saveArtifact('spec', 'test-slug')).not.toThrow();
    });

    it('saves spec without file_changes YAML block', async () => {
      // S8: file_changes moved to contract.yaml - no longer required in spec
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const specWithoutFileChanges = `# Spec

## Implementation
Details here.

## Build Brief
Rules.`;
      await createArtifact('test-slug', 'spec.md', specWithoutFileChanges);

      expect(() => saveArtifact('spec', 'test-slug')).not.toThrow();
    });

    it('rejects spec without Build Brief', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const invalidSpec = `# Spec

Implementation details only.`;
      await createArtifact('test-slug', 'spec.md', invalidSpec);

      expect(() => saveArtifact('spec', 'test-slug')).toThrow();
    });
  });


  describe('build-report format validation', () => {
    it('accepts valid build report with all sections', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      const validReport = `# Build Report

## Deviations from Spec
None.

## Open Issues
None.

## Acceptance Criteria
All met.

## PR Summary
Ready to review.`;
      await createArtifact('test-slug', 'build_report.md', validReport);

      expect(() => saveArtifact('build-report', 'test-slug')).not.toThrow();
    });

    it('rejects build report without Deviations', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      const invalidReport = `# Build Report

## Open Issues
None.`;
      await createArtifact('test-slug', 'build_report.md', invalidReport);

      expect(() => saveArtifact('build-report', 'test-slug')).toThrow();
    });

    it('rejects build report without Open Issues', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      const invalidReport = `# Build Report

## Deviations
None.`;
      await createArtifact('test-slug', 'build_report.md', invalidReport);

      expect(() => saveArtifact('build-report', 'test-slug')).toThrow();
    });

    it('rejects build report without AC Coverage', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      const invalidReport = `# Build Report

## Deviations
None.

## Open Issues
None.

## PR Summary
Done.`;
      await createArtifact('test-slug', 'build_report.md', invalidReport);

      expect(() => saveArtifact('build-report', 'test-slug')).toThrow();
    });

    it('rejects build report without PR Summary', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      const invalidReport = `# Build Report

## Deviations
None.

## Open Issues
None.

## Acceptance Criteria
Met.`;
      await createArtifact('test-slug', 'build_report.md', invalidReport);

      expect(() => saveArtifact('build-report', 'test-slug')).toThrow();
    });
  });


  describe('coAuthor from config', () => {
    it('uses coAuthor from ana.json when present', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });

      // Update ana.json with custom coAuthor
      const anaJsonPath = path.join(tempDir, '.ana', 'ana.json');
      const meta = JSON.parse(await fs.readFile(anaJsonPath, 'utf-8'));
      meta.coAuthor = 'Custom Bot <bot@example.com>';
      await fs.writeFile(anaJsonPath, JSON.stringify(meta), 'utf-8');

      await createArtifact('test-slug', 'scope.md'); // Uses valid default
      saveArtifact('scope', 'test-slug');

      const message = getLastCommitMessage();
      expect(message).toContain('Co-authored-by: Custom Bot <bot@example.com>');
    });

    it('falls back to default coAuthor when field missing', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'scope.md'); // Uses valid default

      saveArtifact('scope', 'test-slug');

      const message = getLastCommitMessage();
      expect(message).toContain('Co-authored-by: Ana <build@anatomia.dev>');
    });
  });

  describe('contract validation', () => {
    /**
     * Create valid contract content that passes validation
     */
    function getValidContractContent(): string {
      return `version: "1.0"
sealed_by: "AnaPlan"
feature: "Test Feature"

assertions:
  - id: A001
    says: "Creating a payment returns success"
    block: "creates payment intent"
    target: "response.status"
    matcher: "equals"
    value: 200
  - id: A002
    says: "Response includes data"
    block: "response has body"
    target: "response.body"
    matcher: "exists"

file_changes:
  - path: "src/test.ts"
    action: create`;
    }

    it('accepts valid contract', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'contract.yaml', getValidContractContent());

      expect(() => saveArtifact('contract', 'test-slug')).not.toThrow();
      expect(isFileCommitted('.ana/plans/active/test-slug/contract.yaml')).toBe(true);
    });

    it('rejects unknown matcher', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const invalidContract = getValidContractContent().replace('matcher: "equals"', 'matcher: "resembles"');
      await createArtifact('test-slug', 'contract.yaml', invalidContract);

      expect(() => saveArtifact('contract', 'test-slug')).toThrow();
    });

    it('rejects missing says field', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const invalidContract = `version: "1.0"
sealed_by: "AnaPlan"
feature: "Test Feature"

assertions:
  - id: A001
    block: "test block"
    target: "test.target"
    matcher: "equals"
    value: 200

file_changes:
  - path: "src/test.ts"
    action: create`;
      await createArtifact('test-slug', 'contract.yaml', invalidContract);

      expect(() => saveArtifact('contract', 'test-slug')).toThrow();
    });

    it('rejects duplicate assertion IDs', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const invalidContract = `version: "1.0"
sealed_by: "AnaPlan"
feature: "Test Feature"

assertions:
  - id: A001
    says: "First assertion"
    block: "test block"
    target: "test.target"
    matcher: "equals"
    value: 200
  - id: A001
    says: "Second assertion same ID"
    block: "test block"
    target: "test.target2"
    matcher: "exists"

file_changes:
  - path: "src/test.ts"
    action: create`;
      await createArtifact('test-slug', 'contract.yaml', invalidContract);

      expect(() => saveArtifact('contract', 'test-slug')).toThrow();
    });

    it('rejects empty assertions array', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const invalidContract = `version: "1.0"
sealed_by: "AnaPlan"
feature: "Test Feature"

assertions: []

file_changes:
  - path: "src/test.ts"
    action: create`;
      await createArtifact('test-slug', 'contract.yaml', invalidContract);

      expect(() => saveArtifact('contract', 'test-slug')).toThrow();
    });

    it('requires value for equals matcher', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const invalidContract = `version: "1.0"
sealed_by: "AnaPlan"
feature: "Test Feature"

assertions:
  - id: A001
    says: "Equals without value"
    block: "test block"
    target: "test.target"
    matcher: "equals"

file_changes:
  - path: "src/test.ts"
    action: create`;
      await createArtifact('test-slug', 'contract.yaml', invalidContract);

      expect(() => saveArtifact('contract', 'test-slug')).toThrow();
    });

    it('does not require value for exists matcher', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const validContract = `version: "1.0"
sealed_by: "AnaPlan"
feature: "Test Feature"

assertions:
  - id: A001
    says: "Exists without value"
    block: "test block"
    target: "test.target"
    matcher: "exists"

file_changes:
  - path: "src/test.ts"
    action: create`;
      await createArtifact('test-slug', 'contract.yaml', validContract);

      expect(() => saveArtifact('contract', 'test-slug')).not.toThrow();
    });

    it('accepts not_contains matcher with value', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const validContract = `version: "1.0"
sealed_by: "AnaPlan"
feature: "Test Feature"

assertions:
  - id: A001
    says: "Error message does not contain debug info"
    block: "error handling"
    target: "error.message"
    matcher: "not_contains"
    value: "DEBUG"

file_changes:
  - path: "src/test.ts"
    action: create`;
      await createArtifact('test-slug', 'contract.yaml', validContract);

      expect(() => saveArtifact('contract', 'test-slug')).not.toThrow();
      expect(isFileCommitted('.ana/plans/active/test-slug/contract.yaml')).toBe(true);
    });

    it('rejects not_contains matcher without value', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const invalidContract = `version: "1.0"
sealed_by: "AnaPlan"
feature: "Test Feature"

assertions:
  - id: A001
    says: "Not contains without value"
    block: "test block"
    target: "test.target"
    matcher: "not_contains"

file_changes:
  - path: "src/test.ts"
    action: create`;
      await createArtifact('test-slug', 'contract.yaml', invalidContract);

      expect(() => saveArtifact('contract', 'test-slug')).toThrow();
    });

    it('rejects missing file_changes', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      const invalidContract = `version: "1.0"
sealed_by: "AnaPlan"
feature: "Test Feature"

assertions:
  - id: A001
    says: "Test assertion"
    block: "test block"
    target: "test.target"
    matcher: "exists"`;
      await createArtifact('test-slug', 'contract.yaml', invalidContract);

      expect(() => saveArtifact('contract', 'test-slug')).toThrow();
    });

    it('writes .saves.json entry for contract', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'contract.yaml', getValidContractContent());

      saveArtifact('contract', 'test-slug');

      const savesPath = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug', '.saves.json');
      const saves = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
      expect(saves.contract).toBeDefined();
      expect(saves.contract.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });
  });

  describe('auto pre-check on verify-report save', () => {
    /**
     * Create valid contract content
     */
    function getValidContractContent(): string {
      return `version: "1.0"
sealed_by: "AnaPlan"
feature: "Test Feature"

assertions:
  - id: A001
    says: "Test passes"
    block: "test"
    target: "result"
    matcher: "truthy"

file_changes:
  - path: "src/test.ts"
    action: create`;
    }

    /**
     * Create valid verify report content
     */
    function getValidVerifyReport(): string {
      return `# Verify Report

**Result:** PASS

All good.`;
    }

    // @ana A003
    it('blocks save when contract is tampered', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });

      // Create contract and save it (creates .saves.json)
      const contractContent = getValidContractContent();
      await createArtifact('test-slug', 'contract.yaml', contractContent);
      execSync('git add -A && git commit -m "contract"', { cwd: tempDir, stdio: 'ignore' });

      // Write .saves.json with the contract hash
      const hash = `sha256:${createHash('sha256').update(contractContent).digest('hex')}`;
      const savesPath = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug', '.saves.json');
      await fs.writeFile(savesPath, JSON.stringify({
        contract: {
          saved_at: new Date().toISOString(),
          hash,
        }
      }), 'utf-8');

      // Modify the contract (tamper)
      await fs.writeFile(
        path.join(tempDir, '.ana/plans/active/test-slug/contract.yaml'),
        getValidContractContent().replace('Test passes', 'MODIFIED'),
        'utf-8'
      );

      // Try to save verify report - should fail
      await createArtifact('test-slug', 'verify_report.md', getValidVerifyReport());

      expect(() => saveArtifact('verify-report', 'test-slug')).toThrow();
    });

    it('warns on uncovered assertions but saves', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });

      // Create contract with 2 assertions
      const contractWithTwo = `version: "1.0"
sealed_by: "AnaPlan"
feature: "Test Feature"

assertions:
  - id: A001
    says: "First assertion"
    block: "test"
    target: "result"
    matcher: "truthy"
  - id: A002
    says: "Second assertion"
    block: "test"
    target: "result"
    matcher: "truthy"

file_changes:
  - path: "src/test.ts"
    action: create`;

      await createArtifact('test-slug', 'contract.yaml', contractWithTwo);
      execSync('git add -A && git commit -m "contract"', { cwd: tempDir, stdio: 'ignore' });

      const hash = `sha256:${createHash('sha256').update(contractWithTwo).digest('hex')}`;
      const savesPath = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug', '.saves.json');
      await fs.writeFile(savesPath, JSON.stringify({
        contract: {
          saved_at: new Date().toISOString(),
          hash,
        }
      }), 'utf-8');

      // Create test file covering only A001
      const testPath = path.join(tempDir, 'tests', 'test.test.ts');
      await fs.mkdir(path.dirname(testPath), { recursive: true });
      await fs.writeFile(testPath, '// @ana A001\ntest()', 'utf-8');

      // Create verify report
      await createArtifact('test-slug', 'verify_report.md', getValidVerifyReport());

      // Should save but warn (capture stdout/stderr)
      const originalWarn = console.warn;
      const warnings: string[] = [];
      console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(' '));
      };

      try {
        saveArtifact('verify-report', 'test-slug');
      } finally {
        console.warn = originalWarn;
      }

      // No UNCOVERED warnings — tag coverage removed, seal-only pre-check
      expect(warnings.some(w => w.includes('UNCOVERED'))).toBe(false);
      expect(isFileCommitted('.ana/plans/active/test-slug/verify_report.md')).toBe(true);
    });

    // @ana A013
    it('stores pre-check results in .saves.json', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });

      const contractContent = getValidContractContent();
      await createArtifact('test-slug', 'contract.yaml', contractContent);
      execSync('git add -A && git commit -m "contract"', { cwd: tempDir, stdio: 'ignore' });

      const hash = `sha256:${createHash('sha256').update(contractContent).digest('hex')}`;
      const savesPath = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug', '.saves.json');
      await fs.writeFile(savesPath, JSON.stringify({
        contract: {
          saved_at: new Date().toISOString(),
          hash,
        }
      }), 'utf-8');

      await createArtifact('test-slug', 'verify_report.md', getValidVerifyReport());
      saveArtifact('verify-report', 'test-slug');

      // Read .saves.json and verify pre-check key exists (seal-only)
      const saves = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
      expect(saves['pre-check']).toBeDefined();
      expect(saves['pre-check'].seal).toBe('INTACT');
      expect(saves['pre-check'].seal_hash).toBeDefined();
      expect(saves['pre-check'].run_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      // No assertions, covered, or uncovered in seal-only data
      expect(saves['pre-check'].assertions).toBeUndefined();
      expect(saves['pre-check'].covered).toBeUndefined();
      expect(saves['pre-check'].uncovered).toBeUndefined();
    });
  });

  describe('.saves.json metadata', () => {
    // @ana A008
    it('writes .saves.json with save metadata', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'scope.md');

      saveArtifact('scope', 'test-slug');

      // Read .saves.json
      const savesPath = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug', '.saves.json');
      expect(await fs.stat(savesPath).catch(() => null)).not.toBeNull();

      const saves = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
      expect(saves.scope).toBeDefined();
      expect(saves.scope.saved_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(saves.scope.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    // @ana A009
    it('step 9a post-commit fixup no longer exists in source', async () => {
      const fsSync = await import('node:fs');
      const sourcePath = path.resolve(__dirname, '../../src/commands/artifact.ts');
      const source = fsSync.readFileSync(sourcePath, 'utf-8');
      // Step 9a was the post-commit fixup that re-wrote .saves.json with the real commit hash
      expect(source).not.toContain('9a.');
      expect(source).not.toContain('Update .saves.json on disk with the real commit hash');
    });

    it('appends to existing .saves.json on subsequent saves', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'scope.md');
      await createArtifact('test-slug', 'spec.md');

      // Save scope first
      saveArtifact('scope', 'test-slug');

      const savesPath = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug', '.saves.json');
      const savesAfterScope = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
      expect(savesAfterScope.scope).toBeDefined();
      const scopeHash = savesAfterScope.scope.hash;

      // Save spec second
      saveArtifact('spec', 'test-slug');

      const savesAfterSpec = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
      expect(savesAfterSpec.scope).toBeDefined();
      expect(savesAfterSpec.spec).toBeDefined();
      // Scope entry should be unchanged
      expect(savesAfterSpec.scope.hash).toBe(scopeHash);
    });

    it('overwrites entry on re-save of same type', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'scope.md');

      saveArtifact('scope', 'test-slug');

      const savesPath = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug', '.saves.json');
      const savesFirst = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
      const firstHash = savesFirst.scope.hash;
      const firstSavedAt = savesFirst.scope.saved_at;

      // Modify and re-save
      await fs.writeFile(
        path.join(tempDir, '.ana/plans/active/test-slug/scope.md'),
        getValidScopeContent().replace('This is a test scope', 'Modified scope content'),
        'utf-8'
      );

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      saveArtifact('scope', 'test-slug');

      const savesSecond = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
      expect(savesSecond.scope.hash).not.toBe(firstHash);
      expect(savesSecond.scope.saved_at).not.toBe(firstSavedAt);
    });
  });

  describe('writeSaveMetadata idempotency', () => {
    // @ana A005
    it('returns false when hash matches existing entry', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'scope.md');

      // First save creates .saves.json with hash
      saveArtifact('scope', 'test-slug');

      const savesPath = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug', '.saves.json');
      const savesFirst = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
      const firstHash = savesFirst.scope.hash;

      // Second save with same content — writeSaveMetadata skips, no-changes check
      // exits with "already up to date" (process.exit(0) throws in test)
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };

      try {
        saveArtifact('scope', 'test-slug');
      } catch { /* exit(0) throws */ }

      console.log = originalLog;

      // Hash should be unchanged (idempotent write was skipped)
      const savesSecond = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
      expect(savesSecond.scope.hash).toBe(firstHash);
    });

    // @ana A006
    it('preserves saved_at when hash matches', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'scope.md');

      saveArtifact('scope', 'test-slug');

      const savesPath = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug', '.saves.json');
      const savesFirst = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
      const firstSavedAt = savesFirst.scope.saved_at;

      // Wait briefly for time difference
      await new Promise(resolve => setTimeout(resolve, 10));

      // Re-save unchanged — process.exit(0) throws in test, but .saves.json
      // should still be on disk with unchanged saved_at
      try { saveArtifact('scope', 'test-slug'); } catch { /* exit(0) throws */ }

      const savesSecond = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
      expect(savesSecond.scope.saved_at).toBe(firstSavedAt);
    });

    // @ana A007
    it('preserves existing entries like pre-check and modules_touched', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      await createArtifact('test-slug', 'build_report.md');

      // Pre-populate .saves.json with extra entries
      const slugDir = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug');
      const savesPath = path.join(slugDir, '.saves.json');
      await fs.writeFile(savesPath, JSON.stringify({
        'pre-check': { seal: 'INTACT', run_at: '2026-04-27T00:00:00Z' },
        'modules_touched': ['src/index.ts'],
      }), 'utf-8');

      saveArtifact('build-report', 'test-slug');

      const saves = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
      expect(saves['pre-check']).toBeDefined();
      expect(saves['pre-check'].seal).toBe('INTACT');
      expect(saves['modules_touched']).toBeDefined();
      expect(saves['build-report']).toBeDefined();
    });
  });

  describe('save bypass recovery', () => {
    // @ana A001, A002, A003
    it('writes metadata when artifact was committed outside save', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      await createArtifact('test-slug', 'build_report.md');

      // Commit the artifact outside of `saveArtifact`
      execSync('git add -A && git commit -m "manual commit"', { cwd: tempDir, stdio: 'ignore' });
      const commitCountBefore = parseInt(
        execSync('git rev-list --count HEAD', { cwd: tempDir, encoding: 'utf-8' }).trim()
      );

      // Now run saveArtifact — artifact is already committed, but .saves.json is missing
      saveArtifact('build-report', 'test-slug');

      // Verify .saves.json has metadata
      const savesPath = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug', '.saves.json');
      const saves = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
      expect(saves['build-report']).toBeDefined();
      expect(saves['build-report'].saved_at).toBeTruthy();
      expect(saves['build-report'].hash).toMatch(/^sha256:[a-f0-9]{64}$/);

      // Verify modules_touched was captured
      expect(saves['modules_touched']).toBeDefined();

      // Verify a new commit was produced (for the .saves.json metadata)
      const commitCountAfter = parseInt(
        execSync('git rev-list --count HEAD', { cwd: tempDir, encoding: 'utf-8' }).trim()
      );
      expect(commitCountAfter).toBeGreaterThan(commitCountBefore);
    });

    // @ana A004
    it('exits with already up to date on unchanged re-save', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      await createArtifact('test-slug', 'build_report.md');

      // First save
      saveArtifact('build-report', 'test-slug');
      const commitCountAfterFirst = parseInt(
        execSync('git rev-list --count HEAD', { cwd: tempDir, encoding: 'utf-8' }).trim()
      );

      // Second save — no changes, should exit(0) with "already up to date"
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };

      try {
        saveArtifact('build-report', 'test-slug');
      } catch { /* exit(0) throws in test */ }

      console.log = originalLog;

      // No new commit
      const commitCountAfterSecond = parseInt(
        execSync('git rev-list --count HEAD', { cwd: tempDir, encoding: 'utf-8' }).trim()
      );
      expect(commitCountAfterSecond - commitCountAfterFirst).toBe(0);
    });
  });

  describe('subdirectory cwd', () => {
    // @ana A008
    it('saveArtifact succeeds from subdirectory', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      await createArtifact('test-slug', 'build_report.md');

      // Create and chdir to a subdirectory
      const subDir = path.join(tempDir, 'packages', 'cli');
      await fs.mkdir(subDir, { recursive: true });
      process.chdir(subDir);

      // Should succeed despite being in subdirectory
      saveArtifact('build-report', 'test-slug');

      const savesPath = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug', '.saves.json');
      const saves = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
      expect(saves['build-report']).toBeDefined();
    });
  });
});

describe('ana artifact save-all', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'save-all-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  async function createTestProject(): Promise<void> {
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });

    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify({ artifactBranch: 'main', coAuthor: 'Ana <build@anatomia.dev>' }),
      'utf-8'
    );

    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });
    execSync('git branch -M main', { cwd: tempDir, stdio: 'ignore' });
  }

  async function createArtifact(slug: string, fileName: string, content: string): Promise<void> {
    const artifactPath = path.join(tempDir, '.ana', 'plans', 'active', slug);
    await fs.mkdir(artifactPath, { recursive: true });
    await fs.writeFile(path.join(artifactPath, fileName), content, 'utf-8');

    // Auto-create companion YAML for report artifacts (required by Foundation 2)
    if (fileName.match(/^verify_report(_\d+)?\.md$/)) {
      const companionName = fileName.replace(/_report/, '_data').replace(/\.md$/, '.yaml');
      const companionPath = path.join(artifactPath, companionName);
      if (!(await fs.stat(companionPath).catch(() => null))) {
        await fs.writeFile(companionPath, 'schema: 1\nfindings:\n  - category: code\n    summary: "Test finding"\n    file: "src/test.ts"\n    severity: risk\n    suggested_action: scope', 'utf-8');
      }
    } else if (fileName.match(/^build_report(_\d+)?\.md$/)) {
      const companionName = fileName.replace(/_report/, '_data').replace(/\.md$/, '.yaml');
      const companionPath = path.join(artifactPath, companionName);
      if (!(await fs.stat(companionPath).catch(() => null))) {
        await fs.writeFile(companionPath, 'schema: 1\nconcerns:\n  - summary: "Test concern"\n    severity: debt\n    suggested_action: monitor', 'utf-8');
      }
    }
  }

  function getLastCommitMessage(): string {
    return execSync('git log -1 --pretty=%B', { cwd: tempDir, encoding: 'utf-8' }).trim();
  }

  function isFileCommitted(filePath: string): boolean {
    try {
      execSync(`git ls-files --error-unmatch ${filePath}`, { cwd: tempDir, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Helper to capture errors from functions that call process.exit
   */
  function captureError(fn: () => void): string {
    const originalExit = process.exit;
    const originalError = console.error;
    const errors: string[] = [];

    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    };

    process.exit = ((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as typeof process.exit;

    try {
      fn();
      return errors.join('\n'); // Return captured errors even if no exit
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('process.exit')) {
        return errors.join('\n');
      }
      throw error;
    } finally {
      console.error = originalError;
      process.exit = originalExit;
    }
  }

  it('saves all artifacts in single commit', async () => {
    await createTestProject();

    const validPlan = `# Plan
## Phases
- [ ] Phase 1
  - Spec: spec.md`;

    const validSpec = `# Spec
file_changes:
  - path: test.ts
    action: create
## Build Brief
Rules.`;

    await createArtifact('test-slug', 'plan.md', validPlan);
    await createArtifact('test-slug', 'spec.md', validSpec);

    saveAllArtifacts('test-slug');

    const message = getLastCommitMessage();
    expect(message).toContain('[test-slug] Save:');
    expect(message).toContain('Plan');
    expect(message).toContain('Spec');
  });

  it('saves partial artifacts when only some exist', async () => {
    await createTestProject();

    const validSpec = `# Spec
file_changes:
  - path: test.ts
    action: create
## Build Brief
Rules.`;

    await createArtifact('test-slug', 'spec.md', validSpec);

    saveAllArtifacts('test-slug');

    const message = getLastCommitMessage();
    expect(message).toContain('[test-slug] Save: Spec');
  });

  it('errors when directory is empty', async () => {
    await createTestProject();

    const slugDir = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug');
    await fs.mkdir(slugDir, { recursive: true });

    const error = captureError(() => saveAllArtifacts('test-slug'));
    expect(error).toContain('No artifacts found in plan directory');
  });

  it('errors when plan.md validation fails', async () => {
    await createTestProject();

    const invalidPlan = `# Plan\nNo phases section`;
    const validSpec = `# Spec
file_changes:
  - path: test.ts
    action: create
## Build Brief
Rules.`;

    await createArtifact('test-slug', 'plan.md', invalidPlan);
    await createArtifact('test-slug', 'spec.md', validSpec);

    const error = captureError(() => saveAllArtifacts('test-slug'));
    expect(error).toContain('plan.md format invalid');
  });

  it('uses Update prefix for re-save', async () => {
    await createTestProject();

    const validSpec = `# Spec
file_changes:
  - path: test.ts
    action: create
## Build Brief
Rules.`;

    await createArtifact('test-slug', 'spec.md', validSpec);
    saveAllArtifacts('test-slug');

    // Modify and re-save
    await createArtifact('test-slug', 'spec.md', validSpec.replace('test.ts', 'test2.ts'));
    saveAllArtifacts('test-slug');

    const message = getLastCommitMessage();
    expect(message).toContain('[test-slug] Update: Spec');
    expect(message).not.toContain('Save');
  });

  it('attempts push after committing', async () => {
    await createTestProject();

    const validSpec = `# Spec
file_changes:
  - path: test.ts
    action: create
## Build Brief
Rules.`;

    await createArtifact('test-slug', 'spec.md', validSpec);

    // Capture stderr to verify push attempt
    const stderr = captureError(() => saveAllArtifacts('test-slug'));

    // Push fails in test environment (no remote) but should be attempted
    expect(stderr).toContain('Warning: Push failed');
  });

  it('writes .saves.json for all saved artifacts', async () => {
    await createTestProject();

    const validPlan = `# Plan
## Phases
- [ ] Phase 1
  - Spec: spec.md`;

    const validSpec = `# Spec
file_changes:
  - path: test.ts
    action: create
## Build Brief
Rules.`;

    await createArtifact('test-slug', 'plan.md', validPlan);
    await createArtifact('test-slug', 'spec.md', validSpec);

    saveAllArtifacts('test-slug');

    // Read .saves.json
    const savesPath = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug', '.saves.json');
    const saves = JSON.parse(await fs.readFile(savesPath, 'utf-8'));

    // Both artifacts should have entries
    expect(saves.plan).toBeDefined();
    expect(saves.spec).toBeDefined();

    // Each should have proper metadata
    for (const type of ['plan', 'spec']) {
      expect(saves[type].saved_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(saves[type].hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it('save-all includes contract.yaml', async () => {
    await createTestProject();

    const validPlan = `# Plan
## Phases
- [ ] Phase 1
  - Spec: spec.md`;

    const validContract = `version: "1.0"
sealed_by: "AnaPlan"
feature: "Test Feature"

assertions:
  - id: A001
    says: "Test assertion"
    block: "test block"
    target: "test.target"
    matcher: "exists"

file_changes:
  - path: "src/test.ts"
    action: create`;

    const validSpec = `# Spec
## Build Brief
Rules.`;

    await createArtifact('test-slug', 'plan.md', validPlan);
    await createArtifact('test-slug', 'contract.yaml', validContract);
    await createArtifact('test-slug', 'spec.md', validSpec);

    saveAllArtifacts('test-slug');

    const message = getLastCommitMessage();
    expect(message).toContain('Plan');
    expect(message).toContain('Contract');
    expect(message).toContain('Spec');

    // Verify all are committed
    expect(isFileCommitted('.ana/plans/active/test-slug/plan.md')).toBe(true);
    expect(isFileCommitted('.ana/plans/active/test-slug/contract.yaml')).toBe(true);
    expect(isFileCommitted('.ana/plans/active/test-slug/spec.md')).toBe(true);
  });

  // @ana A023
  it('save-all blocks on TAMPERED contract seal', async () => {
    await createTestProject();

    // Create and commit contract on main
    const contractContent = `version: "1.0"
sealed_by: "AnaPlan"
feature: "Test Feature"

assertions:
  - id: A001
    says: "Test passes"
    block: "test"
    target: "result"
    matcher: "truthy"

file_changes:
  - path: "src/test.ts"
    action: create`;

    await createArtifact('test-slug', 'contract.yaml', contractContent);
    execSync('git add -A && git commit -m "contract"', { cwd: tempDir, stdio: 'ignore' });

    // Write .saves.json with contract hash
    const slugDir = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug');
    const hash = `sha256:${createHash('sha256').update(contractContent).digest('hex')}`;
    await fs.writeFile(
      path.join(slugDir, '.saves.json'),
      JSON.stringify({ contract: { saved_at: new Date().toISOString(), hash } }),
      'utf-8'
    );

    // Tamper with contract (still on main)
    await fs.writeFile(
      path.join(slugDir, 'contract.yaml'),
      contractContent.replace('Test passes', 'MODIFIED'),
      'utf-8'
    );

    // Add verify report
    await createArtifact('test-slug', 'verify_report.md',
      '# Verify Report\n\n**Result:** PASS\n\nAll good.');

    // save-all should block on TAMPERED
    const error = captureError(() => saveAllArtifacts('test-slug'));
    expect(error).toContain('tampered');
  });

  // @ana A022, A024, A026
  it('save-all runs pre-check and writes data to .saves.json', async () => {
    await createTestProject();

    // Create contract + verify report on main (save-all with planning+build-verify
    // artifacts works on artifact branch; pre-check fires for verify-report)
    const contractContent = `version: "1.0"
sealed_by: "AnaPlan"
feature: "Test Feature"

assertions:
  - id: A001
    says: "Test passes"
    block: "test"
    target: "result"
    matcher: "truthy"

file_changes:
  - path: "src/test.ts"
    action: create`;

    const slugDir = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug');
    await createArtifact('test-slug', 'contract.yaml', contractContent);

    // Commit contract first so seal check has a baseline
    execSync('git add -A && git commit -m "contract"', { cwd: tempDir, stdio: 'ignore' });

    // Write .saves.json with correct contract hash
    const hash = `sha256:${createHash('sha256').update(contractContent).digest('hex')}`;
    await fs.writeFile(
      path.join(slugDir, '.saves.json'),
      JSON.stringify({ contract: { saved_at: new Date().toISOString(), hash } }),
      'utf-8'
    );

    // Create tagged test file for coverage
    const testDir = path.join(tempDir, 'tests');
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(path.join(testDir, 'test.test.ts'), '// @ana A001\ntest()', 'utf-8');
    execSync('git add -A && git commit -m "tests"', { cwd: tempDir, stdio: 'ignore' });

    // Add verify report to slug dir
    await createArtifact('test-slug', 'verify_report.md',
      '# Verify Report\n\n**Result:** PASS\n\nAll good.');

    saveAllArtifacts('test-slug');

    // Read .saves.json and verify pre-check data (seal-only)
    const savesPath = path.join(slugDir, '.saves.json');
    const saves = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
    expect(saves['pre-check']).toBeDefined();
    expect(saves['pre-check'].seal).toBe('INTACT');
    // No assertions, covered, or uncovered in seal-only data
    expect(saves['pre-check'].assertions).toBeUndefined();
    expect(saves['pre-check'].covered).toBeUndefined();
  });

  // @ana A025, A027, A028
  it('save-all captures modules_touched for build-report', async () => {
    await createTestProject();

    // Commit an initial source file
    const srcDir = path.join(tempDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'index.ts'), 'export const x = 1;', 'utf-8');
    execSync('git add -A && git commit -m "source files"', { cwd: tempDir, stdio: 'ignore' });

    // Create feature branch and modify a source file
    execSync('git checkout -b feature/test-slug', { cwd: tempDir, stdio: 'ignore' });
    await fs.writeFile(path.join(srcDir, 'index.ts'), 'export const x = 2;', 'utf-8');
    execSync('git add -A && git commit -m "modify source"', { cwd: tempDir, stdio: 'ignore' });

    // Create build report with all required sections
    const buildReport = `# Build Report: Test

**Created by:** AnaBuild
**Date:** 2026-04-26

## What Was Built
- src/index.ts (modified): changed value

## PR Summary
- Changed value

## Acceptance Criteria Coverage
- AC1 → test

## Deviations from Contract
None

## Test Results
Tests: 1 passed

## Git History
abc123 modify source

## Open Issues
None`;

    await createArtifact('test-slug', 'build_report.md', buildReport);

    saveAllArtifacts('test-slug');

    // Read .saves.json and verify modules_touched
    const slugDir = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug');
    const savesPath = path.join(slugDir, '.saves.json');
    const saves = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
    expect(saves['modules_touched']).toBeDefined();
    expect(saves['modules_touched']).toContain('src/index.ts');
  });
});

describe('validateVerifyDataFormat', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-data-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A001
  it('validates verify_data.yaml with all required fields', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `schema: 1
findings:
  - category: code
    summary: "Test finding"
    file: "src/test.ts"
    severity: observation
    suggested_action: monitor
    related_assertions: ["A001"]
  - category: test
    summary: "Another finding"
    severity: risk
    suggested_action: scope
  - category: upstream
    summary: "Upstream issue"
    severity: debt
    suggested_action: accept
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath, tempDir);
    expect(result.errors.length).toBe(0);
  });

  // @ana A002
  it('rejects verify_data.yaml without schema field', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `findings:
  - category: code
    summary: "Test"
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath);
    expect(result.errors.some(e => e.includes('schema'))).toBe(true);
  });

  it('rejects verify_data.yaml with wrong schema value', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `schema: 2
findings:
  - category: code
    summary: "Test"
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath);
    expect(result.errors.some(e => e.includes('schema'))).toBe(true);
  });

  // @ana A003
  it('rejects verify_data.yaml finding with invalid category', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `schema: 1
findings:
  - category: security
    summary: "Test"
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath);
    expect(result.errors.some(e => e.includes('category'))).toBe(true);
  });

  it('rejects verify_data.yaml finding missing category', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `schema: 1
findings:
  - summary: "Test"
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath);
    expect(result.errors.some(e => e.includes('category'))).toBe(true);
  });

  it('rejects verify_data.yaml finding missing summary', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `schema: 1
findings:
  - category: code
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath);
    expect(result.errors.some(e => e.includes('summary'))).toBe(true);
  });

  // @ana A004
  it('rejects verify_data.yaml finding with invalid severity', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `schema: 1
findings:
  - category: code
    summary: "Test"
    severity: high
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath);
    expect(result.errors.some(e => e.includes('severity'))).toBe(true);
  });

  it('accepts verify_data.yaml finding with valid severity', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `schema: 1
findings:
  - category: code
    summary: "Test"
    severity: risk
    suggested_action: scope
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath);
    expect(result.errors.length).toBe(0);
  });

  // @ana A005
  it('rejects verify_data.yaml finding with non-array related_assertions', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `schema: 1
findings:
  - category: code
    summary: "Test"
    severity: risk
    suggested_action: scope
    related_assertions: "A001"
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath);
    expect(result.errors.some(e => e.includes('related_assertions'))).toBe(true);
  });

  it('accepts empty findings array', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `schema: 1
findings: []
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath);
    expect(result.errors.length).toBe(0);
  });

  // @ana A028
  it('warns when finding references non-existent file', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `schema: 1
findings:
  - category: code
    summary: "Test"
    file: "src/nonexistent.ts"
    severity: risk
    suggested_action: scope
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath, tempDir);
    expect(result.errors.length).toBe(0);
    expect(result.warnings.some(w => w.includes('nonexistent.ts'))).toBe(true);
  });

  it('warns when non-upstream finding has no file', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `schema: 1
findings:
  - category: code
    summary: "Test without file"
    severity: risk
    suggested_action: scope
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath, tempDir);
    expect(result.errors.length).toBe(0);
    expect(result.warnings.some(w => w.includes('no file reference'))).toBe(true);
  });

  it('does not warn when upstream finding has no file', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `schema: 1
findings:
  - category: upstream
    summary: "Upstream issue without file"
    severity: observation
    suggested_action: monitor
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath, tempDir);
    expect(result.errors.length).toBe(0);
    expect(result.warnings.length).toBe(0);
  });

  it('passes with extra unrecognized fields (forward compat)', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `schema: 1
findings:
  - category: code
    summary: "Test"
    severity: risk
    suggested_action: scope
    custom_field: "extra data"
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath);
    expect(result.errors.length).toBe(0);
  });

  // @ana A010
  it('rejects finding missing severity field', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `schema: 1
findings:
  - category: code
    summary: "Test"
    suggested_action: scope
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath);
    expect(result.errors.some(e => e.includes('missing "severity" field'))).toBe(true);
  });

  // @ana A011
  it('rejects finding missing suggested_action field', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `schema: 1
findings:
  - category: code
    summary: "Test"
    severity: risk
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath);
    expect(result.errors.some(e => e.includes('missing "suggested_action" field'))).toBe(true);
  });

  // @ana A013
  it('rejects finding with invalid suggested_action', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `schema: 1
findings:
  - category: code
    summary: "Test"
    severity: risk
    suggested_action: fix
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath);
    expect(result.errors.some(e => e.includes('invalid suggested_action'))).toBe(true);
  });

  // @ana A012
  it('rejects finding with old severity value blocker', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `schema: 1
findings:
  - category: code
    summary: "Test"
    severity: blocker
    suggested_action: scope
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath);
    expect(result.errors.some(e => e.includes('invalid severity'))).toBe(true);
  });

  // @ana A008
  it('accepts all new severity values', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `schema: 1
findings:
  - category: code
    summary: "Risk finding"
    severity: risk
    suggested_action: scope
  - category: test
    summary: "Debt finding"
    severity: debt
    suggested_action: promote
  - category: upstream
    summary: "Observation finding"
    severity: observation
    suggested_action: monitor
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath);
    expect(result.errors.length).toBe(0);
  });

  // @ana A009
  it('accepts all suggested_action values', async () => {
    const filePath = path.join(tempDir, 'verify_data.yaml');
    await fs.writeFile(filePath, `schema: 1
findings:
  - category: code
    summary: "Promote"
    severity: risk
    suggested_action: promote
  - category: code
    summary: "Scope"
    severity: risk
    suggested_action: scope
  - category: code
    summary: "Monitor"
    severity: risk
    suggested_action: monitor
  - category: code
    summary: "Accept"
    severity: risk
    suggested_action: accept
`, 'utf-8');

    const result = validateVerifyDataFormat(filePath);
    expect(result.errors.length).toBe(0);
  });
});

// @ana A010
describe('validateBuildDataFormat', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'build-data-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('validates build_data.yaml with all required fields', async () => {
    const filePath = path.join(tempDir, 'build_data.yaml');
    await fs.writeFile(filePath, `schema: 1
concerns:
  - summary: "Test concern"
    file: "src/test.ts"
    severity: risk
    suggested_action: scope
  - summary: "Another concern"
    severity: debt
    suggested_action: monitor
`, 'utf-8');

    const result = validateBuildDataFormat(filePath);
    expect(result.errors.length).toBe(0);
  });

  // @ana A011
  it('rejects build_data.yaml concern with missing summary', async () => {
    const filePath = path.join(tempDir, 'build_data.yaml');
    await fs.writeFile(filePath, `schema: 1
concerns:
  - file: "src/test.ts"
`, 'utf-8');

    const result = validateBuildDataFormat(filePath);
    expect(result.errors.some(e => e.includes('summary'))).toBe(true);
  });

  it('rejects build_data.yaml without schema', async () => {
    const filePath = path.join(tempDir, 'build_data.yaml');
    await fs.writeFile(filePath, `concerns:
  - summary: "Test"
`, 'utf-8');

    const result = validateBuildDataFormat(filePath);
    expect(result.errors.some(e => e.includes('schema'))).toBe(true);
  });

  it('accepts empty concerns array', async () => {
    const filePath = path.join(tempDir, 'build_data.yaml');
    await fs.writeFile(filePath, `schema: 1
concerns: []
`, 'utf-8');

    const result = validateBuildDataFormat(filePath);
    expect(result.errors.length).toBe(0);
  });

  // @ana A014
  it('rejects concern missing severity', async () => {
    const filePath = path.join(tempDir, 'build_data.yaml');
    await fs.writeFile(filePath, `schema: 1
concerns:
  - summary: "Test concern"
    suggested_action: scope
`, 'utf-8');

    const result = validateBuildDataFormat(filePath);
    expect(result.errors.some(e => e.includes('missing "severity" field'))).toBe(true);
  });

  // @ana A015
  it('rejects concern missing suggested_action', async () => {
    const filePath = path.join(tempDir, 'build_data.yaml');
    await fs.writeFile(filePath, `schema: 1
concerns:
  - summary: "Test concern"
    severity: risk
`, 'utf-8');

    const result = validateBuildDataFormat(filePath);
    expect(result.errors.some(e => e.includes('missing "suggested_action" field'))).toBe(true);
  });

  it('rejects concern with invalid severity', async () => {
    const filePath = path.join(tempDir, 'build_data.yaml');
    await fs.writeFile(filePath, `schema: 1
concerns:
  - summary: "Test concern"
    severity: blocker
    suggested_action: scope
`, 'utf-8');

    const result = validateBuildDataFormat(filePath);
    expect(result.errors.some(e => e.includes('invalid severity'))).toBe(true);
  });

  it('rejects concern with invalid suggested_action', async () => {
    const filePath = path.join(tempDir, 'build_data.yaml');
    await fs.writeFile(filePath, `schema: 1
concerns:
  - summary: "Test concern"
    severity: risk
    suggested_action: fix
`, 'utf-8');

    const result = validateBuildDataFormat(filePath);
    expect(result.errors.some(e => e.includes('invalid suggested_action'))).toBe(true);
  });
});

describe('companion save behavior', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'companion-save-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  async function createTestProject(): Promise<void> {
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });

    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify({ artifactBranch: 'main', coAuthor: 'Ana <build@anatomia.dev>' }),
      'utf-8'
    );

    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });
    execSync('git branch -M main', { cwd: tempDir, stdio: 'ignore' });
    execSync('git checkout -b feature/test-slug', { cwd: tempDir, stdio: 'ignore' });
  }

  async function createSlugDir(slug: string): Promise<string> {
    const slugDir = path.join(tempDir, '.ana', 'plans', 'active', slug);
    await fs.mkdir(slugDir, { recursive: true });
    return slugDir;
  }

  // @ana A006
  it('blocks save when verify_data.yaml is missing', async () => {
    await createTestProject();
    const slugDir = await createSlugDir('test-slug');
    await fs.writeFile(path.join(slugDir, 'verify_report.md'), '# Verify Report\n\n**Result:** PASS\n', 'utf-8');
    // Deliberately do NOT create verify_data.yaml

    expect(() => saveArtifact('verify-report', 'test-slug')).toThrow();
  });

  // @ana A007
  it('blocks save when build_data.yaml is missing', async () => {
    await createTestProject();
    const slugDir = await createSlugDir('test-slug');
    await fs.writeFile(path.join(slugDir, 'build_report.md'), `# Build Report

## Deviations
None.

## Open Issues
None.

## Acceptance Criteria
All met.

## PR Summary
Done.`, 'utf-8');
    // Deliberately do NOT create build_data.yaml

    expect(() => saveArtifact('build-report', 'test-slug')).toThrow();
  });

  // @ana A008, A009
  it('saves verify-report with valid verify_data.yaml', async () => {
    await createTestProject();
    const slugDir = await createSlugDir('test-slug');
    await fs.writeFile(path.join(slugDir, 'verify_report.md'), '# Verify Report\n\n**Result:** PASS\n', 'utf-8');
    await fs.writeFile(path.join(slugDir, 'verify_data.yaml'), `schema: 1
findings:
  - category: code
    summary: "Test finding"
    file: "src/test.ts"
    severity: risk
    suggested_action: scope
`, 'utf-8');

    saveArtifact('verify-report', 'test-slug');

    // Verify companion was committed
    const committed = execSync('git ls-files .ana/plans/active/test-slug/verify_data.yaml', {
      cwd: tempDir, encoding: 'utf-8'
    }).trim();
    expect(committed).toContain('verify_data.yaml');

    // Verify .saves.json has verify-data hash
    const savesPath = path.join(slugDir, '.saves.json');
    const saves = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
    expect(saves['verify-data']).toBeDefined();
    expect(saves['verify-data'].hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  // @ana A012
  it('saves build-report with valid build_data.yaml and hashes companion', async () => {
    await createTestProject();
    const slugDir = await createSlugDir('test-slug');
    await fs.writeFile(path.join(slugDir, 'build_report.md'), `# Build Report

## Deviations
None.

## Open Issues
None.

## Acceptance Criteria
All met.

## PR Summary
Done.`, 'utf-8');
    await fs.writeFile(path.join(slugDir, 'build_data.yaml'), `schema: 1
concerns:
  - summary: "Test concern"
    severity: debt
    suggested_action: monitor
`, 'utf-8');

    saveArtifact('build-report', 'test-slug');

    const savesPath = path.join(slugDir, '.saves.json');
    const saves = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
    expect(saves['build-data']).toBeDefined();
    expect(saves['build-data'].hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  // @ana A013
  it('saveAllArtifacts discovers verify_data.yaml alongside verify_report.md', async () => {
    await createTestProject();
    // Need to go back to main for save-all with planning artifacts
    execSync('git checkout main', { cwd: tempDir, stdio: 'ignore' });

    const slugDir = await createSlugDir('test-slug');
    await fs.writeFile(path.join(slugDir, 'verify_report.md'), '# Verify Report\n\n**Result:** PASS\n', 'utf-8');
    await fs.writeFile(path.join(slugDir, 'verify_data.yaml'), `schema: 1
findings:
  - category: code
    summary: "Test"
    severity: risk
    suggested_action: scope
`, 'utf-8');

    saveAllArtifacts('test-slug');

    const savesPath = path.join(slugDir, '.saves.json');
    const saves = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
    expect(saves['verify-data']).toBeDefined();
  });

  // @ana A014
  it('saveAllArtifacts discovers verify_data_1.yaml alongside verify_report_1.md', async () => {
    await createTestProject();
    execSync('git checkout main', { cwd: tempDir, stdio: 'ignore' });

    const slugDir = await createSlugDir('test-slug');
    await fs.writeFile(path.join(slugDir, 'verify_report_1.md'), '# Verify Report\n\n**Result:** PASS\n', 'utf-8');
    await fs.writeFile(path.join(slugDir, 'verify_data_1.yaml'), `schema: 1
findings:
  - category: test
    summary: "Numbered test"
    severity: debt
    suggested_action: scope
`, 'utf-8');

    saveAllArtifacts('test-slug');

    const savesPath = path.join(slugDir, '.saves.json');
    const saves = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
    expect(saves['verify-data']).toBeDefined();
  });

  it('save with companion file warnings succeeds', async () => {
    await createTestProject();
    const slugDir = await createSlugDir('test-slug');
    await fs.writeFile(path.join(slugDir, 'verify_report.md'), '# Verify Report\n\n**Result:** PASS\n', 'utf-8');
    await fs.writeFile(path.join(slugDir, 'verify_data.yaml'), `schema: 1
findings:
  - category: code
    summary: "Test"
    file: "src/nonexistent.ts"
    severity: risk
    suggested_action: scope
`, 'utf-8');

    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); };

    try {
      saveArtifact('verify-report', 'test-slug');
    } finally {
      console.warn = originalWarn;
    }

    expect(warnings.some(w => w.includes('nonexistent.ts'))).toBe(true);
    // Save still succeeded
    const savesPath = path.join(slugDir, '.saves.json');
    const saves = JSON.parse(await fs.readFile(savesPath, 'utf-8'));
    expect(saves['verify-data']).toBeDefined();
  });
});
