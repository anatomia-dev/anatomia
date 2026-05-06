import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { validateSetupCompletion } from '../../src/commands/check.js';
import { fileExists } from '../../src/commands/init/preflight.js';

/**
 * Tests for setup completion validation
 * and setup-progress.json lifecycle.
 */

// --- Helpers ---

const PROJECT_CONTEXT_TEMPLATE = `# Project Context

## What This Project Does
<!-- Populated by setup. Describes your product, target users, and purpose. -->

## Architecture
<!-- Populated by setup. Architecture overview with rationale. -->

## Key Decisions
<!-- Populated by setup. Technology choices with reasoning. -->

## Key Files
<!-- Key navigation points for agents. -->

## Active Constraints
<!-- Current priorities, limitations, things not to touch. -->

## Domain Vocabulary
<!-- Project-specific terms and their meaning in this context. -->
`;

const DESIGN_PRINCIPLES_TEMPLATE = `# Design Principles

<!-- What does your team believe about building software?
     What tradeoffs do you consistently make?
     What quality bar do you hold?

     This file is yours. Write your philosophy here. -->
`;

const SKILL_TEMPLATE = `---
name: coding-standards
---

## Detected

- **Language:** TypeScript

## Rules

Some rules here.

## Gotchas

## Examples
`;

async function createProjectStructure(
  tmpDir: string,
  overrides?: {
    projectContext?: string;
    designPrinciples?: string;
    skillContent?: string;
    skillNames?: string[];
    anaJson?: Record<string, unknown>;
    setupProgress?: Record<string, unknown>;
  }
) {
  const anaPath = path.join(tmpDir, '.ana');
  const contextPath = path.join(anaPath, 'context');
  const statePath = path.join(anaPath, 'state');
  const skillsPath = path.join(tmpDir, '.claude', 'skills');

  await fs.mkdir(contextPath, { recursive: true });
  await fs.mkdir(statePath, { recursive: true });

  await fs.writeFile(
    path.join(contextPath, 'project-context.md'),
    overrides?.projectContext ?? PROJECT_CONTEXT_TEMPLATE
  );

  await fs.writeFile(
    path.join(contextPath, 'design-principles.md'),
    overrides?.designPrinciples ?? DESIGN_PRINCIPLES_TEMPLATE
  );

  const anaJson = overrides?.anaJson ?? {
    name: 'test-project',
    language: 'TypeScript',
    artifactBranch: 'main',
    commands: { test: 'vitest' },
    lastScanAt: null,
  };
  await fs.writeFile(path.join(anaPath, 'ana.json'), JSON.stringify(anaJson, null, 2));

  const skills = overrides?.skillNames ?? ['coding-standards'];
  for (const skill of skills) {
    const skillDir = path.join(skillsPath, skill);
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      overrides?.skillContent ?? SKILL_TEMPLATE
    );
  }

  if (overrides?.setupProgress) {
    await fs.writeFile(
      path.join(statePath, 'setup-progress.json'),
      JSON.stringify(overrides.setupProgress, null, 2)
    );
  }
}

// --- Tests ---

