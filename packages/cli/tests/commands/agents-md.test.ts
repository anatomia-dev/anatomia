/**
 * Tests for AGENTS.md generation — AI sub-provider collapse and
 * Surfaces section rendering.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { generateAgentsMd } from '../../src/commands/init/assets.js';
import { createEmptyEngineResult } from '../../src/engine/types/engineResult.js';
import type { EngineResult } from '../../src/engine/types/engineResult.js';

describe('generateAgentsMd()', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-md-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
    // generateAgentsMd reads package.json for project name
    await writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test-project' }),
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  function makeEngineResult(overrides: Partial<EngineResult> = {}): EngineResult {
    return { ...createEmptyEngineResult(), ...overrides };
  }

  async function readAgentsMd(): Promise<string> {
    return fs.readFile(path.join(tempDir, 'AGENTS.md'), 'utf-8');
  }

  // @ana A008, A009
  it('AI sub-provider collapse filters parenthesized variants', async () => {
    const er = makeEngineResult({
      stack: {
        ...createEmptyEngineResult().stack,
        aiSdk: 'Vercel AI',
      },
      externalServices: [
        { name: 'Vercel AI (OpenAI)', category: 'ai', source: 'dependency', configFound: false, stackRoles: [] },
        { name: 'Vercel AI (Anthropic)', category: 'ai', source: 'dependency', configFound: false, stackRoles: [] },
        { name: 'Vercel AI (Google)', category: 'ai', source: 'dependency', configFound: false, stackRoles: [] },
        { name: 'OpenAI', category: 'ai', source: 'dependency', configFound: false, stackRoles: [] },
        { name: 'Upstash', category: 'database', source: 'dependency', configFound: false, stackRoles: [] },
      ],
    });

    await generateAgentsMd(tempDir, er);
    const content = await readAgentsMd();

    expect(content).not.toContain('Vercel AI (OpenAI)');
    expect(content).not.toContain('Vercel AI (Anthropic)');
    expect(content).not.toContain('Vercel AI (Google)');
    expect(content).toContain('OpenAI');
    expect(content).toContain('Upstash');
  });

  it('no AI filtering when aiSdk is null', async () => {
    const er = makeEngineResult({
      externalServices: [
        { name: 'Vercel AI (OpenAI)', category: 'ai', source: 'dependency', configFound: false, stackRoles: [] },
        { name: 'OpenAI', category: 'ai', source: 'dependency', configFound: false, stackRoles: [] },
      ],
    });

    await generateAgentsMd(tempDir, er);
    const content = await readAgentsMd();

    // Both should appear when there's no aiSdk set
    expect(content).toContain('Vercel AI (OpenAI)');
    expect(content).toContain('OpenAI');
  });

  // @ana A010, A011, A012
  it('surfaces section rendered for multi-surface projects', async () => {
    const er = makeEngineResult({
      surfaces: [
        { name: 'cli', path: 'packages/cli', packageName: '@test/cli', language: 'TypeScript', framework: null, testing: ['Vitest'], sourceFiles: 50 },
        { name: 'website', path: 'website', packageName: '@test/website', language: 'TypeScript', framework: 'Next.js', testing: ['Vitest'], sourceFiles: 30 },
      ],
    });

    await generateAgentsMd(tempDir, er);
    const content = await readAgentsMd();

    expect(content).toContain('## Surfaces');
    expect(content).toContain('- cli (packages/cli)');
    expect(content).toContain('- website (website) — Next.js');
  });

  // @ana A013
  it('no surfaces section for single-package projects', async () => {
    const er = makeEngineResult({
      surfaces: [],
    });

    await generateAgentsMd(tempDir, er);
    const content = await readAgentsMd();

    expect(content).not.toContain('## Surfaces');
  });

  // @ana A014
  it('surfaces section truncates at 4 with overflow', async () => {
    const er = makeEngineResult({
      surfaces: [
        { name: 'cli', path: 'packages/cli', packageName: null, language: 'TypeScript', framework: null, testing: [], sourceFiles: 50 },
        { name: 'web', path: 'packages/web', packageName: null, language: 'TypeScript', framework: 'Next.js', testing: [], sourceFiles: 30 },
        { name: 'api', path: 'packages/api', packageName: null, language: 'TypeScript', framework: 'Express', testing: [], sourceFiles: 20 },
        { name: 'mobile', path: 'apps/mobile', packageName: null, language: 'TypeScript', framework: 'React Native', testing: [], sourceFiles: 15 },
        { name: 'admin', path: 'apps/admin', packageName: null, language: 'TypeScript', framework: 'React', testing: [], sourceFiles: 10 },
        { name: 'docs', path: 'packages/docs', packageName: null, language: 'TypeScript', framework: null, testing: [], sourceFiles: 5 },
      ],
    });

    await generateAgentsMd(tempDir, er);
    const content = await readAgentsMd();

    expect(content).toContain('## Surfaces');
    expect(content).toContain('- cli (packages/cli)');
    expect(content).toContain('- mobile (apps/mobile) — React Native');
    expect(content).not.toContain('- admin');
    expect(content).not.toContain('- docs');
    expect(content).toContain('+2 more');
  });
});
