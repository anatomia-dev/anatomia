import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

vi.mock('glob', async (importOriginal) => {
  const original = await importOriginal<typeof import('glob')>();
  return { ...original };
});
import * as glob from 'glob';
import {
  generateProofSummary,
  parseFindings,
  parseRejectionCycles,
  extractFileRefs,

  parseBuildOpenIssues,
  resolveFindingPaths,
  getProofContext,
  extractScopeSummary,
  generateDashboard,
  findFindingById,
  computeChainHealth,
  computeHealthReport,
  detectHealthChange,
  computeStaleness,
  truncateSummary,
  MIN_FINDINGS_HOT,
  MIN_ENTRIES_HOT,
  TRAJECTORY_WINDOW,
  MIN_ENTRIES_FOR_TREND,
} from '../../src/utils/proofSummary.js';

describe('generateProofSummary', () => {
  let tempDir: string;
  let slugDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'proof-summary-test-'));
    slugDir = path.join(tempDir, 'test-feature');
    await fs.promises.mkdir(slugDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('reads all four sources and returns complete summary', async () => {
    // Create .saves.json with timing data (pre-check data is vestigial)
    const saves = {
      scope: {
        saved_at: '2026-04-01T10:00:00Z',
        commit: 'abc123',
        hash: 'sha256:scope123',
      },
      contract: {
        saved_at: '2026-04-01T10:30:00Z',
        commit: 'def456',
        hash: 'sha256:contract456',
      },
      'build-report': {
        saved_at: '2026-04-01T11:00:00Z',
        commit: 'ghi789',
        hash: 'sha256:build789',
      },
      'verify-report': {
        saved_at: '2026-04-01T11:30:00Z',
        commit: 'jkl012',
        hash: 'sha256:verify012',
      },
      'pre-check': {
        seal: 'INTACT',
        seal_hash: 'sha256:contract456',
        run_at: '2026-04-01T10:35:00Z',
      },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    // Create contract.yaml
    const contract = `
version: "1.0"
sealed_by: "AnaPlan"
feature: "Stripe Payment Integration"
assertions:
  - id: A001
    says: "Payment returns success"
  - id: A002
    says: "Client secret included"
  - id: A003
    says: "Webhook updates order"
file_changes:
  - path: "src/payments.ts"
    action: create
`;
    await fs.promises.writeFile(path.join(slugDir, 'contract.yaml'), contract);

    // Create verify_report.md with Contract Compliance table
    const verifyReport = `# Verify Report

**Result:** PASS

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Payment returns success | ✅ SATISFIED | test line 42 |
| A002 | Client secret included | ✅ SATISFIED | test line 43 |
| A003 | Webhook updates order | ⚠️ DEVIATED | builder used event mock |

## AC Walkthrough
- ✅ PASS: AC1 Payment works
- ✅ PASS: AC2 Webhook fires
`;
    await fs.promises.writeFile(path.join(slugDir, 'verify_report.md'), verifyReport);

    // Create build_report.md with deviations
    const buildReport = `# Build Report

## Deviations from Contract

### A003: Webhook updates order
**Instead:** Event mock verification
**Reason:** Stripe requires live webhooks
**Outcome:** Functionally equivalent
`;
    await fs.promises.writeFile(path.join(slugDir, 'build_report.md'), buildReport);

    const summary = generateProofSummary(slugDir);

    expect(summary.feature).toBe('Stripe Payment Integration');
    expect(summary.result).toBe('PASS');
    expect(summary.assertions).toHaveLength(3);
    expect(summary.contract.total).toBe(3);
    expect(summary.contract.satisfied).toBe(2);
    expect(summary.contract.deviated).toBe(1);
    expect(summary.deviations).toHaveLength(1);
    expect(summary.deviations[0]!.contract_id).toBe('A003');
    expect(summary.deviations[0]!.instead).toBe('Event mock verification');
    expect((summary as unknown as Record<string, unknown>)['seal_commit']).toBeUndefined();
    expect(summary.hashes['scope']).toBe('sha256:scope123');
    expect(summary.acceptance_criteria.total).toBe(2);
    expect(summary.acceptance_criteria.met).toBe(2);
  });

  // @ana A003
  it('parseACResults handles Format B (bold AC label before status)', async () => {
    // Format B: - **AC1:** ✅ PASS — description
    const verifyReport = `# Verify Report

**Result:** PASS

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Feature works | ✅ SATISFIED | test line 10 |

## AC Walkthrough
- **AC1:** ✅ PASS — Test at proofSummary.ts:397
- **AC2:** ❌ FAIL — Missing validation
- **AC3:** ✅ PASS — Handles edge case
`;
    await fs.promises.writeFile(path.join(slugDir, 'verify_report.md'), verifyReport);

    const summary = generateProofSummary(slugDir);

    expect(summary.acceptance_criteria.total).toBe(3);
    expect(summary.acceptance_criteria.met).toBe(2);
  });

  // @ana A004
  it('parseACResults handles Format C (status at end after arrow)', async () => {
    // Format C: - **AC1:** description ... → ✅ PASS
    const verifyReport = `# Verify Report

**Result:** PASS

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Feature works | ✅ SATISFIED | test line 10 |

## AC Walkthrough
- **AC1:** Template has frontmatter with correct fields → ✅ PASS
- **AC2:** Output matches expected format → ✅ PASS
- **AC3:** Error handling covers edge cases → ⚠️ PARTIAL
`;
    await fs.promises.writeFile(path.join(slugDir, 'verify_report.md'), verifyReport);

    const summary = generateProofSummary(slugDir);

    expect(summary.acceptance_criteria.total).toBe(3);
    expect(summary.acceptance_criteria.met).toBe(2);
  });

  // @ana A005
  it('parseACResults does not false-match on Result line', async () => {
    // The **Result:** PASS line should NOT be counted as an AC pass
    const verifyReport = `# Verify Report

**Result:** PASS

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Feature works | ✅ SATISFIED | test line 10 |

## AC Walkthrough
- ✅ PASS: AC1 Feature works
- ❌ FAIL: AC2 Edge case broken
`;
    await fs.promises.writeFile(path.join(slugDir, 'verify_report.md'), verifyReport);

    const summary = generateProofSummary(slugDir);

    // Total should be 2 (one PASS + one FAIL), NOT 3 (which would mean **Result:** PASS was counted)
    expect(summary.acceptance_criteria.total).toBe(2);
    expect(summary.acceptance_criteria.met).toBe(1);
  });

  // @ana A001
  it('parseACResults scopes to AC Walkthrough section — ignores PASS in other sections', async () => {
    const verifyReport = `# Verify Report

**Result:** PASS

## AC Walkthrough
- ✅ PASS: AC1 Feature works
- ❌ FAIL: AC2 Missing edge case
- ✅ PASS: AC3 Handles errors

## Findings
- Finding about PASS rate improvements in the codebase
- Another finding mentioning PASS in prose
`;
    await fs.promises.writeFile(path.join(slugDir, 'verify_report.md'), verifyReport);

    const summary = generateProofSummary(slugDir);

    // Only 3 ACs in the walkthrough, not 5 (would be 5 if Findings PASS lines counted)
    expect(summary.acceptance_criteria.total).toBe(3);
    expect(summary.acceptance_criteria.met).toBe(2);
  });

  // @ana A002
  it('parseACResults met count excludes PASS mentions outside AC Walkthrough', async () => {
    const verifyReport = `# Verify Report

**Result:** PASS

## AC Walkthrough
- ✅ PASS: AC1 Works correctly
- ❌ FAIL: AC2 Needs fix
- ⚠️ PARTIAL: AC3 Partially done

## Findings
- PASS: This line should not inflate the met count
`;
    await fs.promises.writeFile(path.join(slugDir, 'verify_report.md'), verifyReport);

    const summary = generateProofSummary(slugDir);

    expect(summary.acceptance_criteria.total).toBe(3);
    expect(summary.acceptance_criteria.met).toBe(1);
  });

  // @ana A003
  it('parseACResults falls back to full content when AC Walkthrough heading missing', async () => {
    const verifyReport = `# Verify Report

**Result:** PASS

## Some Other Section
- ✅ PASS: AC1 Works
- ❌ FAIL: AC2 Broken
`;
    await fs.promises.writeFile(path.join(slugDir, 'verify_report.md'), verifyReport);

    const summary = generateProofSummary(slugDir);

    // No ## AC Walkthrough heading, so falls back to full content
    expect(summary.acceptance_criteria.total).toBe(2);
    expect(summary.acceptance_criteria.met).toBe(1);
  });

  it('parseACResults handles AC Walkthrough as last section (no subsequent heading)', async () => {
    const verifyReport = `# Verify Report

**Result:** PASS

## AC Walkthrough
- ✅ PASS: AC1 Feature works
- ✅ PASS: AC2 Edge case handled
- ❌ FAIL: AC3 Needs work`;
    await fs.promises.writeFile(path.join(slugDir, 'verify_report.md'), verifyReport);

    const summary = generateProofSummary(slugDir);

    expect(summary.acceptance_criteria.total).toBe(3);
    expect(summary.acceptance_criteria.met).toBe(2);
  });

  it('parseACResults returns zero counts for empty report', async () => {
    const verifyReport = '';
    await fs.promises.writeFile(path.join(slugDir, 'verify_report.md'), verifyReport);

    const summary = generateProofSummary(slugDir);

    expect(summary.acceptance_criteria.total).toBe(0);
    expect(summary.acceptance_criteria.met).toBe(0);
  });

  // @ana A010, A011
  it('handles missing verify report — bootstraps from contract.yaml', async () => {
    const contract = `
version: "1.0"
feature: "Test Feature"
assertions:
  - id: A001
    says: "Test assertion"
file_changes:
  - path: "test.ts"
    action: create
`;
    await fs.promises.writeFile(path.join(slugDir, 'contract.yaml'), contract);

    const summary = generateProofSummary(slugDir);

    expect(summary.feature).toBe('Test Feature');
    expect(summary.result).toBe('UNKNOWN');
    expect(summary.assertions).toHaveLength(1);
    expect(summary.assertions[0]!.verifyStatus).toBeNull();
    // preCheckStatus no longer exists on ProofAssertion
    expect((summary.assertions[0] as unknown as Record<string, unknown>)['preCheckStatus']).toBeUndefined();
  });

  it('handles missing .saves.json gracefully', async () => {
    // Only contract.yaml
    const contract = `
version: "1.0"
feature: "Test Feature"
assertions:
  - id: A001
    says: "Test assertion"
file_changes:
  - path: "test.ts"
    action: create
`;
    await fs.promises.writeFile(path.join(slugDir, 'contract.yaml'), contract);

    const summary = generateProofSummary(slugDir);

    expect(summary.feature).toBe('Test Feature');
    expect(summary.hashes).toEqual({});
    expect(summary.timing.total_minutes).toBe(0);
    expect(summary.assertions).toHaveLength(1);
    expect(summary.assertions[0]!.verifyStatus).toBeNull();
  });

  it('parses deviations from build report', async () => {
    const buildReport = `# Build Report

## Deviations from Contract

### A001: First assertion
**Instead:** Did something else
**Reason:** Technical constraint
**Outcome:** Same result

### A002: Second assertion
**Instead:** Alternative approach
**Reason:** Better for testing
**Outcome:** Preserved intent
`;
    await fs.promises.writeFile(path.join(slugDir, 'build_report.md'), buildReport);

    const contract = `
version: "1.0"
feature: "Test"
assertions:
  - id: A001
    says: "First assertion"
  - id: A002
    says: "Second assertion"
file_changes:
  - path: "test.ts"
    action: create
`;
    await fs.promises.writeFile(path.join(slugDir, 'contract.yaml'), contract);

    const summary = generateProofSummary(slugDir);

    expect(summary.deviations).toHaveLength(2);
    expect(summary.deviations[0]!.contract_id).toBe('A001');
    expect(summary.deviations[0]!.instead).toBe('Did something else');
    expect(summary.deviations[0]!.reason).toBe('Technical constraint');
    expect(summary.deviations[0]!.outcome).toBe('Same result');
    expect(summary.deviations[1]!.contract_id).toBe('A002');
  });

  // @ana A012, A013, A019
  it('overlays verify statuses onto contract-bootstrapped assertions', async () => {
    // Contract as assertion source
    const contract = `
version: "1.0"
feature: "Test Feature"
assertions:
  - id: A001
    says: "First"
  - id: A002
    says: "Second"
file_changes:
  - path: "test.ts"
    action: create
`;
    await fs.promises.writeFile(path.join(slugDir, 'contract.yaml'), contract);

    // Verify: A001 SATISFIED, A002 UNCOVERED (backward compat)
    const verifyReport = `# Verify Report

**Result:** PASS

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | First | ✅ SATISFIED | test line 10 |
| A002 | Second | ❌ UNCOVERED | |
`;
    await fs.promises.writeFile(path.join(slugDir, 'verify_report.md'), verifyReport);

    const summary = generateProofSummary(slugDir);

    expect(summary.assertions).toHaveLength(2);

    const a001 = summary.assertions.find(a => a.id === 'A001');
    expect(a001?.verifyStatus).toBe('SATISFIED');
    expect(a001?.evidence).toBe('test line 10');

    const a002 = summary.assertions.find(a => a.id === 'A002');
    // Old verify reports with UNCOVERED status parse correctly
    expect(a002?.verifyStatus).toBe('UNCOVERED');

    // No covered/uncovered fields on contract
    expect((summary.contract as Record<string, unknown>)['covered']).toBeUndefined();
    expect((summary.contract as Record<string, unknown>)['uncovered']).toBeUndefined();
  });

  it('computes timing from save timestamps', async () => {
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report': { saved_at: '2026-04-01T12:00:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    expect(summary.timing.total_minutes).toBe(120); // 2 hours
    expect(summary.timing.think).toBe(30); // scope to contract
    expect(summary.timing.plan).toBe(30); // same as think
    expect(summary.timing.build).toBe(60); // contract to build
    expect(summary.timing.verify).toBe(30); // build to verify
  });

  // @ana A007
  it('seal_commit is removed from ProofSummary', () => {
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z', commit: 'aaa111', hash: 'sha256:scope' },
      contract: { saved_at: '2026-04-01T10:30:00Z', commit: 'bbb222', hash: 'sha256:contract' },
      'build-report': { saved_at: '2026-04-01T11:00:00Z', commit: 'ccc333', hash: 'sha256:build' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));
    fs.writeFileSync(path.join(slugDir, 'contract.yaml'), 'feature: "Test"\nassertions: []');

    const summary = generateProofSummary(slugDir);
    expect((summary as unknown as Record<string, unknown>)['seal_commit']).toBeUndefined();
  });

  it('seal_commit not present even when pre-check also has seal_commit', () => {
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z', commit: 'aaa111', hash: 'sha256:scope' },
      contract: { saved_at: '2026-04-01T10:30:00Z', commit: 'same123', hash: 'sha256:contract' },
      'pre-check': { seal_commit: 'same123', assertions: [], covered: 0, uncovered: 0 },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));
    fs.writeFileSync(path.join(slugDir, 'contract.yaml'), 'feature: "Test"\nassertions: []');

    const summary = generateProofSummary(slugDir);
    expect((summary as unknown as Record<string, unknown>)['seal_commit']).toBeUndefined();
  });

  it('returns slug as feature name when contract missing', async () => {
    // Empty directory
    const summary = generateProofSummary(slugDir);

    expect(summary.feature).toBe('test-feature');
    expect(summary.assertions).toHaveLength(0);
    expect(summary.result).toBe('UNKNOWN');
  });
});

