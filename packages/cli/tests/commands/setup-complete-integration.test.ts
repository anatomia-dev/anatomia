import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { validateSetupCompletion } from '../../src/commands/check.js';

/**
 * Integration tests for setup completion validation.
 * Tests validateSetupCompletion against realistic project structures.
 */

describe('ana setup complete integration', () => {
  let tmpDir: string;
  let anaPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-test-'));
    anaPath = path.join(tmpDir, '.ana');

    // Create complete .ana/ structure
    await fs.mkdir(path.join(anaPath, 'context'), { recursive: true });
    await fs.mkdir(path.join(anaPath, 'state'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, '.ana', 'skills', 'coding-standards'), { recursive: true });

    // Create populated project-context
    const projectContext = [
      '# Project Context',
      '',
      '## What This Project Does',
      'A CLI tool for AI-assisted development.',
      '',
      '## Architecture',
      'Monorepo with packages/cli and packages/engine.',
      '',
      '## Key Decisions',
      'TypeScript strict mode everywhere.',
      '',
      '## Key Files',
      'packages/cli/src/index.ts is the entry point.',
      '',
      '## Active Constraints',
      'Do not modify scan engine types.',
      '',
      '## Domain Vocabulary',
      '"Agent" means the pipeline agent, not an LLM agent.',
      '',
    ].join('\n');
    await fs.writeFile(path.join(anaPath, 'context/project-context.md'), projectContext);
    await fs.writeFile(path.join(anaPath, 'context/design-principles.md'), '# Design Principles\n\nMove fast, verify everything.\n');

    // Create valid skill file
    const skill = [
      '---',
      'name: coding-standards',
      '---',
      '',
      '## Detected',
      '',
      '- **Language:** TypeScript',
      '',
      '## Rules',
      '',
      'camelCase for functions.',
      '',
      '## Gotchas',
      '',
      '## Examples',
      '',
    ].join('\n');
    await fs.writeFile(path.join(tmpDir, '.ana/skills/coding-standards/SKILL.md'), skill);

    // Create ana.json
    await fs.writeFile(
      path.join(anaPath, 'ana.json'),
      JSON.stringify({
        name: 'test-project',
        language: 'TypeScript',
        artifactBranch: 'main',
        commands: { test: 'vitest' },
        lastScanAt: null,
      }, null, 2)
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('returns complete with fully populated project', async () => {
    const result = await validateSetupCompletion(tmpDir);

    expect(result.setupPhase).toBe('complete');
    expect(result.stats.contextSections.populated).toBe(6);
    expect(result.stats.principlesCaptured).toBe(true);
    expect(result.stats.skillsCalibrated).toBeGreaterThanOrEqual(1);
    expect(result.warnings).toHaveLength(0);
  });

  it('returns partial when project-context is scaffold-only', async () => {
    // Overwrite with template-only content
    const template = [
      '# Project Context',
      '',
      '## What This Project Does',
      '<!-- Populated by setup. -->',
      '',
      '## Architecture',
      '<!-- Populated by setup. -->',
      '',
      '## Key Decisions',
      '## Key Files',
      '## Active Constraints',
      '## Domain Vocabulary',
      '',
    ].join('\n');
    await fs.writeFile(path.join(anaPath, 'context/project-context.md'), template);

    const result = await validateSetupCompletion(tmpDir);

    expect(result.setupPhase).toBe('context-complete');
    expect(result.warnings).toContainEqual(expect.stringContaining('What This Project Does'));
  });

  it('returns complete when design-principles is empty template', async () => {
    // Overwrite with blank template
    await fs.writeFile(
      path.join(anaPath, 'context/design-principles.md'),
      '# Design Principles\n\n<!-- Your philosophy here. -->\n'
    );

    const result = await validateSetupCompletion(tmpDir);

    expect(result.setupPhase).toBe('complete');
    expect(result.stats.principlesCaptured).toBe(false);
  });

  it('warns when skill file is missing required sections', async () => {
    // Overwrite with incomplete skill
    await fs.writeFile(
      path.join(tmpDir, '.ana/skills/coding-standards/SKILL.md'),
      '## Detected\n\n- **Language:** TypeScript\n\n## Rules\n\nSome rules.\n'
    );

    const result = await validateSetupCompletion(tmpDir);

    expect(result.setupPhase).toBe('complete');
    expect(result.warnings).toContainEqual(expect.stringContaining('missing sections'));
  });
});
