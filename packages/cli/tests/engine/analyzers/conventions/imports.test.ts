import { describe, it, expect } from 'vitest';
import {
  classifyTSImport,
  parseTsconfigAlias,
} from '../../../../src/engine/analyzers/conventions/imports.js';
import type { TsconfigEntry } from '../../../../src/engine/types/census.js';

function makeTsconfigEntry(paths: Record<string, string[]> | null): TsconfigEntry {
  return {
    sourceRootPath: '.',
    path: 'tsconfig.json',
    paths,
    baseUrl: '.',
  };
}

describe('parseTsconfigAlias', () => {
  // @ana A012
  it('returns all path aliases from tsconfig, not just the first one', async () => {
    const entry = makeTsconfigEntry({
      '@/*': ['./src/*'],
      '@/lib/*': ['./src/lib/*'],
      '@/pages/*': ['./src/pages/*'],
      '@/ui/*': ['./src/ui/*'],
    });

    const aliases = await parseTsconfigAlias('/tmp', [entry]);
    expect(aliases.length).toBe(4);
    expect(aliases).toContain('@/');
    expect(aliases).toContain('@/lib/');
    expect(aliases).toContain('@/pages/');
    expect(aliases).toContain('@/ui/');
  });

  // @ana A013
  it('recognizes tilde aliases', async () => {
    const entry = makeTsconfigEntry({
      '~/*': ['./src/*'],
      '~/lib/*': ['./src/lib/*'],
    });

    const aliases = await parseTsconfigAlias('/tmp', [entry]);
    expect(aliases).toContain('~/');
    expect(aliases).toContain('~/lib/');
  });

  // @ana A014
  it('recognizes hash aliases', async () => {
    const entry = makeTsconfigEntry({
      '#imports/*': ['./imports/*'],
    });

    const aliases = await parseTsconfigAlias('/tmp', [entry]);
    expect(aliases).toContain('#imports/');
  });

  // @ana A015
  it('excludes scoped npm packages like @nestjs', async () => {
    const entry = makeTsconfigEntry({
      '@/*': ['./src/*'],
      '@nestjs/*': ['./node_modules/@nestjs/*'],
      '@types/*': ['./node_modules/@types/*'],
    });

    const aliases = await parseTsconfigAlias('/tmp', [entry]);
    expect(aliases).toContain('@/');
    expect(aliases).not.toContain('@nestjs/');
    expect(aliases).not.toContain('@types/');
  });

  it('returns aliases without trailing /* (components/*)', async () => {
    const entry = makeTsconfigEntry({
      'components/*': ['./src/components/*'],
    });

    const aliases = await parseTsconfigAlias('/tmp', [entry]);
    expect(aliases).toContain('components/');
  });

  // @ana A017
  it('returns empty array for no paths', async () => {
    const entry = makeTsconfigEntry(null);

    const aliases = await parseTsconfigAlias('/tmp', [entry]);
    expect(aliases.length).toBe(0);
  });

  it('returns empty array for empty tsconfig entries', async () => {
    const aliases = await parseTsconfigAlias('/tmp', []);
    expect(aliases.length).toBe(0);
  });
});

describe('classifyTSImport with multiple aliases', () => {
  // @ana A016
  it('classifies all configured aliases as absolute', () => {
    const aliases = ['@/', '@/lib/', '~/lib/', '#imports/'];

    expect(classifyTSImport('@/models/user', aliases)).toBe('absolute');
    expect(classifyTSImport('@/lib/utils', aliases)).toBe('absolute');
    expect(classifyTSImport('~/lib/helpers', aliases)).toBe('absolute');
    expect(classifyTSImport('#imports/components', aliases)).toBe('absolute');
  });

  it('still classifies external packages correctly', () => {
    const aliases = ['@/', '~/'];

    expect(classifyTSImport('@nestjs/common', aliases)).toBe('external');
    expect(classifyTSImport('express', aliases)).toBe('external');
    expect(classifyTSImport('react', aliases)).toBe('external');
  });
});