describe('computeTiming with work_started_at', () => {
  let tempDir: string;
  let slugDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'timing-test-'));
    slugDir = path.join(tempDir, 'test-timing');
    await fs.promises.mkdir(slugDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A022, A023
  it('computes think from work_started_at and plan differs from think', async () => {
    const saves = {
      work_started_at: '2026-04-01T09:40:00Z',
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report': { saved_at: '2026-04-01T12:00:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // think = scopeTime - workStartedAt = 20min
    expect(summary.timing.think).toBe(20);
    // plan = contractTime - scopeTime = 30min
    expect(summary.timing.plan).toBe(30);
    // think !== plan
    expect(summary.timing.think).not.toBe(summary.timing.plan);
    // total includes think phase: verifyTime - workStartedAt
    expect(summary.timing.total_minutes).toBe(140);
    // build and verify unchanged
    expect(summary.timing.build).toBe(60);
    expect(summary.timing.verify).toBe(30);
  });

  // @ana A024
  it('falls back when work_started_at missing', async () => {
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report': { saved_at: '2026-04-01T12:00:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // Fallback: think === plan (both are contractTime - scopeTime)
    expect(summary.timing.think).toBe(30);
    expect(summary.timing.plan).toBe(30);
    expect(summary.timing.think).toBe(summary.timing.plan);
    // total: verifyTime - scopeTime (no workStartedAt)
    expect(summary.timing.total_minutes).toBe(120);
  });

  it('total_minutes includes think phase when work_started_at present', async () => {
    const saves = {
      work_started_at: '2026-04-01T09:00:00Z',
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report': { saved_at: '2026-04-01T12:00:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // total = verifyTime - workStartedAt = 180min (3 hours)
    expect(summary.timing.total_minutes).toBe(180);
    // think = 60min, plan = 30min
    expect(summary.timing.think).toBe(60);
    expect(summary.timing.plan).toBe(30);
  });
});

// @ana A010, A012, A008, A009
describe('parseFindings', () => {
  // @ana A008
  it('parses bulleted findings with em-dash format', () => {
    const content = `## Findings

- **Code — Dead logic in full-stack check:** \`projectKind.ts:105\` — BROWSER_FRAMEWORKS.has(d) will never match because dep names are lowercase.

- **Test — A003 purity test is comment-fragile:** projectKind.test.ts:187 reads source and asserts not.toContain. A comment mentioning node:fs breaks it.

- **Upstream — Pre-check tag collision:** @ana A015 tag in proof.test.ts matched a different feature's contract.

## Deployer Handoff
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(3);
    expect(findings[0]!.category).toBe('code');
    expect(findings[0]!.summary).toContain('Dead logic in full-stack check');
    expect(findings[0]!.file).toBe('projectKind.ts');
    expect(findings[1]!.category).toBe('test');
    expect(findings[1]!.summary).toContain('A003 purity test');
    expect(findings[1]!.file).toBe('projectKind.test.ts');
    expect(findings[2]!.category).toBe('upstream');
    expect(findings[2]!.summary).toContain('Pre-check tag collision');
    expect(findings[2]!.file).toBe('proof.test.ts');
  });

  it('parses numbered findings', () => {
    const content = `## Findings

1. **Code — Unused export:** ProjectKindResult exported but never imported.

2. **Test — Missing priority test:** No test for bin-over-framework priority.
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(2);
    expect(findings[0]!.category).toBe('code');
    expect(findings[0]!.file).toBeNull();
    expect(findings[1]!.category).toBe('test');
    expect(findings[1]!.file).toBeNull();
  });

  it('parses findings with colon-only format (no em-dash)', () => {
    const content = `## Findings

- **Code:** slug truncation at 24 chars misaligns table columns for long slugs.

- **Test:** duplicate @ana tag IDs across list and detail test sections.
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(2);
    expect(findings[0]!.category).toBe('code');
    expect(findings[0]!.summary).toContain('slug truncation');
    expect(findings[0]!.file).toBeNull();
    expect(findings[1]!.category).toBe('test');
    expect(findings[1]!.file).toBeNull();
  });

  it('returns empty array when no Callouts section in verify report', () => {
    const content = `## Independent Findings
Some findings here.

## AC Walkthrough
Some ACs here.
`;
    expect(parseFindings(content)).toHaveLength(0);
  });

  it('returns empty array when Callouts section in verify report has no parseable entries', () => {
    const content = `## Findings

Just some plain text with no structured findings.
`;
    expect(parseFindings(content)).toHaveLength(0);
  });

  it('caps summary at 1000 characters', () => {
    const longDesc = 'x'.repeat(1100);
    const content = `## Findings

- **Code — Long one:** ${longDesc}
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.summary.length).toBeLessThanOrEqual(1000);
  });

  it('extracts code anchor from backtick-quoted construct', () => {
    const content = `## Findings

- **Code — Non-recursive check:** \`readdirSync(prismaDir)\` only checks top-level entries in the directory.
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.anchor).toBe('readdirSync(prismaDir)');
  });

  it('returns null anchor when no suitable backtick content', () => {
    const content = `## Findings

- **Upstream — Spec deviation:** The spec suggested a different approach but implementation is better.
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.anchor).toBeNull();
  });

  it('skips file:line references as anchors', () => {
    const content = `## Findings

- **Code — Issue at location:** \`census.ts:219\` has a problem. The real code is \`readdirSync(prismaDir)\`.
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(1);
    // Should skip census.ts:219 (file:line ref) and use readdirSync(prismaDir)
    expect(findings[0]!.anchor).toBe('readdirSync(prismaDir)');
  });

  it('handles multi-line finding descriptions', () => {
    const content = `## Findings

- **Code — Multi-line issue:** First line of description
  continues on second line with more detail
  and a third line too.

- **Test — Next entry:** Should be separate.
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(2);
    expect(findings[0]!.summary).toContain('continues on second line');
    expect(findings[0]!.file).toBeNull();
    expect(findings[1]!.summary).toContain('Next entry');
    expect(findings[1]!.file).toBeNull();
  });

  it('parses category-header format with sub-bullets (add-hook-detection style)', () => {
    const content = `## Findings

**Code:**
- **Component file heuristic may over-count:** confirmation.ts:797 includes any .tsx file.

- **Nuxt detection deviates from spec:** Uses import matching instead of regex.

**Test:**
- **No @ana tags for 8 assertions:** A001-A003 have no tags.

**Upstream:**
- **Spec suggested regex but import matching is better:** Positive deviation.

## Deployer Handoff
`;
    const findings = parseFindings(content);
    expect(findings.length).toBeGreaterThanOrEqual(4);

    const codeFindings = findings.filter(c => c.category === 'code');
    expect(codeFindings.length).toBeGreaterThanOrEqual(2);
    expect(codeFindings[0]!.summary).toContain('Component file heuristic');
    expect(codeFindings[0]!.file).toBe('confirmation.ts');

    const testFindings = findings.filter(c => c.category === 'test');
    expect(testFindings.length).toBeGreaterThanOrEqual(1);

    const upstreamFindings = findings.filter(c => c.category === 'upstream');
    expect(upstreamFindings.length).toBeGreaterThanOrEqual(1);
  });

  it('parses standalone paragraph format (fix-skill-template-gaps style)', () => {
    const content = `## Findings

**Upstream:** Contract assertions A007 and A008 were sealed with incorrect values. The planner miscounted.

**Code:** The error-handling rule is now longer than the others. Appropriate given the nuance.

**Test:** No test coverage for template content. Visual inspection only.

## Deployer Handoff
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(3);
    expect(findings[0]!.category).toBe('upstream');
    expect(findings[0]!.summary).toContain('A007');
    expect(findings[0]!.file).toBeNull();
    expect(findings[1]!.category).toBe('code');
    expect(findings[1]!.file).toBeNull();
    expect(findings[2]!.category).toBe('test');
    expect(findings[2]!.file).toBeNull();
  });

  // @ana A001
  it('returns file field with first file ref from summary', () => {
    const content = `## Findings

- **Code — Dead logic in full-stack check:** \`projectKind.ts:105\` — BROWSER_FRAMEWORKS.has(d) will never match.
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.file).toBe('projectKind.ts');
  });

  // @ana A002
  it('returns null file when no file ref in summary', () => {
    const content = `## Findings

- **Upstream — Contract assertion sealed with incorrect value:** The planner miscounted the total assertions.
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.file).toBeNull();
  });

  // @ana A003
  it('takes first file ref when multiple files present in summary', () => {
    const content = `## Findings

- **Code — Cross-file issue:** fileA.ts:10 and fileB.ts:20 both have the same problem.
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.file).toBe('fileA.ts');
  });

  it('accepts non-standard categories like Security or Performance', () => {
    const content = `## Findings

- **Security — SQL injection in query builder:** db/queries.ts:42 — user input concatenated into SQL string.
- **Performance — N+1 query in user list:** api/users.ts:15 — fetches roles individually per user.

## Deployer Handoff
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(2);
    expect(findings[0]!.category).toBe('security');
    expect(findings[0]!.file).toBe('db/queries.ts');
    expect(findings[1]!.category).toBe('performance');
    expect(findings[1]!.file).toBe('api/users.ts');
  });
});

describe('parseRejectionCycles', () => {
  it('parses Previous Findings Resolution table', () => {
    const content = `## Independent Findings
Some findings.

## Previous Findings Resolution

Previous verification: 2026-04-15, Result: FAIL

### Previously UNSATISFIED Assertions
| ID | Previous Issue | Current Status | Resolution |
|----|----------------|----------------|------------|
| A015 | Test was a sentinel, not real test | ✅ SATISFIED | Builder added real scaffold test |
| A016 | Used toBeDefined instead of type check | ✅ SATISFIED | Builder replaced with type-safe assertions |

### Previous Callouts
| Callout | Status | Notes |
|---------|--------|-------|
| Dead logic in full-stack check | Still present | Not a FAIL item |

## AC Walkthrough
`;
    const result = parseRejectionCycles(content);
    expect(result.cycles).toBe(1);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0]!.id).toBe('A015');
    expect(result.failures[0]!.summary).toContain('sentinel');
    expect(result.failures[1]!.id).toBe('A016');
  });

  it('returns zero cycles when no Previous Findings Resolution section', () => {
    const content = `## Independent Findings
Some findings.

## AC Walkthrough
Some ACs.
`;
    const result = parseRejectionCycles(content);
    expect(result.cycles).toBe(0);
    expect(result.failures).toHaveLength(0);
  });

  it('returns zero cycles when section exists but no assertion table', () => {
    const content = `## Previous Findings Resolution

Previous verification: 2026-04-15, Result: FAIL

### Previous Callouts
| Callout | Status | Notes |
|---------|--------|-------|
| Some callout | Fixed | Done |
`;
    const result = parseRejectionCycles(content);
    expect(result.cycles).toBe(0);
    expect(result.failures).toHaveLength(0);
  });

  it('skips header row in assertion table', () => {
    const content = `## Previous Findings Resolution

### Previously UNSATISFIED Assertions
| ID | Previous Issue | Current Status | Resolution |
|----|----------------|----------------|------------|
| A001 | Missing validation | ✅ SATISFIED | Added input checks |
`;
    const result = parseRejectionCycles(content);
    expect(result.cycles).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.id).toBe('A001');
  });
});

// @ana A008
describe('extractFileRefs', () => {
  // @ana A001
  it('extracts filename:line format', () => {
    const result = extractFileRefs('Dead logic in projectKind.ts:105 causes issues');
    expect(result).toContain('projectKind.ts');
  });

  // @ana A002
  it('extracts filename:line-line range format', () => {
    const result = extractFileRefs('Check scan-engine.ts:200-250 for the issue');
    expect(result).toContain('scan-engine.ts');
  });

  // @ana A003
  it('extracts filename without line number', () => {
    const result = extractFileRefs('See displayNames.ts for the mapping');
    expect(result).toContain('displayNames.ts');
  });

  // @ana A004
  it('returns multiple refs from one summary', () => {
    const result = extractFileRefs('projectKind.ts:105 and scan-engine.ts:200 both affected');
    expect(result.length).toBeGreaterThan(1);
    expect(result).toContain('projectKind.ts');
    expect(result).toContain('scan-engine.ts');
  });

  // @ana A005
  it('returns empty array when no refs found', () => {
    const result = extractFileRefs('No file references in this finding');
    expect(result.length).toBe(0);
  });

  // @ana A006
  it('handles various file extensions', () => {
    const result = extractFileRefs('Check config.json and schema.yaml and readme.md');
    expect(result).toContain('config.json');
    expect(result).toContain('schema.yaml');
    expect(result).toContain('readme.md');
  });

  it('deduplicates multiple mentions of same file', () => {
    const result = extractFileRefs('projectKind.ts:105 and projectKind.ts:200');
    expect(result).toHaveLength(1);
    expect(result).toContain('projectKind.ts');
  });

  it('handles tsx and jsx extensions', () => {
    const result = extractFileRefs('See Button.tsx:50 and helpers.jsx');
    expect(result).toContain('Button.tsx');
    expect(result).toContain('helpers.jsx');
  });

  it('preserves directory path when present', () => {
    const result = extractFileRefs('src/utils/proofSummary.ts:361 uses substring');
    expect(result).toContain('src/utils/proofSummary.ts');
    expect(result).not.toContain('proofSummary.ts');
  });

  it('distinguishes same filename in different directories', () => {
    const result = extractFileRefs('src/a/index.ts and src/b/index.ts both export');
    expect(result).toHaveLength(2);
    expect(result).toContain('src/a/index.ts');
    expect(result).toContain('src/b/index.ts');
  });

  it('skips URL-like paths', () => {
    const result = extractFileRefs('See https://docs.example.com/api/handler.ts for docs');
    expect(result).toHaveLength(0);
  });

  it('handles deep paths', () => {
    const result = extractFileRefs('packages/cli/src/engine/analyzers/patterns/confirmation.ts:847');
    expect(result).toContain('packages/cli/src/engine/analyzers/patterns/confirmation.ts');
  });

  it('handles dotted filenames like .test.ts', () => {
    const result = extractFileRefs('projectKind.test.ts has dead logic');
    expect(result).toContain('projectKind.test.ts');
    expect(result).not.toContain('test.ts');
  });

  it('handles dotted filenames with line numbers', () => {
    const result = extractFileRefs('findProjectRoot.test.ts:90-95 is a tautology');
    expect(result).toContain('findProjectRoot.test.ts');
  });

  it('handles multi-dotted filenames like .config.js', () => {
    const result = extractFileRefs('next.config.js needs updating');
    expect(result).toContain('next.config.js');
  });

  it('does not match English sentences with periods', () => {
    const result = extractFileRefs('This is wrong. The fix is elsewhere.');
    expect(result).toHaveLength(0);
  });

  it('does not match version numbers', () => {
    const result = extractFileRefs('v2.0.0 release notes');
    expect(result).toHaveLength(0);
  });
});

