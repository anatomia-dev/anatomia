import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dataDir = join(process.cwd(), 'data', 'docs');
const dataExists = existsSync(dataDir);

function readJson(filename: string): unknown {
  return JSON.parse(readFileSync(join(dataDir, filename), 'utf-8'));
}

// @ana A021
describe.skipIf(!dataExists)('data integrity — docs JSON files', () => {
  // @ana A017
  it('proof-entries.json has valid shape', () => {
    const data = readJson('proof-entries.json') as Record<string, unknown>[];

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);

    const first = data[0];
    expect(first).toHaveProperty('slug');
    expect(first).toHaveProperty('feature');
    expect(first).toHaveProperty('result');
    expect(first).toHaveProperty('timing');
    expect(first).toHaveProperty('contract');
    expect(first).toHaveProperty('assertionCount');
    expect(first).toHaveProperty('findingCount');
    expect(first).toHaveProperty('rejectionCycles');
    expect(first).toHaveProperty('assertions');
    expect(first).toHaveProperty('findings');
    expect(first).toHaveProperty('findingSeverity');
  });

  // @ana A018
  it('skill-templates.json has valid shape', () => {
    const data = readJson('skill-templates.json') as Record<string, unknown>[];

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);

    const first = data[0];
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('description');
    expect(first).toHaveProperty('sections');
    expect(first).toHaveProperty('rules');
  });

  it('gotchas.json has valid shape', () => {
    const data = readJson('gotchas.json') as Record<string, unknown>[];

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);

    const first = data[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('triggers');
    expect(first).toHaveProperty('skill');
    expect(first).toHaveProperty('text');
  });

  // @ana A019
  it('build-meta.json has valid shape', () => {
    const data = readJson('build-meta.json') as Record<string, unknown>;

    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('commitSha');
    expect(data).toHaveProperty('buildTimestamp');
  });

  // @ana A020
  it('commands.json has valid shape', () => {
    const data = readJson('commands.json') as Record<string, unknown>;

    expect(data).toHaveProperty('groups');
    expect(data).toHaveProperty('totalCommands');
    expect(data.totalCommands).toBeGreaterThanOrEqual(1);
  });

  it('supplementary files are valid JSON arrays', () => {
    const supplementary = ['agent-templates.json', 'context-files.json', 'search-index.json'];

    for (const file of supplementary) {
      const filePath = join(dataDir, file);
      if (existsSync(filePath)) {
        const data = readJson(file);
        expect(Array.isArray(data), `${file} should be an array`).toBe(true);
      }
    }
  });
});
