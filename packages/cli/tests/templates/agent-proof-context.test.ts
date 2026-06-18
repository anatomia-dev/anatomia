import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { AGENT_FILES } from '../../src/constants.js';
import * as path from 'node:path';

const templatesDir = path.join(__dirname, '../../templates/.claude/agents');

function readTemplate(filename: string): string {
  return readFileSync(path.join(templatesDir, filename), 'utf-8');
}

describe('Agent Proof Context Queries', () => {
  // @ana A001
  it('ana.md references the targeted proof context command during exploration', () => {
    const content = readTemplate('ana.md');
    expect(content).toContain('ana proof context');
  });

  // @ana A002
  it('ana.md checkpoint does not reference PROOF_CHAIN.md', () => {
    const content = readTemplate('ana.md');
    // Find the checkpoint paragraph (starts with "ALWAYS present the structured preview")
    const checkpointStart = content.indexOf('ALWAYS present the structured preview');
    expect(checkpointStart).toBeGreaterThan(-1);
    // Extract from checkpoint to the next section heading
    const checkpointEnd = content.indexOf('\n#', checkpointStart);
    const checkpoint = content.slice(checkpointStart, checkpointEnd > -1 ? checkpointEnd : undefined);
    expect(checkpoint).not.toContain('PROOF_CHAIN.md');
  });

  // @ana A003
  it('ana.md Step 1 (Before Scoping) does not reference PROOF_CHAIN.md', () => {
    const content = readTemplate('ana.md');
    // Step 1 is "Before Scoping or Recommending" — find its section
    const step1Start = content.indexOf('### 1. Before Scoping or Recommending');
    expect(step1Start).toBeGreaterThan(-1);
    const step1End = content.indexOf('\n### 2.', step1Start);
    const step1 = content.slice(step1Start, step1End > -1 ? step1End : undefined);
    expect(step1).not.toContain('PROOF_CHAIN.md');
  });

  // @ana A004
  it('ana-verify.md references the targeted proof context command', () => {
    const content = readTemplate('ana-verify.md');
    expect(content).toContain('ana proof context');
  });

  // @ana A005
  it('ana-verify.md includes a fallback for when the command is unavailable', () => {
    const content = readTemplate('ana-verify.md');
    expect(content).toContain('If the command is not available');
  });

  // @ana A006
  it('ana-plan.md has no PROOF_CHAIN.md references', () => {
    const content = readTemplate('ana-plan.md');
    expect(content).not.toContain('PROOF_CHAIN.md');
  });

  // @ana A007
  it('ana-build.md has no PROOF_CHAIN.md references', () => {
    const content = readTemplate('ana-build.md');
    expect(content).not.toContain('PROOF_CHAIN.md');
  });

  // @ana A008
  it('dogfood agent definitions match the shipped templates exactly', () => {
    const dogfoodDir = path.join(__dirname, '../../../../.claude/agents');
    const files = [...AGENT_FILES];

    for (const file of files) {
      const template = readTemplate(file);
      const dogfood = readFileSync(path.join(dogfoodDir, file), 'utf-8');
      expect(dogfood, `${file} dogfood should match template`).toBe(template);
    }
  });

  // @ana A003, A004
  it('AGENT_FILES matches template directory contents', () => {
    const dirFiles = readdirSync(templatesDir).filter(f => f.endsWith('.md')).sort();
    const constantFiles = [...AGENT_FILES].sort();
    expect(dirFiles).toEqual(constantFiles);
  });
});

// Component 1 (verifier-verdict-honesty): the verifier prompt forbids reading the
// build report in two places but used to *license* it in two others. The license
// is gone; the prohibition and the source-inspection fallback must survive.
// NOTE: the A001-A008 tags above belong to a prior merged contract; the tags below
// reference the verifier-verdict-honesty contract.
describe('Verdict honesty — build-report read license removed', () => {
  const codexTemplatesDir = path.join(__dirname, '../../templates/.codex/agents');
  const repoRoot = path.join(__dirname, '../../../..');
  const BUILD_REPORT_LICENSE = 'check the build report for coverage claims';

  // @ana A001
  it('claude master ana-verify.md no longer licenses reading the build report', () => {
    const content = readTemplate('ana-verify.md');
    expect(content).not.toContain(BUILD_REPORT_LICENSE);
  });

  // @ana A002
  it('codex master ana-verify.md no longer licenses reading the build report', () => {
    const content = readFileSync(path.join(codexTemplatesDir, 'ana-verify.md'), 'utf-8');
    expect(content).not.toContain(BUILD_REPORT_LICENSE);
  });

  // @ana A003
  it('claude master keeps the never-read-the-build-report prohibition', () => {
    const content = readTemplate('ana-verify.md');
    expect(content).toContain('never read the build report');
  });

  // @ana A004
  it('claude master keeps the source-inspection fallback for untested assertions', () => {
    const content = readTemplate('ana-verify.md');
    expect(content).toContain('source inspection');
  });

  // @ana A005
  it('both dogfood ana-verify copies match their master byte-for-byte', () => {
    const claudeMaster = readTemplate('ana-verify.md');
    const claudeDogfood = readFileSync(path.join(repoRoot, '.claude/agents/ana-verify.md'), 'utf-8');
    expect(claudeDogfood).toBe(claudeMaster);

    const codexMaster = readFileSync(path.join(codexTemplatesDir, 'ana-verify.md'), 'utf-8');
    const codexDogfood = readFileSync(path.join(repoRoot, '.codex/agents/ana-verify.md'), 'utf-8');
    expect(codexDogfood).toBe(codexMaster);
  });
});

// Phase 1 of proof-context-intelligence — tags use THIS contract's IDs
// (.ana/plans/active/proof-context-intelligence/contract.yaml), distinct from
// the prior-contract @ana tags reused elsewhere in this file.
describe('Proof-context adoption framing (proof-context-intelligence Phase 1)', () => {
  const phaseCodexTemplatesDir = path.join(__dirname, '../../templates/.codex/agents');

  // @ana A030
  it('ana.md instructs running ana proof context as a non-optional scope step', () => {
    const content = readTemplate('ana.md');
    expect(content).toContain('ana proof context');
    expect(content).toContain('not optional');
  });

  // @ana A031
  it('ana-verify.md drops the "context, not a checklist" hedge', () => {
    const content = readTemplate('ana-verify.md');
    expect(content).not.toContain('context, not a checklist');
  });

  // @ana A032
  it('ana-verify.md reaffirms forming findings independently', () => {
    const content = readTemplate('ana-verify.md');
    expect(content).toContain('independent');
  });

  // @ana A034
  it('codex ana-verify mirror carries the independence framing', () => {
    const content = readFileSync(path.join(phaseCodexTemplatesDir, 'ana-verify.md'), 'utf-8');
    expect(content).toContain('independent');
  });
});