describe('parseBuildOpenIssues', () => {
  it('extracts numbered open issues', () => {
    const content = `## Open Issues

1. **\`extractFileRefs\` cannot parse dotted test filenames:** \`projectKind.test.ts\` is extracted as \`test.ts\` because the regex doesn't handle dots.

2. **Census dialect as sentinel entry:** Using \`orm: 'drizzle-dialect'\` is a workaround.

Verified complete by second pass.
`;
    const issues = parseBuildOpenIssues(content);
    expect(issues).toHaveLength(2);
    expect(issues[0]!.summary).toContain('extractFileRefs');
    expect(issues[0]!.file).toBe('projectKind.test.ts');
    expect(issues[1]!.summary).toContain('Census dialect');
  });

  it('extracts bulleted open issues', () => {
    const content = `## Open Issues

- **agents.test.ts fixture modification:** Added \`.ana/\` directory creation to the helper.
- **\`slugDir2\` still exists in \`saveArtifact\`:** The rename is cosmetic.

Verified complete by second pass.
`;
    const issues = parseBuildOpenIssues(content);
    expect(issues).toHaveLength(2);
    expect(issues[0]!.file).toBe('agents.test.ts');
  });

  it('returns empty array when section says None', () => {
    const content = `## Open Issues

None — verified by second pass.
`;
    const issues = parseBuildOpenIssues(content);
    expect(issues).toHaveLength(0);
  });

  it('returns empty array when section is missing', () => {
    const content = `## Test Results

Tests passed.
`;
    const issues = parseBuildOpenIssues(content);
    expect(issues).toHaveLength(0);
  });

  it('extracts file references from issue text', () => {
    const content = `## Open Issues

1. **A017 coverage is partial:** The null-null modelCount sort branch at \`scanProject.test.ts:549\` is not exercised.
`;
    const issues = parseBuildOpenIssues(content);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.file).toBe('scanProject.test.ts');
  });
});

describe('resolveFindingPaths', () => {
  let tempDir: string;

  const modules = [
    'packages/cli/src/engine/census.ts',
    'packages/cli/src/engine/scan-engine.ts',
    'packages/cli/src/utils/proofSummary.ts',
  ];

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'resolve-paths-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A001, A002, A007
  it('resolves single-match basename to full path', () => {
    const items = [{ file: 'census.ts' }];
    resolveFindingPaths(items, modules, tempDir);
    expect(items[0]!.file).toBe('packages/cli/src/engine/census.ts');
  });

  // @ana A004
  it('keeps basename when no modules match', () => {
    const items = [{ file: 'unknown.ts' }];
    resolveFindingPaths(items, modules, tempDir);
    expect(items[0]!.file).toBe('unknown.ts');
  });

  // @ana A003
  it('keeps basename when multiple modules match', () => {
    const dupeModules = [
      'packages/cli/src/a/index.ts',
      'packages/cli/src/b/index.ts',
    ];
    const items = [{ file: 'index.ts' }];
    resolveFindingPaths(items, dupeModules, tempDir);
    expect(items[0]!.file).toBe('index.ts');
  });

  // @ana A013
  it('skips resolution for files that exist at declared path', async () => {
    await fs.promises.mkdir(path.join(tempDir, 'src', 'utils'), { recursive: true });
    await fs.promises.writeFile(path.join(tempDir, 'src', 'utils', 'proofSummary.ts'), '');

    const items = [{ file: 'src/utils/proofSummary.ts' }];
    resolveFindingPaths(items, modules, tempDir);
    expect(items[0]!.file).toBe('src/utils/proofSummary.ts');
  });

  // @ana A014
  it('resolves files with slashes that do not exist at declared path', async () => {
    // File has a slash but doesn't exist at the declared partial monorepo path
    // It should enter resolution and match via modules_touched
    const items = [{ file: 'src/utils/proofSummary.ts' }];
    // tempDir has no such file, so existsSync fails → enters resolution
    // But modules don't end with '/src/utils/proofSummary.ts' as a suffix match
    // So it stays unresolved — the point is it ENTERS the chain
    const modulesWith = ['packages/cli/src/utils/proofSummary.ts'];
    resolveFindingPaths(items, modulesWith, tempDir);
    // The suffix match: module.endsWith('/src/utils/proofSummary.ts') → true
    expect(items[0]!.file).toBe('packages/cli/src/utils/proofSummary.ts');
  });

  it('skips null file fields', () => {
    const items = [{ file: null }];
    resolveFindingPaths(items, modules, tempDir);
    expect(items[0]!.file).toBeNull();
  });

  // @ana A006
  it('resolves build concern file paths', () => {
    const concerns = [{ file: 'scan-engine.ts', summary: 'some concern' }];
    resolveFindingPaths(concerns, modules, tempDir);
    expect(concerns[0]!.file).toBe('packages/cli/src/engine/scan-engine.ts');
  });

  it('handles empty modules_touched array', () => {
    const items = [{ file: 'census.ts' }];
    resolveFindingPaths(items, [], tempDir);
    expect(items[0]!.file).toBe('census.ts');
  });

  // @ana A008
  it('uses path-boundary checking to prevent false matches', () => {
    const boundaryModules = ['packages/cli/src/subroute.ts'];
    const items = [{ file: 'route.ts' }];
    resolveFindingPaths(items, boundaryModules, tempDir);
    expect(items[0]!.file).toBe('route.ts');
  });

  // @ana A015
  it('resolves single-match basename to full path via glob', async () => {
    await fs.promises.mkdir(path.join(tempDir, 'packages', 'cli', 'src', 'engine'), { recursive: true });
    await fs.promises.writeFile(path.join(tempDir, 'packages', 'cli', 'src', 'engine', 'census.ts'), '');

    const items = [{ file: 'census.ts' }];
    resolveFindingPaths(items, [], tempDir);
    expect(items[0]!.file).toBe('packages/cli/src/engine/census.ts');
  });

  describe('glob fallback', () => {
    // @ana A014
    it('resolves basename via glob when modules_touched fails', async () => {
      await fs.promises.mkdir(path.join(tempDir, 'src', 'utils'), { recursive: true });
      await fs.promises.writeFile(path.join(tempDir, 'src', 'utils', 'helper.ts'), '');

      const items = [{ file: 'helper.ts' }];
      resolveFindingPaths(items, [], tempDir);
      expect(items[0]!.file).toBe('src/utils/helper.ts');
    });

    // @ana A015
    it('skips ambiguous basename with 2+ glob matches', async () => {
      await fs.promises.mkdir(path.join(tempDir, 'src', 'a'), { recursive: true });
      await fs.promises.mkdir(path.join(tempDir, 'src', 'b'), { recursive: true });
      await fs.promises.writeFile(path.join(tempDir, 'src', 'a', 'index.ts'), '');
      await fs.promises.writeFile(path.join(tempDir, 'src', 'b', 'index.ts'), '');

      const items = [{ file: 'index.ts' }];
      resolveFindingPaths(items, [], tempDir);
      expect(items[0]!.file).toBe('index.ts');
    });

    // @ana A016
    it('ignores node_modules matches', async () => {
      await fs.promises.mkdir(path.join(tempDir, 'node_modules', 'pkg'), { recursive: true });
      await fs.promises.writeFile(path.join(tempDir, 'node_modules', 'pkg', 'helper.ts'), '');

      const items = [{ file: 'helper.ts' }];
      resolveFindingPaths(items, [], tempDir);
      expect(items[0]!.file).toBe('helper.ts');
    });

    // @ana A017
    it('ignores .ana matches', async () => {
      await fs.promises.mkdir(path.join(tempDir, '.ana', 'plans'), { recursive: true });
      await fs.promises.writeFile(path.join(tempDir, '.ana', 'plans', 'spec.md'), '');

      const items = [{ file: 'spec.md' }];
      resolveFindingPaths(items, [], tempDir);
      expect(items[0]!.file).toBe('spec.md');
    });
  });

  describe('glob cache', () => {
    // @ana A010
    it('reuses cached glob results across multiple calls', async () => {
      await fs.promises.mkdir(path.join(tempDir, 'src', 'utils'), { recursive: true });
      await fs.promises.writeFile(path.join(tempDir, 'src', 'utils', 'helper.ts'), '');

      const spy = vi.spyOn(glob, 'globSync');

      const sharedCache = new Map<string, string[]>();
      const items1 = [{ file: 'helper.ts' }];
      const items2 = [{ file: 'helper.ts' }];

      resolveFindingPaths(items1, [], tempDir, sharedCache);
      resolveFindingPaths(items2, [], tempDir, sharedCache);

      expect(items1[0]!.file).toBe('src/utils/helper.ts');
      expect(items2[0]!.file).toBe('src/utils/helper.ts');
      // Cache should have stored the result from the first call
      expect(sharedCache.get('helper.ts')).toEqual(['src/utils/helper.ts']);
      // globSync called once for first lookup, second lookup hits cache
      expect(spy).toHaveBeenCalledTimes(1);

      spy.mockRestore();
    });

    // @ana A011
    it('resolves paths correctly without explicit cache parameter', async () => {
      await fs.promises.mkdir(path.join(tempDir, 'src', 'utils'), { recursive: true });
      await fs.promises.writeFile(path.join(tempDir, 'src', 'utils', 'helper.ts'), '');

      const items = [{ file: 'helper.ts' }];
      resolveFindingPaths(items, [], tempDir);
      expect(items[0]!.file).toBe('src/utils/helper.ts');
    });
  });
});

