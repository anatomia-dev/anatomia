import { describe, it, expect } from 'vitest';
import { detectApplicationShape } from '../../../src/engine/detectors/applicationShape.js';
import type { ApplicationShapeInput } from '../../../src/engine/detectors/applicationShape.js';
import type { SourceRoot } from '../../../src/engine/types/census.js';

/** Minimal input with all signals off. */
function makeInput(overrides: Partial<ApplicationShapeInput> = {}): ApplicationShapeInput {
  return {
    hasBin: false,
    hasMain: false,
    hasExports: false,
    frameworkName: null,
    projectType: 'node',
    deps: [],
    ...overrides,
  };
}

describe('detectApplicationShape', () => {
  // @ana NEW — new shapes
  describe('detects new application shapes', () => {
    it('detects mcp-server from @modelcontextprotocol/sdk', () => {
      const result = detectApplicationShape(makeInput({ deps: ['@modelcontextprotocol/sdk'] }));
      expect(result.shape).toBe('mcp-server');
    });

    it('detects ai-agent from langchain', () => {
      const result = detectApplicationShape(makeInput({ deps: ['langchain'] }));
      expect(result.shape).toBe('ai-agent');
    });

    it('detects ai-agent from claude-agent-sdk', () => {
      const result = detectApplicationShape(makeInput({ deps: ['@anthropic-ai/claude-agent-sdk'] }));
      expect(result.shape).toBe('ai-agent');
    });

    it('does NOT detect ai-agent from bare AI SDK', () => {
      const result = detectApplicationShape(makeInput({ deps: ['@anthropic-ai/sdk'], frameworkName: 'express' }));
      expect(result.shape).toBe('api-server');
    });

    it('detects mobile-app from react-native', () => {
      const result = detectApplicationShape(makeInput({ deps: ['react-native'] }));
      expect(result.shape).toBe('mobile-app');
    });

    it('detects mobile-app from expo', () => {
      const result = detectApplicationShape(makeInput({ deps: ['expo'] }));
      expect(result.shape).toBe('mobile-app');
    });

    it('detects worker from inngest without web framework', () => {
      const result = detectApplicationShape(makeInput({ deps: ['inngest'], frameworkName: null }));
      expect(result.shape).toBe('worker');
    });

    it('does NOT detect worker when web framework present', () => {
      const result = detectApplicationShape(makeInput({ deps: ['inngest', 'express'], frameworkName: 'express' }));
      expect(result.shape).not.toBe('worker');
    });
  });

  describe('priority: most specific shape wins', () => {
    it('mcp-server yields to web-app when browser framework present', () => {
      // A Next.js app with @modelcontextprotocol/sdk is a web-app with an MCP feature
      const result = detectApplicationShape(makeInput({
        deps: ['@modelcontextprotocol/sdk', 'next', 'react'],
        frameworkName: 'nextjs',
      }));
      expect(result.shape).toBe('web-app');
    });

    it('mcp-server still wins when no browser framework (pure MCP server)', () => {
      const result = detectApplicationShape(makeInput({
        deps: ['@modelcontextprotocol/sdk', 'express'],
        frameworkName: 'express',
      }));
      expect(result.shape).toBe('mcp-server');
    });

    it('ai-agent wins over api-server', () => {
      const result = detectApplicationShape(makeInput({
        deps: ['langchain', 'express'],
        frameworkName: 'express',
      }));
      expect(result.shape).toBe('ai-agent');
    });

    it('mobile-app wins over library', () => {
      const result = detectApplicationShape(makeInput({
        deps: ['react-native'],
        hasMain: true,
        hasExports: true,
      }));
      expect(result.shape).toBe('mobile-app');
    });

    it('mcp-server wins over ai-agent', () => {
      const result = detectApplicationShape(makeInput({
        deps: ['@modelcontextprotocol/sdk', 'langchain'],
      }));
      expect(result.shape).toBe('mcp-server');
    });
  });


  // @ana A005
  describe('classifies project with bin field as cli', () => {
    it('returns cli when hasBin is true', () => {
      const result = detectApplicationShape(makeInput({ hasBin: true }));
      expect(result.shape).toBe('cli');
    });

    it('returns cli when hasBin is true even with CLI deps', () => {
      const result = detectApplicationShape(makeInput({ hasBin: true, deps: ['commander'] }));
      expect(result.shape).toBe('cli');
    });
  });

  // @ana A006
  describe('classifies project with CLI dependency as cli', () => {
    it('returns cli for commander', () => {
      const result = detectApplicationShape(makeInput({ deps: ['commander'] }));
      expect(result.shape).toBe('cli');
    });

    it('returns cli for yargs', () => {
      const result = detectApplicationShape(makeInput({ deps: ['yargs'] }));
      expect(result.shape).toBe('cli');
    });

    it('returns cli for meow', () => {
      const result = detectApplicationShape(makeInput({ deps: ['meow'] }));
      expect(result.shape).toBe('cli');
    });

    it('returns cli for cac', () => {
      const result = detectApplicationShape(makeInput({ deps: ['cac'] }));
      expect(result.shape).toBe('cli');
    });
  });

  // @ana A007
  describe('classifies project with browser framework as web-app', () => {
    it('returns web-app for nextjs', () => {
      const result = detectApplicationShape(makeInput({ frameworkName: 'nextjs', deps: ['next', 'react'] }));
      expect(result.shape).toBe('web-app');
    });

    it('returns web-app for react', () => {
      const result = detectApplicationShape(makeInput({ frameworkName: 'react', deps: ['react'] }));
      expect(result.shape).toBe('web-app');
    });

    it('returns web-app for vue', () => {
      const result = detectApplicationShape(makeInput({ frameworkName: 'vue', deps: ['vue'] }));
      expect(result.shape).toBe('web-app');
    });

    it('returns web-app for svelte', () => {
      const result = detectApplicationShape(makeInput({ frameworkName: 'svelte', deps: ['svelte'] }));
      expect(result.shape).toBe('web-app');
    });
  });

  // @ana A008
  describe('classifies project with server framework as api-server', () => {
    it('returns api-server for express without browser deps', () => {
      const result = detectApplicationShape(makeInput({ frameworkName: 'express', deps: ['express'] }));
      expect(result.shape).toBe('api-server');
    });

    it('returns api-server for fastify without browser deps', () => {
      const result = detectApplicationShape(makeInput({ frameworkName: 'fastify', deps: ['fastify'] }));
      expect(result.shape).toBe('api-server');
    });

    it('returns api-server for hono without browser deps', () => {
      const result = detectApplicationShape(makeInput({ frameworkName: 'hono', deps: ['hono'] }));
      expect(result.shape).toBe('api-server');
    });

    it('returns api-server for koa without browser deps (was broken: display name mismatch)', () => {
      const result = detectApplicationShape(makeInput({ frameworkName: 'koa', deps: ['koa'] }));
      expect(result.shape).toBe('api-server');
    });
  });

  describe('classifies react-router as web-app (was broken: missing from set)', () => {
    it('returns web-app for react-router', () => {
      const result = detectApplicationShape(makeInput({ frameworkName: 'react-router', deps: ['react-router', 'react'] }));
      expect(result.shape).toBe('web-app');
    });
  });

  // @ana A009
  describe('classifies project with server and browser framework as full-stack', () => {
    it('returns full-stack for express + react', () => {
      const result = detectApplicationShape(makeInput({ frameworkName: 'express', deps: ['express', 'react'] }));
      expect(result.shape).toBe('full-stack');
    });

    it('returns full-stack for fastify + vue', () => {
      const result = detectApplicationShape(makeInput({ frameworkName: 'fastify', deps: ['fastify', 'vue'] }));
      expect(result.shape).toBe('full-stack');
    });

    it('returns full-stack for nestjs + next', () => {
      const result = detectApplicationShape(makeInput({ frameworkName: 'nestjs', deps: ['@nestjs/core', 'next'] }));
      expect(result.shape).toBe('full-stack');
    });
  });

  // @ana A010
  describe('classifies project with main/exports as library', () => {
    it('returns library when hasMain is true', () => {
      const result = detectApplicationShape(makeInput({ hasMain: true }));
      expect(result.shape).toBe('library');
    });

    it('returns library when hasExports is true', () => {
      const result = detectApplicationShape(makeInput({ hasExports: true }));
      expect(result.shape).toBe('library');
    });

    it('returns library when both hasMain and hasExports', () => {
      const result = detectApplicationShape(makeInput({ hasMain: true, hasExports: true }));
      expect(result.shape).toBe('library');
    });
  });

  // @ana A011
  describe('classifies project with no signals as unknown', () => {
    it('returns unknown for Node project with no signals', () => {
      const result = detectApplicationShape(makeInput());
      expect(result.shape).toBe('unknown');
    });
  });

  // @ana A012
  describe('returns unknown for non-node project type', () => {
    it('returns unknown for python', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'python', hasBin: true }));
      expect(result.shape).toBe('unknown');
    });

    it('returns unknown for go', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'go', deps: ['commander'] }));
      expect(result.shape).toBe('unknown');
    });

    it('returns unknown for rust', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'rust' }));
      expect(result.shape).toBe('unknown');
    });
  });

  // @ana A013
  describe('bin wins over main/exports', () => {
    it('returns cli when hasBin and hasMain are both true', () => {
      const result = detectApplicationShape(makeInput({ hasBin: true, hasMain: true }));
      expect(result.shape).toBe('cli');
    });

    it('returns cli when hasBin and hasExports are both true', () => {
      const result = detectApplicationShape(makeInput({ hasBin: true, hasExports: true }));
      expect(result.shape).toBe('cli');
    });
  });

  // @ana A014
  describe('CLI dep wins over main/exports', () => {
    it('returns cli when commander dep and hasMain', () => {
      const result = detectApplicationShape(makeInput({ deps: ['commander'], hasMain: true }));
      expect(result.shape).toBe('cli');
    });

    it('returns cli when yargs dep and hasExports', () => {
      const result = detectApplicationShape(makeInput({ deps: ['yargs'], hasExports: true }));
      expect(result.shape).toBe('cli');
    });
  });

  // @ana A003
  describe('detector is a pure function', () => {
    it('does not import node:fs', async () => {
      const detectorSource = await import('node:fs/promises').then(fs =>
        fs.readFile(new URL('../../../src/engine/detectors/applicationShape.ts', import.meta.url), 'utf-8')
      );
      expect(detectorSource).not.toContain('node:fs');
    });
  });

  // @ana A002
  describe('classifies project with bin field as cli (Anatomia shape)', () => {
    it('classifies Anatomia-like project (bin + commander) as cli', () => {
      const result = detectApplicationShape(makeInput({
        hasBin: true,
        hasMain: false,
        hasExports: true,
        frameworkName: null,
        projectType: 'node',
        deps: ['commander', 'chalk', 'ora'],
      }));
      expect(result.shape).toBe('cli');
    });
  });

  // @ana A001
  describe('applicationShape field exists on EngineResult', () => {
    it('createEmptyEngineResult includes applicationShape', async () => {
      const { createEmptyEngineResult } = await import('../../../src/engine/types/engineResult.js');
      const result = createEmptyEngineResult();
      expect(result).toHaveProperty('applicationShape');
    });
  });

  // @ana A004
  describe('createEmptyEngineResult includes applicationShape', () => {
    it('defaults to unknown', async () => {
      const { createEmptyEngineResult } = await import('../../../src/engine/types/engineResult.js');
      const result = createEmptyEngineResult();
      expect(result.applicationShape).toBe('unknown');
    });
  });

  // @ana A016
  describe('SourceRoot includes hasBin field', () => {
    it('hasBin is a declared boolean property on SourceRoot', () => {
      // Construct a type-safe SourceRoot — TypeScript enforces hasBin is required.
      // If hasBin were removed from the interface, this would fail to compile.
      const root: SourceRoot = {
        absolutePath: '/tmp/test',
        relativePath: '.',
        packageName: 'test',
        fileCount: 1,
        isPrimary: true,
        deps: {},
        devDeps: {},
        hasBin: true,
        scripts: [],
      };

      // Runtime assertion that hasBin exists and is boolean
      expect(root).toHaveProperty('hasBin');
      expect(typeof root.hasBin).toBe('boolean');
      expect(root.hasBin).toBe(true);
    });
  });

  // @ana A001, A002, A003, A004, A005, A006, A007
  describe('non-Node shape mapping', () => {
    it('maps fastapi to api-server shape', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'python', frameworkName: 'fastapi' }));
      expect(result.shape).toBe('api-server');
    });

    it('maps django to full-stack shape', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'python', frameworkName: 'django' }));
      expect(result.shape).toBe('full-stack');
    });

    it('maps django-drf to api-server shape', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'python', frameworkName: 'django-drf' }));
      expect(result.shape).toBe('api-server');
    });

    it('maps flask to api-server shape', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'python', frameworkName: 'flask' }));
      expect(result.shape).toBe('api-server');
    });

    it('maps typer to cli shape', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'python', frameworkName: 'typer' }));
      expect(result.shape).toBe('cli');
    });

    it('maps click to cli shape', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'python', frameworkName: 'click' }));
      expect(result.shape).toBe('cli');
    });

    it('maps gin to api-server shape', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'go', frameworkName: 'gin' }));
      expect(result.shape).toBe('api-server');
    });

    it('maps echo to api-server shape', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'go', frameworkName: 'echo' }));
      expect(result.shape).toBe('api-server');
    });

    it('maps chi to api-server shape', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'go', frameworkName: 'chi' }));
      expect(result.shape).toBe('api-server');
    });

    it('maps cobra-cli to cli shape', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'go', frameworkName: 'cobra-cli' }));
      expect(result.shape).toBe('cli');
    });

    it('maps fiber to api-server shape', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'go', frameworkName: 'fiber' }));
      expect(result.shape).toBe('api-server');
    });

    it('maps axum to api-server shape', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'rust', frameworkName: 'axum' }));
      expect(result.shape).toBe('api-server');
    });

    it('maps actix-web to api-server shape', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'rust', frameworkName: 'actix-web' }));
      expect(result.shape).toBe('api-server');
    });

    it('maps rocket to api-server shape', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'rust', frameworkName: 'rocket' }));
      expect(result.shape).toBe('api-server');
    });

    it('maps clap-cli to cli shape', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'rust', frameworkName: 'clap-cli' }));
      expect(result.shape).toBe('cli');
    });

    // @ana A008
    it('returns unknown when frameworkName is null', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'python', frameworkName: null }));
      expect(result.shape).toBe('unknown');
    });

    // @ana A009
    it('returns unknown for unmapped framework string', () => {
      const result = detectApplicationShape(makeInput({ projectType: 'python', frameworkName: 'some-unknown-framework' }));
      expect(result.shape).toBe('unknown');
    });

    // @ana A018
    it('maps all 15 framework strings', () => {
      const frameworks = [
        'fastapi', 'django', 'django-drf', 'flask', 'typer', 'click',
        'gin', 'echo', 'chi', 'cobra-cli', 'fiber',
        'axum', 'actix-web', 'rocket', 'clap-cli',
      ];
      const mapped = frameworks.filter(fw =>
        detectApplicationShape(makeInput({ projectType: 'python', frameworkName: fw })).shape !== 'unknown'
      );
      expect(mapped).toHaveLength(15);
    });

    // @ana A010
    it('does not affect Node shape detection', () => {
      const result = detectApplicationShape(makeInput({
        projectType: 'node',
        frameworkName: 'express',
        deps: ['express'],
      }));
      expect(result.shape).not.toBe('unknown');
    });
  });

  // @ana A015
  describe('scaffold generator uses applicationShape for descriptions', () => {
    it('includes shape label when applicationShape is set', async () => {
      const { generateProjectContextScaffold } = await import('../../../src/utils/scaffold-generators.js');
      const { createEmptyEngineResult } = await import('../../../src/engine/types/engineResult.js');

      const result = createEmptyEngineResult();
      result.applicationShape = 'cli';
      result.stack.language = 'TypeScript';

      const scaffold = generateProjectContextScaffold(result);
      expect(scaffold).toContain('CLI tool');
      expect(scaffold).toContain('TypeScript');
    });

    it('uses framework as prefix when available', async () => {
      const { generateProjectContextScaffold } = await import('../../../src/utils/scaffold-generators.js');
      const { createEmptyEngineResult } = await import('../../../src/engine/types/engineResult.js');

      const result = createEmptyEngineResult();
      result.applicationShape = 'web-app';
      result.stack.framework = 'Next.js';

      const scaffold = generateProjectContextScaffold(result);
      expect(scaffold).toContain('Next.js web application');
    });
  });
});
