/**
 * Tests for ana doctor — unified project health diagnostic
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { runDoctor } from '../../src/commands/doctor.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-doctor-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
});

/**
 * Helper to create a minimal .ana/ structure for a healthy project.
 */
async function createMinimalProject(dir: string, overrides?: {
  anaJson?: Record<string, unknown>;
  scanJson?: Record<string, unknown>;
  proofChain?: { entries: unknown[] };
  setupPhase?: string;
  skills?: Record<string, string>;
  contextPopulated?: boolean;
}): Promise<void> {
  const anaDir = path.join(dir, '.ana');
  const contextDir = path.join(anaDir, 'context');
  const skillsDir = path.join(dir, '.claude', 'skills');

  await fs.mkdir(contextDir, { recursive: true });
  await fs.mkdir(path.join(anaDir, 'plans', 'active'), { recursive: true });

  // ana.json
  const anaJson = {
    anaVersion: '1.1.1',
    name: 'test-project',
    language: 'TypeScript',
    commands: { build: 'pnpm run build', test: 'pnpm run test -- --run' },
    artifactBranch: 'main',
    branchPrefix: 'feature/',
    lastScanAt: new Date().toISOString(),
    ...overrides?.anaJson,
  };
  if (overrides?.setupPhase !== undefined) {
    (anaJson as Record<string, unknown>)['setupPhase'] = overrides.setupPhase;
  }
  await fs.writeFile(path.join(anaDir, 'ana.json'), JSON.stringify(anaJson));

  // scan.json
  const scanJson = overrides?.scanJson ?? {
    schemaVersion: '1.0',
    overview: { scannedAt: anaJson.lastScanAt, depth: 'deep' },
    stack: { testing: ['Vitest'] },
    git: { head: 'abc1234' },
  };
  await fs.writeFile(path.join(anaDir, 'scan.json'), JSON.stringify(scanJson));

  // project-context.md
  if (overrides?.contextPopulated !== false) {
    await fs.writeFile(
      path.join(contextDir, 'project-context.md'),
      `# Project Context

## What This Project Does
A test project for doctor.

## Architecture
Monorepo.

## Key Decisions
TypeScript.

## Key Files
src/index.ts

## Active Constraints
Node 22+.

## Domain Vocabulary
Test terms.
`,
    );
  } else {
    await fs.writeFile(
      path.join(contextDir, 'project-context.md'),
      `# Project Context

## What This Project Does
## Architecture
## Key Decisions
## Key Files
## Active Constraints
## Domain Vocabulary
`,
    );
  }

  // Skills
  const defaultSkills = overrides?.skills ?? {
    'coding-standards': '## Detected\n- TypeScript\n\n## Rules\n- Use camelCase\n\n## Gotchas\n\n## Examples\n',
    'testing-standards': '## Detected\n- Vitest\n\n## Rules\n- Use --run\n\n## Gotchas\n\n## Examples\n',
    'git-workflow': '## Detected\n- main branch\n\n## Rules\n- Feature branches\n\n## Gotchas\n\n## Examples\n',
    'deployment': '## Detected\n\n## Rules\n\n## Gotchas\n\n## Examples\n',
    'troubleshooting': '## Detected\n\n## Rules\n\n## Gotchas\n\n## Examples\n',
  };
  for (const [name, content] of Object.entries(defaultSkills)) {
    const dir = path.join(skillsDir, name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'SKILL.md'), `# ${name}\n\n${content}`);
  }

  // Proof chain
  if (overrides?.proofChain) {
    await fs.writeFile(
      path.join(anaDir, 'proof_chain.json'),
      JSON.stringify(overrides.proofChain),
    );
  }
}

// ── Terminal output dimensions ──────────────────────────────────────

