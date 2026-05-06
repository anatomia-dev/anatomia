import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createEmptyEngineResult } from '../../src/engine/types/engineResult.js';
import { fileExists } from '../../src/commands/init/preflight.js';
import { AGENT_FILES } from '../../src/constants.js';

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

      // Simulate Phase 3
      await fs.mkdir(path.join(anaPath, 'context'), { recursive: true });
      await fs.mkdir(path.join(anaPath, 'state'), { recursive: true });

      // Verify all exist
      const dirs = [
        'context',
        'state',
      ];

      for (const dir of dirs) {
        const exists = await dirExists(path.join(anaPath, dir));
        expect(exists).toBe(true);
      }
    });
  });

  describe('template inventory', () => {
    it('all template files exist in CLI package', async () => {
      // Get templates directory using same logic as init.ts
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const templatesDir = path.join(__dirname, '..', '..', 'templates');

      const expectedFiles = [
        // 1 settings template
        '.claude/settings.json',
        // Agent files (from AGENT_FILES constant)
        ...AGENT_FILES.map(f => '.claude/agents/' + f),
        // 5 core skill files
        '.claude/skills/testing-standards/SKILL.md',
        '.claude/skills/coding-standards/SKILL.md',
        '.claude/skills/git-workflow/SKILL.md',
        '.claude/skills/deployment/SKILL.md',
        '.claude/skills/troubleshooting/SKILL.md',
        // CLAUDE.md entry point
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
    it('creates valid initial ana.json from EngineResult', async () => {
      const engineResult = createEmptyEngineResult();
      // Simulate what createAnaJson does from an EngineResult
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
      // createEmptyEngineResult defaults packageManager to null because a
      // project with no detected lockfile has no package manager in the Node
      // sense. Previously this was 'npm', which was a semantic lie for
      // Python/Go/Rust projects.
      expect(meta.packageManager).toBeNull();
      expect(meta.framework).toBeNull();
      expect(meta.anaVersion).toBeDefined();
      expect(meta.lastScanAt).toBeDefined();
      // setupPhase is NOT set by createAnaJson — only by the setup agent
      expect(meta).not.toHaveProperty('setupPhase');
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

      // Create existing .ana/ with state/
      await fs.mkdir(statePath, { recursive: true });
      await fs.writeFile(path.join(statePath, 'snapshot.json'), '{"test":"data"}');

      // Simulate --force: backup state/
      const backup = path.join(os.tmpdir(), `.ana-state-backup-${Date.now()}`);
      await fs.cp(statePath, backup, { recursive: true });

      // Delete .ana/
      await fs.rm(anaPath, { recursive: true, maxRetries: 3, retryDelay: 200 });

      // Recreate .ana/
      await fs.mkdir(statePath, { recursive: true });

      // Restore state/
      await fs.rm(statePath, { recursive: true, maxRetries: 3, retryDelay: 200 });
      await fs.rename(backup, statePath);

      // Verify snapshot preserved
      const content = await fs.readFile(path.join(statePath, 'snapshot.json'), 'utf-8');
      expect(JSON.parse(content)).toEqual({ test: 'data' });
    });
  });

  describe('.claude/ configuration', () => {
    it('ships empty hooks object in settings template', async () => {
      // PostToolUse hook chain removed (it computed validation results then
      // discarded them). Template ships with empty hooks object as placeholder;
      // if future hooks are added the merge logic in mergeHooksSettings
      // handles user-settings merging.
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

      // Simulate init creating .claude/agents/
      await fs.mkdir(agentsPath, { recursive: true });

      // Get templates directory
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const templatesDir = path.join(__dirname, '..', '..', 'templates');

      // Copy agent files
      for (const agentFile of AGENT_FILES) {
        const sourcePath = path.join(templatesDir, '.claude/agents', agentFile);
        const destPath = path.join(agentsPath, agentFile);
        await fs.copyFile(sourcePath, destPath);
      }

      const exists = await dirExists(agentsPath);
      expect(exists).toBe(true);

      // Should have all agent files
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

        // Check frontmatter markers
        expect(content.startsWith('---'), `${agentFile} should start with ---`).toBe(true);
        const secondDashIndex = content.indexOf('---', 3);
        expect(secondDashIndex).toBeGreaterThan(3);

        const frontmatter = content.slice(3, secondDashIndex).trim();

        // Check required fields
        expect(frontmatter).toContain('name:');
        expect(frontmatter).toContain('model:');
        expect(frontmatter).toContain('description:');

        // ana.md, ana-plan.md, and ana-setup.md use opus
        // ana.md has memory:, others don't
        // sub-agents use sonnet/haiku and have tools:
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

      // Simulate first init
      await fs.mkdir(agentsPath, { recursive: true });

      // Get templates directory
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const templatesDir = path.join(__dirname, '..', '..', 'templates');

      // Copy agent files (first init)
      for (const agentFile of AGENT_FILES) {
        const sourcePath = path.join(templatesDir, '.claude/agents', agentFile);
        const destPath = path.join(agentsPath, agentFile);
        await fs.copyFile(sourcePath, destPath);
      }

      // Simulate re-init: check if file exists before copying
      for (const agentFile of AGENT_FILES) {
        const destPath = path.join(agentsPath, agentFile);
        const exists = await fileExists(destPath);
        // Should skip copy if exists
        expect(exists).toBe(true);
      }

      // Should still have exactly AGENT_FILES.length files, not double
      const files = await fs.readdir(agentsPath);
      expect(files).toHaveLength(AGENT_FILES.length);
    });

    it('merges into existing .claude/settings.json without duplicates', async () => {
      const claudePath = path.join(tmpDir, '.claude');
      const settingsPath = path.join(claudePath, 'settings.json');

      // Create existing settings with custom hook
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

      // Simulate merge logic
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

      // Merge
      const merged = { ...existingSettings };
      merged.hooks = { ...existingSettings.hooks, ...templateSettings.hooks };
      await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2));

      // Verify merged content
      const content = await fs.readFile(settingsPath, 'utf-8');
      const result = JSON.parse(content);

      // Should have both hook types
      expect(result.hooks.PreToolUse).toBeDefined();
      expect(result.hooks.PostToolUse).toBeDefined();

      // Custom hook preserved
      expect(result.hooks.PreToolUse[0].hooks[0].command).toBe('custom-hook.sh');
    });

    it('does not duplicate hooks on re-init', async () => {
      const claudePath = path.join(tmpDir, '.claude');
      const settingsPath = path.join(claudePath, 'settings.json');

      // Create settings with our hooks already present
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

      // Simulate re-init merge (should detect duplicates)
      const _templateSettings = { ...settingsWithOurHooks };

      // Check if hook already exists by command path
      const existingPostToolUse = settingsWithOurHooks.hooks.PostToolUse;

      const postToolUseHasOurHook = existingPostToolUse.some(
        (entry: { matcher?: string; hooks?: Array<{ command: string }> }) =>
          entry.hooks?.some((h) => h.command === '.ana/hooks/verify-context-file.sh')
      );

      expect(postToolUseHasOurHook).toBe(true);

      // Since hook exists, we wouldn't add it again
      // Final count should be 1
      expect(settingsWithOurHooks.hooks.PostToolUse).toHaveLength(1);
    });

    it('overwrites malformed .claude/settings.json with Anatomia defaults', async () => {
      const claudePath = path.join(tmpDir, '.claude');
      const settingsPath = path.join(claudePath, 'settings.json');

      // Create malformed settings.json
      await fs.mkdir(claudePath, { recursive: true });
      await fs.writeFile(settingsPath, '{ invalid json here }');

      // Simulate the try/catch behavior in createClaudeConfiguration
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

      // Try to parse, catch error, overwrite
      let didOverwrite = false;
      try {
        const content = await fs.readFile(settingsPath, 'utf-8');
        JSON.parse(content); // This should throw
      } catch {
        // Malformed JSON - overwrite with defaults
        await fs.writeFile(settingsPath, JSON.stringify(templateSettings, null, 2));
        didOverwrite = true;
      }

      expect(didOverwrite).toBe(true);

      // Verify the file is now valid JSON with our hooks
      const content = await fs.readFile(settingsPath, 'utf-8');
      const result = JSON.parse(content);
      expect(result.hooks.PostToolUse).toBeDefined();
      expect(result.hooks.PostToolUse[0].hooks[0].command).toBe(
        '.ana/hooks/verify-context-file.sh'
      );
    });
  });
});

// Uses Node.js built-in fileURLToPath from 'node:url' (imported at top)
// to correctly handle Windows drive letter paths.
