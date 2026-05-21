/**
 * Tests for scaffold-generators surface line
 */

import { describe, it, expect } from 'vitest';
import { generateProjectContextScaffold } from '../../src/utils/scaffold-generators.js';
import { createEmptyEngineResult } from '../../src/engine/types/engineResult.js';

describe('generateProjectContextScaffold', () => {
  // @ana A012
  it('includes detected surfaces line for monorepo projects', () => {
    const result = createEmptyEngineResult();
    result.monorepo = {
      isMonorepo: true,
      tool: 'pnpm',
      packages: [
        { name: 'my-cli', path: 'packages/cli', language: 'TypeScript', framework: null, testing: ['Vitest'], hasBin: true, scripts: [], sourceFiles: 50 },
        { name: 'my-web', path: 'website', language: 'TypeScript', framework: 'Next.js', testing: ['Vitest'], hasBin: false, scripts: [], sourceFiles: 30 },
      ],
      primaryPackage: null,
    };
    result.surfaces = [
      { name: 'cli', path: 'packages/cli', packageName: 'my-cli', language: 'TypeScript', framework: null, testing: ['Vitest'], sourceFiles: 50 },
      { name: 'website', path: 'website', packageName: 'my-web', language: 'TypeScript', framework: 'Next.js', testing: ['Vitest'], sourceFiles: 30 },
    ];
    const scaffold = generateProjectContextScaffold(result);
    expect(scaffold).toContain('Detected surfaces');
    expect(scaffold).toContain('cli (packages/cli, TypeScript)');
    expect(scaffold).toContain('website (website, TypeScript, Next.js)');
  });

  // @ana A013
  it('has no surface mention for single-package projects', () => {
    const result = createEmptyEngineResult();
    result.monorepo = { isMonorepo: false, tool: null, packages: [], primaryPackage: null };
    result.surfaces = [];
    const scaffold = generateProjectContextScaffold(result);
    expect(scaffold).not.toContain('Detected surfaces');
  });
});