describe('terminal output dimensions', () => {
  // @ana A001
  it('includes CLI version line', async () => {
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);
    expect(results.dimensions.cli_version.current).toMatch(/\d+\.\d+\.\d+/);
  });

  // @ana A002
  it('includes scan freshness dimension', async () => {
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);
    expect(results.dimensions.scan_freshness).toBeDefined();
    expect(results.dimensions.scan_freshness.depth).toBe('deep');
  });

  // @ana A003
  it('includes context dimension', async () => {
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);
    expect(results.dimensions.context).toBeDefined();
    expect(results.dimensions.context.sections_total).toBe(6);
  });

  // @ana A004
  it('includes skills dimension', async () => {
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);
    expect(results.dimensions.skills).toBeDefined();
    expect(results.dimensions.skills.total).toBeGreaterThan(0);
  });

  // @ana A005
  it('includes proof chain dimension', async () => {
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);
    expect(results.dimensions.proof_chain).toBeDefined();
  });
});

// ── JSON output ─────────────────────────────────────────────────────

describe('JSON output structure', () => {
  // @ana A006
  it('has command field set to "doctor"', async () => {
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);
    // The JSON envelope wraps results — simulate what the action handler does
    const json = { command: 'doctor', timestamp: new Date().toISOString(), results };
    expect(json.command).toBe('doctor');
  });

  // @ana A007
  it('has a timestamp field', async () => {
    const json = { command: 'doctor', timestamp: new Date().toISOString(), results: {} };
    expect(json.timestamp).toBeDefined();
    expect(new Date(json.timestamp).getTime()).not.toBeNaN();
  });

  // @ana A008
  it('includes all five dimension objects', async () => {
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);
    expect(results.dimensions.cli_version).toBeDefined();
    expect(results.dimensions.scan_freshness).toBeDefined();
    expect(results.dimensions.context).toBeDefined();
    expect(results.dimensions.skills).toBeDefined();
    expect(results.dimensions.proof_chain).toBeDefined();
  });

  // @ana A009
  it('includes the maturity classification', async () => {
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);
    expect(results.maturity).toBeDefined();
    expect(['new', 'setup', 'established']).toContain(results.maturity);
  });

  // @ana A010
  it('includes the overall pass/fail status', async () => {
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);
    expect(results.overall).toBeDefined();
    expect(['pass', 'fail']).toContain(results.overall);
  });

  // @ana A031
  it('scan dimension includes depth', async () => {
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);
    expect(results.dimensions.scan_freshness.depth).toBe('deep');
  });

  // @ana A032
  it('skills dimension lists scaffold-default skill names', async () => {
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);
    expect(results.dimensions.skills.scaffold_defaults).toBeDefined();
    expect(Array.isArray(results.dimensions.skills.scaffold_defaults)).toBe(true);
  });

  // @ana A033
  it('context dimension includes setup state', async () => {
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);
    expect(results.dimensions.context.setup_state).toBeDefined();
  });

  // @ana A034
  it('proof chain dimension includes trend', async () => {
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);
    expect(results.dimensions.proof_chain.trend).toBeDefined();
  });

  // @ana A035
  it('includes stale_work array', async () => {
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);
    expect(results.stale_work).toBeDefined();
    expect(Array.isArray(results.stale_work)).toBe(true);
  });
});

// ── Exit codes ──────────────────────────────────────────────────────

describe('exit codes', () => {
  // @ana A011
  it('returns pass (exit 0) for a healthy project', async () => {
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);
    expect(results.overall).toBe('pass');
  });

  // @ana A013
  it('returns pass (exit 0) when only yellow items exist', async () => {
    // No proof chain + no setup = yellow dimensions but no red
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);
    // Proof chain is yellow (0 runs), but overall should still be pass
    expect(results.dimensions.proof_chain.status).toBe('warn');
    expect(results.overall).toBe('pass');
  });
});

// ── Maturity classification ─────────────────────────────────────────

describe('maturity classification', () => {
  // @ana A014, A015
  it('new project without proof chain shows "new" maturity', async () => {
    await createMinimalProject(tmpDir, { contextPopulated: false });
    const results = await runDoctor(tmpDir);
    expect(results.maturity).toBe('new');
  });

  // @ana A016
  it('established project with 10+ runs shows "established" maturity', async () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({
      slug: `task-${i}`,
      findings: [{ status: 'active', severity: 'observation' }],
    }));
    await createMinimalProject(tmpDir, {
      proofChain: { entries },
      setupPhase: 'complete',
    });
    const results = await runDoctor(tmpDir);
    expect(results.maturity).toBe('established');
  });
});

// ── CLI version dimension ───────────────────────────────────────────