describe('getProofContext', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'proof-context-test-'));
    await fs.promises.mkdir(path.join(tempDir, '.ana'), { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  function writeChain(entries: unknown[]): void {
    fs.writeFileSync(
      path.join(tempDir, '.ana', 'proof_chain.json'),
      JSON.stringify({ entries }, null, 2),
    );
  }

  const baseEntry = {
    feature: 'Fix Drizzle schema detection',
    completed_at: '2026-04-24T10:00:00Z',
    modules_touched: ['packages/cli/src/engine/census.ts', 'packages/cli/src/engine/scan-engine.ts'],
    findings: [
      { id: 'drizzle-C1', category: 'code', summary: 'drizzle-dialect overloads SchemaFileEntry semantics', file: 'packages/cli/src/engine/census.ts', anchor: 'census.ts:267-274' },
      { id: 'drizzle-C2', category: 'code', summary: 'Config regex can match comments', file: 'packages/cli/src/engine/census.ts', anchor: 'census.ts:251' },
    ],
    build_concerns: [
      { summary: 'Census dialect as sentinel entry', file: 'packages/cli/src/engine/census.ts' },
    ],
  };

  // @ana A009, A010, A017, A007
  it('returns findings for queried file (full path match)', () => {
    writeChain([baseEntry]);
    const results = getProofContext(['packages/cli/src/engine/census.ts'], tempDir);
    expect(results).toHaveLength(1);
    expect(results[0]!.findings.length).toBe(2);
    expect(results[0]!.findings[0]!.from).toBe('Fix Drizzle schema detection');
    expect(results[0]!.findings[0]!.category).toBe('code');
    expect(results[0]!.findings[0]!.summary).toContain('drizzle-dialect');
  });

  // @ana A018, A008
  it('matches basename query to full-path finding (path suffix)', () => {
    writeChain([baseEntry]);
    const results = getProofContext(['census.ts'], tempDir);
    expect(results[0]!.findings.length).toBe(2);
    expect(results[0]!.findings[0]!.file).toBe('packages/cli/src/engine/census.ts');
  });

  // @ana A019, A009
  it('matches full-path query to basename finding (legacy)', () => {
    const legacyEntry = {
      ...baseEntry,
      findings: [
        { id: 'legacy-C1', category: 'code', summary: 'Old issue', file: 'census.ts', anchor: null },
      ],
    };
    writeChain([legacyEntry]);
    const results = getProofContext(['packages/cli/src/engine/census.ts'], tempDir);
    expect(results[0]!.findings.length).toBe(1);
    expect(results[0]!.findings[0]!.file).toBe('census.ts');
  });

  it('matches basename query to basename finding (legacy)', () => {
    const legacyEntry = {
      ...baseEntry,
      findings: [
        { id: 'legacy-C2', category: 'test', summary: 'Legacy test issue', file: 'census.ts', anchor: null },
      ],
    };
    writeChain([legacyEntry]);
    const results = getProofContext(['census.ts'], tempDir);
    expect(results[0]!.findings.length).toBeGreaterThan(0);
  });

  // @ana A020
  it('path-boundary prevents false positive matches', () => {
    const entry = {
      ...baseEntry,
      findings: [
        { id: 'boundary-C1', category: 'code', summary: 'Issue in subroute', file: 'packages/cli/src/subroute.ts', anchor: null },
      ],
    };
    writeChain([entry]);
    const results = getProofContext(['route.ts'], tempDir);
    expect(results[0]!.findings.length).toBe(0);
  });

  // @ana A023
  it('does not match null-file findings', () => {
    const entry = {
      ...baseEntry,
      findings: [
        { id: 'null-C1', category: 'upstream', summary: 'Ambient observation', file: null, anchor: null },
      ],
    };
    writeChain([entry]);
    const results = getProofContext(['anything.ts'], tempDir);
    expect(results[0]!.findings.length).toBe(0);
  });

  it('includes build concerns in results', () => {
    writeChain([baseEntry]);
    const results = getProofContext(['packages/cli/src/engine/census.ts'], tempDir);
    expect(results[0]!.build_concerns.length).toBeGreaterThan(0);
    expect(results[0]!.build_concerns[0]!.summary).toContain('Census dialect');
    expect(results[0]!.build_concerns[0]!.from).toBe('Fix Drizzle schema detection');
  });

  it('returns empty result for file with no findings', () => {
    writeChain([baseEntry]);
    const results = getProofContext(['unknown-file.ts'], tempDir);
    expect(results[0]!.findings).toHaveLength(0);
    expect(results[0]!.build_concerns).toHaveLength(0);
    expect(results[0]!.touch_count).toBe(0);
    expect(results[0]!.last_touched).toBeNull();
  });

  it('returns empty results when proof_chain.json does not exist', () => {
    // Don't write chain file
    const results = getProofContext(['census.ts'], tempDir);
    expect(results[0]!.findings).toHaveLength(0);
    expect(results[0]!.touch_count).toBe(0);
    expect(results[0]!.last_touched).toBeNull();
  });

  // @ana A024
  it('returns results for multiple queried files', () => {
    writeChain([baseEntry]);
    const results = getProofContext(['census.ts', 'scan-engine.ts'], tempDir);
    expect(results).toHaveLength(2);
    expect(results[0]!.query).toBe('census.ts');
    expect(results[1]!.query).toBe('scan-engine.ts');
    expect(results[0]!.findings.length).toBeGreaterThan(0);
  });

  // @ana A021
  it('returns touch count per file', () => {
    const entry2 = {
      feature: 'Fix Prisma detection',
      completed_at: '2026-04-23T10:00:00Z',
      findings: [
        { id: 'prisma-C1', category: 'code', summary: 'Non-recursive check', file: 'packages/cli/src/engine/census.ts', anchor: null },
      ],
    };
    writeChain([baseEntry, entry2]);
    const results = getProofContext(['census.ts'], tempDir);
    expect(results[0]!.touch_count).toBeGreaterThan(0);
    expect(results[0]!.touch_count).toBe(2);
  });

  // @ana A022
  it('returns last touched date', () => {
    const entry2 = {
      feature: 'Fix Prisma detection',
      completed_at: '2026-04-23T10:00:00Z',
      findings: [
        { id: 'prisma-C1', category: 'code', summary: 'Non-recursive check', file: 'packages/cli/src/engine/census.ts', anchor: null },
      ],
    };
    writeChain([entry2, baseEntry]); // baseEntry is newer (2026-04-24)
    const results = getProofContext(['census.ts'], tempDir);
    expect(results[0]!.last_touched).toBeDefined();
    expect(results[0]!.last_touched).toBe('2026-04-24T10:00:00Z');
  });

  // @ana A016
  it('getProofContext has no CLI dependencies', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/utils/proofSummary.ts'),
      'utf-8',
    );
    expect(source).not.toContain("from 'chalk");
    expect(source).not.toContain("from 'commander");
  });

  it('handles entries without completed_at gracefully', () => {
    const undatedEntry = {
      feature: 'Old feature',
      findings: [
        { id: 'old-C1', category: 'code', summary: 'Old issue', file: 'census.ts', anchor: null },
      ],
    };
    writeChain([undatedEntry]);
    const results = getProofContext(['census.ts'], tempDir);
    expect(results[0]!.findings.length).toBeGreaterThan(0);
    // Undated entries don't contribute to touch_count
    expect(results[0]!.touch_count).toBe(0);
    expect(results[0]!.last_touched).toBeNull();
  });

  // @ana A019
  it('excludes closed findings by default', () => {
    const entry = {
      feature: 'Test',
      completed_at: '2026-04-24T10:00:00Z',
      findings: [
        { id: 'c1', category: 'code', summary: 'Active issue', file: 'packages/cli/src/engine/census.ts', anchor: null, status: 'active' },
        { id: 'c2', category: 'code', summary: 'Closed issue', file: 'packages/cli/src/engine/census.ts', anchor: null, status: 'closed' },
      ],
    };
    writeChain([entry]);
    const results = getProofContext(['census.ts'], tempDir);
    expect(results[0]!.findings).toHaveLength(1);
    expect(results[0]!.findings[0]!.summary).toBe('Active issue');
  });

  // @ana A020
  it('returns all findings with includeAll option', () => {
    const entry = {
      feature: 'Test',
      completed_at: '2026-04-24T10:00:00Z',
      findings: [
        { id: 'c1', category: 'code', summary: 'Active issue', file: 'packages/cli/src/engine/census.ts', anchor: null, status: 'active' },
        { id: 'c2', category: 'code', summary: 'Closed issue', file: 'packages/cli/src/engine/census.ts', anchor: null, status: 'closed' },
      ],
    };
    writeChain([entry]);
    const results = getProofContext(['census.ts'], tempDir, { includeAll: true });
    expect(results[0]!.findings).toHaveLength(2);
  });

  // @ana A021
  it('includes status field in returned findings', () => {
    const entry = {
      feature: 'Test',
      completed_at: '2026-04-24T10:00:00Z',
      findings: [
        { id: 'c1', category: 'code', summary: 'Issue', file: 'packages/cli/src/engine/census.ts', anchor: null, status: 'active' },
      ],
    };
    writeChain([entry]);
    const results = getProofContext(['census.ts'], tempDir);
    expect(results[0]!.findings[0]!.status).toBe('active');
  });

  // @ana A009
  it('rejects same-basename different-directory paths (false positive fix)', () => {
    const entry = {
      ...baseEntry,
      findings: [
        { id: 'fp-C1', category: 'code', summary: 'Issue in package a', file: 'packages/a/census.ts', anchor: null },
      ],
    };
    writeChain([entry]);
    const results = getProofContext(['packages/b/census.ts'], tempDir);
    expect(results[0]!.findings).toHaveLength(0);
  });

  // @ana A010
  it('matches when one path is a suffix of the other (both have dirs)', () => {
    const entry = {
      ...baseEntry,
      findings: [
        { id: 'suffix-C1', category: 'code', summary: 'Issue in engine', file: 'engine/census.ts', anchor: null },
      ],
    };
    writeChain([entry]);
    const results = getProofContext(['packages/cli/src/engine/census.ts'], tempDir);
    expect(results[0]!.findings.length).toBeGreaterThan(0);
  });

  // @ana A011
  it('matches bare basename query against full stored path (backward compat)', () => {
    const entry = {
      ...baseEntry,
      findings: [
        { id: 'bare-C1', category: 'code', summary: 'Issue', file: 'packages/b/census.ts', anchor: null },
      ],
    };
    writeChain([entry]);
    const results = getProofContext(['census.ts'], tempDir);
    expect(results[0]!.findings.length).toBeGreaterThan(0);
  });

  // @ana A012
  it('matches full query against bare stored path (legacy data compat)', () => {
    const entry = {
      ...baseEntry,
      findings: [
        { id: 'legacy-C3', category: 'code', summary: 'Old legacy issue', file: 'census.ts', anchor: null },
      ],
    };
    writeChain([entry]);
    const results = getProofContext(['packages/cli/src/engine/census.ts'], tempDir);
    expect(results[0]!.findings.length).toBeGreaterThan(0);
  });

  it('matches exact paths with directories (both dirs, exact)', () => {
    const entry = {
      ...baseEntry,
      findings: [
        { id: 'exact-C1', category: 'code', summary: 'Exact match', file: 'packages/cli/src/engine/census.ts', anchor: null },
      ],
    };
    writeChain([entry]);
    const results = getProofContext(['packages/cli/src/engine/census.ts'], tempDir);
    expect(results[0]!.findings.length).toBeGreaterThan(0);
  });
});

// @ana A022, A023
describe('extractScopeSummary', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'scope-summary-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('extracts first paragraph from Intent section', () => {
    const scopePath = path.join(tempDir, 'scope.md');
    fs.writeFileSync(scopePath, '# Scope\n\n## Intent\nThis is the intent paragraph text.\n\n## Other section\n');
    const result = extractScopeSummary(scopePath);
    expect(result).toBe('This is the intent paragraph text.');
  });

  it('returns undefined when scope.md does not exist', () => {
    const result = extractScopeSummary(path.join(tempDir, 'nonexistent.md'));
    expect(result).toBeUndefined();
  });

  it('returns undefined when scope.md has no Intent section', () => {
    const scopePath = path.join(tempDir, 'scope.md');
    fs.writeFileSync(scopePath, '# Scope\n\n## Background\nSome background.\n');
    const result = extractScopeSummary(scopePath);
    expect(result).toBeUndefined();
  });

  it('returns undefined when Intent section is empty', () => {
    const scopePath = path.join(tempDir, 'scope.md');
    fs.writeFileSync(scopePath, '# Scope\n\n## Intent\n\n## Other section\n');
    const result = extractScopeSummary(scopePath);
    expect(result).toBeUndefined();
  });
});

// @ana A025, A026, A027, A028
describe('generateDashboard', () => {
  it('contains summary line with run count and status counts', () => {
    const entries = [{ slug: 'feat-1', feature: 'Feature 1', completed_at: '2026-04-01T00:00:00Z', findings: [] }];
    const md = generateDashboard(entries, { runs: 1, active: 0, lessons: 0, promoted: 0, closed: 0 });
    expect(md).toContain('# Proof Chain Dashboard');
    expect(md).toContain('1 runs');
    expect(md).toContain('0 active');
  });

  it('lists hot modules with 2+ entries', () => {
    const entries = [
      {
        slug: 'feat-1', feature: 'Feature 1', completed_at: '2026-04-01T00:00:00Z',
        findings: [{ id: 'c1', category: 'code', summary: 'Issue 1', file: 'src/foo.ts', anchor: null, status: 'active' }],
      },
      {
        slug: 'feat-2', feature: 'Feature 2', completed_at: '2026-04-02T00:00:00Z',
        findings: [{ id: 'c2', category: 'code', summary: 'Issue 2', file: 'src/foo.ts', anchor: null, status: 'active' }],
      },
    ];
    const md = generateDashboard(entries, { runs: 2, active: 2, lessons: 0, promoted: 0, closed: 0 });
    expect(md).toContain('## Hot Modules');
    expect(md).toContain('src/foo.ts');
  });

  it('shows no hot modules when all files have only 1 entry', () => {
    const entries = [{
      slug: 'feat-1', feature: 'Feature 1', completed_at: '2026-04-01T00:00:00Z',
      findings: [{ id: 'c1', category: 'code', summary: 'Issue', file: 'src/bar.ts', anchor: null, status: 'active' }],
    }];
    const md = generateDashboard(entries, { runs: 1, active: 1, lessons: 0, promoted: 0, closed: 0 });
    expect(md).toContain('*No hot modules yet.*');
  });

  it('groups active findings by file with ### headings', () => {
    const entries = [{
      slug: 'feat-1', feature: 'Feature 1', completed_at: '2026-04-01T00:00:00Z',
      findings: [
        { id: 'c1', category: 'code', summary: 'Issue in foo', file: 'src/foo.ts', anchor: null, status: 'active' },
        { id: 'c2', category: 'test', summary: 'Issue in bar', file: 'src/bar.ts', anchor: null, status: 'active' },
      ],
    }];
    const md = generateDashboard(entries, { runs: 1, active: 2, lessons: 0, promoted: 0, closed: 0 });
    expect(md).toContain('### src/bar.ts');
    expect(md).toContain('### src/foo.ts');
  });

  // @ana A015, A016
  it('caps active findings at 30', () => {
    const findings = Array.from({ length: 35 }, (_, i) => ({
      id: `c${i}`, category: 'code', summary: `Issue ${i}`, file: `file-${i}.ts`, anchor: null, status: 'active' as const,
    }));
    const entries = [{ slug: 'feat-1', feature: 'Feature 1', completed_at: '2026-04-01T00:00:00Z', findings }];
    const md = generateDashboard(entries, { runs: 1, active: 35, lessons: 0, promoted: 0, closed: 0 });
    expect(md).toContain('30 shown of 35 total');
    const findingLines = md.split('\n').filter(l => l.startsWith('- **'));
    expect(findingLines).toHaveLength(30);
    // Verify first item survived the cap (insertion order preserved)
    expect(md).toContain('file-0.ts');
    // Verify item beyond cap was dropped
    expect(md).not.toContain('file-30.ts');
  });

  it('contains promoted rules placeholder', () => {
    const entries = [{ slug: 'f', feature: 'F', completed_at: '2026-04-01T00:00:00Z', findings: [] }];
    const md = generateDashboard(entries, { runs: 1, active: 0, lessons: 0, promoted: 0, closed: 0 });
    expect(md).toContain('## Promoted Rules');
    expect(md).toContain('*No promoted rules yet.*');
  });
});

// @ana A022
describe('generateProofSummary scope_summary', () => {
  let tempDir: string;
  let slugDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'proof-scope-test-'));
    slugDir = path.join(tempDir, 'test-feature');
    await fs.promises.mkdir(slugDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('populates scope_summary from scope.md Intent section', () => {
    fs.writeFileSync(path.join(slugDir, 'scope.md'), '# Scope\n\n## Intent\nIntent paragraph text.\n\n## Other\n');
    fs.writeFileSync(path.join(slugDir, 'contract.yaml'), 'feature: "Test"\nassertions: []');
    const summary = generateProofSummary(slugDir);
    expect(summary.scope_summary).toBe('Intent paragraph text.');
  });

  it('returns undefined scope_summary when scope.md is missing', () => {
    fs.writeFileSync(path.join(slugDir, 'contract.yaml'), 'feature: "Test"\nassertions: []');
    const summary = generateProofSummary(slugDir);
    expect(summary.scope_summary).toBeUndefined();
  });
});

