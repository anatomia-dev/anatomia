import { describe, it, expect } from 'vitest';
import type { ProjectCensus, SourceRoot } from '../../../src/engine/types/census.js';

describe('ProjectCensus type shape', () => {
  /** cal.com-shaped monorepo fixture: 3 source roots, framework hints, configs */
  function makeMonorepoCensus(): ProjectCensus {
    const webRoot: SourceRoot = {
      absolutePath: '/tmp/cal.com/apps/web',
      relativePath: 'apps/web',
      packageName: '@calcom/web',
      fileCount: 1200,
      isPrimary: true,
      deps: { next: '14.0.0', react: '18.2.0' },
      devDeps: { typescript: '5.3.0' },
      hasBin: false,
      hasMain: false,
      hasExports: false,
      scripts: [],
    };
    const apiRoot: SourceRoot = {
      absolutePath: '/tmp/cal.com/apps/api',
      relativePath: 'apps/api',
      packageName: '@calcom/api',
      fileCount: 300,
      isPrimary: false,
      deps: { express: '4.18.0' },
      devDeps: { vitest: '1.0.0' },
      hasBin: false,
      hasMain: false,
      hasExports: false,
      scripts: [],
    };
    const uiRoot: SourceRoot = {
      absolutePath: '/tmp/cal.com/packages/ui',
      relativePath: 'packages/ui',
      packageName: '@calcom/ui',
      fileCount: 200,
      isPrimary: false,
      deps: { react: '18.2.0' },
      devDeps: {},
      hasBin: false,
      hasMain: false,
      hasExports: false,
      scripts: [],
    };

    return {
      rootPath: '/tmp/cal.com',
      projectName: 'cal.com',
      layout: 'monorepo',
      monorepoTool: 'pnpm',
      sourceRoots: [webRoot, apiRoot, uiRoot],
      primarySourceRoot: 'apps/web',
      allDeps: { next: '14.0.0', react: '18.2.0', express: '4.18.0', typescript: '5.3.0', vitest: '1.0.0' },
      deps: { next: '14.0.0', react: '18.2.0', express: '4.18.0' },
      devDeps: { typescript: '5.3.0', vitest: '1.0.0' },
      rootDevDeps: { '@playwright/test': '1.40.0', typescript: '5.3.0' },
      rootDeps: {},
      primaryDeps: { next: '14.0.0', react: '18.2.0', typescript: '5.3.0', vitest: '1.0.0' },
      configs: {
        frameworkHints: [
          { framework: 'nextjs', sourceRootPath: 'apps/web', path: 'apps/web/next.config.ts' },
          { framework: 'nextjs-app-dir', sourceRootPath: 'apps/web', path: 'apps/web/app' },
          { framework: 'react', sourceRootPath: 'apps/web', path: 'apps/web/package.json' },
          { framework: 'express', sourceRootPath: 'apps/api', path: 'apps/api/src/main.ts' },
          { framework: 'react', sourceRootPath: 'packages/ui', path: 'packages/ui/package.json' },
        ],
        tsconfigs: [
          { sourceRootPath: 'apps/web', path: 'apps/web/tsconfig.json', paths: { '@/*': ['./src/*'] }, baseUrl: '.' },
          { sourceRootPath: 'apps/api', path: 'apps/api/tsconfig.json', paths: null, baseUrl: null },
        ],
        schemas: [
          { orm: 'prisma', sourceRootPath: 'apps/web', path: 'apps/web/prisma/schema.prisma' },
        ],
        deployments: [
          { platform: 'Vercel', sourceRootPath: 'apps/web', path: 'apps/web/vercel.json' },
        ],
        ciWorkflows: [
          { system: 'GitHub Actions', workflowFiles: ['ci.yml', 'release.yml'] },
        ],
      },
      builtAt: '2026-04-11T12:00:00.000Z',
      buildDurationMs: 42,
    };
  }

  it('constructs from monorepo fixture (cal.com-shaped)', () => {
    const census = makeMonorepoCensus();

    expect(census.layout).toBe('monorepo');
    expect(census.monorepoTool).toBe('pnpm');
    expect(census.sourceRoots).toHaveLength(3);
    expect(census.configs.frameworkHints).toHaveLength(5);
    expect(census.configs.tsconfigs).toHaveLength(2);
    expect(census.configs.schemas).toHaveLength(1);
    expect(census.configs.deployments).toHaveLength(1);
    expect(census.configs.ciWorkflows).toHaveLength(1);
    expect(census.configs.ciWorkflows[0]!.workflowFiles).toHaveLength(2);
  });

  it('constructs from single-repo fixture', () => {
    const root: SourceRoot = {
      absolutePath: '/tmp/my-app',
      relativePath: '.',
      packageName: 'my-app',
      fileCount: 50,
      isPrimary: true,
      deps: { next: '14.0.0' },
      devDeps: { vitest: '1.0.0' },
      hasBin: false,
      hasMain: false,
      hasExports: false,
      scripts: [],
    };

    const census: ProjectCensus = {
      rootPath: '/tmp/my-app',
      projectName: 'my-app',
      layout: 'single-repo',
      monorepoTool: null,
      sourceRoots: [root],
      primarySourceRoot: '.',
      allDeps: { next: '14.0.0', vitest: '1.0.0' },
      deps: { next: '14.0.0' },
      devDeps: { vitest: '1.0.0' },
      rootDevDeps: { vitest: '1.0.0' },
      rootDeps: {},
      primaryDeps: { next: '14.0.0', vitest: '1.0.0' },
      configs: {
        frameworkHints: [{ framework: 'nextjs', sourceRootPath: '.', path: 'next.config.ts' }],
        tsconfigs: [{ sourceRootPath: '.', path: 'tsconfig.json', paths: null, baseUrl: null }],
        schemas: [],
        deployments: [],
        ciWorkflows: [],
      },
      builtAt: '2026-04-11T12:00:00.000Z',
      buildDurationMs: 5,
    };

    expect(census.layout).toBe('single-repo');
    expect(census.sourceRoots).toHaveLength(1);
    expect(census.sourceRoots[0]!.isPrimary).toBe(true);
    expect(census.primarySourceRoot).toBe(census.sourceRoots[0]!.relativePath);
  });

  it('JSON roundtrips without loss', () => {
    const census = makeMonorepoCensus();
    const roundtripped = JSON.parse(JSON.stringify(census)) as ProjectCensus;

    expect(roundtripped).toEqual(census);
  });

  it('primarySourceRoot matches the isPrimary source root', () => {
    const census = makeMonorepoCensus();
    const primary = census.sourceRoots.find(r => r.isPrimary);

    expect(primary).toBeDefined();
    expect(primary!.relativePath).toBe(census.primarySourceRoot);

    const primaries = census.sourceRoots.filter(r => r.isPrimary);
    expect(primaries).toHaveLength(1);
  });
});
