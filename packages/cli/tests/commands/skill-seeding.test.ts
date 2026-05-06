/**
 * Skill seeding tests
 *
 * Tests that seedSkillFiles injects ## Detected sections
 * and guards against duplicates on reinit.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

describe('skill seeding', () => {
  let tempDir: string;
  let cliPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-skill-test-'));
    cliPath = path.join(__dirname, '..', '..', 'dist', 'index.js');

    // Create minimal project with detectable data
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'skill-test',
        dependencies: { next: '14.0.0', '@sentry/nextjs': '10.0.0', 'posthog-js': '1.0.0' },
        devDependencies: { vitest: '2.0.0' },
        scripts: { build: 'next build', test: 'vitest run', lint: 'next lint' },
      })
    );
    await fs.writeFile(path.join(tempDir, 'tsconfig.json'), '{}');
    await fs.writeFile(path.join(tempDir, 'vercel.json'), '{}');
    await fs.writeFile(path.join(tempDir, '.gitignore'), 'node_modules\n');

    // Init git (needed for git detection)
    await execFileAsync('git', ['init'], { cwd: tempDir });
    await execFileAsync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir });
    await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
    await execFileAsync('git', ['add', '-A'], { cwd: tempDir });
    await execFileAsync('git', ['commit', '-m', 'init'], { cwd: tempDir });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('injects ## Detected section into coding-standards', async () => {
    await execFileAsync('node', [cliPath, 'init', '--force'], { cwd: tempDir });

    const content = await fs.readFile(
      path.join(tempDir, '.claude', 'skills', 'coding-standards', 'SKILL.md'),
      'utf-8'
    );
    expect(content).toContain('## Detected');
    expect(content).toContain('Language:');
  });

  it('injects ## Detected with real commands into testing-standards', async () => {
    await execFileAsync('node', [cliPath, 'init', '--force'], { cwd: tempDir });

    const content = await fs.readFile(
      path.join(tempDir, '.claude', 'skills', 'testing-standards', 'SKILL.md'),
      'utf-8'
    );
    expect(content).toContain('## Detected');
    expect(content).toContain('Vitest');
  });

  it('injects ## Detected into git-workflow with branch info', async () => {
    await execFileAsync('node', [cliPath, 'init', '--force'], { cwd: tempDir });

    const content = await fs.readFile(
      path.join(tempDir, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      'utf-8'
    );
    expect(content).toContain('## Detected');
    expect(content).toContain('Default branch:');
  });

  it('does not duplicate ## Detected on reinit', async () => {
    // First init
    await execFileAsync('node', [cliPath, 'init', '--force'], { cwd: tempDir });

    // Second init
    await execFileAsync('node', [cliPath, 'init', '--force'], { cwd: tempDir });

    const content = await fs.readFile(
      path.join(tempDir, '.claude', 'skills', 'testing-standards', 'SKILL.md'),
      'utf-8'
    );
    const detectedCount = (content.match(/## Detected/g) || []).length;
    expect(detectedCount).toBe(1);
  }, 30000);

  it('Path B: re-init preserves user-edited ## Gotchas (allowGotchaInjection semantic)', async () => {
    // Path A (reinit: .ana/ present + skill file exists) and Path B (partial
    // install: .ana/ missing + skill file exists) collapsed onto a single
    // branch that sets `allowGotchaInjection = false` when the skill file
    // already exists. This test pins the semantic: once the user has edited
    // ## Gotchas, a subsequent init MUST NOT overwrite their content even
    // though the stack (Vitest → vitest-watch-mode) would otherwise trigger
    // automatic gotcha injection.
    //
    // The test writes Vitest into package.json so the vitest-watch-mode gotcha
    // is a candidate for injection. Without the allowGotchaInjection guard,
    // a re-init would overwrite the custom gotchas section. With the guard,
    // it must be preserved verbatim.

    // First init: Vitest is in deps, so vitest-watch-mode gotcha is injected
    // on the fresh-install path.
    await execFileAsync('node', [cliPath, 'init', '--force'], { cwd: tempDir });

    const skillPath = path.join(tempDir, '.claude', 'skills', 'testing-standards', 'SKILL.md');
    const afterFirstInit = await fs.readFile(skillPath, 'utf-8');
    expect(afterFirstInit).toContain('watch mode');  // gotcha was injected

    // Simulate user editing ## Gotchas with their own content + delete .ana/
    // to put the project in the "partial install" Path B state.
    const customGotchas = '- CUSTOM GOTCHA: do not mock the database in integration tests\n- CUSTOM GOTCHA: tests that touch /tmp must clean up in afterEach';
    const gotchasIdx = afterFirstInit.indexOf('## Gotchas');
    const nextSectionAfterGotchas = afterFirstInit.indexOf('\n## ', gotchasIdx + 1);
    const beforeGotchas = afterFirstInit.slice(0, gotchasIdx);
    const afterGotchas = nextSectionAfterGotchas === -1 ? '' : afterFirstInit.slice(nextSectionAfterGotchas);
    const customContent = beforeGotchas + '## Gotchas\n' + customGotchas + '\n' + afterGotchas;
    await fs.writeFile(skillPath, customContent, 'utf-8');
    await fs.rm(path.join(tempDir, '.ana'), { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });

    // Re-init: Path B (skill file exists, .ana/ missing). Should preserve
    // custom gotchas and refresh Detected, but NOT re-inject vitest-watch-mode.
    await execFileAsync('node', [cliPath, 'init', '--force'], { cwd: tempDir });

    const afterReinit = await fs.readFile(skillPath, 'utf-8');

    // Custom gotchas MUST be preserved verbatim.
    expect(afterReinit).toContain('CUSTOM GOTCHA: do not mock the database in integration tests');
    expect(afterReinit).toContain('CUSTOM GOTCHA: tests that touch /tmp must clean up in afterEach');

    // The vitest-watch-mode GOTCHA text must NOT appear in ## Gotchas
    // (the user replaced that section). Library rules in ## Detected may
    // mention "watch mode" — that's correct (Detected refreshes on re-init).
    // Check for the specific gotcha phrasing, not just "watch mode".
    const gotchasSection = afterReinit.slice(
      afterReinit.indexOf('## Gotchas'),
      afterReinit.indexOf('\n## ', afterReinit.indexOf('## Gotchas') + 1)
    );
    expect(gotchasSection).not.toContain('Vitest defaults to watch mode');

    // ## Detected MUST still be refreshed (machine-owned section).
    expect(afterReinit).toContain('## Detected');
    const detectedCount = (afterReinit.match(/## Detected/g) || []).length;
    expect(detectedCount).toBe(1);
  }, 30000);

  it('injects ### Library Rules into coding-standards Detected section', async () => {
    await execFileAsync('node', [cliPath, 'init', '--force'], { cwd: tempDir });

    const content = await fs.readFile(
      path.join(tempDir, '.claude', 'skills', 'coding-standards', 'SKILL.md'),
      'utf-8'
    );
    // TypeScript project → ESM .js extension rule should be injected
    expect(content).toContain('### Library Rules');
    expect(content).toContain('.js');
  });

  it('injects ### Common Issues into troubleshooting Detected section', async () => {
    await execFileAsync('node', [cliPath, 'init', '--force'], { cwd: tempDir });

    const content = await fs.readFile(
      path.join(tempDir, '.claude', 'skills', 'troubleshooting', 'SKILL.md'),
      'utf-8'
    );
    // Next.js + Vitest + Prisma project → should have common issues
    expect(content).toContain('### Common Issues');
    // Vitest watch mode hang issue
    expect(content).toContain('hang');
  });

  it('re-init preserves ## Rules but replaces ## Detected', async () => {
    // First init — creates skill files with scan data
    await execFileAsync('node', [cliPath, 'init', '--force'], { cwd: tempDir });

    const skillPath = path.join(tempDir, '.claude', 'skills', 'coding-standards', 'SKILL.md');

    // Read the initial content to get the original Detected section
    const initialContent = await fs.readFile(skillPath, 'utf-8');
    expect(initialContent).toContain('## Detected');
    expect(initialContent).toContain('## Rules');

    // Inject custom human content into ## Rules
    const customRules = '- CUSTOM RULE: Always use semicolons\n- CUSTOM RULE: No magic numbers\n- CUSTOM RULE: Max 3 params per function';
    const rulesIdx = initialContent.indexOf('## Rules');
    const nextSectionAfterRules = initialContent.indexOf('\n## ', rulesIdx + 1);
    const beforeRules = initialContent.slice(0, rulesIdx);
    const afterRules = nextSectionAfterRules === -1 ? '' : initialContent.slice(nextSectionAfterRules);
    const customContent = beforeRules + '## Rules\n' + customRules + '\n' + afterRules;
    await fs.writeFile(skillPath, customContent, 'utf-8');

    // Verify custom rules are in place
    const beforeReinit = await fs.readFile(skillPath, 'utf-8');
    expect(beforeReinit).toContain('CUSTOM RULE: Always use semicolons');

    // Re-init — should REPLACE ## Detected, preserve ## Rules
    await execFileAsync('node', [cliPath, 'init', '--force'], { cwd: tempDir });

    const afterReinit = await fs.readFile(skillPath, 'utf-8');

    // ## Rules MUST be preserved exactly
    expect(afterReinit).toContain('CUSTOM RULE: Always use semicolons');
    expect(afterReinit).toContain('CUSTOM RULE: No magic numbers');
    expect(afterReinit).toContain('CUSTOM RULE: Max 3 params per function');

    // ## Detected MUST be refreshed (present with scan data)
    expect(afterReinit).toContain('## Detected');

    // Only one ## Detected section
    const detectedCount = (afterReinit.match(/## Detected/g) || []).length;
    expect(detectedCount).toBe(1);
  }, 30000);
}, 30000);