// @ana A015, A016
describe('generateProofSummary YAML reader', () => {
  let tempDir: string;
  let slugDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'yaml-reader-test-'));
    slugDir = path.join(tempDir, 'test-feature');
    await fs.promises.mkdir(slugDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A015, A016
  it('reads findings from verify_data.yaml with new fields', () => {
    fs.writeFileSync(path.join(slugDir, 'verify_report.md'), `# Verify Report

**Result:** PASS

## Findings

- **Code — Some issue:** details
`);
    fs.writeFileSync(path.join(slugDir, 'verify_data.yaml'), `schema: 1
findings:
  - category: code
    summary: "Structured finding from YAML"
    file: "src/test.ts"
    line: 42
    severity: observation
    suggested_action: monitor
    related_assertions: ["A001", "A002"]
`);

    const summary = generateProofSummary(slugDir);
    expect(summary.findings.length).toBeGreaterThan(0);
    expect(summary.findings[0]!.summary).toBe('Structured finding from YAML');
    expect(summary.findings[0]!.severity).toBe('observation');
    expect(summary.findings[0]!.suggested_action).toBe('monitor');
    expect(summary.findings[0]!.line).toBe(42);
    expect(summary.findings[0]!.related_assertions).toEqual(['A001', 'A002']);
  });

  // @ana A017, A018
  it('falls back to parseFindings when verify_data.yaml absent', () => {
    fs.writeFileSync(path.join(slugDir, 'verify_report.md'), `# Verify Report

**Result:** PASS

## Findings

- **Code — Regex-parsed finding:** Description of the finding.
`);
    // No verify_data.yaml

    const summary = generateProofSummary(slugDir);
    expect(summary.findings.length).toBeGreaterThan(0);
    expect(summary.findings[0]!.summary).toContain('Regex-parsed finding');
    expect(summary.findings[0]!.severity).toBeUndefined();
    expect(summary.findings[0]!.line).toBeUndefined();
    expect(summary.findings[0]!.related_assertions).toBeUndefined();
  });

  // @ana A016b
  it('reads concern severity and suggested_action from build_data.yaml', () => {
    fs.writeFileSync(path.join(slugDir, 'build_report.md'), `# Build Report

## Deviations
None.

## Open Issues
1. **Classified concern:** Details.
`);
    fs.writeFileSync(path.join(slugDir, 'build_data.yaml'), `schema: 1
concerns:
  - summary: "Classified concern"
    file: "src/test.ts"
    severity: debt
    suggested_action: scope
`);

    const summary = generateProofSummary(slugDir);
    expect(summary.build_concerns.length).toBeGreaterThan(0);
    expect(summary.build_concerns[0]!.severity).toBe('debt');
    expect(summary.build_concerns[0]!.suggested_action).toBe('scope');
  });

  // @ana A019
  it('reads concerns from build_data.yaml', () => {
    fs.writeFileSync(path.join(slugDir, 'build_report.md'), `# Build Report

## Deviations
None.

## Open Issues
1. **Some issue:** Details.
`);
    fs.writeFileSync(path.join(slugDir, 'build_data.yaml'), `schema: 1
concerns:
  - summary: "Structured concern from YAML"
    file: "src/test.ts"
`);

    const summary = generateProofSummary(slugDir);
    expect(summary.build_concerns.length).toBeGreaterThan(0);
    expect(summary.build_concerns[0]!.summary).toBe('Structured concern from YAML');
    expect(summary.build_concerns[0]!.file).toBe('src/test.ts');
  });

  it('falls back to parseBuildOpenIssues when build_data.yaml absent', () => {
    fs.writeFileSync(path.join(slugDir, 'build_report.md'), `# Build Report

## Deviations
None.

## Open Issues
1. **Regex-parsed issue:** Details here.
`);
    // No build_data.yaml

    const summary = generateProofSummary(slugDir);
    expect(summary.build_concerns.length).toBeGreaterThan(0);
    expect(summary.build_concerns[0]!.summary).toContain('Regex-parsed issue');
  });

  it('discovers numbered verify_data_1.yaml alongside verify_report_1.md', () => {
    fs.writeFileSync(path.join(slugDir, 'verify_report_1.md'), `# Verify Report

**Result:** PASS

## Findings

- **Code — Fallback:** Should not appear
`);
    fs.writeFileSync(path.join(slugDir, 'verify_data_1.yaml'), `schema: 1
findings:
  - category: code
    summary: "Numbered companion finding"
`);

    const summary = generateProofSummary(slugDir);
    expect(summary.findings.length).toBeGreaterThan(0);
    expect(summary.findings[0]!.summary).toBe('Numbered companion finding');
  });
});

// @ana A026, A027
describe('parseFindings backward compat', () => {
  it('parses findings with ## Findings heading', () => {
    const content = `## Findings

- **Code — New heading test:** This uses the new heading.
`;
    const findings = parseFindings(content);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.summary).toContain('New heading test');
  });

});

// @ana A020, A021
describe('getProofContext new fields', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'context-fields-test-'));
    await fs.promises.mkdir(path.join(tempDir, '.ana'), { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('getProofContext returns line, severity, related_assertions', () => {
    const chain = {
      entries: [{
        feature: 'Test Feature',
        completed_at: '2026-04-28T10:00:00Z',
        findings: [{
          id: 'test-C1',
          category: 'code',
          summary: 'Issue with new fields',
          file: 'packages/cli/src/test.ts',
          anchor: null,
          line: 42,
          severity: 'observation',
          related_assertions: ['A001', 'A003'],
          status: 'active',
        }],
      }],
    };
    fs.writeFileSync(
      path.join(tempDir, '.ana', 'proof_chain.json'),
      JSON.stringify(chain, null, 2),
    );

    const results = getProofContext(['packages/cli/src/test.ts'], tempDir);
    expect(results[0]!.findings.length).toBe(1);
    expect(results[0]!.findings[0]!.severity).toBe('observation');
    expect(results[0]!.findings[0]!.line).toBe(42);
    expect(results[0]!.findings[0]!.related_assertions).toEqual(['A001', 'A003']);
  });

  // @ana A017
  it('getProofContext returns suggested_action when present', () => {
    const chain = {
      entries: [{
        feature: 'Test Feature',
        completed_at: '2026-04-28T10:00:00Z',
        findings: [{
          id: 'test-C2',
          category: 'code',
          summary: 'Issue with suggested action',
          file: 'packages/cli/src/test.ts',
          anchor: null,
          severity: 'risk',
          suggested_action: 'scope',
          status: 'active',
        }],
      }],
    };
    fs.writeFileSync(
      path.join(tempDir, '.ana', 'proof_chain.json'),
      JSON.stringify(chain, null, 2),
    );

    const results = getProofContext(['packages/cli/src/test.ts'], tempDir);
    expect(results[0]!.findings.length).toBe(1);
    expect(results[0]!.findings[0]!.suggested_action).toBe('scope');
  });

  // @ana A018
  it('getProofContext omits suggested_action when absent', () => {
    const chain = {
      entries: [{
        feature: 'Old Feature',
        completed_at: '2026-04-28T10:00:00Z',
        findings: [{
          id: 'old-C2',
          category: 'code',
          summary: 'Old-style finding without action',
          file: 'packages/cli/src/test.ts',
          anchor: null,
          status: 'active',
        }],
      }],
    };
    fs.writeFileSync(
      path.join(tempDir, '.ana', 'proof_chain.json'),
      JSON.stringify(chain, null, 2),
    );

    const results = getProofContext(['packages/cli/src/test.ts'], tempDir);
    expect(results[0]!.findings.length).toBe(1);
    expect(results[0]!.findings[0]!.suggested_action).toBeUndefined();
  });

  it('getProofContext omits new fields when not present in chain', () => {
    const chain = {
      entries: [{
        feature: 'Old Feature',
        completed_at: '2026-04-28T10:00:00Z',
        findings: [{
          id: 'old-C1',
          category: 'code',
          summary: 'Old-style finding',
          file: 'packages/cli/src/test.ts',
          anchor: null,
          status: 'active',
        }],
      }],
    };
    fs.writeFileSync(
      path.join(tempDir, '.ana', 'proof_chain.json'),
      JSON.stringify(chain, null, 2),
    );

    const results = getProofContext(['packages/cli/src/test.ts'], tempDir);
    expect(results[0]!.findings.length).toBe(1);
    expect(results[0]!.findings[0]!.severity).toBeUndefined();
    expect(results[0]!.findings[0]!.line).toBeUndefined();
    expect(results[0]!.findings[0]!.related_assertions).toBeUndefined();
  });
});

describe('findFindingById', () => {
  // @ana A011
  it('returns finding and entry when found', () => {
    const chain = {
      entries: [{
        slug: 'fix-auth',
        feature: 'Fix Auth',
        findings: [
          { id: 'F001', category: 'code', summary: 'Missing validation' },
          { id: 'F002', category: 'test', summary: 'No edge case test' },
        ],
      }],
    };
    const result = findFindingById(chain, 'F001');
    expect(result).not.toBeNull();
    expect(result!.finding.id).toBe('F001');
    expect(result!.entry.slug).toBe('fix-auth');
  });

  // @ana A012
  it('returns null for missing id', () => {
    const chain = {
      entries: [{
        slug: 'fix-auth',
        feature: 'Fix Auth',
        findings: [
          { id: 'F001', category: 'code', summary: 'Missing validation' },
        ],
      }],
    };
    const result = findFindingById(chain, 'F999');
    expect(result).toBeNull();
  });

  it('finds finding in second entry and returns correct entry', () => {
    const chain = {
      entries: [
        {
          slug: 'first',
          feature: 'First',
          findings: [{ id: 'F001', category: 'code', summary: 'First finding' }],
        },
        {
          slug: 'second',
          feature: 'Second',
          findings: [{ id: 'F002', category: 'test', summary: 'Second finding' }],
        },
      ],
    };
    const result = findFindingById(chain, 'F002');
    expect(result).not.toBeNull();
    expect(result!.finding.id).toBe('F002');
    expect(result!.entry.slug).toBe('second');
  });

  it('returns finding regardless of status (caller decides)', () => {
    const chain = {
      entries: [{
        slug: 'fix-auth',
        feature: 'Fix Auth',
        findings: [
          { id: 'F001', category: 'code', summary: 'Closed finding', status: 'closed' },
          { id: 'F002', category: 'code', summary: 'Promoted finding', status: 'promoted' },
          { id: 'F003', category: 'code', summary: 'Lesson finding', status: 'lesson' },
        ],
      }],
    };
    expect(findFindingById(chain, 'F001')).not.toBeNull();
    expect(findFindingById(chain, 'F002')).not.toBeNull();
    expect(findFindingById(chain, 'F003')).not.toBeNull();
  });

  it('handles entries with no findings array', () => {
    const chain = {
      entries: [
        { slug: 'empty', feature: 'Empty' },
        {
          slug: 'has-findings',
          feature: 'Has Findings',
          findings: [{ id: 'F001', category: 'code', summary: 'Found' }],
        },
      ],
    };
    const result = findFindingById(chain, 'F001');
    expect(result).not.toBeNull();
    expect(result!.entry.slug).toBe('has-findings');
  });

  it('handles finding with no status field (treated as active by convention)', () => {
    const chain = {
      entries: [{
        slug: 'fix-auth',
        feature: 'Fix Auth',
        findings: [
          { id: 'F001', category: 'code', summary: 'No status' },
        ],
      }],
    };
    const result = findFindingById(chain, 'F001');
    expect(result).not.toBeNull();
    expect(result!.finding['status']).toBeUndefined();
  });
});

describe('computeChainHealth', () => {
  // @ana A026
  it('returns by_severity with correct counts for mixed severity values', () => {
    const chain = {
      entries: [{
        findings: [
          { status: 'active', severity: 'risk', suggested_action: 'scope' },
          { status: 'active', severity: 'risk', suggested_action: 'promote' },
          { status: 'active', severity: 'debt', suggested_action: 'monitor' },
          { status: 'active', severity: 'observation', suggested_action: 'accept' },
        ],
      }],
    };
    const health = computeChainHealth(chain);
    expect(health.findings.by_severity).toEqual({
      risk: 2, debt: 1, observation: 1, unclassified: 0,
    });
  });

  // @ana A027
  it('returns by_action with correct counts for mixed action values', () => {
    const chain = {
      entries: [{
        findings: [
          { status: 'active', severity: 'risk', suggested_action: 'scope' },
          { status: 'active', severity: 'risk', suggested_action: 'promote' },
          { status: 'active', severity: 'debt', suggested_action: 'monitor' },
          { status: 'active', severity: 'observation', suggested_action: 'accept' },
        ],
      }],
    };
    const health = computeChainHealth(chain);
    expect(health.findings.by_action).toEqual({
      promote: 1, scope: 1, monitor: 1, accept: 1, unclassified: 0,
    });
  });

  // @ana A028
  it('counts findings without severity as unclassified', () => {
    const chain = {
      entries: [{
        findings: [
          { status: 'active', severity: 'risk' },
          { status: 'active' },
          { status: 'active' },
        ],
      }],
    };
    const health = computeChainHealth(chain);
    expect(health.findings.by_severity.unclassified).toBe(2);
    expect(health.findings.by_severity.risk).toBe(1);
  });

  // @ana A029
  it('counts findings without suggested_action as unclassified', () => {
    const chain = {
      entries: [{
        findings: [
          { status: 'active', suggested_action: 'promote' },
          { status: 'active' },
          { status: 'active' },
        ],
      }],
    };
    const health = computeChainHealth(chain);
    expect(health.findings.by_action.unclassified).toBe(2);
    expect(health.findings.by_action.promote).toBe(1);
  });

  it('returns all zeros for empty chain', () => {
    const health = computeChainHealth({ entries: [] });
    expect(health.chain_runs).toBe(0);
    expect(health.findings.total).toBe(0);
    expect(health.findings.by_severity).toEqual({
      risk: 0, debt: 0, observation: 0, unclassified: 0,
    });
    expect(health.findings.by_action).toEqual({
      promote: 0, scope: 0, monitor: 0, accept: 0, unclassified: 0,
    });
  });

  it('returns all zeros for entries with no findings', () => {
    const chain = { entries: [{ findings: [] }, {}] };
    const health = computeChainHealth(chain);
    expect(health.chain_runs).toBe(2);
    expect(health.findings.total).toBe(0);
    expect(health.findings.by_severity.unclassified).toBe(0);
    expect(health.findings.by_action.unclassified).toBe(0);
  });

  // @ana A030, A008, A009
  it('preserves existing status counts alongside new breakdowns (active-only severity/action)', () => {
    const chain = {
      entries: [{
        findings: [
          { status: 'active', severity: 'risk', suggested_action: 'scope' },
          { status: 'closed', severity: 'debt', suggested_action: 'accept' },
          { status: 'lesson', severity: 'observation', suggested_action: 'monitor' },
        ],
      }],
    };
    const health = computeChainHealth(chain);
    expect(health.findings.active).toBe(1);
    expect(health.findings.closed).toBe(1);
    expect(health.findings.lesson).toBe(1);
    expect(health.findings.total).toBe(3);
    // by_severity and by_action count active findings only
    expect(health.findings.by_severity.risk).toBe(1);
    expect(health.findings.by_severity.debt).toBe(0);
    expect(health.findings.by_severity.observation).toBe(0);
    expect(health.findings.by_action.scope).toBe(1);
    expect(health.findings.by_action.accept).toBe(0);
    expect(health.findings.by_action.monitor).toBe(0);
  });

  it('counts across multiple entries', () => {
    const chain = {
      entries: [
        { findings: [{ status: 'active', severity: 'risk', suggested_action: 'promote' }] },
        { findings: [{ status: 'active', severity: 'debt', suggested_action: 'scope' }] },
      ],
    };
    const health = computeChainHealth(chain);
    expect(health.chain_runs).toBe(2);
    expect(health.findings.total).toBe(2);
    expect(health.findings.by_severity.risk).toBe(1);
    expect(health.findings.by_severity.debt).toBe(1);
    expect(health.findings.by_action.promote).toBe(1);
    expect(health.findings.by_action.scope).toBe(1);
  });

  // @ana A010
  it('health by_severity matches audit active-only counts for same chain', () => {
    const chain = {
      entries: [{
        findings: [
          { status: 'active', severity: 'risk', suggested_action: 'promote' },
          { status: 'active', severity: 'debt', suggested_action: 'scope' },
          { status: 'closed', severity: 'risk', suggested_action: 'accept' },
          { status: 'promoted', severity: 'debt', suggested_action: 'monitor' },
          { status: 'lesson', severity: 'observation', suggested_action: 'accept' },
        ],
      }],
    };
    const health = computeChainHealth(chain);
    // by_severity should only count the 2 active findings
    expect(health.findings.by_severity).toEqual({
      risk: 1, debt: 1, observation: 0, unclassified: 0,
    });
    // by_action should only count the 2 active findings
    expect(health.findings.by_action).toEqual({
      promote: 1, scope: 1, monitor: 0, accept: 0, unclassified: 0,
    });
    // status counts still include all
    expect(health.findings.total).toBe(5);
    expect(health.findings.active).toBe(2);
    expect(health.findings.closed).toBe(1);
    expect(health.findings.promoted).toBe(1);
    expect(health.findings.lesson).toBe(1);
  });
});

