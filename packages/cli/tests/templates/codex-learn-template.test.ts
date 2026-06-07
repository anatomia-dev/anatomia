import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { CODEX_AGENT_FILES } from '../../src/constants.js';

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

describe('Dogfood Codex — agent defs match shipped templates', () => {
  const dogfoodDir = path.join(__dirname, '../../../../.codex/agents');

  // @ana A021, A022 — every codex dogfood `.md` matches its template byte-for-byte
  // (mirrors the `.claude` check in agent-proof-context.test.ts). This closes the
  // asymmetric-enforcement gap so the `.codex` ana-build/ana-verify edits — and all
  // future codex `.md` drift — are test-enforced, not just ana-learn.
  it('every dogfood codex agent .md matches the shipped template exactly', () => {
    for (const file of CODEX_AGENT_FILES) {
      const template = readCodexTemplate(file);
      const dogfood = readFileSync(path.join(dogfoodDir, file), 'utf-8');
      expect(dogfood, `${file} dogfood should match template`).toBe(template);
    }
  });

  it('dogfood ana-learn.agent.toml matches the template', () => {
    const learnToml = readFileSync(path.join(dogfoodDir, 'ana-learn.agent.toml'), 'utf-8');
    const templateToml = readFileSync(path.join(codexTemplatesDir, 'ana-learn.agent.toml'), 'utf-8');
    expect(learnToml, 'ana-learn.agent.toml dogfood should match template').toBe(templateToml);
  });
});