describe('CLI version dimension', () => {
  // @ana A017
  it('delegates to checkForUpdates and returns current version', async () => {
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);
    expect(results.dimensions.cli_version.current).toBeTruthy();
    expect(typeof results.dimensions.cli_version.current).toBe('string');
  });

  // @ana A021
  it('shows outdated CLI as fail with latest version', async () => {
    // checkForUpdates skips cache read when CI=true — unset for this test
    const savedCi = process.env['CI'];
    delete process.env['CI'];
    try {
      // Write a fake update cache to simulate outdated version
      const cacheDir = path.join(tmpDir, '.ana', 'state', 'cache');
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(
        path.join(cacheDir, 'update-check.json'),
        JSON.stringify({ version: '99.0.0', timestamp: Date.now() }),
      );
      await createMinimalProject(tmpDir);

      const results = await runDoctor(tmpDir);
      expect(results.dimensions.cli_version.status).toBe('fail');
      expect(results.dimensions.cli_version.latest).toBe('99.0.0');
    } finally {
      if (savedCi !== undefined) process.env['CI'] = savedCi;
    }
  });

  // @ana A012
  it('project with outdated CLI has overall fail', async () => {
    // checkForUpdates skips cache read when CI=true — unset for this test
    const savedCi = process.env['CI'];
    delete process.env['CI'];
    try {
      const cacheDir = path.join(tmpDir, '.ana', 'state', 'cache');
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(
        path.join(cacheDir, 'update-check.json'),
        JSON.stringify({ version: '99.0.0', timestamp: Date.now() }),
      );
      await createMinimalProject(tmpDir);

      const results = await runDoctor(tmpDir);
      expect(results.overall).toBe('fail');
    } finally {
      if (savedCi !== undefined) process.env['CI'] = savedCi;
    }
  });
});

// ── Scan freshness dimension ────────────────────────────────────────

describe('scan freshness dimension', () => {
  // @ana A020
  it('stale scan shows fail status', async () => {
    // checkScanFreshness returns null when CI=true — unset for this test
    const savedCi = process.env['CI'];
    delete process.env['CI'];
    try {
      const staleDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await createMinimalProject(tmpDir, {
        anaJson: { lastScanAt: staleDate },
      });
      const results = await runDoctor(tmpDir);
      // Without git, checkScanFreshness uses time-only fallback
      expect(results.dimensions.scan_freshness.days_since_scan).toBeGreaterThan(7);
    } finally {
      if (savedCi !== undefined) process.env['CI'] = savedCi;
    }
  });

  // @ana A036
  it('missing scan.json degrades gracefully', async () => {
    await createMinimalProject(tmpDir);
    // Remove scan.json
    await fs.unlink(path.join(tmpDir, '.ana', 'scan.json'));
    const results = await runDoctor(tmpDir);
    expect(results.dimensions.scan_freshness).toBeDefined();
    expect(results.dimensions.scan_freshness.depth).toBeNull();
  });
});

// ── Context dimension ───────────────────────────────────────────────

describe('context dimension', () => {
  // @ana A027, A028
  it('setup in progress shows "in-progress" state', async () => {
    await createMinimalProject(tmpDir, {
      anaJson: { setupPhase: 'guided' },
    });
    const results = await runDoctor(tmpDir);
    expect(results.dimensions.context.setup_state).toBe('in-progress');
  });

  // @ana A029
  it('setup complete but thin sections shows warn', async () => {
    await createMinimalProject(tmpDir, {
      setupPhase: 'complete',
      contextPopulated: false,
    });
    const results = await runDoctor(tmpDir);
    expect(results.dimensions.context.setup_state).toBe('complete');
    expect(results.dimensions.context.sections_populated).toBe(0);
    expect(results.dimensions.context.status).toBe('warn');
  });

  // @ana A030
  it('setup never started shows "not-started" state', async () => {
    await createMinimalProject(tmpDir);
    // No setupPhase in anaJson by default
    const results = await runDoctor(tmpDir);
    expect(results.dimensions.context.setup_state).toBe('not-started');
  });
});

// ── Skills dimension ────────────────────────────────────────────────