describe('computeHealthReport', () => {
  // Helper to create entries with specific risk counts
  function makeEntry(risks: number, debts = 0, observations = 0, opts?: {
    slug?: string;
    file?: string;
    status?: string;
    suggested_action?: string;
    category?: string;
    promoted_to?: string;
  }): {
    slug: string;
    findings: Array<{
      id: string;
      status: string;
      severity: string;
      category: string;
      summary: string;
      file: string | null;
      suggested_action: string;
      promoted_to?: string;
    }>;
  } {
    const findings: Array<{
      id: string;
      status: string;
      severity: string;
      category: string;
      summary: string;
      file: string | null;
      suggested_action: string;
      promoted_to?: string;
    }> = [];
    const status = opts?.status || 'active';
    const action = opts?.suggested_action || 'scope';
    const category = opts?.category || 'code';
    const file = opts?.file ?? 'src/test.ts';
    let idCounter = 0;
    for (let i = 0; i < risks; i++) {
      const f: typeof findings[0] = {
        id: `F${String(++idCounter).padStart(3, '0')}`,
        status,
        severity: 'risk',
        category,
        summary: `risk finding ${i}`,
        file,
        suggested_action: action,
      };
      if (opts?.promoted_to) f.promoted_to = opts.promoted_to;
      findings.push(f);
    }
    for (let i = 0; i < debts; i++) {
      findings.push({
        id: `F${String(++idCounter).padStart(3, '0')}`,
        status,
        severity: 'debt',
        category,
        summary: `debt finding ${i}`,
        file,
        suggested_action: action,
      });
    }
    for (let i = 0; i < observations; i++) {
      findings.push({
        id: `F${String(++idCounter).padStart(3, '0')}`,
        status,
        severity: 'observation',
        category,
        summary: `observation finding ${i}`,
        file,
        suggested_action: action,
      });
    }
    return { slug: opts?.slug || 'test-slug', findings };
  }

  describe('trajectory', () => {
    // @ana A019, A020
    it('returns nulls and insufficient_data for empty chain', () => {
      const report = computeHealthReport({ entries: [] });
      expect(report.runs).toBe(0);
      expect(report.trajectory.risks_per_run_last5).toBeNull();
      expect(report.trajectory.risks_per_run_all).toBeNull();
      expect(report.trajectory.trend).toBe('insufficient_data');
      expect(report.trajectory.unclassified_count).toBe(0);
    });

    // @ana A029, A030
    it('with fewer than 5 entries last5 equals all', () => {
      const chain = {
        entries: [
          makeEntry(2), // 2 risks
          makeEntry(1), // 1 risk
        ],
      };
      const report = computeHealthReport(chain);
      expect(report.trajectory.risks_per_run_last5).toBe(1.5);
      expect(report.trajectory.risks_per_run_all).toBe(1.5);
    });

    // @ana A028
    it('with fewer than 10 entries trend reports insufficient_data', () => {
      const entries = Array.from({ length: 7 }, () => makeEntry(1));
      const report = computeHealthReport({ entries });
      expect(report.trajectory.trend).toBe('insufficient_data');
    });

    // @ana A027
    it('counts risks per entry not cumulatively', () => {
      // 2 entries, each with 2 risks → 2.0 per run, not 4
      const chain = {
        entries: [
          makeEntry(2),
          makeEntry(2),
        ],
      };
      const report = computeHealthReport(chain);
      expect(report.trajectory.risks_per_run_all).toBe(2.0);
    });

    // @ana A039
    it('trend reflects improving trajectory', () => {
      // First 5 entries: 3 risks each, last 5 entries: 1 risk each
      const entries = [
        ...Array.from({ length: 5 }, () => makeEntry(3)),
        ...Array.from({ length: 5 }, () => makeEntry(1)),
      ];
      const report = computeHealthReport({ entries });
      expect(report.trajectory.trend).toBe('improving');
    });

    it('trend reflects worsening trajectory', () => {
      const entries = [
        ...Array.from({ length: 5 }, () => makeEntry(1)),
        ...Array.from({ length: 5 }, () => makeEntry(3)),
      ];
      const report = computeHealthReport({ entries });
      expect(report.trajectory.trend).toBe('worsening');
    });

    it('trend reflects stable trajectory', () => {
      const entries = Array.from({ length: 10 }, () => makeEntry(2));
      const report = computeHealthReport({ entries });
      expect(report.trajectory.trend).toBe('stable');
    });

    // @ana A021, A022
    it('counts unclassified findings separately from trajectory', () => {
      // 2 entries: first has 1 risk + 2 unclassified, second has 1 risk + 1 unclassified
      const chain = {
        entries: [
          {
            slug: 'e1',
            findings: [
              { severity: 'risk', status: 'active', category: 'code', summary: 'r1', file: 'a.ts' },
              { status: 'active', category: 'code', summary: 'u1', file: 'b.ts' }, // no severity
              { status: 'active', category: 'code', summary: 'u2', file: 'c.ts' }, // no severity
            ],
          },
          {
            slug: 'e2',
            findings: [
              { severity: 'risk', status: 'active', category: 'code', summary: 'r2', file: 'a.ts' },
              { status: 'active', category: 'code', summary: 'u3', file: 'd.ts' }, // no severity
            ],
          },
        ],
      };
      const report = computeHealthReport(chain);
      expect(report.trajectory.unclassified_count).toBe(3);
      // risks per run: entry1 has 1 risk, entry2 has 1 risk → 1.0
      expect(report.trajectory.risks_per_run_all).toBe(1.0);
    });

    // @ana A040
    it('all unclassified reports no_classified_data', () => {
      const chain = {
        entries: [
          {
            slug: 'e1',
            findings: [
              { status: 'active', category: 'code', summary: 'u1', file: 'a.ts' },
              { status: 'active', category: 'code', summary: 'u2', file: 'b.ts' },
            ],
          },
        ],
      };
      const report = computeHealthReport(chain);
      expect(report.trajectory.trend).toBe('no_classified_data');
      expect(report.trajectory.risks_per_run_all).toBeNull();
      expect(report.trajectory.risks_per_run_last5).toBeNull();
      expect(report.trajectory.unclassified_count).toBe(2);
    });

    it('trajectory window uses last 5 entries', () => {
      // 8 entries: first 3 have 0 risks (1 observation each), last 5 have 2 risks each
      const entries = [
        ...Array.from({ length: 3 }, () => makeEntry(0, 0, 1)),
        ...Array.from({ length: 5 }, () => makeEntry(2)),
      ];
      const report = computeHealthReport({ entries });
      expect(report.trajectory.risks_per_run_last5).toBe(2.0);
      // all: (0*3 + 2*5) / 8 = 1.3
      expect(report.trajectory.risks_per_run_all).toBe(1.3);
    });
  });

  describe('hot modules', () => {
    // @ana A033
    it('detects hot module at threshold', () => {
      // 3 findings from 2 entries on same file
      const chain = {
        entries: [
          makeEntry(2, 0, 0, { file: 'src/hot.ts', slug: 'e1' }),
          makeEntry(1, 0, 0, { file: 'src/hot.ts', slug: 'e2' }),
        ],
      };
      const report = computeHealthReport(chain);
      expect(report.hot_modules.length).toBeGreaterThan(0);
      expect(report.hot_modules[0]!.file).toBe('src/hot.ts');
      expect(report.hot_modules[0]!.finding_count).toBe(3);
      expect(report.hot_modules[0]!.entry_count).toBe(2);
    });

    // @ana A034
    it('excludes modules below threshold', () => {
      // 2 findings from 1 entry — below both thresholds
      const chain = {
        entries: [
          makeEntry(2, 0, 0, { file: 'src/cold.ts' }),
        ],
      };
      const report = computeHealthReport(chain);
      expect(report.hot_modules.length).toBe(0);
    });

    // @ana A036
    it('hot module shows severity breakdown', () => {
      const chain = {
        entries: [
          makeEntry(1, 1, 0, { file: 'src/mixed.ts', slug: 'e1' }),
          makeEntry(1, 0, 1, { file: 'src/mixed.ts', slug: 'e2' }),
        ],
      };
      // 1 risk + 1 debt + 1 risk + 1 observation = 4 findings, 2 entries
      const report = computeHealthReport(chain);
      expect(report.hot_modules.length).toBeGreaterThan(0);
      const mod = report.hot_modules[0]!;
      expect(mod.by_severity).toBeDefined();
      expect(mod.by_severity.risk).toBe(2);
      expect(mod.by_severity.debt).toBe(1);
      expect(mod.by_severity.observation).toBe(1);
    });

    it('only counts active findings for hot modules', () => {
      const chain = {
        entries: [
          {
            slug: 'e1',
            findings: [
              { id: 'F001', status: 'active', severity: 'risk', category: 'code', file: 'src/a.ts', summary: 'r1', suggested_action: 'scope' },
              { id: 'F002', status: 'closed', severity: 'risk', category: 'code', file: 'src/a.ts', summary: 'r2', suggested_action: 'scope' },
              { id: 'F003', status: 'active', severity: 'debt', category: 'code', file: 'src/a.ts', summary: 'd1', suggested_action: 'scope' },
            ],
          },
          {
            slug: 'e2',
            findings: [
              { id: 'F004', status: 'active', severity: 'risk', category: 'code', file: 'src/a.ts', summary: 'r3', suggested_action: 'scope' },
            ],
          },
        ],
      };
      const report = computeHealthReport(chain);
      // 3 active findings from 2 entries → hot
      expect(report.hot_modules.length).toBe(1);
      expect(report.hot_modules[0]!.finding_count).toBe(3);
    });

    it('caps hot modules at 5, sorted by count', () => {
      const entries = [];
      for (let i = 0; i < 7; i++) {
        entries.push(makeEntry(3 + i, 0, 0, { file: `src/mod${i}.ts`, slug: `e1-${i}` }));
        entries.push(makeEntry(1, 0, 0, { file: `src/mod${i}.ts`, slug: `e2-${i}` }));
      }
      const report = computeHealthReport({ entries });
      expect(report.hot_modules.length).toBeLessThanOrEqual(5);
      // Verify sorted descending
      for (let i = 1; i < report.hot_modules.length; i++) {
        expect(report.hot_modules[i]!.finding_count).toBeLessThanOrEqual(report.hot_modules[i - 1]!.finding_count);
      }
    });

    it('skips findings without file', () => {
      const chain = {
        entries: [
          {
            slug: 'e1',
            findings: [
              { id: 'F001', status: 'active', severity: 'risk', category: 'code', file: null, summary: 'r1', suggested_action: 'scope' },
              { id: 'F002', status: 'active', severity: 'risk', category: 'code', file: null, summary: 'r2', suggested_action: 'scope' },
              { id: 'F003', status: 'active', severity: 'risk', category: 'code', file: null, summary: 'r3', suggested_action: 'scope' },
            ],
          },
          {
            slug: 'e2',
            findings: [
              { id: 'F004', status: 'active', severity: 'risk', category: 'code', file: null, summary: 'r4', suggested_action: 'scope' },
            ],
          },
        ],
      };
      const report = computeHealthReport(chain);
      expect(report.hot_modules.length).toBe(0);
    });
  });

  describe('promotion candidates', () => {
    it('includes findings with suggested_action promote', () => {
      const chain = {
        entries: [{
          slug: 'e1',
          findings: [
            { id: 'F042', status: 'active', severity: 'risk', category: 'code', summary: 'Promote me', file: 'src/a.ts', suggested_action: 'promote' },
          ],
        }],
      };
      const report = computeHealthReport(chain);
      expect(report.promotion_candidates.length).toBe(1);
      expect(report.promotion_candidates[0]!.id).toBe('F042');
      expect(report.promotion_candidates[0]!.suggested_action).toBe('promote');
    });

    // @ana A038
    it('includes recurring scope findings from multiple entries', () => {
      const chain = {
        entries: [
          {
            slug: 'e1',
            findings: [
              { id: 'F001', status: 'active', severity: 'debt', category: 'code', summary: 'Recurring scope', file: 'src/a.ts', suggested_action: 'scope' },
            ],
          },
          {
            slug: 'e2',
            findings: [
              { id: 'F002', status: 'active', severity: 'debt', category: 'code', summary: 'Recurring scope v2', file: 'src/a.ts', suggested_action: 'scope' },
            ],
          },
        ],
      };
      const report = computeHealthReport(chain);
      const scopeCandidates = report.promotion_candidates.filter(c => c.suggested_action === 'scope');
      expect(scopeCandidates.length).toBeGreaterThan(0);
      expect(scopeCandidates[0]!.recurrence_count).toBe(2);
    });

    it('does not include single-occurrence scope findings', () => {
      const chain = {
        entries: [{
          slug: 'e1',
          findings: [
            { id: 'F001', status: 'active', severity: 'debt', category: 'code', summary: 'One-off scope', file: 'src/a.ts', suggested_action: 'scope' },
          ],
        }],
      };
      const report = computeHealthReport(chain);
      expect(report.promotion_candidates.length).toBe(0);
    });

    // @ana A025
    it('returns empty promotions when no findings have been promoted', () => {
      const chain = {
        entries: [makeEntry(2)],
      };
      const report = computeHealthReport(chain);
      expect(report.promotions).toEqual([]);
    });
  });

  describe('promotion effectiveness', () => {
    // @ana A023
    it('shows tracking status for promotions with < 5 subsequent entries', () => {
      const chain = {
        entries: [
          {
            slug: 'e1',
            findings: [
              { id: 'F001', status: 'promoted', severity: 'risk', category: 'code', summary: 'Promoted finding', file: 'src/a.ts', suggested_action: 'promote', promoted_to: 'rule-1' },
            ],
          },
          makeEntry(0, 0, 0, { slug: 'e2' }),
          makeEntry(0, 0, 0, { slug: 'e3' }),
        ],
      };
      const report = computeHealthReport(chain);
      expect(report.promotions.length).toBe(1);
      expect(report.promotions[0]!.status).toBe('tracking');
      expect(report.promotions[0]!.reduction_pct).toBeNull();
    });

    // @ana A024
    it('computes reduction percentage for mature promotions', () => {
      const chain = {
        entries: [
          {
            slug: 'e1',
            findings: [
              { id: 'F001', status: 'promoted', severity: 'risk', category: 'code', summary: 'Promoted finding', file: 'src/a.ts', suggested_action: 'promote', promoted_to: 'rule-1' },
            ],
          },
          // 5 subsequent entries with no matching findings = 100% reduction
          ...Array.from({ length: 5 }, (_, i) => makeEntry(0, 0, 0, { slug: `e${i + 2}`, file: 'src/b.ts' })),
        ],
      };
      const report = computeHealthReport(chain);
      expect(report.promotions.length).toBe(1);
      expect(report.promotions[0]!.status).toBe('effective');
      expect(report.promotions[0]!.reduction_pct).toBe(100);
    });

    // @ana A037
    it('matches by severity plus category plus file', () => {
      const chain = {
        entries: [
          {
            slug: 'e1',
            findings: [
              { id: 'F001', status: 'promoted', severity: 'risk', category: 'code', summary: 'Promoted', file: 'src/a.ts', suggested_action: 'promote', promoted_to: 'rule-1' },
            ],
          },
          // 5 subsequent entries with matching severity+category+file
          ...Array.from({ length: 5 }, (_, i) => ({
            slug: `e${i + 2}`,
            findings: [
              { id: `F${i + 10}`, status: 'active', severity: 'risk', category: 'code', summary: 'match', file: 'src/a.ts', suggested_action: 'scope' },
            ],
          })),
        ],
      };
      const report = computeHealthReport(chain);
      expect(report.promotions[0]!.match_criteria).toBeDefined();
      expect(report.promotions[0]!.match_criteria.severity).toBe('risk');
      expect(report.promotions[0]!.match_criteria.category).toBe('code');
      expect(report.promotions[0]!.match_criteria.file).toBe('src/a.ts');
      // 5 matching findings in 5 entries = 0% reduction
      expect(report.promotions[0]!.reduction_pct).toBe(0);
      expect(report.promotions[0]!.status).toBe('ineffective');
    });
  });

  describe('named constants', () => {
    // @ana A031
    it('exports MIN_FINDINGS_HOT constant', () => {
      expect(MIN_FINDINGS_HOT).toBe(3);
    });

    // @ana A032
    it('exports MIN_ENTRIES_HOT constant', () => {
      expect(MIN_ENTRIES_HOT).toBe(2);
    });

    it('exports TRAJECTORY_WINDOW constant', () => {
      expect(TRAJECTORY_WINDOW).toBe(5);
    });

    it('exports MIN_ENTRIES_FOR_TREND constant', () => {
      expect(MIN_ENTRIES_FOR_TREND).toBe(10);
    });
  });
});