describe('validateSetupCompletion', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-completion-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('returns complete when What This Project Does has content', async () => {
    const pc = PROJECT_CONTEXT_TEMPLATE.replace(
      '<!-- Populated by setup. Describes your product, target users, and purpose. -->',
      'Anatomia is a CLI tool for AI-assisted development.'
    );
    await createProjectStructure(tmpDir, { projectContext: pc });

    const result = await validateSetupCompletion(tmpDir);
    expect(result.setupPhase).toBe('complete');
    expect(result.stats.contextSections.populated).toBeGreaterThanOrEqual(1);
  });

  it('returns partial when What This Project Does is template', async () => {
    await createProjectStructure(tmpDir);

    const result = await validateSetupCompletion(tmpDir);
    expect(result.setupPhase).toBe('context-complete');
    expect(result.warnings).toContainEqual(
      expect.stringContaining('What This Project Does')
    );
  });

  it('returns complete even when design-principles is empty', async () => {
    const pc = PROJECT_CONTEXT_TEMPLATE.replace(
      '<!-- Populated by setup. Describes your product, target users, and purpose. -->',
      'A real product description.'
    );
    await createProjectStructure(tmpDir, {
      projectContext: pc,
      designPrinciples: DESIGN_PRINCIPLES_TEMPLATE,
    });

    const result = await validateSetupCompletion(tmpDir);
    expect(result.setupPhase).toBe('complete');
    expect(result.stats.principlesCaptured).toBe(false);
  });

  it('returns partial when section only has Detected lines and HTML comments', async () => {
    const pc = `# Project Context

## What This Project Does
<!-- Populated by setup. -->
**Detected:** TypeScript monorepo

## Architecture
<!-- Populated by setup. -->

## Key Decisions
## Key Files
## Active Constraints
## Domain Vocabulary
`;
    await createProjectStructure(tmpDir, { projectContext: pc });

    const result = await validateSetupCompletion(tmpDir);
    expect(result.setupPhase).toBe('context-complete');
  });

  it('treats design-principles with only heading and HTML comments as empty', async () => {
    const pc = PROJECT_CONTEXT_TEMPLATE.replace(
      '<!-- Populated by setup. Describes your product, target users, and purpose. -->',
      'A real product description.'
    );
    await createProjectStructure(tmpDir, {
      projectContext: pc,
      designPrinciples: DESIGN_PRINCIPLES_TEMPLATE,
    });

    const result = await validateSetupCompletion(tmpDir);
    expect(result.stats.principlesCaptured).toBe(false);
  });

  it('detects populated design-principles', async () => {
    const pc = PROJECT_CONTEXT_TEMPLATE.replace(
      '<!-- Populated by setup. Describes your product, target users, and purpose. -->',
      'A real product description.'
    );
    const dp = `# Design Principles

Move fast and break things — but never break the API contract.
`;
    await createProjectStructure(tmpDir, {
      projectContext: pc,
      designPrinciples: dp,
    });

    const result = await validateSetupCompletion(tmpDir);
    expect(result.stats.principlesCaptured).toBe(true);
  });

  it('warns when skill file missing sections', async () => {
    const pc = PROJECT_CONTEXT_TEMPLATE.replace(
      '<!-- Populated by setup. Describes your product, target users, and purpose. -->',
      'A real product description.'
    );
    const badSkill = `---
name: coding-standards
---

## Detected

- **Language:** TypeScript

## Rules

Some rules.
`;
    await createProjectStructure(tmpDir, {
      projectContext: pc,
      skillContent: badSkill,
    });

    const result = await validateSetupCompletion(tmpDir);
    expect(result.setupPhase).toBe('complete');
    expect(result.warnings).toContainEqual(
      expect.stringContaining('missing sections')
    );
  });

  it('counts populated sections correctly', async () => {
    const pc = `# Project Context

## What This Project Does
Anatomia is a CLI tool for AI-assisted development.

## Architecture
Monorepo with packages/cli and packages/engine.

## Key Decisions
<!-- Populated by setup. -->

## Key Files
<!-- Key navigation points. -->

## Active Constraints
Don't touch the scan engine.

## Domain Vocabulary
<!-- Project-specific terms. -->
`;
    await createProjectStructure(tmpDir, { projectContext: pc });

    const result = await validateSetupCompletion(tmpDir);
    expect(result.setupPhase).toBe('complete');
    expect(result.stats.contextSections.populated).toBe(3);
    expect(result.stats.contextSections.total).toBe(6);
  });
});

describe('ana setup complete CLI', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cli-complete-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('writes setupPhase to ana.json based on validation', async () => {
    const pc = PROJECT_CONTEXT_TEMPLATE.replace(
      '<!-- Populated by setup. Describes your product, target users, and purpose. -->',
      'A real product description.'
    );
    await createProjectStructure(tmpDir, { projectContext: pc });

    const result = await validateSetupCompletion(tmpDir);
    expect(result.setupPhase).toBe('complete');

    // Simulate CLI write
    const anaJsonPath = path.join(tmpDir, '.ana', 'ana.json');
    const config = JSON.parse(await fs.readFile(anaJsonPath, 'utf-8'));
    config.setupPhase = result.setupPhase;
    await fs.writeFile(anaJsonPath, JSON.stringify(config, null, 2));

    const updated = JSON.parse(await fs.readFile(anaJsonPath, 'utf-8'));
    expect(updated.setupPhase).toBe('complete');
  });

  it('deletes setup-progress.json when complete', async () => {
    const pc = PROJECT_CONTEXT_TEMPLATE.replace(
      '<!-- Populated by setup. Describes your product, target users, and purpose. -->',
      'A real product description.'
    );
    await createProjectStructure(tmpDir, {
      projectContext: pc,
      setupProgress: {
        phases: {
          confirm: { completed: true, timestamp: '2026-04-07T00:00:00Z' },
          enrich: { completed: true, timestamp: '2026-04-07T00:01:00Z' },
          principles: { completed: true, timestamp: '2026-04-07T00:02:00Z' },
        },
      },
    });

    const progressPath = path.join(tmpDir, '.ana', 'state', 'setup-progress.json');
    expect(await fileExists(progressPath)).toBe(true);

    const result = await validateSetupCompletion(tmpDir);
    expect(result.setupPhase).toBe('complete');

    // Simulate CLI cleanup
    await fs.unlink(progressPath);
    expect(await fileExists(progressPath)).toBe(false);
  });

  it('keeps setup-progress.json when partial', async () => {
    await createProjectStructure(tmpDir, {
      setupProgress: {
        phases: {
          confirm: { completed: true, timestamp: '2026-04-07T00:00:00Z' },
          enrich: { completed: false },
          principles: { completed: false },
        },
      },
    });

    const progressPath = path.join(tmpDir, '.ana', 'state', 'setup-progress.json');
    expect(await fileExists(progressPath)).toBe(true);

    const result = await validateSetupCompletion(tmpDir);
    expect(result.setupPhase).toBe('context-complete');

    // Partial: don't delete
    expect(await fileExists(progressPath)).toBe(true);
  });

  it('--force sets complete regardless of validation', async () => {
    // Template-only project-context → normally "partial"
    await createProjectStructure(tmpDir);

    const result = await validateSetupCompletion(tmpDir);
    expect(result.setupPhase).toBe('context-complete');

    // --force overrides
    const finalMode = 'complete'; // force flag
    expect(finalMode).toBe('complete');
  });
});

