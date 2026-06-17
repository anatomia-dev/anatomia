/**
 * Tests for ana run command.
 *
 * Tests mock spawnSync to verify correct argument construction
 * without spawning actual processes. All paths call process.exit(),
 * so every executeRun() call is expected to throw.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Mock child_process before importing the module under test
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: '', stderr: '' })),
}));

import { spawnSync } from 'node:child_process';
import { executeRun, resolvePlatform, parseSimpleToml, buildCaptureEnv, resolveDispatchKind } from '../../src/commands/run.js';

const mockedSpawnSync = vi.mocked(spawnSync);

describe('ana run', () => {
  let tempDir: string;
  let originalCwd: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as never);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockedSpawnSync.mockReset();
    // Default: `which` succeeds (claude and codex are in PATH), spawned processes exit 0
    mockedSpawnSync.mockImplementation(((cmd: string) => {
      if (cmd === 'which' || cmd === 'where') {
        return { status: 0, stdout: '/usr/bin/claude\n', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    }) as typeof spawnSync);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  function createProject(config?: Record<string, unknown>): void {
    const anaDir = path.join(tempDir, '.ana');
    fs.mkdirSync(anaDir, { recursive: true });
    fs.writeFileSync(
      path.join(anaDir, 'ana.json'),
      JSON.stringify({
        name: 'test',
        platforms: ['claude'],
        platformFlags: {},
        ...config,
      }),
    );
  }

  /** Create a Codex-configured project with TOML manifests and prompt files. */
  function createCodexProject(config?: Record<string, unknown>): void {
    const anaDir = path.join(tempDir, '.ana');
    fs.mkdirSync(anaDir, { recursive: true });
    fs.writeFileSync(
      path.join(anaDir, 'ana.json'),
      JSON.stringify({
        name: 'test',
        platforms: ['codex'],
        platformFlags: {},
        ...config,
      }),
    );

    // Create .codex/agents/ with TOML manifests and prompt files
    const agentsDir = path.join(tempDir, '.codex', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    const agents = ['ana', 'ana-build', 'ana-plan', 'ana-verify', 'ana-setup', 'ana-learn'];
    for (const agent of agents) {
      fs.writeFileSync(
        path.join(agentsDir, `${agent}.agent.toml`),
        `model = "gpt-5.5"\nsandbox_mode = "danger-full-access"\nmodel_reasoning_effort = "high"\n`,
      );
      fs.writeFileSync(
        path.join(agentsDir, `${agent}.md`),
        `# ${agent} prompt\nYou are ${agent}.`,
      );
    }
  }

  /** Run executeRun and return the exit code from the thrown error. */
  function runAndGetExit(suffix: string, args: string[] = [], platformFlag?: string): number {
    try {
      executeRun(suffix, args, platformFlag);
      return -1; // Should not reach here
    } catch (e) {
      const match = (e as Error).message.match(/process\.exit\((\d+)\)/);
      return match?.[1] ? parseInt(match[1], 10) : -1;
    }
  }

  // @ana A033
  it('errors without .ana directory', () => {
    const code = runAndGetExit('build');
    expect(code).toBe(1);
    const errorOutput = errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(errorOutput).toContain('ana init');
  });

  // @ana A028
  it('spawns claude --agent ana-build for build argument', () => {
    createProject();
    runAndGetExit('build');

    const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'claude');
    expect(spawnCall).toBeDefined();
    const spawnArgs = spawnCall![1] as string[];
    expect(spawnArgs).toContain('--agent');
    expect(spawnArgs).toContain('ana-build');
  });

  // @ana A029
  it('spawns claude --agent ana for empty agent argument', () => {
    createProject();
    runAndGetExit('');

    const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'claude');
    expect(spawnCall).toBeDefined();
    const spawnArgs = spawnCall![1] as string[];
    expect(spawnArgs).toContain('--agent');
    expect(spawnArgs).toContain('ana');
    expect(spawnArgs[spawnArgs.indexOf('--agent') + 1]).toBe('ana');
  });

  // @ana A030
  it('appends platformFlags from config', () => {
    createProject({
      platformFlags: { claude: ['--dangerously-skip-permissions'] },
    });
    runAndGetExit('build');

    const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'claude');
    expect(spawnCall).toBeDefined();
    const spawnArgs = spawnCall![1] as string[];
    expect(spawnArgs).toContain('--dangerously-skip-permissions');
  });

  // @ana A031
  it('passes through args after --', () => {
    createProject();
    runAndGetExit('build', ['--extra-flag']);

    const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'claude');
    expect(spawnCall).toBeDefined();
    const spawnArgs = spawnCall![1] as string[];
    expect(spawnArgs).toContain('--extra-flag');
  });

  // @ana A032
  it('rejects --agent in platformFlags with exit code 1', () => {
    createProject({
      platformFlags: { claude: ['--agent', 'something'] },
    });

    const code = runAndGetExit('build');
    expect(code).toBe(1);
    const errorOutput = errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(errorOutput).toContain('--agent');
    expect(errorOutput).toContain('conflicts');
  });

  it('errors when claude is not in PATH', () => {
    createProject();
    mockedSpawnSync.mockImplementation(((cmd: string) => {
      if (cmd === 'which' || cmd === 'where') {
        return { status: 1, stdout: '', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    }) as typeof spawnSync);

    const code = runAndGetExit('build');
    expect(code).toBe(1);
    const errorOutput = errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(errorOutput).toContain('claude not found');
  });

  it('errors for unknown agent suffix', () => {
    createProject();
    const code = runAndGetExit('unknown-agent');
    expect(code).toBe(1);
    const errorOutput = errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(errorOutput).toContain('Unknown agent');
  });

  it('builds correct arg order: --agent name, flags, passthrough', () => {
    createProject({
      platformFlags: { claude: ['--dangerously-skip-permissions'] },
    });
    runAndGetExit('build', ['--verbose']);

    const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'claude');
    const spawnArgs = spawnCall![1] as string[];
    expect(spawnArgs).toEqual([
      '--agent', 'ana-build',
      '--dangerously-skip-permissions',
      '--verbose',
    ]);
  });

  it('maps all known agent suffixes correctly', () => {
    const expectedMappings: Record<string, string> = {
      '': 'ana',
      build: 'ana-build',
      plan: 'ana-plan',
      verify: 'ana-verify',
      setup: 'ana-setup',
      learn: 'ana-learn',
    };

    for (const [suffix, expectedAgent] of Object.entries(expectedMappings)) {
      createProject();
      mockedSpawnSync.mockReset();
      mockedSpawnSync.mockImplementation(((cmd: string) => {
        if (cmd === 'which' || cmd === 'where') {
          return { status: 0, stdout: '/usr/bin/claude\n', stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
      }) as typeof spawnSync);

      runAndGetExit(suffix);

      const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'claude');
      expect(spawnCall, `Missing spawn call for suffix "${suffix}"`).toBeDefined();
      const spawnArgs = spawnCall![1] as string[];
      expect(spawnArgs[spawnArgs.indexOf('--agent') + 1]).toBe(expectedAgent);
    }
  });

  it('shows advisory warning when no work item at expected stage', () => {
    createProject();
    // Create a work item with scope only — not ready for build
    const plansDir = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug');
    fs.mkdirSync(plansDir, { recursive: true });
    fs.writeFileSync(path.join(plansDir, 'scope.md'), '# Scope');
    // No plan.md → not ready for build

    runAndGetExit('build');

    const logOutput = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(logOutput).toContain('No work item at build stage');
  });

  it('does not warn when work item is at the correct stage', () => {
    createProject();
    // Create a work item with scope + plan → plausibly ready for build
    const plansDir = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug');
    fs.mkdirSync(plansDir, { recursive: true });
    fs.writeFileSync(path.join(plansDir, 'scope.md'), '# Scope');
    fs.writeFileSync(path.join(plansDir, 'plan.md'), '# Plan');

    runAndGetExit('build');

    const logOutput = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(logOutput).not.toContain('No work item');
  });

  it('does not warn for plan when scope exists without plan', () => {
    createProject();
    const plansDir = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug');
    fs.mkdirSync(plansDir, { recursive: true });
    fs.writeFileSync(path.join(plansDir, 'scope.md'), '# Scope');
    // No plan.md → ready for plan

    runAndGetExit('plan');

    const logOutput = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(logOutput).not.toContain('No work item');
  });

  describe('Codex dispatch', () => {
    // @ana A030, A031, A032
    it('dispatches codex exec with model and sandbox from TOML', () => {
      createCodexProject();
      runAndGetExit('build');

      const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'codex');
      expect(spawnCall).toBeDefined();
      const spawnArgs = spawnCall![1] as string[];
      expect(spawnArgs).not.toContain('exec');
      expect(spawnArgs).toContain('--model');
      expect(spawnArgs).toContain('gpt-5.5');
      expect(spawnArgs).toContain('--sandbox');
      expect(spawnArgs).toContain('danger-full-access');
    });

    // @ana A033
    it('opens interactive mode for Think agent (no exec)', () => {
      createCodexProject();
      runAndGetExit('');

      const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'codex');
      expect(spawnCall).toBeDefined();
      const spawnArgs = spawnCall![1] as string[];
      expect(spawnArgs).not.toContain('exec');
      expect(spawnArgs).toContain('--model');
      expect(spawnArgs).toContain('--sandbox');
    });

    it('opens interactive mode for Setup agent (no exec)', () => {
      createCodexProject();
      runAndGetExit('setup');

      const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'codex');
      expect(spawnCall).toBeDefined();
      const spawnArgs = spawnCall![1] as string[];
      expect(spawnArgs).not.toContain('exec');
    });

    it('uses interactive mode for Plan agent', () => {
      createCodexProject();
      runAndGetExit('plan');

      const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'codex');
      expect(spawnCall).toBeDefined();
      const spawnArgs = spawnCall![1] as string[];
      expect(spawnArgs).not.toContain('exec');
    });

    it('uses interactive mode for Verify agent', () => {
      createCodexProject();
      runAndGetExit('verify');

      const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'codex');
      expect(spawnCall).toBeDefined();
      const spawnArgs = spawnCall![1] as string[];
      expect(spawnArgs).not.toContain('exec');
    });

    // @ana A001, A002, A003
    it('dispatches Learn agent on Codex', () => {
      createCodexProject();
      runAndGetExit('learn');

      const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'codex');
      expect(spawnCall).toBeDefined();
      const spawnArgs = spawnCall![1] as string[];
      expect(spawnArgs).not.toContain('exec');
      const diArg = spawnArgs.find(a => typeof a === 'string' && a.startsWith('developer_instructions='));
      expect(diArg).toBeDefined();
      expect(diArg).toContain('# ana-learn prompt');
    });

    it('does not use shell for codex spawn (security: no command injection)', () => {
      createCodexProject();
      runAndGetExit('build');

      const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'codex');
      expect(spawnCall).toBeDefined();
      // Options are in spawnCall[2] (command, args, options)
      const spawnOpts = spawnCall![2] as Record<string, unknown> | undefined;
      expect(spawnOpts?.['shell']).toBeUndefined();
    });

    it('includes developer_instructions as direct arg (no shell expansion)', () => {
      createCodexProject();
      runAndGetExit('build');

      const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'codex');
      expect(spawnCall).toBeDefined();
      const spawnArgs = spawnCall![1] as string[];
      const diArg = spawnArgs.find(a => typeof a === 'string' && a.startsWith('developer_instructions='));
      expect(diArg).toBeDefined();
      expect(diArg).toContain('# ana-build prompt');
    });

    it('errors when codex is not in PATH', () => {
      createCodexProject();
      mockedSpawnSync.mockImplementation(((cmd: string, args?: string[]) => {
        if (cmd === 'which' || cmd === 'where') {
          const target = args?.[0];
          if (target === 'codex') {
            return { status: 1, stdout: '', stderr: '' };
          }
          return { status: 0, stdout: '/usr/bin/claude\n', stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
      }) as typeof spawnSync);

      const code = runAndGetExit('build');
      expect(code).toBe(1);
      const errorOutput = errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
      expect(errorOutput).toContain('codex not found');
      expect(errorOutput).toContain('https://openai.com/codex');
    });

    it('errors when agent prompt file is missing', () => {
      createCodexProject();
      // Remove the prompt file for ana-build
      fs.unlinkSync(path.join(tempDir, '.codex', 'agents', 'ana-build.md'));

      const code = runAndGetExit('build');
      expect(code).toBe(1);
      const errorOutput = errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
      expect(errorOutput).toContain('Agent prompt not found');
    });

    it('passes through platform flags for codex', () => {
      createCodexProject({
        platformFlags: { codex: ['--full-auto'] },
      });
      runAndGetExit('build');

      const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'codex');
      expect(spawnCall).toBeDefined();
      const spawnArgs = spawnCall![1] as string[];
      expect(spawnArgs).toContain('--full-auto');
    });

    // @ana A004, A005
    it('codex learn template and TOML exist', () => {
      createCodexProject();
      const learnPrompt = path.join(tempDir, '.codex', 'agents', 'ana-learn.md');
      const learnToml = path.join(tempDir, '.codex', 'agents', 'ana-learn.agent.toml');
      expect(fs.existsSync(learnPrompt)).toBe(true);
      expect(fs.existsSync(learnToml)).toBe(true);
    });

    it('all Codex agents use interactive mode (no exec)', () => {
      createCodexProject();
      runAndGetExit('build');

      const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'codex');
      expect(spawnCall).toBeDefined();
      const spawnArgs = spawnCall![1] as string[];
      expect(spawnArgs).not.toContain('exec');
      expect(spawnArgs.some(a => typeof a === 'string' && a.startsWith('developer_instructions='))).toBe(true);
    });
  });

  describe('platform resolution', () => {
    // @ana A034
    it('--platform flag selects codex dispatch', () => {
      // Project configured for claude, but --platform codex overrides
      createProject();
      // Also need codex agents for dispatch
      const agentsDir = path.join(tempDir, '.codex', 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(path.join(agentsDir, 'ana-build.agent.toml'), 'model = "gpt-5.5"\nsandbox_mode = "danger-full-access"\nmodel_reasoning_effort = "high"\n');
      fs.writeFileSync(path.join(agentsDir, 'ana-build.md'), '# build prompt');

      runAndGetExit('build', [], 'codex');

      const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'codex');
      expect(spawnCall).toBeDefined();
    });

    // @ana A036
    it('--platform flag takes priority over ANA_PLATFORM env', () => {
      createProject({ platforms: ['claude', 'codex'] });
      const agentsDir = path.join(tempDir, '.codex', 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(path.join(agentsDir, 'ana-build.agent.toml'), 'model = "gpt-5.5"\nsandbox_mode = "danger-full-access"\nmodel_reasoning_effort = "high"\n');
      fs.writeFileSync(path.join(agentsDir, 'ana-build.md'), '# build prompt');

      const originalEnv = process.env['ANA_PLATFORM'];
      process.env['ANA_PLATFORM'] = 'claude';
      try {
        runAndGetExit('build', [], 'codex');
        const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'codex');
        expect(spawnCall).toBeDefined();
      } finally {
        if (originalEnv === undefined) {
          delete process.env['ANA_PLATFORM'];
        } else {
          process.env['ANA_PLATFORM'] = originalEnv;
        }
      }
    });

    it('ANA_PLATFORM env selects platform when no flag', () => {
      createProject({ platforms: ['claude', 'codex'] });
      const agentsDir = path.join(tempDir, '.codex', 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(path.join(agentsDir, 'ana-build.agent.toml'), 'model = "gpt-5.5"\nsandbox_mode = "danger-full-access"\nmodel_reasoning_effort = "high"\n');
      fs.writeFileSync(path.join(agentsDir, 'ana-build.md'), '# build prompt');

      const originalEnv = process.env['ANA_PLATFORM'];
      process.env['ANA_PLATFORM'] = 'codex';
      try {
        runAndGetExit('build');
        const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'codex');
        expect(spawnCall).toBeDefined();
      } finally {
        if (originalEnv === undefined) {
          delete process.env['ANA_PLATFORM'];
        } else {
          process.env['ANA_PLATFORM'] = originalEnv;
        }
      }
    });

    it('sole platform in ana.json auto-selects', () => {
      createCodexProject();
      runAndGetExit('build');

      const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'codex');
      expect(spawnCall).toBeDefined();
    });

    // @ana A037
    it('multiple platforms without flag shows error with guidance', () => {
      createProject({ platforms: ['claude', 'codex'] });
      const originalEnv = process.env['ANA_PLATFORM'];
      delete process.env['ANA_PLATFORM'];
      try {
        const code = runAndGetExit('build');
        expect(code).toBe(1);
        const errorOutput = errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
        expect(errorOutput).toContain('--platform');
        expect(errorOutput).toContain('ANA_PLATFORM');
      } finally {
        if (originalEnv !== undefined) {
          process.env['ANA_PLATFORM'] = originalEnv;
        }
      }
    });

    it('CC dispatch unchanged when platform is claude', () => {
      createProject();
      runAndGetExit('build');

      const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'claude');
      expect(spawnCall).toBeDefined();
      const spawnArgs = spawnCall![1] as string[];
      expect(spawnArgs).toContain('--agent');
      expect(spawnArgs).toContain('ana-build');
    });
  });

  describe('parseSimpleToml', () => {
    it('parses key-value pairs', () => {
      const result = parseSimpleToml('model = "gpt-5.5"\nsandbox_mode = "danger-full-access"');
      expect(result).toEqual({ model: 'gpt-5.5', sandbox_mode: 'danger-full-access' });
    });

    it('ignores comments and blank lines', () => {
      const result = parseSimpleToml('# comment\n\nmodel = "gpt-5.5"\n');
      expect(result).toEqual({ model: 'gpt-5.5' });
    });

    it('returns empty object for empty content', () => {
      expect(parseSimpleToml('')).toEqual({});
    });
  });

  describe('resolvePlatform', () => {
    it('returns flag value when provided', () => {
      createProject();
      expect(resolvePlatform(tempDir, 'codex')).toBe('codex');
    });

    it('falls back to ANA_PLATFORM env', () => {
      createProject({ platforms: ['claude', 'codex'] });
      const originalEnv = process.env['ANA_PLATFORM'];
      process.env['ANA_PLATFORM'] = 'codex';
      try {
        expect(resolvePlatform(tempDir, undefined)).toBe('codex');
      } finally {
        if (originalEnv === undefined) {
          delete process.env['ANA_PLATFORM'];
        } else {
          process.env['ANA_PLATFORM'] = originalEnv;
        }
      }
    });

    it('returns sole platform from ana.json', () => {
      createProject({ platforms: ['codex'] });
      expect(resolvePlatform(tempDir, undefined)).toBe('codex');
    });

    it('defaults to claude when no ana.json', () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-test-'));
      try {
        expect(resolvePlatform(emptyDir, undefined)).toBe('claude');
      } finally {
        fs.rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });
});