describe('detectHealthChange', () => {
  // @ana A035
  it('first entry produces no change', () => {
    const chain = {
      entries: [{
        slug: 'first',
        findings: [
          { id: 'F001', status: 'active', severity: 'risk', category: 'code', summary: 'r1', file: 'src/a.ts', suggested_action: 'scope' },
        ],
      }],
    };
    const change = detectHealthChange(chain);
    expect(change.changed).toBe(false);
    expect(change.triggers).toEqual([]);
  });

  it('empty chain produces no change', () => {
    const change = detectHealthChange({ entries: [] });
    expect(change.changed).toBe(false);
  });

  it('detects trend improvement', () => {
    // Need 10+ entries for trend. First 5 high risks, last 6 low.
    const entries = [
      ...Array.from({ length: 5 }, (_, i) => ({
        slug: `e${i}`,
        findings: Array.from({ length: 4 }, (_, j) => ({
          id: `F${i * 10 + j}`, status: 'active', severity: 'risk', category: 'code', summary: 'r', file: 'src/a.ts', suggested_action: 'scope',
        })),
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        slug: `e${i + 5}`,
        findings: [
          { id: `F${50 + i}`, status: 'active', severity: 'risk', category: 'code', summary: 'r', file: `src/b${i}.ts`, suggested_action: 'scope' },
        ],
      })),
    ];
    const change = detectHealthChange({ entries });
    // The 11th entry shifts the trend comparison
    if (change.changed) {
      expect(change.triggers).toContain('trend_improved');
    }
    // Always includes trajectory snapshot
    expect(change.trajectory).toBeDefined();
  });

  it('detects new hot module', () => {
    // Set up a chain where the last entry pushes a module over the hot threshold
    const entries = [
      {
        slug: 'e1',
        findings: [
          { id: 'F001', status: 'active', severity: 'risk', category: 'code', summary: 'r1', file: 'src/hot.ts', suggested_action: 'scope' },
          { id: 'F002', status: 'active', severity: 'debt', category: 'code', summary: 'd1', file: 'src/hot.ts', suggested_action: 'scope' },
        ],
      },
      // This entry pushes src/hot.ts to 3 findings from 2 entries → hot
      {
        slug: 'e2',
        findings: [
          { id: 'F003', status: 'active', severity: 'risk', category: 'code', summary: 'r2', file: 'src/hot.ts', suggested_action: 'scope' },
        ],
      },
    ];
    const change = detectHealthChange({ entries });
    expect(change.changed).toBe(true);
    expect(change.triggers).toContain('new_hot_module');
    expect(change.details.some(d => d.includes('src/hot.ts'))).toBe(true);
  });

  it('detects new promotion candidates', () => {
    const entries = [
      {
        slug: 'e1',
        findings: [
          { id: 'F001', status: 'active', severity: 'risk', category: 'code', summary: 'existing', file: 'src/a.ts', suggested_action: 'scope' },
        ],
      },
      {
        slug: 'e2',
        findings: [
          { id: 'F002', status: 'active', severity: 'risk', category: 'code', summary: 'new promote', file: 'src/b.ts', suggested_action: 'promote' },
        ],
      },
    ];
    const change = detectHealthChange({ entries });
    expect(change.changed).toBe(true);
    expect(change.triggers).toContain('new_candidates');
  });

  // @ana A026
  it('no change when stable', () => {
    // 2 entries with monitor action — no scope recurrence, no promote, no hot modules
    const change = detectHealthChange({
      entries: [
        {
          slug: 'e1',
          findings: [
            { id: 'F001', status: 'active', severity: 'risk', category: 'code', summary: 'r1', file: 'src/a.ts', suggested_action: 'monitor' },
          ],
        },
        {
          slug: 'e2',
          findings: [
            { id: 'F002', status: 'active', severity: 'risk', category: 'code', summary: 'r2', file: 'src/b.ts', suggested_action: 'monitor' },
          ],
        },
      ],
    });
    expect(change.changed).toBe(false);
    expect(change.triggers).toEqual([]);
  });

  it('always includes trajectory snapshot', () => {
    const change = detectHealthChange({
      entries: [
        { slug: 'e1', findings: [{ id: 'F001', status: 'active', severity: 'risk', category: 'code', summary: 'r', file: 'a.ts', suggested_action: 'scope' }] },
        { slug: 'e2', findings: [] },
      ],
    });
    expect(change.trajectory).toBeDefined();
    expect(change.trajectory.risks_per_run_all).toBeDefined();
  });
});

