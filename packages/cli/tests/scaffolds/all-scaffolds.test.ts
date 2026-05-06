import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  generateProjectContextScaffold,
  generateDesignPrinciplesTemplate,
} from '../../src/utils/scaffold-generators.js';
import { createEmptyEngineResult } from '../../src/engine/types/engineResult.js';
import { generatePrimaryPackageAgentsMd } from '../../src/commands/init/assets.js';

describe('scaffold generators (2 generators)', () => {
  const result = createEmptyEngineResult();

  describe('generateProjectContextScaffold', () => {
    it('produces scaffold with expected sections', () => {
      const output = generateProjectContextScaffold(result);
      expect(output).toContain('<!-- SCAFFOLD');
      expect(output).toContain('# Project Context');
      expect(output).toContain('## What This Project Does');
      expect(output).toContain('## Architecture');
      expect(output).toContain('## Key Decisions');
      expect(output).toContain('## Key Files');
      expect(output).toContain('## Active Constraints');
      expect(output).toContain('## Domain Vocabulary');
    });

    it('has 8 sections', () => {
      const output = generateProjectContextScaffold(result);
      const sections = (output.match(/^## /gm) || []).length;
      expect(sections).toBe(8);
      expect(output).toContain('## Where to Make Changes');
      expect(output).toContain('## What Looks Wrong But Is Intentional');
    });

    it('includes synthesized description when stack data present', () => {
      const richResult = {
        ...result,
        stack: { ...result.stack, language: 'TypeScript', framework: 'Next.js', database: 'PostgreSQL' },
        projectProfile: { ...result.projectProfile, hasBrowserUI: true },
        externalServices: [{ name: 'Stripe', category: 'Payments', source: 'dependency', configFound: false, stackRoles: [] }],
        commands: { ...result.commands, build: 'pnpm build', test: 'vitest' },
      };

      const output = generateProjectContextScaffold(richResult);
      expect(output).toContain('**Detected:** Next.js web application');
      expect(output).toContain('database (PostgreSQL)');
      expect(output).toContain('source files');
      // Services and commands are in AGENTS.md now, not project-context
      expect(output).not.toContain('**Detected services:**');
      expect(output).not.toContain('**Detected commands:**');
    });

    it('omits Detected lines when data is null', () => {
      const output = generateProjectContextScaffold(result);
      // Empty result should have no Detected lines for stack (all null)
      expect(output).not.toMatch(/\*\*Detected:\*\* null/);
    });

    it('includes monorepo info when detected', () => {
      const monoResult = {
        ...result,
        monorepo: { isMonorepo: true, tool: 'pnpm', packages: [{ name: 'api', path: 'packages/api' }, { name: 'web', path: 'packages/web' }], primaryPackage: { name: 'api', path: 'packages/api' } },
      };

      const output = generateProjectContextScaffold(monoResult);
      expect(output).toContain('pnpm monorepo');
      expect(output).toContain('pnpm · 2 packages');
    });

    // @ana A005
    describe('scaffold includes README description', () => {
      it('includes README description in What This Project Does', () => {
        const readmeResult = {
          ...result,
          readme: {
            description: 'readme description content',
            architecture: null,
            setup: null,
            source: 'heading' as const,
          },
        };
        const output = generateProjectContextScaffold(readmeResult);
        expect(output).toContain('readme description content');
        // Should appear in the What This Project Does section
        const whatSection = output.split('## Architecture')[0]!;
        expect(whatSection).toContain('readme description content');
      });
    });

    // @ana A006
    describe('scaffold includes README architecture', () => {
      it('includes README architecture in Architecture section', () => {
        const readmeResult = {
          ...result,
          readme: {
            description: null,
            architecture: 'readme architecture content',
            setup: null,
            source: 'heading' as const,
          },
        };
        const output = generateProjectContextScaffold(readmeResult);
        expect(output).toContain('readme architecture content');
        // Should appear in the Architecture section
        const archSection = output.split('## Architecture')[1]!.split('## Key Decisions')[0]!;
        expect(archSection).toContain('readme architecture content');
      });
    });

    // @ana A007
    describe('scaffold excludes README setup from Architecture', () => {
      it('does NOT include README setup instructions in Architecture section', () => {
        const readmeResult = {
          ...result,
          readme: {
            description: null,
            architecture: null,
            setup: 'npm install && npm run dev',
            source: 'heading' as const,
          },
        };
        const output = generateProjectContextScaffold(readmeResult);
        // Setup instructions don't belong in project-context Architecture
        expect(output).not.toContain('npm install && npm run dev');
      });
    });

    it('scaffold without readme has no readme content', () => {
      const output = generateProjectContextScaffold(result);
      // result.readme is null — should not error
      expect(output).toContain('## What This Project Does');
      expect(output).toContain('## Architecture');
    });
  });

  describe('generateDesignPrinciplesTemplate', () => {
    it('returns static template with 3 default principles', () => {
      const output = generateDesignPrinciplesTemplate();
      expect(output).toContain('# Design Principles');
      expect(output).toContain('## Name the disease, not the symptom');
      expect(output).toContain('## Surface tradeoffs before committing');
      expect(output).toContain('## Every change should be foundation, not scaffolding');
      expect(output).not.toContain('**Detected:**');
    });

    it('is pure placeholder content', () => {
      const output = generateDesignPrinciplesTemplate();
      // Should be entirely HTML comments (placeholder) plus the heading
      expect(output).toContain('<!--');
      expect(output).toContain('-->');
    });
  });
});

describe('generatePrimaryPackageAgentsMd', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-test-'));
    // Create package.json for project name detection
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-workspace' }), 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A001
  it('creates AGENTS.md in primary package directory', async () => {
    const base = createEmptyEngineResult();
    const result = {
      ...base,
      monorepo: {
        isMonorepo: true,
        tool: 'pnpm',
        packages: [{ name: 'anatomia-cli', path: 'packages/cli' }],
        primaryPackage: { name: 'anatomia-cli', path: 'packages/cli' },
      },
      commands: { ...base.commands, build: 'pnpm run build', test: 'vitest', lint: 'pnpm run lint' },
    };

    // Create the package directory
    await fs.mkdir(path.join(tmpDir, 'packages/cli'), { recursive: true });

    const content = await generatePrimaryPackageAgentsMd(tmpDir, result);

    expect(content).not.toBeNull();
    const filePath = path.join(tmpDir, 'packages/cli', 'AGENTS.md');
    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  // @ana A002
  it('includes package name heading', async () => {
    const result = {
      ...createEmptyEngineResult(),
      monorepo: {
        isMonorepo: true,
        tool: 'pnpm',
        packages: [{ name: 'anatomia-cli', path: 'packages/cli' }],
        primaryPackage: { name: 'anatomia-cli', path: 'packages/cli' },
      },
    };

    await fs.mkdir(path.join(tmpDir, 'packages/cli'), { recursive: true });

    const content = await generatePrimaryPackageAgentsMd(tmpDir, result);

    expect(content).toContain('# anatomia-cli');
  });

  // @ana A003
  it('identifies as primary package', async () => {
    const result = {
      ...createEmptyEngineResult(),
      monorepo: {
        isMonorepo: true,
        tool: 'pnpm',
        packages: [{ name: 'anatomia-cli', path: 'packages/cli' }],
        primaryPackage: { name: 'anatomia-cli', path: 'packages/cli' },
      },
    };

    await fs.mkdir(path.join(tmpDir, 'packages/cli'), { recursive: true });

    const content = await generatePrimaryPackageAgentsMd(tmpDir, result);

    expect(content).toContain('Primary package in');
  });

  // @ana A004
  it('includes commands section with available commands', async () => {
    const base = createEmptyEngineResult();
    const result = {
      ...base,
      monorepo: {
        isMonorepo: true,
        tool: 'pnpm',
        packages: [{ name: 'anatomia-cli', path: 'packages/cli' }],
        primaryPackage: { name: 'anatomia-cli', path: 'packages/cli' },
      },
      commands: { ...base.commands, build: 'pnpm run build', test: 'vitest', lint: 'pnpm run lint' },
    };

    await fs.mkdir(path.join(tmpDir, 'packages/cli'), { recursive: true });

    const content = await generatePrimaryPackageAgentsMd(tmpDir, result);

    expect(content).toContain('## Commands');
    expect(content).toContain('Build:');
    expect(content).toContain('Lint:');
  });

  // @ana A005
  it('includes non-interactive test command', async () => {
    const base = createEmptyEngineResult();
    const result = {
      ...base,
      monorepo: {
        isMonorepo: true,
        tool: 'pnpm',
        packages: [{ name: 'anatomia-cli', path: 'packages/cli' }],
        primaryPackage: { name: 'anatomia-cli', path: 'packages/cli' },
      },
      stack: { ...base.stack, testing: ['Vitest'] },
      commands: { ...base.commands, test: 'vitest' },
    };

    await fs.mkdir(path.join(tmpDir, 'packages/cli'), { recursive: true });

    const content = await generatePrimaryPackageAgentsMd(tmpDir, result);

    expect(content).toContain('Test:');
    // Vitest should have --run added for non-interactive
    expect(content).toContain('--run');
  });

  // @ana A006
  it('includes pointer to root AGENTS.md', async () => {
    const result = {
      ...createEmptyEngineResult(),
      monorepo: {
        isMonorepo: true,
        tool: 'pnpm',
        packages: [{ name: 'anatomia-cli', path: 'packages/cli' }],
        primaryPackage: { name: 'anatomia-cli', path: 'packages/cli' },
      },
    };

    await fs.mkdir(path.join(tmpDir, 'packages/cli'), { recursive: true });

    const content = await generatePrimaryPackageAgentsMd(tmpDir, result);

    expect(content).toContain('AGENTS.md');
    expect(content).toContain('Full Project Context');
  });

  // @ana A007
  it('relative path is correct for two-level nesting', async () => {
    const result = {
      ...createEmptyEngineResult(),
      monorepo: {
        isMonorepo: true,
        tool: 'pnpm',
        packages: [{ name: 'anatomia-cli', path: 'packages/cli' }],
        primaryPackage: { name: 'anatomia-cli', path: 'packages/cli' },
      },
    };

    await fs.mkdir(path.join(tmpDir, 'packages/cli'), { recursive: true });

    const content = await generatePrimaryPackageAgentsMd(tmpDir, result);

    expect(content).toContain('../../AGENTS.md');
  });

  // @ana A008
  it('relative path is correct for single-level nesting', async () => {
    const result = {
      ...createEmptyEngineResult(),
      monorepo: {
        isMonorepo: true,
        tool: 'pnpm',
        packages: [{ name: 'cli-pkg', path: 'cli' }],
        primaryPackage: { name: 'cli-pkg', path: 'cli' },
      },
    };

    await fs.mkdir(path.join(tmpDir, 'cli'), { recursive: true });

    const content = await generatePrimaryPackageAgentsMd(tmpDir, result);

    expect(content).toContain('../AGENTS.md');
  });

  // @ana A009
  it('does not overwrite existing file', async () => {
    const base = createEmptyEngineResult();
    const result = {
      ...base,
      monorepo: {
        isMonorepo: true,
        tool: 'pnpm',
        packages: [{ name: 'anatomia-cli', path: 'packages/cli' }],
        primaryPackage: { name: 'anatomia-cli', path: 'packages/cli' },
      },
      commands: { ...base.commands, build: 'pnpm run build', test: 'vitest' },
    };

    await fs.mkdir(path.join(tmpDir, 'packages/cli'), { recursive: true });
    const existingPath = path.join(tmpDir, 'packages/cli', 'AGENTS.md');
    await fs.writeFile(existingPath, 'existing content', 'utf-8');

    const content = await generatePrimaryPackageAgentsMd(tmpDir, result);

    expect(content).toBeNull();
    const fileContent = await fs.readFile(existingPath, 'utf-8');
    expect(fileContent).toBe('existing content');
  });

  // @ana A010
  it('skips non-monorepo projects', async () => {
    const base = createEmptyEngineResult();
    const result = {
      ...base,
      monorepo: {
        isMonorepo: false,
        tool: null,
        packages: [],
        primaryPackage: null,
      },
      commands: { ...base.commands, build: 'pnpm run build', test: 'vitest' },
    };

    const content = await generatePrimaryPackageAgentsMd(tmpDir, result);

    expect(content).toBeNull();
  });

  // @ana A011
  it('skips when primaryPackage is null', async () => {
    const base = createEmptyEngineResult();
    const result = {
      ...base,
      monorepo: {
        isMonorepo: true,
        tool: 'pnpm',
        packages: [{ name: 'pkg-a', path: 'packages/a' }, { name: 'pkg-b', path: 'packages/b' }],
        primaryPackage: null,
      },
      commands: { ...base.commands, build: 'pnpm run build', test: 'vitest' },
    };

    const content = await generatePrimaryPackageAgentsMd(tmpDir, result);

    expect(content).toBeNull();
  });

  // @ana A012
  it('omits commands section when no commands detected', async () => {
    const result = {
      ...createEmptyEngineResult(),
      monorepo: {
        isMonorepo: true,
        tool: 'pnpm',
        packages: [{ name: 'anatomia-cli', path: 'packages/cli' }],
        primaryPackage: { name: 'anatomia-cli', path: 'packages/cli' },
      },
    };

    await fs.mkdir(path.join(tmpDir, 'packages/cli'), { recursive: true });

    const content = await generatePrimaryPackageAgentsMd(tmpDir, result);

    expect(content).not.toContain('## Commands');
  });

  // @ana A013
  it('handles null engineResult', async () => {
    const content = await generatePrimaryPackageAgentsMd(tmpDir, null);

    expect(content).toBeNull();
  });
});
