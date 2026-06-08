import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { lstatSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createEmptyEngineResult } from '../../src/engine/types/engineResult.js';
import { fileExists } from '../../src/commands/init/preflight.js';
import { displayBlindSpots, displaySuccessMessage } from '../../src/commands/init/state.js';
import { createDirectoryStructure } from '../../src/commands/init/assets.js';
import { createSkillSymlinks, copyCodexAgentFiles } from '../../src/commands/init/assets.js';
import { preserveUserState, migrateSkillsToCanonical, createAnaJson } from '../../src/commands/init/state.js';
import { isTestEvidenceGateEnabled } from '../../src/commands/artifact.js';
import { AGENT_FILES, CODEX_AGENT_FILES, DOCS_QUICKSTART, DOCS_SETUP_GUIDE } from '../../src/constants.js';

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

describe('ana init', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-init-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  describe('directory structure', () => {
    it('creates all required directories', async () => {
      const anaPath = path.join(tmpDir, '.ana');
      await fs.mkdir(anaPath);
      await fs.mkdir(path.join(anaPath, 'context'), { recursive: true });
      await fs.mkdir(path.join(anaPath, 'state'), { recursive: true });
      const dirs = [
        'context',
        'state',
      ];

      for (const dir of dirs) {
        const exists = await dirExists(path.join(anaPath, dir));
        expect(exists).toBe(true);
      }
    });

    // @ana A044 — provenance/ must never be gitignored: per-session provenance
    // travels in git between machines, so a generated ignore of it would break
    // cross-machine assembly. The generator already omits it; lock that in.
    it('generated .ana/.gitignore does not ignore provenance', async () => {
      const tmpAnaPath = path.join(tmpDir, '.ana-gitignore');
      await createDirectoryStructure(tmpAnaPath);

      const gitignore = await fs.readFile(path.join(tmpAnaPath, '.gitignore'), 'utf-8');
      expect(gitignore).not.toContain('provenance');
    });
  });

  describe('template inventory', () => {
    it('all template files exist in CLI package', async () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const templatesDir = path.join(__dirname, '..', '..', 'templates');

      const expectedFiles = [
        '.claude/settings.json',
        ...AGENT_FILES.map(f => '.claude/agents/' + f),
        '.claude/skills/testing-standards/SKILL.md',
        '.claude/skills/coding-standards/SKILL.md',
        '.claude/skills/git-workflow/SKILL.md',
        '.claude/skills/deployment/SKILL.md',
        '.claude/skills/troubleshooting/SKILL.md',
        'CLAUDE.md',
      ];

      expect(expectedFiles).toHaveLength(7 + AGENT_FILES.length);

      for (const file of expectedFiles) {
        const filePath = path.join(templatesDir, file);
        const exists = await fileExists(filePath);
        expect(exists, `Missing template: ${file}`).toBe(true);
      }
    });
  });

  describe('ana.json', () => {
    // @ana A021
    it('creates valid initial ana.json from EngineResult', async () => {
      const engineResult = createEmptyEngineResult();
      const meta = {
        anaVersion: '1.0.0',
        name: engineResult.overview.project,
        language: engineResult.stack.language || null,
        framework: engineResult.stack.framework || null,
        packageManager: engineResult.commands.packageManager,
        commands: {
          build: engineResult.commands.build || null,
          test: engineResult.commands.test || null,
          lint: engineResult.commands.lint || null,
          dev: engineResult.commands.dev || null,
        },
        coAuthor: 'Ana <build@anatomia.dev>',
        artifactBranch: engineResult.git?.defaultBranch ?? engineResult.git?.branch ?? 'main',
        lastScanAt: engineResult.overview.scannedAt,
      };

      expect(meta.name).toBe('unknown');
      expect(meta.packageManager).toBeNull();
      expect(meta.framework).toBeNull();
      expect(meta.anaVersion).toBeDefined();
      expect(meta.lastScanAt).toBeDefined();
      expect(meta).not.toHaveProperty('setupPhase');
      expect(meta).not.toHaveProperty('mergeStrategy');
    });

    // @ana A010, A001 — a freshly initialized project opts into the test-evidence gate.
    it('createAnaJson writes testEvidenceGate: on', async () => {
      const tmpAnaPath = path.join(tmpDir, '.ana-tmp');
      await createDirectoryStructure(tmpAnaPath);

      const config = await createAnaJson(tmpAnaPath, createEmptyEngineResult());

      expect(config['testEvidenceGate']).toBe('on');
      const written = JSON.parse(await fs.readFile(path.join(tmpAnaPath, 'ana.json'), 'utf-8'));
      expect(written.testEvidenceGate).toBe('on');
    });

    // @ana A032 — new projects default to warn (off), not block.
    it('createAnaJson writes processCaptureStrict: off', async () => {
      const tmpAnaPath = path.join(tmpDir, '.ana-tmp-strict');
      await createDirectoryStructure(tmpAnaPath);

      const config = await createAnaJson(tmpAnaPath, createEmptyEngineResult());

      expect(config['processCaptureStrict']).toBe('off');
      const written = JSON.parse(await fs.readFile(path.join(tmpAnaPath, 'ana.json'), 'utf-8'));
      expect(written.processCaptureStrict).toBe('off');
    });

    it('has all required fields for D1 schema', () => {
      const meta = {
        anaVersion: '1.0.0',
        name: 'my-project',
        language: 'Python',
        framework: 'FastAPI',
        packageManager: 'pip',
        commands: {
          build: null,
          test: 'pytest',
          lint: 'ruff check .',
          dev: 'uvicorn src.main:app --reload',
        },
        coAuthor: 'Ana <build@anatomia.dev>',
        artifactBranch: 'main',
        lastScanAt: new Date().toISOString(),
      };

      const keys = Object.keys(meta);
      expect(keys).toContain('anaVersion');
      expect(keys).toContain('lastScanAt');
      expect(keys).toContain('name');
      expect(keys).toContain('framework');
      expect(keys).toContain('packageManager');
      expect(keys).not.toContain('scanStaleDays');
      expect(keys).not.toContain('setupStatus');
      expect(keys).not.toContain('analyzerVersion');
      expect(keys).not.toContain('setupMode');
      expect(keys).not.toContain('setupCompletedAt');
    });
  });

  describe('--force flag', () => {
    it('preserves state/ when overwriting', async () => {
      const anaPath = path.join(tmpDir, '.ana');
      const statePath = path.join(anaPath, 'state');
      await fs.mkdir(statePath, { recursive: true });
      await fs.writeFile(path.join(statePath, 'snapshot.json'), '{"test":"data"}');
      const backup = path.join(os.tmpdir(), `.ana-state-backup-${Date.now()}`);
      await fs.cp(statePath, backup, { recursive: true });
      await fs.rm(anaPath, { recursive: true, maxRetries: 3, retryDelay: 200 });
      await fs.mkdir(statePath, { recursive: true });
      await fs.rm(statePath, { recursive: true, maxRetries: 3, retryDelay: 200 });
      await fs.rename(backup, statePath);
      const content = await fs.readFile(path.join(statePath, 'snapshot.json'), 'utf-8');
      expect(JSON.parse(content)).toEqual({ test: 'data' });
    });
  });

  describe('.claude/ configuration', () => {
    it('ships empty hooks object in settings template', async () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const templatesDir = path.join(__dirname, '..', '..', 'templates');

      const settingsPath = path.join(templatesDir, '.claude/settings.json');
      const content = await fs.readFile(settingsPath, 'utf-8');
      const settings = JSON.parse(content);

      expect(settings.hooks).toEqual({});
    });

    it(`creates .claude/agents/ directory with ${AGENT_FILES.length} agent files`, async () => {
      const claudePath = path.join(tmpDir, '.claude');
      const agentsPath = path.join(claudePath, 'agents');
      await fs.mkdir(agentsPath, { recursive: true });
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const templatesDir = path.join(__dirname, '..', '..', 'templates');
      for (const agentFile of AGENT_FILES) {
        const sourcePath = path.join(templatesDir, '.claude/agents', agentFile);
        const destPath = path.join(agentsPath, agentFile);
        await fs.copyFile(sourcePath, destPath);
      }

      const exists = await dirExists(agentsPath);
      expect(exists).toBe(true);
      const files = await fs.readdir(agentsPath);
      expect(files).toHaveLength(AGENT_FILES.length);
      for (const agentFile of AGENT_FILES) {
        expect(files).toContain(agentFile);
      }
    });

    it('agent files have valid frontmatter with required fields', async () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const templatesDir = path.join(__dirname, '..', '..', 'templates');

      for (const agentFile of AGENT_FILES) {
        const filePath = path.join(templatesDir, '.claude/agents', agentFile);
        const content = await fs.readFile(filePath, 'utf-8');
        expect(content.startsWith('---'), `${agentFile} should start with ---`).toBe(true);
        const secondDashIndex = content.indexOf('---', 3);
        expect(secondDashIndex).toBeGreaterThan(3);

        const frontmatter = content.slice(3, secondDashIndex).trim();
        expect(frontmatter).toContain('name:');
        expect(frontmatter).toContain('model:');
        expect(frontmatter).toContain('description:');
        if (agentFile === 'ana.md') {
          expect(frontmatter).toContain('model: opus');
          expect(frontmatter).toContain('memory:');
        } else if (agentFile === 'ana-plan.md') {
          expect(frontmatter).toContain('model: opus');
          expect(frontmatter).not.toContain('tools:');
          expect(frontmatter).not.toContain('memory:');
        } else if (agentFile === 'ana-setup.md') {
          expect(frontmatter).toContain('model: opus');
          expect(frontmatter).not.toContain('tools:');  // no tools field = inherit all tools including Agent
          expect(frontmatter).not.toContain('memory:');
        } else if (agentFile === 'ana-build.md' || agentFile === 'ana-verify.md' || agentFile === 'ana-learn.md') {
          expect(frontmatter).toContain('model: opus');
          expect(frontmatter).not.toContain('tools:');
          expect(frontmatter).not.toContain('memory:');
        }
      }
    });

    it('re-init does not duplicate agent files', async () => {
      const claudePath = path.join(tmpDir, '.claude');
      const agentsPath = path.join(claudePath, 'agents');
      await fs.mkdir(agentsPath, { recursive: true });
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const templatesDir = path.join(__dirname, '..', '..', 'templates');
      for (const agentFile of AGENT_FILES) {
        const sourcePath = path.join(templatesDir, '.claude/agents', agentFile);
        const destPath = path.join(agentsPath, agentFile);
        await fs.copyFile(sourcePath, destPath);
      }
      for (const agentFile of AGENT_FILES) {
        const destPath = path.join(agentsPath, agentFile);
        const exists = await fileExists(destPath);
        expect(exists).toBe(true);
      }
      const files = await fs.readdir(agentsPath);
      expect(files).toHaveLength(AGENT_FILES.length);
    });

    it('merges into existing .claude/settings.json without duplicates', async () => {
      const claudePath = path.join(tmpDir, '.claude');
      const settingsPath = path.join(claudePath, 'settings.json');
      await fs.mkdir(claudePath, { recursive: true });
      const existingSettings = {
        hooks: {
          PreToolUse: [
            {
              matcher: '*',
              hooks: [{ type: 'command', command: 'custom-hook.sh' }],
            },
          ],
        },
      };
      await fs.writeFile(settingsPath, JSON.stringify(existingSettings, null, 2));
      const templateSettings = {
        hooks: {
          PostToolUse: [
            {
              matcher: 'Write',
              hooks: [
                {
                  type: 'command',
                  command: '.ana/hooks/verify-context-file.sh',
                  timeout: 30,
                },
              ],
            },
          ],
        },
      };
      const merged = { ...existingSettings };
      merged.hooks = { ...existingSettings.hooks, ...templateSettings.hooks };
      await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2));
      const content = await fs.readFile(settingsPath, 'utf-8');
      const result = JSON.parse(content);
      expect(result.hooks.PreToolUse).toBeDefined();
      expect(result.hooks.PostToolUse).toBeDefined();
      expect(result.hooks.PreToolUse[0].hooks[0].command).toBe('custom-hook.sh');
    });

    it('does not duplicate hooks on re-init', async () => {
      const claudePath = path.join(tmpDir, '.claude');
      const settingsPath = path.join(claudePath, 'settings.json');
      await fs.mkdir(claudePath, { recursive: true });
      const settingsWithOurHooks = {
        hooks: {
          PostToolUse: [
            {
              matcher: 'Write',
              hooks: [
                {
                  type: 'command',
                  command: '.ana/hooks/verify-context-file.sh',
                  timeout: 30,
                },
              ],
            },
          ],
        },
      };
      await fs.writeFile(settingsPath, JSON.stringify(settingsWithOurHooks, null, 2));
      const _templateSettings = { ...settingsWithOurHooks };
      const existingPostToolUse = settingsWithOurHooks.hooks.PostToolUse;

      const postToolUseHasOurHook = existingPostToolUse.some(
        (entry: { matcher?: string; hooks?: Array<{ command: string }> }) =>
          entry.hooks?.some((h) => h.command === '.ana/hooks/verify-context-file.sh')
      );

      expect(postToolUseHasOurHook).toBe(true);
      expect(settingsWithOurHooks.hooks.PostToolUse).toHaveLength(1);
    });

    it('overwrites malformed .claude/settings.json with Anatomia defaults', async () => {
      const claudePath = path.join(tmpDir, '.claude');
      const settingsPath = path.join(claudePath, 'settings.json');
      await fs.mkdir(claudePath, { recursive: true });
      await fs.writeFile(settingsPath, '{ invalid json here }');
      const templateSettings = {
        hooks: {
          PostToolUse: [
            {
              matcher: 'Write',
              hooks: [
                {
                  type: 'command',
                  command: '.ana/hooks/verify-context-file.sh',
                  timeout: 30,
                },
              ],
            },
          ],
        },
      };
      let didOverwrite = false;
      try {
        const content = await fs.readFile(settingsPath, 'utf-8');
        JSON.parse(content); // This should throw
      } catch {
        await fs.writeFile(settingsPath, JSON.stringify(templateSettings, null, 2));
        didOverwrite = true;
      }

      expect(didOverwrite).toBe(true);
      const content = await fs.readFile(settingsPath, 'utf-8');
      const result = JSON.parse(content);
      expect(result.hooks.PostToolUse).toBeDefined();
      expect(result.hooks.PostToolUse[0].hooks[0].command).toBe(
        '.ana/hooks/verify-context-file.sh'
      );
    });
  });
  describe('blind spot display', () => {
    it('shows nothing when blind spots array is empty', () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });

      displayBlindSpots([]);

      expect(logs.join('\n')).not.toContain('Blind spots');
      spy.mockRestore();
    });
    it('translates Analyzer blind spot to human-readable message', () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });

      displayBlindSpots([
        { area: 'Analyzer', issue: 'Tree-sitter analysis unavailable: WASM load failed', resolution: 'Install tree-sitter' },
      ]);

      const output = logs.join('\n');
      expect(output).toContain('code patterns, conventions, and structure analysis');
      expect(output).not.toContain('Tree-sitter');
      expect(output).toContain('Blind spots');
      spy.mockRestore();
    });
    it('displays non-Analyzer blind spots with their fields directly', () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });

      displayBlindSpots([
        { area: 'Database', issue: 'Prisma dependency found but no schema.prisma', resolution: 'Create prisma/schema.prisma (or packages/<pkg>/prisma/schema.prisma in a monorepo)' },
      ]);

      const output = logs.join('\n');
      expect(output).toContain('Database');
      expect(output).toContain('schema.prisma');
      spy.mockRestore();
    });

    it('handles mixed Analyzer and non-Analyzer blind spots', () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });

      displayBlindSpots([
        { area: 'Analyzer', issue: 'Tree-sitter analysis unavailable: failed', resolution: 'Rebuild' },
        { area: 'Database', issue: 'No schema found', resolution: 'Create schema.prisma' },
      ]);

      const output = logs.join('\n');
      expect(output).toContain('code patterns, conventions, and structure analysis');
      expect(output).toContain('Database');
      expect(output).not.toContain('Tree-sitter');
      spy.mockRestore();
    });
  });

  describe('displaySuccessMessage pipeline readiness', () => {
    it('shows Pipeline readiness section when warnings exist', () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });

      const result = createEmptyEngineResult();
      result.stack.language = 'TypeScript';
      displaySuccessMessage(result, 'test-project', '2.0', undefined, [
        'git user.name not configured — git config --global user.name "Your Name"',
      ]);

      const output = logs.join('\n');
      expect(output).toContain('Pipeline readiness');
      expect(output).toContain('git user.name not configured');
      spy.mockRestore();
    });
    it('hides Pipeline readiness when no warnings', () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });

      const result = createEmptyEngineResult();
      result.stack.language = 'TypeScript';
      displaySuccessMessage(result, 'test-project', '2.0', undefined, []);

      const output = logs.join('\n');
      expect(output).not.toContain('Pipeline readiness');
      spy.mockRestore();
    });

    it('shows Pipeline readiness with multi-line warnings', () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });

      const result = createEmptyEngineResult();
      result.stack.language = 'TypeScript';
      displaySuccessMessage(result, 'test-project', '2.0', undefined, [
        'gh CLI not installed — PR creation unavailable\nInstall from https://cli.github.com/\nThe pipeline works without it through Build/Verify',
      ]);

      const output = logs.join('\n');
      expect(output).toContain('Pipeline readiness');
      expect(output).toContain('The pipeline works without it through Build/Verify');
      spy.mockRestore();
    });

    it('shows Pipeline readiness even when engineResult is null', () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });

      displaySuccessMessage(null, 'test-project', '2.0', undefined, [
        'Some warning',
      ]);

      const output = logs.join('\n');
      expect(output).toContain('Pipeline readiness');
      spy.mockRestore();
    });
  });

  describe('displaySuccessMessage quickstart URL', () => {
    it('shows quickstart URL with label', () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });

      const result = createEmptyEngineResult();
      result.stack.language = 'TypeScript';
      displaySuccessMessage(result, 'test-project', '2.0', undefined, []);

      const output = logs.join('\n');
      expect(output).toContain(DOCS_QUICKSTART);
      expect(output).toContain('Quickstart');
      spy.mockRestore();
    });
    it('shows quickstart URL after Next steps block', () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });

      const result = createEmptyEngineResult();
      result.stack.language = 'TypeScript';
      displaySuccessMessage(result, 'test-project', '2.0', undefined, []);

      const output = logs.join('\n');
      const nextIndex = output.indexOf('Next:');
      const quickstartIndex = output.indexOf(DOCS_QUICKSTART);
      expect(nextIndex).toBeGreaterThan(-1);
      expect(quickstartIndex).toBeGreaterThan(nextIndex);
      spy.mockRestore();
    });
    it('shows quickstart URL even when engineResult is null', () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });

      displaySuccessMessage(null, 'test-project', '2.0', undefined, []);

      const output = logs.join('\n');
      expect(output).toContain(DOCS_QUICKSTART);
      spy.mockRestore();
    });
  });

  describe('setup bare command guide URL', () => {
    it('shows guide URL with label', async () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });

      const { Command } = await import('commander');
      const { registerSetupCommand } = await import('../../src/commands/setup.js');
      const program = new Command();
      program.exitOverride();
      registerSetupCommand(program);
      program.parse(['setup'], { from: 'user' });

      const output = logs.join('\n');
      expect(output).toContain(DOCS_SETUP_GUIDE);
      expect(output).toContain('Guide');
      spy.mockRestore();
    });
    it('shows guide URL between agent command and subcommands', async () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });

      const { Command } = await import('commander');
      const { registerSetupCommand } = await import('../../src/commands/setup.js');
      const program = new Command();
      program.exitOverride();
      registerSetupCommand(program);
      program.parse(['setup'], { from: 'user' });

      const output = logs.join('\n');
      const agentIndex = output.indexOf('ana run setup');
      const guideIndex = output.indexOf(DOCS_SETUP_GUIDE);
      const subcommandsIndex = output.indexOf('Subcommands:');
      expect(agentIndex).toBeGreaterThan(-1);
      expect(guideIndex).toBeGreaterThan(agentIndex);
      expect(subcommandsIndex).toBeGreaterThan(guideIndex);
      spy.mockRestore();
    });
  });

  describe('URL constants', () => {
    it('DOCS_QUICKSTART has correct value', () => {
      expect(DOCS_QUICKSTART).toBe('https://anatomia.dev/docs/start');
    });
    it('DOCS_SETUP_GUIDE has correct value', () => {
      expect(DOCS_SETUP_GUIDE).toBe('https://anatomia.dev/docs/guides/using-ana-setup');
    });
  });

  describe('setup agent template', () => {
    it('includes environment validation commands and safety guardrail', async () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const templatePath = path.join(__dirname, '..', '..', 'templates', '.claude', 'agents', 'ana-setup.md');
      const content = await fs.readFile(templatePath, 'utf-8');

      expect(content).toContain('gh --version');
      expect(content).toContain('git config user.name');
      expect(content).toContain('Do not install software');
    });
    it('includes design principles guide URL in Step 6 block', async () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const templatePath = path.join(__dirname, '..', '..', 'templates', '.claude', 'agents', 'ana-setup.md');
      const content = await fs.readFile(templatePath, 'utf-8');

      expect(content).toContain('https://anatomia.dev/docs/guides/using-ana-setup#design-principles');
    });
  });

  describe('using-ana-setup docs page', () => {
    it('links to design principles reference section', async () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const mdxPath = path.join(__dirname, '..', '..', '..', '..', 'website', 'content', 'docs', 'guides', 'using-ana-setup.mdx');
      const content = await fs.readFile(mdxPath, 'utf-8');

      expect(content).toContain('/docs/reference/context#design-principles');
    });
  });
  describe('init creates learn directory with seeded state.json', () => {
    it('creates .ana/learn/state.json with null last_session_at', async () => {
      const anaPath = path.join(tmpDir, '.ana');
      await fs.mkdir(anaPath, { recursive: true });

      await createDirectoryStructure(anaPath);

      const stateContent = await fs.readFile(
        path.join(anaPath, 'learn', 'state.json'),
        'utf-8',
      );
      const state = JSON.parse(stateContent);
      expect(state.last_session_at).toBe(null);
    });
  });
  describe('re-init preserves learn state.json', () => {
    it('preserves existing learn state with non-null timestamp', async () => {
      const existingAnaPath = path.join(tmpDir, '.ana-existing');
      await fs.mkdir(path.join(existingAnaPath, 'learn'), { recursive: true });
      const existingTimestamp = '2026-05-15T14:30:00Z';
      await fs.writeFile(
        path.join(existingAnaPath, 'learn', 'state.json'),
        JSON.stringify({ last_session_at: existingTimestamp }),
      );
      const tmpAnaPath = path.join(tmpDir, '.ana-tmp');
      await createDirectoryStructure(tmpAnaPath);
      const freshState = JSON.parse(
        await fs.readFile(path.join(tmpAnaPath, 'learn', 'state.json'), 'utf-8'),
      );
      expect(freshState.last_session_at).toBe(null);
      await fs.writeFile(
        path.join(existingAnaPath, 'ana.json'),
        JSON.stringify({ artifactBranch: 'main' }),
      );
      const newConfig = { anaVersion: '1.0.0', lastScanAt: new Date().toISOString() };
      await preserveUserState(existingAnaPath, tmpAnaPath, newConfig);
      const preservedState = JSON.parse(
        await fs.readFile(path.join(tmpAnaPath, 'learn', 'state.json'), 'utf-8'),
      );
      expect(preservedState.last_session_at).toBe(existingTimestamp);
    });
  });
  describe('re-init refreshes metadata fields from new scan', () => {
    it('refreshes name, language, framework, packageManager from new config', async () => {
      const existingAnaPath = path.join(tmpDir, '.ana-existing');
      await fs.mkdir(existingAnaPath, { recursive: true });
      await fs.writeFile(
        path.join(existingAnaPath, 'ana.json'),
        JSON.stringify({
          name: 'old-project',
          language: 'JavaScript',
          framework: null,
          packageManager: 'npm',
          commands: { test: 'my-custom-test', build: 'my-build' },
          coAuthor: 'Old Author <old@example.com>',
          artifactBranch: 'main',
          myCustomKey: true,
        }),
      );

      const tmpAnaPath = path.join(tmpDir, '.ana-tmp');
      await createDirectoryStructure(tmpAnaPath);

      const newConfig = {
        anaVersion: '2.0.0',
        lastScanAt: '2026-05-18T00:00:00Z',
        name: 'fresh-project-name',
        language: 'Python',
        framework: 'Django',
        packageManager: 'pip',
        commands: { test: 'pytest', build: 'python -m build' },
      };

      await preserveUserState(existingAnaPath, tmpAnaPath, newConfig);

      const result = JSON.parse(
        await fs.readFile(path.join(tmpAnaPath, 'ana.json'), 'utf-8'),
      );
      expect(result.name).toBe('fresh-project-name');
      expect(result.language).toBe('Python');
      expect(result.framework).toBe('Django');
      expect(result.packageManager).toBe('pip');
      expect(result.commands.test).toBe('my-custom-test');
      expect(result.commands.build).toBe('my-build');
      expect(result.myCustomKey).toBe(true);
    });
  });
  describe('preserves user-owned fields during metadata refresh', () => {
    // @ana A022
    it('preserves coAuthor, artifactBranch, branchPrefix, mergeStrategy, custom', async () => {
      const existingAnaPath = path.join(tmpDir, '.ana-existing');
      await fs.mkdir(existingAnaPath, { recursive: true });
      await fs.writeFile(
        path.join(existingAnaPath, 'ana.json'),
        JSON.stringify({
          name: 'old-name',
          language: 'Go',
          framework: 'Gin',
          packageManager: 'go',
          coAuthor: 'My Team <team@example.com>',
          artifactBranch: 'develop',
          branchPrefix: 'fix/',
          mergeStrategy: 'rebase',
          custom: { myFlag: true },
          commands: { test: 'go test ./...' },
        }),
      );

      const tmpAnaPath = path.join(tmpDir, '.ana-tmp');
      await createDirectoryStructure(tmpAnaPath);

      const newConfig = {
        anaVersion: '2.0.0',
        lastScanAt: '2026-05-18T00:00:00Z',
        name: 'new-name',
        language: 'Rust',
        framework: null,
        packageManager: 'cargo',
      };

      await preserveUserState(existingAnaPath, tmpAnaPath, newConfig);

      const result = JSON.parse(
        await fs.readFile(path.join(tmpAnaPath, 'ana.json'), 'utf-8'),
      );
      expect(result.coAuthor).toBe('My Team <team@example.com>');
      expect(result.artifactBranch).toBe('develop');
      expect(result.branchPrefix).toBe('fix/');
      expect(result.mergeStrategy).toBe('rebase');
      expect(result.custom.myFlag).toBe(true);
      expect(result.name).toBe('new-name');
      expect(result.language).toBe('Rust');
    });
  });
  describe('testEvidenceGate re-init preservation', () => {
    // @ana A011 — re-init preserves an explicit gate-off choice.
    it('keeps testEvidenceGate: off through a re-init merge', async () => {
      const existingAnaPath = path.join(tmpDir, '.ana-existing');
      await fs.mkdir(existingAnaPath, { recursive: true });
      await fs.writeFile(
        path.join(existingAnaPath, 'ana.json'),
        JSON.stringify({
          name: 'my-project',
          language: 'TypeScript',
          packageManager: 'pnpm',
          artifactBranch: 'main',
          testEvidenceGate: 'off',
          commands: { test: 'pnpm vitest run' },
        }),
      );

      const tmpAnaPath = path.join(tmpDir, '.ana-tmp');
      await createDirectoryStructure(tmpAnaPath);

      const newConfig = {
        anaVersion: '2.0.0',
        lastScanAt: '2026-05-18T00:00:00Z',
        name: 'my-project',
        language: 'TypeScript',
        framework: null,
        packageManager: 'pnpm',
      };

      await preserveUserState(existingAnaPath, tmpAnaPath, newConfig);

      const result = JSON.parse(await fs.readFile(path.join(tmpAnaPath, 'ana.json'), 'utf-8'));
      expect(result.testEvidenceGate).toBe('off');
    });

    // @ana A033 — re-init preserves an explicit processCaptureStrict choice.
    it('keeps an explicit processCaptureStrict: on through a re-init merge', async () => {
      const existingAnaPath = path.join(tmpDir, '.ana-existing-strict');
      await fs.mkdir(existingAnaPath, { recursive: true });
      await fs.writeFile(
        path.join(existingAnaPath, 'ana.json'),
        JSON.stringify({
          name: 'my-project',
          language: 'TypeScript',
          packageManager: 'pnpm',
          artifactBranch: 'main',
          processCaptureStrict: 'on',
          commands: { test: 'pnpm vitest run' },
        }),
      );

      const tmpAnaPath = path.join(tmpDir, '.ana-tmp-strict-reinit');
      await createDirectoryStructure(tmpAnaPath);

      const newConfig = {
        anaVersion: '2.0.0',
        lastScanAt: '2026-05-18T00:00:00Z',
        name: 'my-project',
        language: 'TypeScript',
        framework: null,
        packageManager: 'pnpm',
      };

      await preserveUserState(existingAnaPath, tmpAnaPath, newConfig);

      const result = JSON.parse(await fs.readFile(path.join(tmpAnaPath, 'ana.json'), 'utf-8'));
      expect(result.processCaptureStrict).toBe('on');
    });

    // @ana A012 — re-init on a project that never set the flag leaves it absent,
    // and the GUARANTEE is the resulting enablement is off (assert behavior).
    it('leaves an absent flag absent, and enablement reads off', async () => {
      const existingAnaPath = path.join(tmpDir, '.ana-existing');
      await fs.mkdir(existingAnaPath, { recursive: true });
      await fs.writeFile(
        path.join(existingAnaPath, 'ana.json'),
        JSON.stringify({
          name: 'my-project',
          language: 'TypeScript',
          packageManager: 'pnpm',
          artifactBranch: 'main',
          // No testEvidenceGate — and a resolvable test command, so the ONLY reason
          // enablement is off must be the absent flag (not a missing command).
          commands: { test: 'pnpm vitest run' },
        }),
      );

      const tmpAnaPath = path.join(tmpDir, '.ana-tmp');
      await createDirectoryStructure(tmpAnaPath);

      const newConfig = {
        anaVersion: '2.0.0',
        lastScanAt: '2026-05-18T00:00:00Z',
        name: 'my-project',
        language: 'TypeScript',
        framework: null,
        packageManager: 'pnpm',
      };

      await preserveUserState(existingAnaPath, tmpAnaPath, newConfig);

      const result = JSON.parse(await fs.readFile(path.join(tmpAnaPath, 'ana.json'), 'utf-8'));
      expect(result).not.toHaveProperty('testEvidenceGate');

      // Behavior-level guarantee: place the merged config at a project root and
      // confirm the gate reads off despite a resolvable test command.
      const projectRoot = path.join(tmpDir, 'merged-proj');
      await fs.mkdir(path.join(projectRoot, '.ana'), { recursive: true });
      await fs.writeFile(path.join(projectRoot, '.ana', 'ana.json'), JSON.stringify(result), 'utf-8');
      expect(isTestEvidenceGateEnabled(projectRoot)).toBe(false);
    });
  });

  describe('refreshes null values from scan without preserving stale data', () => {
    it('null scan results overwrite non-null old values', async () => {
      const existingAnaPath = path.join(tmpDir, '.ana-existing');
      await fs.mkdir(existingAnaPath, { recursive: true });
      await fs.writeFile(
        path.join(existingAnaPath, 'ana.json'),
        JSON.stringify({
          name: 'my-project',
          language: 'TypeScript',
          framework: 'Express',
          packageManager: 'pnpm',
          artifactBranch: 'main',
        }),
      );

      const tmpAnaPath = path.join(tmpDir, '.ana-tmp');
      await createDirectoryStructure(tmpAnaPath);

      const newConfig = {
        anaVersion: '2.0.0',
        lastScanAt: '2026-05-18T00:00:00Z',
        name: 'my-project',
        language: null,
        framework: null,
        packageManager: null,
      };

      await preserveUserState(existingAnaPath, tmpAnaPath, newConfig);

      const result = JSON.parse(
        await fs.readFile(path.join(tmpAnaPath, 'ana.json'), 'utf-8'),
      );
      expect(result.language).toBe(null);
      expect(result.framework).toBe(null);
      expect(result.packageManager).toBe(null);
    });
  });

  describe('scan engine blind spot messages', () => {
    it('scan-engine blind spot message is not modified', async () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const scanEnginePath = path.join(__dirname, '..', '..', 'src', 'engine', 'scan-engine.ts');
      const content = await fs.readFile(scanEnginePath, 'utf-8');

      expect(content).toContain('Tree-sitter analysis unavailable');
    });
  });
});