describe('computeStaleness', () => {
  // @ana A022
  it('detects findings whose files were modified by subsequent entries', () => {
    const chain = {
      entries: [
        {
          slug: 'entry-1',
          completed_at: '2026-04-20T10:00:00Z',
          modules_touched: ['src/api/payments.ts'],
          findings: [
            { id: 'F001', status: 'active', severity: 'risk', category: 'code', summary: 'Missing validation', file: 'src/api/payments.ts' },
          ],
        },
        {
          slug: 'entry-2',
          completed_at: '2026-04-21T10:00:00Z',
          modules_touched: ['src/api/payments.ts'],
          findings: [],
        },
        {
          slug: 'entry-3',
          completed_at: '2026-04-22T10:00:00Z',
          modules_touched: ['src/api/payments.ts'],
          findings: [],
        },
        {
          slug: 'entry-4',
          completed_at: '2026-04-23T10:00:00Z',
          modules_touched: ['src/api/payments.ts'],
          findings: [],
        },
      ],
    };
    const result = computeStaleness(chain);
    expect(result.total_stale).toBeGreaterThan(0);
    expect(result.high_confidence.length).toBe(1);
    expect(result.high_confidence[0]!.id).toBe('F001');
    expect(result.high_confidence[0]!.subsequent_count).toBe(3);
    expect(result.high_confidence[0]!.subsequent_slugs).toEqual(['entry-2', 'entry-3', 'entry-4']);
  });

  // @ana A023
  it('assigns high confidence when 3+ subsequent entries modified the file', () => {
    const chain = {
      entries: [
        {
          slug: 'entry-1',
          completed_at: '2026-04-20T10:00:00Z',
          modules_touched: [],
          findings: [
            { id: 'F001', status: 'active', severity: 'risk', category: 'code', summary: 'Issue', file: 'src/app.ts' },
          ],
        },
        { slug: 'entry-2', completed_at: '2026-04-21T10:00:00Z', modules_touched: ['src/app.ts'], findings: [] },
        { slug: 'entry-3', completed_at: '2026-04-22T10:00:00Z', modules_touched: ['src/app.ts'], findings: [] },
        { slug: 'entry-4', completed_at: '2026-04-23T10:00:00Z', modules_touched: ['src/app.ts'], findings: [] },
      ],
    };
    const result = computeStaleness(chain);
    expect(result.high_confidence.length).toBe(1);
    expect(result.high_confidence[0]!.subsequent_count).toBeGreaterThan(2);
    expect(result.high_confidence[0]!.confidence).toBe('high');
  });

  it('assigns medium confidence when 1-2 subsequent entries modified the file', () => {
    const chain = {
      entries: [
        {
          slug: 'entry-1',
          completed_at: '2026-04-20T10:00:00Z',
          modules_touched: [],
          findings: [
            { id: 'F001', status: 'active', severity: 'debt', category: 'code', summary: 'Debt issue', file: 'src/utils.ts' },
          ],
        },
        { slug: 'entry-2', completed_at: '2026-04-21T10:00:00Z', modules_touched: ['src/utils.ts'], findings: [] },
      ],
    };
    const result = computeStaleness(chain);
    expect(result.medium_confidence.length).toBe(1);
    expect(result.medium_confidence[0]!.confidence).toBe('medium');
    expect(result.medium_confidence[0]!.subsequent_count).toBe(1);
  });

  // @ana A024
  it('filters by afterSlug to only show findings from that entry', () => {
    const chain = {
      entries: [
        {
          slug: 'entry-1',
          completed_at: '2026-04-20T10:00:00Z',
          modules_touched: [],
          findings: [
            { id: 'F001', status: 'active', severity: 'risk', category: 'code', summary: 'First', file: 'src/a.ts' },
          ],
        },
        {
          slug: 'entry-2',
          completed_at: '2026-04-21T10:00:00Z',
          modules_touched: ['src/a.ts'],
          findings: [
            { id: 'F002', status: 'active', severity: 'debt', category: 'code', summary: 'Second', file: 'src/b.ts' },
          ],
        },
        {
          slug: 'entry-3',
          completed_at: '2026-04-22T10:00:00Z',
          modules_touched: ['src/a.ts', 'src/b.ts'],
          findings: [],
        },
      ],
    };
    const result = computeStaleness(chain, { afterSlug: 'entry-1' });
    expect(result.total_stale).toBeGreaterThan(0);
    // Only F001 from entry-1 should appear
    const allIds = [...result.high_confidence, ...result.medium_confidence].map(f => f.id);
    expect(allIds).toContain('F001');
    expect(allIds).not.toContain('F002');
  });

  it('filters by minConfidence high to exclude medium', () => {
    const chain = {
      entries: [
        {
          slug: 'entry-1',
          completed_at: '2026-04-20T10:00:00Z',
          modules_touched: [],
          findings: [
            { id: 'F001', status: 'active', severity: 'risk', category: 'code', summary: 'High', file: 'src/a.ts' },
            { id: 'F002', status: 'active', severity: 'debt', category: 'code', summary: 'Medium', file: 'src/b.ts' },
          ],
        },
        { slug: 'e2', completed_at: '2026-04-21T10:00:00Z', modules_touched: ['src/a.ts', 'src/b.ts'], findings: [] },
        { slug: 'e3', completed_at: '2026-04-22T10:00:00Z', modules_touched: ['src/a.ts'], findings: [] },
        { slug: 'e4', completed_at: '2026-04-23T10:00:00Z', modules_touched: ['src/a.ts'], findings: [] },
      ],
    };
    const result = computeStaleness(chain, { minConfidence: 'high' });
    expect(result.high_confidence.length).toBe(1);
    expect(result.medium_confidence.length).toBe(0);
    expect(result.total_stale).toBe(1);
  });

  it('returns empty result when no findings are stale', () => {
    const chain = {
      entries: [
        {
          slug: 'entry-1',
          completed_at: '2026-04-20T10:00:00Z',
          modules_touched: ['src/a.ts'],
          findings: [
            { id: 'F001', status: 'active', severity: 'risk', category: 'code', summary: 'Issue', file: 'src/a.ts' },
          ],
        },
        {
          slug: 'entry-2',
          completed_at: '2026-04-21T10:00:00Z',
          modules_touched: ['src/other.ts'],
          findings: [],
        },
      ],
    };
    const result = computeStaleness(chain);
    expect(result.total_stale).toBe(0);
    expect(result.high_confidence).toEqual([]);
    expect(result.medium_confidence).toEqual([]);
  });

  it('skips findings with no file', () => {
    const chain = {
      entries: [
        {
          slug: 'entry-1',
          completed_at: '2026-04-20T10:00:00Z',
          modules_touched: [],
          findings: [
            { id: 'F001', status: 'active', severity: 'risk', category: 'upstream', summary: 'No file ref', file: null },
          ],
        },
        { slug: 'entry-2', completed_at: '2026-04-21T10:00:00Z', modules_touched: ['src/a.ts'], findings: [] },
      ],
    };
    const result = computeStaleness(chain);
    expect(result.total_stale).toBe(0);
  });

  it('skips non-active findings', () => {
    const chain = {
      entries: [
        {
          slug: 'entry-1',
          completed_at: '2026-04-20T10:00:00Z',
          modules_touched: [],
          findings: [
            { id: 'F001', status: 'closed', severity: 'risk', category: 'code', summary: 'Closed', file: 'src/a.ts' },
            { id: 'F002', status: 'promoted', severity: 'debt', category: 'code', summary: 'Promoted', file: 'src/a.ts' },
          ],
        },
        { slug: 'entry-2', completed_at: '2026-04-21T10:00:00Z', modules_touched: ['src/a.ts'], findings: [] },
      ],
    };
    const result = computeStaleness(chain);
    expect(result.total_stale).toBe(0);
  });

  it('does not count the finding own entry modules_touched as subsequent', () => {
    const chain = {
      entries: [
        {
          slug: 'entry-1',
          completed_at: '2026-04-20T10:00:00Z',
          modules_touched: ['src/a.ts'],
          findings: [
            { id: 'F001', status: 'active', severity: 'risk', category: 'code', summary: 'In own entry', file: 'src/a.ts' },
          ],
        },
      ],
    };
    const result = computeStaleness(chain);
    expect(result.total_stale).toBe(0);
  });

  it('only counts entries AFTER the finding entry, not before', () => {
    const chain = {
      entries: [
        { slug: 'before', completed_at: '2026-04-19T10:00:00Z', modules_touched: ['src/a.ts'], findings: [] },
        {
          slug: 'entry-1',
          completed_at: '2026-04-20T10:00:00Z',
          modules_touched: [],
          findings: [
            { id: 'F001', status: 'active', severity: 'risk', category: 'code', summary: 'Issue', file: 'src/a.ts' },
          ],
        },
      ],
    };
    const result = computeStaleness(chain);
    expect(result.total_stale).toBe(0);
  });

  it('returns zero findings for afterSlug that does not exist', () => {
    const chain = {
      entries: [
        {
          slug: 'entry-1',
          completed_at: '2026-04-20T10:00:00Z',
          modules_touched: [],
          findings: [
            { id: 'F001', status: 'active', severity: 'risk', category: 'code', summary: 'Issue', file: 'src/a.ts' },
          ],
        },
        { slug: 'entry-2', completed_at: '2026-04-21T10:00:00Z', modules_touched: ['src/a.ts'], findings: [] },
      ],
    };
    const result = computeStaleness(chain, { afterSlug: 'nonexistent' });
    expect(result.total_stale).toBe(0);
  });

  it('handles entries with empty modules_touched', () => {
    const chain = {
      entries: [
        {
          slug: 'entry-1',
          completed_at: '2026-04-20T10:00:00Z',
          modules_touched: [],
          findings: [
            { id: 'F001', status: 'active', severity: 'risk', category: 'code', summary: 'Issue', file: 'src/a.ts' },
          ],
        },
        { slug: 'entry-2', completed_at: '2026-04-21T10:00:00Z', modules_touched: [], findings: [] },
      ],
    };
    const result = computeStaleness(chain);
    expect(result.total_stale).toBe(0);
  });

  // @ana A016
  it('high-frequency file needs more touches for high confidence', () => {
    // 11 entries total. File src/hot.ts touched in 6 of 11 entries (55% baseline rate).
    // entriesSince = 10, touchRate = 6/11 ≈ 0.545
    // expected = max(3, ceil(10 * 0.545)) = max(3, 6) = 6
    // Only 3 post-finding touches < 6 → NOT high
    // 3 >= ceil(6*0.5)=3 → medium
    const chain = {
      entries: [
        {
          slug: 'entry-0',
          completed_at: '2026-04-19T10:00:00Z',
          modules_touched: ['src/hot.ts'],
          findings: [
            { id: 'F001', status: 'active', severity: 'risk', category: 'code', summary: 'Hot file finding', file: 'src/hot.ts' },
          ],
        },
        { slug: 'e1', completed_at: '2026-04-20T10:00:00Z', modules_touched: ['src/hot.ts'], findings: [] },
        { slug: 'e2', completed_at: '2026-04-20T11:00:00Z', modules_touched: ['src/hot.ts'], findings: [] },
        { slug: 'e3', completed_at: '2026-04-20T12:00:00Z', modules_touched: ['src/hot.ts'], findings: [] },
        { slug: 'e4', completed_at: '2026-04-20T13:00:00Z', modules_touched: ['src/other.ts'], findings: [] },
        { slug: 'e5', completed_at: '2026-04-20T14:00:00Z', modules_touched: ['src/hot.ts'], findings: [] },
        { slug: 'e6', completed_at: '2026-04-20T15:00:00Z', modules_touched: ['src/other.ts'], findings: [] },
        { slug: 'e7', completed_at: '2026-04-20T16:00:00Z', modules_touched: ['src/hot.ts'], findings: [] },
        { slug: 'e8', completed_at: '2026-04-20T17:00:00Z', modules_touched: ['src/other.ts'], findings: [] },
        { slug: 'e9', completed_at: '2026-04-20T18:00:00Z', modules_touched: ['src/other.ts'], findings: [] },
        { slug: 'e10', completed_at: '2026-04-20T19:00:00Z', modules_touched: ['src/other.ts'], findings: [] },
      ],
    };
    const result = computeStaleness(chain);
    // Post-finding touches: e1, e2, e3 = 3. Expected = 6. 3 < 6 → NOT high
    expect(result.high_confidence.length).toBe(0);
    expect(result.medium_confidence.length).toBe(1);
    expect(result.medium_confidence[0]!.confidence).toBe('medium');
  });

  // @ana A017
  it('low-frequency file keeps floor threshold of 3', () => {
    // 11 entries total. File src/cold.ts touched in 3 of 11 entries (27% rate).
    // entriesSince = 10, touchRate = 3/11 ≈ 0.273
    // expected = max(3, ceil(10 * 0.273)) = max(3, 3) = 3
    // 3 post-finding touches >= 3 → high
    const chain = {
      entries: [
        {
          slug: 'entry-0',
          completed_at: '2026-04-19T10:00:00Z',
          modules_touched: [],
          findings: [
            { id: 'F001', status: 'active', severity: 'risk', category: 'code', summary: 'Cold file finding', file: 'src/cold.ts' },
          ],
        },
        { slug: 'e1', completed_at: '2026-04-20T10:00:00Z', modules_touched: ['src/cold.ts'], findings: [] },
        { slug: 'e2', completed_at: '2026-04-20T11:00:00Z', modules_touched: ['src/other.ts'], findings: [] },
        { slug: 'e3', completed_at: '2026-04-20T12:00:00Z', modules_touched: ['src/other.ts'], findings: [] },
        { slug: 'e4', completed_at: '2026-04-20T13:00:00Z', modules_touched: ['src/cold.ts'], findings: [] },
        { slug: 'e5', completed_at: '2026-04-20T14:00:00Z', modules_touched: ['src/other.ts'], findings: [] },
        { slug: 'e6', completed_at: '2026-04-20T15:00:00Z', modules_touched: ['src/other.ts'], findings: [] },
        { slug: 'e7', completed_at: '2026-04-20T16:00:00Z', modules_touched: ['src/other.ts'], findings: [] },
        { slug: 'e8', completed_at: '2026-04-20T17:00:00Z', modules_touched: ['src/other.ts'], findings: [] },
        { slug: 'e9', completed_at: '2026-04-20T18:00:00Z', modules_touched: ['src/cold.ts'], findings: [] },
        { slug: 'e10', completed_at: '2026-04-20T19:00:00Z', modules_touched: ['src/other.ts'], findings: [] },
      ],
    };
    const result = computeStaleness(chain);
    // 3 post-finding touches, expected=3 → 3>=3 → high
    expect(result.high_confidence.length).toBe(1);
    expect(result.high_confidence[0]!.confidence).toBe('high');
  });

  // @ana A018
  it('uses raw thresholds below minimum entries', () => {
    // Only 4 entries after finding (< 5 minimum), file touched 3 times → raw: high
    const chain = {
      entries: [
        {
          slug: 'entry-0',
          completed_at: '2026-04-19T10:00:00Z',
          modules_touched: [],
          findings: [
            { id: 'F001', status: 'active', severity: 'risk', category: 'code', summary: 'Young finding', file: 'src/young.ts' },
          ],
        },
        { slug: 'e1', completed_at: '2026-04-20T10:00:00Z', modules_touched: ['src/young.ts'], findings: [] },
        { slug: 'e2', completed_at: '2026-04-20T11:00:00Z', modules_touched: ['src/young.ts'], findings: [] },
        { slug: 'e3', completed_at: '2026-04-20T12:00:00Z', modules_touched: ['src/young.ts'], findings: [] },
        { slug: 'e4', completed_at: '2026-04-20T13:00:00Z', modules_touched: ['src/young.ts'], findings: [] },
      ],
    };
    const result = computeStaleness(chain);
    // entriesSince=4, < 5 → raw thresholds. 4 touches >= 3 → high
    expect(result.high_confidence.length).toBe(1);
    expect(result.high_confidence[0]!.confidence).toBe('high');
  });

  it('high-frequency file reaches high when touches meet expected threshold', () => {
    // 11 entries total. File src/hot.ts touched in 6 of 11 (55% rate).
    // entriesSince = 10, expected = max(3, ceil(10 * 6/11)) = max(3, 6) = 6
    // 6 post-finding touches >= 6 → high
    const chain = {
      entries: [
        {
          slug: 'entry-0',
          completed_at: '2026-04-19T10:00:00Z',
          modules_touched: [],
          findings: [
            { id: 'F001', status: 'active', severity: 'risk', category: 'code', summary: 'Hot file many touches', file: 'src/hot.ts' },
          ],
        },
        { slug: 'e1', completed_at: '2026-04-20T10:00:00Z', modules_touched: ['src/hot.ts'], findings: [] },
        { slug: 'e2', completed_at: '2026-04-20T11:00:00Z', modules_touched: ['src/hot.ts'], findings: [] },
        { slug: 'e3', completed_at: '2026-04-20T12:00:00Z', modules_touched: ['src/hot.ts'], findings: [] },
        { slug: 'e4', completed_at: '2026-04-20T13:00:00Z', modules_touched: ['src/other.ts'], findings: [] },
        { slug: 'e5', completed_at: '2026-04-20T14:00:00Z', modules_touched: ['src/hot.ts'], findings: [] },
        { slug: 'e6', completed_at: '2026-04-20T15:00:00Z', modules_touched: ['src/other.ts'], findings: [] },
        { slug: 'e7', completed_at: '2026-04-20T16:00:00Z', modules_touched: ['src/other.ts'], findings: [] },
        { slug: 'e8', completed_at: '2026-04-20T17:00:00Z', modules_touched: ['src/other.ts'], findings: [] },
        { slug: 'e9', completed_at: '2026-04-20T18:00:00Z', modules_touched: ['src/hot.ts'], findings: [] },
        { slug: 'e10', completed_at: '2026-04-20T19:00:00Z', modules_touched: ['src/hot.ts'], findings: [] },
      ],
    };
    const result = computeStaleness(chain);
    // 6 touches across 11 entries → rate=6/11≈0.545, expected=ceil(10*0.545)=6, 6>=6 → high
    expect(result.high_confidence.length).toBe(1);
    expect(result.high_confidence[0]!.confidence).toBe('high');
  });
});

// @ana A013, A014, A015
describe('truncateSummary', () => {
  // @ana A014
  it('returns short text unchanged', () => {
    const text = 'short text';
    const result = truncateSummary(text, 100);
    expect(result).toBe(text);
    expect(result.length).toBe(10);
  });

  it('returns text exactly at maxLength unchanged', () => {
    const text = 'a'.repeat(50);
    const result = truncateSummary(text, 50);
    expect(result).toBe(text);
  });

  // @ana A013
  it('truncates at last word boundary and appends ellipsis', () => {
    const text = 'The quick brown fox jumps over the lazy dog and keeps running far away';
    const result = truncateSummary(text, 50);
    expect(result).toContain('...');
    expect(result.length).toBeLessThanOrEqual(53); // 50 + '...'
    // Should cut at a space boundary
    const withoutEllipsis = result.slice(0, -3);
    expect(text.startsWith(withoutEllipsis)).toBe(true);
    expect(withoutEllipsis.endsWith(' ')).toBe(false);
  });

  it('hard-cuts when no space found before maxLength', () => {
    const text = 'abcdefghijklmnopqrstuvwxyz';
    const result = truncateSummary(text, 10);
    expect(result).toBe('abcdefghij...');
  });

  // @ana A015
  it('respects custom maxLength parameter', () => {
    // 50 chars then a space — lastIndexOf(' ', 50) returns 50, substring(0, 50) + '...' = 53
    const text = '12345678901234567890123456789012345678901234567890 more text after space';
    const result = truncateSummary(text, 50);
    expect(result.length).toBe(53);
  });

  it('handles empty string', () => {
    expect(truncateSummary('', 100)).toBe('');
  });
});
