import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const codexTemplatesDir = path.join(__dirname, '../../templates/.codex/agents');
const ccTemplatesDir = path.join(__dirname, '../../templates/.claude/agents');

function readCodexTemplate(filename: string): string {
  return readFileSync(path.join(codexTemplatesDir, filename), 'utf-8');
}

function readCcTemplate(filename: string): string {
  return readFileSync(path.join(ccTemplatesDir, filename), 'utf-8');
}

describe('Codex Learn Template', () => {
  // @ana A008
  it('Codex Learn template has no frontmatter', () => {
    const templateContent = readCodexTemplate('ana-learn.md');
    // First line should be content, not a YAML frontmatter delimiter
    expect(templateContent.startsWith('---')).toBe(false);
  });

  // @ana A009
  it('Codex Learn template uses .ana/skills/ paths', () => {
    const templateContent = readCodexTemplate('ana-learn.md');
    expect(templateContent).not.toContain('.claude/skills/');
    expect(templateContent).toContain('.ana/skills/');
  });

  // @ana A010, A011
  it('Codex Learn template uses Codex diagnostic language', () => {
    const templateContent = readCodexTemplate('ana-learn.md');
    // No CC-specific frontmatter diagnostic language
    expect(templateContent).not.toContain('frontmatter `skills:`');
    // References Plan's prompt file for diagnostics
    expect(templateContent).toContain('.codex/agents/ana-plan.md');
  });

  // @ana A012
  it('Codex Learn template notes that promoted rules require re-init', () => {
    const templateContent = readCodexTemplate('ana-learn.md');
    expect(templateContent).toContain('ana init');
    // Specific note about re-init for Codex skill content
    expect(templateContent).toContain('regenerate');
  });
});

describe('CC Learn Template Paths', () => {
  // @ana A013, A014
  it('CC Learn template paths are corrected', () => {
    const ccTemplateContent = readCcTemplate('ana-learn.md');
    expect(ccTemplateContent).not.toContain('.claude/skills/');
    expect(ccTemplateContent).toContain('.ana/skills/');
  });
});

describe('Dogfood Codex Learn', () => {
  const dogfoodDir = path.join(__dirname, '../../../../.codex/agents');

  // @ana A018, A019
  it('dogfood codex agents include Learn', () => {
    const learnMd = readFileSync(path.join(dogfoodDir, 'ana-learn.md'), 'utf-8');
    const learnToml = readFileSync(path.join(dogfoodDir, 'ana-learn.agent.toml'), 'utf-8');

    // Dogfood should match product templates
    const templateMd = readCodexTemplate('ana-learn.md');
    const templateToml = readFileSync(
      path.join(codexTemplatesDir, 'ana-learn.agent.toml'),
      'utf-8',
    );

    expect(learnMd, 'ana-learn.md dogfood should match template').toBe(templateMd);
    expect(learnToml, 'ana-learn.agent.toml dogfood should match template').toBe(templateToml);
  });
});