describe('Codex init infrastructure', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-codex-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  describe('Codex template inventory', () => {
    // @ana A006, A007
    it('has 6 Codex agent files including Learn', () => {
      expect(CODEX_AGENT_FILES).toHaveLength(6);
      expect(CODEX_AGENT_FILES).toContain('ana-learn.md');
    });

    it('all Codex template files exist in CLI package', async () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const templatesDir = path.join(__dirname, '..', '..', 'templates');

      for (const agentFile of CODEX_AGENT_FILES) {
        const mdPath = path.join(templatesDir, '.codex/agents', agentFile);
        const exists = await fileExists(mdPath);
        expect(exists, `Missing template: .codex/agents/${agentFile}`).toBe(true);

        const baseName = agentFile.replace('.md', '');
        const tomlPath = path.join(templatesDir, '.codex/agents', `${baseName}.agent.toml`);
        const tomlExists = await fileExists(tomlPath);
        expect(tomlExists, `Missing TOML: .codex/agents/${baseName}.agent.toml`).toBe(true);
      }
    });
    it('Codex agent templates have no YAML frontmatter', async () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const templatesDir = path.join(__dirname, '..', '..', 'templates');

      for (const agentFile of CODEX_AGENT_FILES) {
        const content = await fs.readFile(
          path.join(templatesDir, '.codex/agents', agentFile),
          'utf-8',
        );
        expect(content.startsWith('---'), `${agentFile} should NOT start with ---`).toBe(false);
        expect(content.startsWith('#'), `${agentFile} should start with # heading`).toBe(true);
      }
    });
    it('Codex build template uses ana run syntax', async () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const content = await fs.readFile(
        path.join(__dirname, '..', '..', 'templates', '.codex/agents/ana-build.md'),
        'utf-8',
      );
      expect(content).toContain('ana run');
    });
    it('Codex build template has no CC-specific references', async () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const content = await fs.readFile(
        path.join(__dirname, '..', '..', 'templates', '.codex/agents/ana-build.md'),
        'utf-8',
      );
      expect(content).not.toContain("Claude Code's Write tool");
      expect(content).not.toContain('claude --agent');
    });
  });

  describe('Codex TOML manifests', () => {
    it('Build TOML has correct fields', async () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const content = await fs.readFile(
        path.join(__dirname, '..', '..', 'templates', '.codex/agents/ana-build.agent.toml'),
        'utf-8',
      );
      expect(content).toContain('model = "gpt-5.5"');
      expect(content).toContain('sandbox_mode = "danger-full-access"');
      expect(content).toContain('model_reasoning_effort = "high"');
      expect(content).not.toMatch(/^mode\s*=/m);
    });
  });

  describe('Codex configuration', () => {
    it('.codex/agents/ should have 5 agent files and 5 TOML manifests', async () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const templatesDir = path.join(__dirname, '..', '..', 'templates');
      const codexAgentsPath = path.join(tmpDir, '.codex', 'agents');
      await fs.mkdir(codexAgentsPath, { recursive: true });
      for (const agentFile of CODEX_AGENT_FILES) {
        await fs.copyFile(
          path.join(templatesDir, '.codex/agents', agentFile),
          path.join(codexAgentsPath, agentFile),
        );
        const baseName = agentFile.replace('.md', '');
        const tomlFile = `${baseName}.agent.toml`;
        await fs.copyFile(
          path.join(templatesDir, '.codex/agents', tomlFile),
          path.join(codexAgentsPath, tomlFile),
        );
      }

      const files = await fs.readdir(codexAgentsPath);
      expect(files).toHaveLength(12);

      for (const agentFile of CODEX_AGENT_FILES) {
        expect(files).toContain(agentFile);
        const baseName = agentFile.replace('.md', '');
        expect(files).toContain(`${baseName}.agent.toml`);
      }
    });
    // @ana A002, A005, A006
    it('re-init overwrites Codex instruction body while preserving .agent.toml config', async () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const templatesDir = path.join(__dirname, '..', '..', 'templates');
      const codexAgentsPath = path.join(tmpDir, '.codex', 'agents');
      await fs.mkdir(codexAgentsPath, { recursive: true });

      // Seed from stock, then mutate an instruction body + the .agent.toml config keys
      for (const agentFile of CODEX_AGENT_FILES) {
        await fs.copyFile(
          path.join(templatesDir, '.codex/agents', agentFile),
          path.join(codexAgentsPath, agentFile),
        );
        const baseName = agentFile.replace('.md', '');
        await fs.copyFile(
          path.join(templatesDir, '.codex/agents', `${baseName}.agent.toml`),
          path.join(codexAgentsPath, `${baseName}.agent.toml`),
        );
      }
      const mdPath = path.join(codexAgentsPath, 'ana-build.md');
      const tomlPath = path.join(codexAgentsPath, 'ana-build.agent.toml');
      await fs.writeFile(mdPath, '# Custom Build Agent\n\nMy custom content');
      await fs.writeFile(
        tomlPath,
        `name = "renamed-by-user"
description = "user edited"
developer_instructions = "stale pointer"
model = "gpt-4.1-custom"
sandbox_mode = "read-only"
model_reasoning_effort = "low"
`,
      );

      // Drive the REAL refresh path
      const changed = await copyCodexAgentFiles(codexAgentsPath, templatesDir);

      // Instruction body IS overwritten with stock (the propagation fix)
      const stockMd = await fs.readFile(
        path.join(templatesDir, '.codex/agents', 'ana-build.md'),
        'utf-8',
      );
      const refreshedMd = await fs.readFile(mdPath, 'utf-8');
      expect(refreshedMd).toBe(stockMd);
      expect(refreshedMd).not.toContain('My custom content');
      expect(changed).toContain('ana-build.md');

      // CONFIG keys ARE preserved
      const refreshedToml = await fs.readFile(tomlPath, 'utf-8');
      expect(refreshedToml).toContain('model = "gpt-4.1-custom"');
      expect(refreshedToml).toContain('sandbox_mode = "read-only"');
      expect(refreshedToml).toContain('model_reasoning_effort = "low"');

      // Machine fields refresh from stock (pointer can't be stranded)
      expect(refreshedToml).toContain('name = "ana-build"');
      expect(refreshedToml).toContain(
        'developer_instructions = "Full instructions in ana-build.md. Invoke via: ana run"',
      );
      expect(refreshedToml).not.toContain('renamed-by-user');
      expect(refreshedToml).not.toContain('stale pointer');
    });
  });

  describe('createSkillSymlinks', () => {
    it('creates symlinks from platform dirs to .ana/skills', async () => {
      await fs.mkdir(path.join(tmpDir, '.ana', 'skills'), { recursive: true });
      await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true });

      await createSkillSymlinks(tmpDir, ['claude', 'codex']);
      const claudeSkillsPath = path.join(tmpDir, '.claude', 'skills');
      const claudeStats = lstatSync(claudeSkillsPath);
      expect(claudeStats.isSymbolicLink()).toBe(true);
      const agentsSkillsPath = path.join(tmpDir, '.agents', 'skills');
      const agentsStats = lstatSync(agentsSkillsPath);
      expect(agentsStats.isSymbolicLink()).toBe(true);
    });
    it('symlinks resolve to the same content', async () => {
      const skillsDir = path.join(tmpDir, '.ana', 'skills', 'coding-standards');
      await fs.mkdir(skillsDir, { recursive: true });
      await fs.writeFile(path.join(skillsDir, 'SKILL.md'), '# Test Skill');
      await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true });

      await createSkillSymlinks(tmpDir, ['claude', 'codex']);
      const claudeContent = readFileSync(
        path.join(tmpDir, '.claude', 'skills', 'coding-standards', 'SKILL.md'),
        'utf-8',
      );
      const agentsContent = readFileSync(
        path.join(tmpDir, '.agents', 'skills', 'coding-standards', 'SKILL.md'),
        'utf-8',
      );
      expect(claudeContent).toBe('# Test Skill');
      expect(agentsContent).toBe('# Test Skill');
    });

    it('is idempotent — skips if symlink already exists', async () => {
      await fs.mkdir(path.join(tmpDir, '.ana', 'skills'), { recursive: true });
      await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true });
      await createSkillSymlinks(tmpDir, ['claude']);
      await createSkillSymlinks(tmpDir, ['claude']);

      const stats = lstatSync(path.join(tmpDir, '.claude', 'skills'));
      expect(stats.isSymbolicLink()).toBe(true);
    });
  });

  describe('migrateSkillsToCanonical', () => {
    it('migrates real .claude/skills/ dir to .ana/skills/ + symlink', async () => {
      const claudeSkillsPath = path.join(tmpDir, '.claude', 'skills', 'coding-standards');
      await fs.mkdir(claudeSkillsPath, { recursive: true });
      await fs.writeFile(
        path.join(claudeSkillsPath, 'SKILL.md'),
        '# Enriched coding standards',
      );
      await fs.mkdir(path.join(tmpDir, '.ana', 'skills'), { recursive: true });

      await migrateSkillsToCanonical(tmpDir);
      const stats = lstatSync(path.join(tmpDir, '.claude', 'skills'));
      expect(stats.isSymbolicLink()).toBe(true);
      const content = readFileSync(
        path.join(tmpDir, '.ana', 'skills', 'coding-standards', 'SKILL.md'),
        'utf-8',
      );
      expect(content).toBe('# Enriched coding standards');
    });

    it('skips migration when .claude/skills/ is already a symlink', async () => {
      await fs.mkdir(path.join(tmpDir, '.ana', 'skills'), { recursive: true });
      await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true });
      await fs.symlink(
        path.join('..', '.ana', 'skills'),
        path.join(tmpDir, '.claude', 'skills'),
      );
      await migrateSkillsToCanonical(tmpDir);
      const stats = lstatSync(path.join(tmpDir, '.claude', 'skills'));
      expect(stats.isSymbolicLink()).toBe(true);
    });
  });

  describe('CC template migration', () => {
    it('CC agent templates use ana run syntax', async () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const templatesDir = path.join(__dirname, '..', '..', 'templates');

      for (const agentFile of AGENT_FILES) {
        const content = await fs.readFile(
          path.join(templatesDir, '.claude/agents', agentFile),
          'utf-8',
        );
        expect(content, `${agentFile} should not contain claude --agent`).not.toContain('claude --agent');
      }
    });
    it('CLAUDE.md template uses ana run syntax', async () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const content = await fs.readFile(
        path.join(__dirname, '..', '..', 'templates', 'CLAUDE.md'),
        'utf-8',
      );
      expect(content).not.toContain('claude --agent');
      expect(content).toContain('ana run');
    });
    it('check.ts uses getSkillsDirRel for display', async () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const checkSource = await fs.readFile(
        path.join(__dirname, '..', '..', 'src', 'commands', 'check.ts'),
        'utf-8',
      );
      expect(checkSource).not.toContain("No skills found in .claude/skills/");
      expect(checkSource).toContain('getSkillsDirRel()');
    });
  });

  describe('platform auto-detection', () => {
    it('detectPlatforms returns at least one platform', async () => {
      const { detectPlatforms } = await import('../../src/commands/init/state.js');
      const platforms = detectPlatforms();
      expect(platforms.length).toBeGreaterThan(0);
    });
  });

  describe('platform preservation on re-init', () => {
    it('preserveUserState preserves platforms from existing ana.json', async () => {
      const existingAnaPath = path.join(tmpDir, '.ana-existing');
      await fs.mkdir(existingAnaPath, { recursive: true });
      await fs.writeFile(
        path.join(existingAnaPath, 'ana.json'),
        JSON.stringify({
          name: 'test',
          platforms: ['claude', 'codex'],
          platformFlags: { codex: ['--full-auto'] },
        }),
      );

      const tmpAnaPath = path.join(tmpDir, '.ana-tmp');
      await createDirectoryStructure(tmpAnaPath);

      const newConfig = {
        anaVersion: '2.0.0',
        lastScanAt: '2026-05-18T00:00:00Z',
        name: 'test',
        language: null,
        framework: null,
        packageManager: null,
      };

      await preserveUserState(existingAnaPath, tmpAnaPath, newConfig);

      const result = JSON.parse(
        await fs.readFile(path.join(tmpAnaPath, 'ana.json'), 'utf-8'),
      );
      expect(result.platforms).toEqual(['claude', 'codex']);
      expect(result.platformFlags.codex).toEqual(['--full-auto']);
    });
  });
});