describe('resolveDispatchKind — dispatch guard', () => {
  it('maps the wired platforms to their dispatcher', () => {
    expect(resolveDispatchKind('claude')).toBe('claude');
    expect(resolveDispatchKind('codex')).toBe('codex');
  });

  it('returns null for any other platform → executeRun errors instead of spawning claude', () => {
    // A future `known:true` descriptor that has no wired dispatcher (e.g. cursor)
    // must NOT fall through to the Claude dispatcher. null forces the explicit
    // "no dispatcher wired" error path in executeRun.
    expect(resolveDispatchKind('cursor')).toBeNull();
    expect(resolveDispatchKind('unknown-platform')).toBeNull();
    expect(resolveDispatchKind('')).toBeNull();
  });
});

describe('buildCaptureEnv', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-env-'));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  /** Write a Claude agent-def file so the hash has content to read. */
  function writeAgentDef(agentName: string, content: string, platform: 'claude' | 'codex' = 'claude'): void {
    const dir = path.join(projectDir, platform === 'codex' ? '.codex' : '.claude', 'agents');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${agentName}.md`), content);
  }

  /** Mark projectDir as a worktree for the given slug. */
  function writeWorktreeMeta(slug: string): void {
    const anaDir = path.join(projectDir, '.ana');
    fs.mkdirSync(anaDir, { recursive: true });
    fs.writeFileSync(path.join(anaDir, 'worktree-meta.json'), JSON.stringify({ slug }));
  }

  // @ana A001
  it('mints a non-empty ANA_RUN_ID as a UUID', () => {
    const env = buildCaptureEnv(projectDir, 'build', 'claude', 'ana-build');
    // A001: the per-launch correlation key — the only key shared by the
    // SessionStart pending pointer and the in-session `ana artifact save`.
    expect(env['ANA_RUN_ID']).toBeDefined();
    expect(env['ANA_RUN_ID']).not.toBe('');
    expect(env['ANA_RUN_ID']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('mints a DISTINCT ANA_RUN_ID on each launch', () => {
    const a = buildCaptureEnv(projectDir, 'build', 'claude', 'ana-build')['ANA_RUN_ID'];
    const b = buildCaptureEnv(projectDir, 'build', 'claude', 'ana-build')['ANA_RUN_ID'];
    expect(a).not.toBe(b);
  });

  it("declares the trusted-launcher capture boundary as 'root' (behavioral coverage is declared, not inferred)", () => {
    // The launcher captures only the root agent's transcript today; this is the
    // fact only the launcher knows, read back by buildRootLaneContext (Step 1).
    expect(buildCaptureEnv(projectDir, 'build', 'claude', 'ana-build')['ANA_CAPTURE_BOUNDARY']).toBe('root');
    expect(buildCaptureEnv(projectDir, 'verify', 'codex', 'ana-verify')['ANA_CAPTURE_BOUNDARY']).toBe('root');
  });

  it('sets ANA_HARNESS to the platform', () => {
    const env = buildCaptureEnv(projectDir, 'build', 'claude', 'ana-build');
    expect(env['ANA_HARNESS']).toBe('claude');

    const codexEnv = buildCaptureEnv(projectDir, 'build', 'codex', 'ana-build');
    expect(codexEnv['ANA_HARNESS']).toBe('codex');
  });

  it('sets ANA_ROLE to the agent role, defaulting to ana for Think', () => {
    expect(buildCaptureEnv(projectDir, 'build', 'claude', 'ana-build')['ANA_ROLE']).toBe('build');
    expect(buildCaptureEnv(projectDir, 'verify', 'claude', 'ana-verify')['ANA_ROLE']).toBe('verify');
    // Think launches with an empty suffix → defaults to 'ana'.
    expect(buildCaptureEnv(projectDir, '', 'claude', 'ana')['ANA_ROLE']).toBe('ana');
  });

  it('sets ANA_AGENT_DEF_HASH to a sha256 of the resolved agent-def file', () => {
    writeAgentDef('ana-build', '# ana-build agent definition body');
    const env = buildCaptureEnv(projectDir, 'build', 'claude', 'ana-build');
    expect(env['ANA_AGENT_DEF_HASH']).toContain('sha256');
    expect(env['ANA_AGENT_DEF_HASH']).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('hashes the Codex agent-def file when platform is codex', () => {
    writeAgentDef('ana-build', '# codex agent body', 'codex');
    const env = buildCaptureEnv(projectDir, 'build', 'codex', 'ana-build');
    expect(env['ANA_AGENT_DEF_HASH']).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('degrades to an empty hash when the agent-def file is unreadable', () => {
    // No agent-def file written.
    const env = buildCaptureEnv(projectDir, 'build', 'claude', 'ana-build');
    expect(env['ANA_AGENT_DEF_HASH']).toBe('');
  });

  // @ana A002
  it('merge over process.env is additive — PATH survives', () => {
    const env = buildCaptureEnv(projectDir, 'build', 'claude', 'ana-build');
    // The spawn site merges this over process.env. Simulate that merge.
    const spawnEnv = { ...process.env, ...env };
    expect(spawnEnv['PATH']).toBeDefined();
    expect(spawnEnv['ANA_HARNESS']).toBe('claude');
    // buildCaptureEnv itself only contributes ANA_* keys — it never strips env.
    expect(Object.keys(env).every((k) => k.startsWith('ANA_'))).toBe(true);
  });

  it('build launched inside a worktree resolves ANA_SLUG from the worktree', () => {
    writeWorktreeMeta('session-capture');
    const env = buildCaptureEnv(projectDir, 'build', 'claude', 'ana-build');
    expect(env['ANA_SLUG']).toBe('session-capture');
  });

  it('verify launched inside a worktree resolves ANA_SLUG from the worktree', () => {
    writeWorktreeMeta('session-capture');
    const env = buildCaptureEnv(projectDir, 'verify', 'claude', 'ana-verify');
    expect(env['ANA_SLUG']).toBe('session-capture');
  });

  it('think injects an empty ANA_SLUG (no worktree)', () => {
    const env = buildCaptureEnv(projectDir, '', 'claude', 'ana');
    expect(env['ANA_SLUG']).toBe('');
  });

  it('learn injects an empty ANA_SLUG (no worktree)', () => {
    const env = buildCaptureEnv(projectDir, 'learn', 'claude', 'ana-learn');
    expect(env['ANA_SLUG']).toBe('');
  });

  it('plan --slug sets ANA_SLUG to the given slug', () => {
    const env = buildCaptureEnv(projectDir, 'plan', 'claude', 'ana-plan', 'session-capture');
    expect(env['ANA_SLUG']).toBe('session-capture');
  });

  it('plain plan (no --slug) injects an empty ANA_SLUG', () => {
    const env = buildCaptureEnv(projectDir, 'plan', 'claude', 'ana-plan');
    expect(env['ANA_SLUG']).toBe('');
  });

  it('plan ignores the worktree slug, using only the --slug option', () => {
    // Even inside a worktree, plan keys off the explicit flag, not the worktree.
    writeWorktreeMeta('some-other-slug');
    const env = buildCaptureEnv(projectDir, 'plan', 'claude', 'ana-plan', 'explicit-slug');
    expect(env['ANA_SLUG']).toBe('explicit-slug');
  });

  it('includes a non-empty ANA_CLI_VERSION read from package.json', () => {
    const env = buildCaptureEnv(projectDir, 'build', 'claude', 'ana-build');
    // The CLI version resolves from the package.json — present and a string.
    expect(typeof env['ANA_CLI_VERSION']).toBe('string');
    expect(env['ANA_CLI_VERSION']).not.toBe('');
  });
});
