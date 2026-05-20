/**
 * Tests for surface awareness in agent templates.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const TEMPLATES_DIR = path.join(__dirname, '../../templates/.claude/agents');

// @ana A029
describe('ana-plan template references surfaces not testPackage', () => {
  it('does not reference testPackage', async () => {
    const templateContent = await fs.readFile(path.join(TEMPLATES_DIR, 'ana-plan.md'), 'utf-8');
    expect(templateContent).not.toContain('testPackage');
    expect(templateContent).toContain('surfaces');
  });
});

// @ana A030
describe('ana-verify template references spec not build report', () => {
  it('does not reference build report Verification Commands', async () => {
    const templateContent = await fs.readFile(path.join(TEMPLATES_DIR, 'ana-verify.md'), 'utf-8');
    expect(templateContent).not.toContain("build report's Verification Commands");
    expect(templateContent).toContain("spec's Build Brief");
  });
});

// @ana A028
describe('AnaJsonSchema parses surfaces with defaults', () => {
  it('parses surfaces with fail-soft defaults', async () => {
    const { AnaJsonSchema } = await import('../../src/commands/init/anaJsonSchema.js');
    // Malformed surfaces should fall back to defaults, not crash
    const result = AnaJsonSchema.parse({
      surfaces: {
        cli: { path: 'packages/cli', language: 'TypeScript', framework: null, commands: { test: 'cmd' } },
        malformed: 'not-an-object',
      },
    });
    expect(result.surfaces).toBeDefined();
    expect(result.surfaces['cli']).toBeDefined();
    expect(result.surfaces['cli']!.path).toBe('packages/cli');
    // Malformed entry falls back to default via .catch()
    expect(result.surfaces['malformed']).toBeDefined();
    expect(result.surfaces['malformed']!.path).toBe('');
  });

  it('parses empty surfaces as empty record', async () => {
    const { AnaJsonSchema } = await import('../../src/commands/init/anaJsonSchema.js');
    const result = AnaJsonSchema.parse({});
    expect(result.surfaces).toEqual({});
  });
});