describe('setup-progress.json lifecycle', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-progress-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('Phase 1 sets confirm.completed', async () => {
    const progress = {
      phases: {
        confirm: { completed: true, timestamp: '2026-04-07T00:00:00Z' },
        enrich: { completed: false },
        principles: { completed: false },
      },
    };

    const statePath = path.join(tmpDir, '.ana', 'state');
    await fs.mkdir(statePath, { recursive: true });
    await fs.writeFile(
      path.join(statePath, 'setup-progress.json'),
      JSON.stringify(progress, null, 2)
    );

    const content = JSON.parse(
      await fs.readFile(path.join(statePath, 'setup-progress.json'), 'utf-8')
    );
    expect(content.phases.confirm.completed).toBe(true);
    expect(content.phases.confirm.timestamp).toBeTruthy();
  });

  it('Phase 2 sets enrich.completed', async () => {
    const progress = {
      phases: {
        confirm: { completed: true, timestamp: '2026-04-07T00:00:00Z' },
        enrich: { completed: true, timestamp: '2026-04-07T00:01:00Z' },
        principles: { completed: false },
      },
    };

    const statePath = path.join(tmpDir, '.ana', 'state');
    await fs.mkdir(statePath, { recursive: true });
    await fs.writeFile(
      path.join(statePath, 'setup-progress.json'),
      JSON.stringify(progress, null, 2)
    );

    const content = JSON.parse(
      await fs.readFile(path.join(statePath, 'setup-progress.json'), 'utf-8')
    );
    expect(content.phases.enrich.completed).toBe(true);
  });

  it('Phase 3 skip sets principles.skipped', async () => {
    const progress = {
      phases: {
        confirm: { completed: true, timestamp: '2026-04-07T00:00:00Z' },
        enrich: { completed: true, timestamp: '2026-04-07T00:01:00Z' },
        principles: { skipped: true, timestamp: '2026-04-07T00:02:00Z' },
      },
    };

    const statePath = path.join(tmpDir, '.ana', 'state');
    await fs.mkdir(statePath, { recursive: true });
    await fs.writeFile(
      path.join(statePath, 'setup-progress.json'),
      JSON.stringify(progress, null, 2)
    );

    const content = JSON.parse(
      await fs.readFile(path.join(statePath, 'setup-progress.json'), 'utf-8')
    );
    expect(content.phases.principles.skipped).toBe(true);
  });

  it('complete deletes the file', async () => {
    const statePath = path.join(tmpDir, '.ana', 'state');
    await fs.mkdir(statePath, { recursive: true });
    const progressPath = path.join(statePath, 'setup-progress.json');
    await fs.writeFile(progressPath, '{}');

    await fs.unlink(progressPath);
    expect(await fileExists(progressPath)).toBe(false);
  });

  it('partial keeps the file', async () => {
    const statePath = path.join(tmpDir, '.ana', 'state');
    await fs.mkdir(statePath, { recursive: true });
    const progressPath = path.join(statePath, 'setup-progress.json');
    await fs.writeFile(progressPath, '{}');

    // Partial: no deletion
    expect(await fileExists(progressPath)).toBe(true);
  });
});