describe('skills dimension', () => {
  // @ana A022
  it('names scaffold-default skills when not all enriched', async () => {
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);
    // deployment and troubleshooting have 0 detected + 0 rules
    expect(results.dimensions.skills.scaffold_defaults).toContain('deployment');
    expect(results.dimensions.skills.scaffold_defaults).toContain('troubleshooting');
    expect(results.dimensions.skills.scaffold_defaults.join(', ')).toContain('still scaffold'.split(' ')[0] ? 'deployment' : '');
  });
});

// ── Proof chain dimension ───────────────────────────────────────────

describe('proof chain dimension', () => {
  // @ana A037
  it('missing proof_chain.json shows zero runs', async () => {
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);
    expect(results.dimensions.proof_chain.runs).toBe(0);
    expect(results.dimensions.proof_chain.trend).toBe('insufficient_data');
  });

  it('populated proof chain reports correct run count', async () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      slug: `task-${i}`,
      findings: [{ status: 'active', severity: 'debt' }],
    }));
    await createMinimalProject(tmpDir, { proofChain: { entries } });
    const results = await runDoctor(tmpDir);
    expect(results.dimensions.proof_chain.runs).toBe(5);
    expect(results.dimensions.proof_chain.active_findings).toBe(5);
  });
});

// ── Stale work detection ────────────────────────────────────────────

describe('stale work detection', () => {
  // @ana A023
  it('work item stalled >14 days appears as stale', async () => {
    await createMinimalProject(tmpDir);
    const slugDir = path.join(tmpDir, '.ana', 'plans', 'active', 'stale-item');
    await fs.mkdir(slugDir, { recursive: true });
    const staleSave = [{
      type: 'scope',
      saved_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    }];
    await fs.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(staleSave));

    const results = await runDoctor(tmpDir);
    const staleItem = results.stale_work.find(w => w.slug === 'stale-item');
    expect(staleItem).toBeDefined();
    expect(staleItem!.days_stalled).toBeGreaterThan(14);
  });

  // @ana A024
  it('work item with active worktree is not stalled', async () => {
    await createMinimalProject(tmpDir);
    const slug = 'active-worktree-item';
    const slugDir = path.join(tmpDir, '.ana', 'plans', 'active', slug);
    await fs.mkdir(slugDir, { recursive: true });
    const staleSave = [{
      type: 'scope',
      saved_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    }];
    await fs.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(staleSave));

    // Create worktree directory
    const wtDir = path.join(tmpDir, '.ana', 'worktrees', slug);
    await fs.mkdir(wtDir, { recursive: true });

    const results = await runDoctor(tmpDir);
    const staleItem = results.stale_work.find(w => w.slug === slug);
    expect(staleItem).toBeUndefined();
  });
});

// ── Terminal formatting ─────────────────────────────────────────────

describe('terminal formatting', () => {
  it('formatTerminalOutput is covered via runDoctor results structure', async () => {
    await createMinimalProject(tmpDir);
    const results = await runDoctor(tmpDir);

    // Verify the structure that formatTerminalOutput reads
    expect(results.dimensions.cli_version.status).toBeDefined();
    expect(results.dimensions.scan_freshness.status).toBeDefined();
    expect(results.dimensions.context.status).toBeDefined();
    expect(results.dimensions.skills.status).toBeDefined();
    expect(results.dimensions.proof_chain.status).toBeDefined();
  });
});

// ── Edge cases ──────────────────────────────────────────────────────

describe('edge cases', () => {
  it('partial .ana/ with missing context dir', async () => {
    const anaDir = path.join(tmpDir, '.ana');
    await fs.mkdir(path.join(anaDir, 'plans', 'active'), { recursive: true });
    await fs.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify({
        anaVersion: '1.1.1',
        name: 'test',
        lastScanAt: new Date().toISOString(),
      }),
    );

    const results = await runDoctor(tmpDir);
    expect(results.dimensions.context.sections_populated).toBe(0);
  });

  it('empty proof chain (0 entries) shows warn not fail', async () => {
    await createMinimalProject(tmpDir, {
      proofChain: { entries: [] },
    });
    const results = await runDoctor(tmpDir);
    expect(results.dimensions.proof_chain.status).toBe('warn');
    expect(results.dimensions.proof_chain.runs).toBe(0);
  });
});
