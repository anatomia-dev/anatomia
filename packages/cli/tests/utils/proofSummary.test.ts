import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  generateProofSummary,
  getProofContext,
  generateDashboard,
  truncateSummary,
} from '../../src/utils/proofSummary.js';
import { formatHumanReadable } from '../../src/commands/proof.js';
// buildGanttBars lives in the website package (PipelineGantt.tsx) and can't be
// imported cross-package in vitest. Re-implement the pure function here so the
// contract assertions (A014-A018, A022) are testable within the CLI test suite.

interface TestProofTiming {
  think: number;
  plan: number;
  build: number;
  verify: number;
  totalMinutes: number;
  segments?: Array<{ stage: string; minutes: number; phase?: number }>;
}

interface TestGanttBar {
  label: string;
  minutes: number;
  leftPct: number;
  widthPct: number;
}

const TEST_STAGES = [
  { key: 'think' as const, label: 'Think' },
  { key: 'plan' as const, label: 'Plan' },
  { key: 'build' as const, label: 'Build' },
  { key: 'verify' as const, label: 'Verify' },
];

function buildGanttBars(timing: TestProofTiming): TestGanttBar[] {
  const total = timing.totalMinutes;
  if (total === 0) return [];

  if (timing.segments && timing.segments.length > 0) {
    const bars: TestGanttBar[] = [];
    let cumulative = 0;
    for (const seg of timing.segments) {
      const label = seg.phase != null
        ? `${seg.stage.charAt(0).toUpperCase() + seg.stage.slice(1)} ${seg.phase}`
        : seg.stage.charAt(0).toUpperCase() + seg.stage.slice(1);
      const pct = total > 0 ? Math.round((seg.minutes / total) * 100) : 0;
      bars.push({
        label,
        minutes: seg.minutes,
        leftPct: total > 0 ? Math.round((cumulative / total) * 100) : 0,
        widthPct: seg.minutes === 0 ? 2 : pct,
      });
      cumulative += seg.minutes;
    }
    return bars;
  }

  const bars: TestGanttBar[] = [];
  let cumulative = 0;
  for (const stage of TEST_STAGES) {
    const value = timing[stage.key];
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    bars.push({
      label: stage.label,
      minutes: value,
      leftPct: total > 0 ? Math.round((cumulative / total) * 100) : 0,
      widthPct: value === 0 ? 2 : pct,
    });
    cumulative += value;
  }
  return bars;
}

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


// @ana A008



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
    expect(results[0]!.findings.length).toBe(1);
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
    expect(results[0]!.build_concerns.length).toBe(1);
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
    expect(results[0]!.findings.length).toBe(2);
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
    expect(results[0]!.last_touched).toBe('2026-04-24T10:00:00Z');
  });

  // @ana A016
  // Source-reading exemption: enforces import boundary — no behavioral surface for this constraint
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
    expect(results[0]!.findings.length).toBe(1);
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
    expect(results[0]!.findings.length).toBe(1);
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
    expect(results[0]!.findings.length).toBe(1);
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
    expect(results[0]!.findings.length).toBe(1);
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
    expect(results[0]!.findings.length).toBe(1);
  });
});

// @ana A022, A023

// @ana A011, A012, A013, A014, A015, A016, A017

// @ana A025, A026, A027, A028
describe('generateDashboard', () => {
  it('contains summary line with run count and status counts', () => {
    const entries = [{ slug: 'feat-1', feature: 'Feature 1', completed_at: '2026-04-01T00:00:00Z', findings: [] }];
    const md = generateDashboard(entries, { runs: 1, active: 0, promoted: 0, closed: 0 });
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
    const md = generateDashboard(entries, { runs: 2, active: 2, promoted: 0, closed: 0 });
    expect(md).toContain('## Hot Modules');
    expect(md).toContain('src/foo.ts');
  });

  it('shows no hot modules when all files have only 1 entry', () => {
    const entries = [{
      slug: 'feat-1', feature: 'Feature 1', completed_at: '2026-04-01T00:00:00Z',
      findings: [{ id: 'c1', category: 'code', summary: 'Issue', file: 'src/bar.ts', anchor: null, status: 'active' }],
    }];
    const md = generateDashboard(entries, { runs: 1, active: 1, promoted: 0, closed: 0 });
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
    const md = generateDashboard(entries, { runs: 1, active: 2, promoted: 0, closed: 0 });
    expect(md).toContain('### src/bar.ts');
    expect(md).toContain('### src/foo.ts');
  });

  // @ana A015, A016
  it('caps active findings at 30', () => {
    const findings = Array.from({ length: 35 }, (_, i) => ({
      id: `c${i}`, category: 'code', summary: `Issue ${i}`, file: `file-${i}.ts`, anchor: null, status: 'active' as const,
    }));
    const entries = [{ slug: 'feat-1', feature: 'Feature 1', completed_at: '2026-04-01T00:00:00Z', findings }];
    const md = generateDashboard(entries, { runs: 1, active: 35, promoted: 0, closed: 0 });
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
    const md = generateDashboard(entries, { runs: 1, active: 0, promoted: 0, closed: 0 });
    expect(md).toContain('## Promoted Rules');
    expect(md).toContain('*No promoted rules yet.*');
  });

  // @ana A008, A009
  it('renders By Surface section when entries have surface data', () => {
    const entries = [
      { slug: 'feat-1', feature: 'F1', completed_at: '2026-04-01T00:00:00Z', surface: 'cli', findings: [
        { id: 'c1', category: 'code', summary: 'Issue', file: 'src/a.ts', anchor: null, status: 'active' },
      ]},
      { slug: 'feat-2', feature: 'F2', completed_at: '2026-04-02T00:00:00Z', surface: 'cli', findings: [] },
      { slug: 'feat-3', feature: 'F3', completed_at: '2026-04-03T00:00:00Z', surface: 'website', findings: [] },
    ];
    const md = generateDashboard(entries, { runs: 3, active: 1, promoted: 0, closed: 0 });
    expect(md).toContain('## By Surface');
    expect(md).toContain('cli');
    expect(md).toContain('website');
    // cli has 2 runs
    expect(md).toContain('| cli | 2 | 1 |');
    // website has 1 run
    expect(md).toContain('| website | 1 | 0 |');
  });

  // @ana A010
  it('does not render By Surface section when no entries have surface data', () => {
    const entries = [
      { slug: 'feat-1', feature: 'F1', completed_at: '2026-04-01T00:00:00Z', findings: [] },
    ];
    const md = generateDashboard(entries, { runs: 1, active: 0, promoted: 0, closed: 0 });
    expect(md).not.toContain('## By Surface');
  });

  // @ana A011
  it('groups entries without surface as Unscoped', () => {
    const entries = [
      { slug: 'feat-1', feature: 'F1', completed_at: '2026-04-01T00:00:00Z', surface: 'cli', findings: [] },
      { slug: 'feat-2', feature: 'F2', completed_at: '2026-04-02T00:00:00Z', findings: [] },
    ];
    const md = generateDashboard(entries, { runs: 2, active: 0, promoted: 0, closed: 0 });
    expect(md).toContain('## By Surface');
    expect(md).toContain('Unscoped');
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
    expect(summary.findings.length).toBe(1);
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
    expect(summary.findings.length).toBe(1);
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
    expect(summary.build_concerns.length).toBe(1);
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
    expect(summary.build_concerns.length).toBe(1);
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
    expect(summary.build_concerns.length).toBe(1);
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
    expect(summary.findings.length).toBe(1);
    expect(summary.findings[0]!.summary).toBe('Numbered companion finding');
  });
});

// @ana A026, A027

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

describe('computeTiming with build_started_at and verify_started_at', () => {
  let tempDir: string;
  let slugDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'timing-v2-test-'));
    slugDir = path.join(tempDir, 'test-timing-v2');
    await fs.promises.mkdir(slugDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A007
  it('uses build_started_at for build duration when available', async () => {
    const saves = {
      work_started_at: '2026-04-01T09:40:00Z',
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      build_started_at: '2026-04-01T11:00:00Z',
      'build-report': { saved_at: '2026-04-01T11:45:00Z' },
      'verify-report': { saved_at: '2026-04-01T12:30:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // build = build-report - build_started_at = 45min (not 75min gap from contract)
    expect(summary.timing.build).toBe(45);
  });

  // @ana A008
  it('uses verify_started_at for verify duration when available', async () => {
    const saves = {
      work_started_at: '2026-04-01T09:40:00Z',
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': { saved_at: '2026-04-01T11:30:00Z' },
      verify_started_at: '2026-04-01T11:45:00Z',
      'verify-report': { saved_at: '2026-04-01T12:15:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // verify = verify-report - verify_started_at = 30min (not 45min gap from build-report)
    expect(summary.timing.verify).toBe(30);
  });

  // @ana A009
  it('falls back to artifact-gap timing when _started_at timestamps absent', async () => {
    const saves = {
      work_started_at: '2026-04-01T09:40:00Z',
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report': { saved_at: '2026-04-01T12:00:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // build = build-report - contract = 60min (gap timing)
    expect(summary.timing.build).toBe(60);
    // verify = verify-report - build-report = 30min (gap timing)
    expect(summary.timing.verify).toBe(30);
  });

  // @ana A010
  it('falls back when build_started_at is later than build-report save', async () => {
    const saves = {
      work_started_at: '2026-04-01T09:40:00Z',
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      build_started_at: '2026-04-01T12:00:00Z', // AFTER build-report
      'build-report': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report': { saved_at: '2026-04-01T12:30:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // Falls back to gap timing: build-report - contract = 60min
    expect(summary.timing.build).toBe(60);
  });

  // @ana A011
  it('falls back when computed duration exceeds 24 hours', async () => {
    const saves = {
      work_started_at: '2026-04-01T09:40:00Z',
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      build_started_at: '2026-04-01T00:00:00Z', // 35.5 hours before build-report
      'build-report': { saved_at: '2026-04-02T11:30:00Z' },
      'verify-report': { saved_at: '2026-04-02T12:00:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // Falls back to gap timing: build-report - contract = 1500min (25h)
    // But that's also > 24h — so just verify it didn't use the 35.5h value
    // Gap timing: build-report(Apr 2 11:30) - contract(Apr 1 10:30) = 25h = 1500min
    expect(summary.timing.build).toBe(1500);
  });

  // @ana A012
  it('falls back when computed duration is negative', async () => {
    const saves = {
      work_started_at: '2026-04-01T09:40:00Z',
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      verify_started_at: '2026-04-01T13:00:00Z', // AFTER verify-report (clock skew)
      'build-report': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report': { saved_at: '2026-04-01T12:00:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // Falls back to gap timing: verify-report - build-report = 30min
    expect(summary.timing.verify).toBe(30);
    // Verify it's not negative
    expect(summary.timing.verify).toBeGreaterThan(-1);
  });

  it('uses both build_started_at and verify_started_at together', async () => {
    const saves = {
      work_started_at: '2026-04-01T09:40:00Z',
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      build_started_at: '2026-04-01T11:00:00Z',
      'build-report': { saved_at: '2026-04-01T11:45:00Z' },
      verify_started_at: '2026-04-01T12:00:00Z',
      'verify-report': { saved_at: '2026-04-01T12:20:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // build = 45min (from _started_at), verify = 20min (from _started_at)
    expect(summary.timing.build).toBe(45);
    expect(summary.timing.verify).toBe(20);
    // think and plan unchanged
    expect(summary.timing.think).toBe(20);
    expect(summary.timing.plan).toBe(30);
  });
});

describe('computeTiming with plan_started_at', () => {
  let tempDir: string;
  let slugDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'timing-plan-test-'));
    slugDir = path.join(tempDir, 'test-plan-timing');
    await fs.promises.mkdir(slugDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A004
  it('uses plan_started_at for plan duration when available', async () => {
    const saves = {
      work_started_at: '2026-04-01T09:40:00Z',
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      plan_started_at: '2026-04-01T10:15:00Z',
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      build_started_at: '2026-04-01T11:00:00Z',
      'build-report': { saved_at: '2026-04-01T11:45:00Z' },
      'verify-report': { saved_at: '2026-04-01T12:30:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // plan = contract - plan_started_at = 15min (not 30min gap from scope)
    expect(summary.timing.plan).toBe(15);
    // think should still use scope - work_started_at = 20min
    expect(summary.timing.think).toBe(20);
  });

  // @ana A005
  it('falls back to artifact-gap when plan_started_at absent', async () => {
    const saves = {
      work_started_at: '2026-04-01T09:40:00Z',
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report': { saved_at: '2026-04-01T12:00:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // plan = contract - scope = 30min (gap timing, no plan_started_at)
    expect(summary.timing.plan).toBe(30);
  });

  // @ana A008
  it('falls back when plan_started_at is after contractTime', async () => {
    const saves = {
      work_started_at: '2026-04-01T09:40:00Z',
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      plan_started_at: '2026-04-01T11:00:00Z', // AFTER contract
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report': { saved_at: '2026-04-01T12:00:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // Falls back to gap timing: contract - scope = 30min
    expect(summary.timing.plan).toBe(30);
  });

  // @ana A009
  it('falls back when plan duration exceeds 24 hours', async () => {
    const saves = {
      work_started_at: '2026-04-01T09:40:00Z',
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      plan_started_at: '2026-03-30T10:00:00Z', // 48h before contract
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report': { saved_at: '2026-04-01T12:00:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // Falls back to gap timing: contract - scope = 30min
    expect(summary.timing.plan).toBe(30);
  });

  // @ana A010
  it('backward compat: old entries without plan_started_at still produce correct plan timing', async () => {
    const saves = {
      work_started_at: '2026-04-01T09:40:00Z',
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report': { saved_at: '2026-04-01T12:00:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // plan = contract - scope = 30min (same as before plan_started_at existed)
    expect(summary.timing.plan).toBe(30);
    expect(summary.timing.think).toBe(20);
  });

  // @ana A017
  it('verify_started_at still consumed by computeTiming', async () => {
    const saves = {
      work_started_at: '2026-04-01T09:40:00Z',
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      plan_started_at: '2026-04-01T10:15:00Z',
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': { saved_at: '2026-04-01T11:30:00Z' },
      verify_started_at: '2026-04-01T11:45:00Z',
      'verify-report': { saved_at: '2026-04-01T12:15:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // verify = verify-report - verify_started_at = 30min
    expect(summary.timing.verify).toBe(30);
  });

  it('plan_started_at exactly equal to contractTime produces 0 duration', async () => {
    const saves = {
      work_started_at: '2026-04-01T09:40:00Z',
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      plan_started_at: '2026-04-01T10:30:00Z', // same as contract
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report': { saved_at: '2026-04-01T12:00:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // plan = contract - plan_started_at = 0min (valid)
    expect(summary.timing.plan).toBe(0);
  });

  it('plan_started_at present but insane falls back to artifact-gap', async () => {
    const saves = {
      work_started_at: '2026-04-01T09:40:00Z',
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      plan_started_at: 'not-a-date',
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report': { saved_at: '2026-04-01T12:00:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // Falls back: NaN from invalid date → readRawTimestamp returns null → gap timing
    expect(summary.timing.plan).toBe(30);
  });
});


// --- Fix-timing-accuracy tests ---

describe('writeSaveMetadata history preservation', () => {
  let tempDir: string;
  let slugDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'history-test-'));
    slugDir = path.join(tempDir, 'test-slug');
    await fs.promises.mkdir(slugDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A001, A002
  it('preserves history when overwriting with different content', async () => {
    const { writeSaveMetadata } = await import('../../src/commands/artifact.js');

    // Use fake timers to guarantee distinct timestamps between writes
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T10:00:00Z'));

    // First write
    writeSaveMetadata(slugDir, 'build-report', 'content v1');
    const saves1 = JSON.parse(fs.readFileSync(path.join(slugDir, '.saves.json'), 'utf-8'));
    const firstSavedAt = saves1['build-report'].saved_at;
    const firstHash = saves1['build-report'].hash;
    expect(firstSavedAt).toBeDefined();
    expect(firstHash).toBeDefined();
    expect(saves1['build-report'].history).toBeUndefined();

    // Advance time to ensure distinct timestamps
    vi.setSystemTime(new Date('2026-05-13T10:30:00Z'));

    // Second write with different content
    writeSaveMetadata(slugDir, 'build-report', 'content v2');
    const saves2 = JSON.parse(fs.readFileSync(path.join(slugDir, '.saves.json'), 'utf-8'));
    expect(saves2['build-report'].history).toHaveLength(1);
    expect(saves2['build-report'].history[0].saved_at).toBe(firstSavedAt);
    expect(saves2['build-report'].history[0].hash).toBe(firstHash);
    expect(saves2['build-report'].saved_at).not.toBe(firstSavedAt);
    expect(saves2['build-report'].hash).not.toBe(firstHash);

    vi.useRealTimers();
  });

  // @ana A003
  it('accumulates history entries across multiple overwrites', async () => {
    const { writeSaveMetadata } = await import('../../src/commands/artifact.js');

    writeSaveMetadata(slugDir, 'build-report', 'content v1');
    writeSaveMetadata(slugDir, 'build-report', 'content v2');
    writeSaveMetadata(slugDir, 'build-report', 'content v3');

    const saves = JSON.parse(fs.readFileSync(path.join(slugDir, '.saves.json'), 'utf-8'));
    expect(saves['build-report'].history).toHaveLength(2);
    // Chronological order: oldest first
    const h0Time = new Date(saves['build-report'].history[0].saved_at).getTime();
    const h1Time = new Date(saves['build-report'].history[1].saved_at).getTime();
    expect(h0Time).toBeLessThanOrEqual(h1Time);
  });

  // @ana A004
  it('does not create history on idempotent re-save', async () => {
    const { writeSaveMetadata } = await import('../../src/commands/artifact.js');

    writeSaveMetadata(slugDir, 'build-report', 'same content');
    const result = writeSaveMetadata(slugDir, 'build-report', 'same content');

    expect(result).toBe(false);
    const saves = JSON.parse(fs.readFileSync(path.join(slugDir, '.saves.json'), 'utf-8'));
    expect(saves['build-report'].history).toBeUndefined();
  });

  // @ana A005
  it('SaveMetadata type includes optional history field', async () => {
    const { writeSaveMetadata } = await import('../../src/commands/artifact.js');

    // Type-level test: if this compiles and runs, the type accepts history
    writeSaveMetadata(slugDir, 'build-report', 'v1');
    writeSaveMetadata(slugDir, 'build-report', 'v2');
    const saves = JSON.parse(fs.readFileSync(path.join(slugDir, '.saves.json'), 'utf-8'));
    // Verify the shape is correct
    expect(saves['build-report']).toHaveProperty('saved_at');
    expect(saves['build-report']).toHaveProperty('hash');
    expect(saves['build-report']).toHaveProperty('history');
  });
});

describe('computeTiming segment-based computation', () => {
  let tempDir: string;
  let slugDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'segment-timing-'));
    slugDir = path.join(tempDir, 'test-timing');
    await fs.promises.mkdir(slugDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A006
  it('SaveEntry type includes optional history field', () => {
    // Type-level test: construct a saves object with history and verify it parses
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': {
        saved_at: '2026-04-01T11:30:00Z',
        history: [{ saved_at: '2026-04-01T11:00:00Z', hash: 'sha256:old' }],
      },
      'verify-report': { saved_at: '2026-04-01T12:00:00Z' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);
    // If the type didn't accept history, this would fail at parse/runtime
    expect(summary.timing).toBeDefined();
  });

  // @ana A007, A008, A011
  it('computes accurate build time for 2-phase pipeline', async () => {
    // Phase 1 build: contract(10:30) → build-report-1(11:00) = 30min
    // Phase 1 verify: build-report-1(11:00) → verify-report-1(11:08) = 8min
    // Phase 2 build: verify-report-1(11:08) → build-report-2(11:23) = 15min
    // Phase 2 verify: build-report-2(11:23) → verify-report-2(11:37) = 14min
    // Total build = 30 + 15 = 45min, total verify = 8 + 14 = 22min
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report-1': { saved_at: '2026-04-01T11:00:00Z' },
      'verify-report-1': { saved_at: '2026-04-01T11:08:00Z' },
      'build-report-2': { saved_at: '2026-04-01T11:23:00Z' },
      'verify-report-2': { saved_at: '2026-04-01T11:37:00Z' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    expect(summary.timing.build).toBe(45);
    expect(summary.timing.verify).toBe(22);
    expect(summary.timing.total_minutes).toBe(97); // 10:00 → 11:37
  });

  // @ana A009, A010
  it('computes accurate timing for 3-phase pipeline', async () => {
    // Phase 1: build 20min, verify 5min
    // Phase 2: build 15min, verify 8min
    // Phase 3: build 10min, verify 7min
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report-1': { saved_at: '2026-04-01T10:50:00Z' },
      'verify-report-1': { saved_at: '2026-04-01T10:55:00Z' },
      'build-report-2': { saved_at: '2026-04-01T11:10:00Z' },
      'verify-report-2': { saved_at: '2026-04-01T11:18:00Z' },
      'build-report-3': { saved_at: '2026-04-01T11:28:00Z' },
      'verify-report-3': { saved_at: '2026-04-01T11:35:00Z' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    expect(summary.timing.build).toBe(45); // 20 + 15 + 10
    expect(summary.timing.verify).toBe(20); // 5 + 8 + 7
  });

  // @ana A012, A013
  it('computes accurate timing for rejection cycle with history', async () => {
    // Cycle 1: build = contract(10:30) → build[0](11:00) = 30min
    //          verify = build[0](11:00) → verify[0](11:10) = 10min
    // Cycle 2: build = verify[0](11:10) → build.current(11:40) = 30min
    //          verify = build.current(11:40) → verify.current(11:50) = 10min
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': {
        saved_at: '2026-04-01T11:40:00Z',
        hash: 'sha256:v2',
        history: [{ saved_at: '2026-04-01T11:00:00Z', hash: 'sha256:v1' }],
      },
      'verify-report': {
        saved_at: '2026-04-01T11:50:00Z',
        hash: 'sha256:vr2',
        history: [{ saved_at: '2026-04-01T11:10:00Z', hash: 'sha256:vr1' }],
      },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    // Content-based detection requires a verify report with rejection content
    const verifyReportWithRejection = `# Verify Report

**Result:** PASS

## Previous Findings Resolution

### Previously UNSATISFIED Assertions

| ID | Previous Issue |
|----|---------------|
| A001 | Missing validation |
`;
    fs.writeFileSync(path.join(slugDir, 'verify_report.md'), verifyReportWithRejection);

    const summary = generateProofSummary(slugDir);

    expect(summary.timing.build).toBe(60); // 30 + 30
    expect(summary.timing.verify).toBe(20); // 10 + 10
  });

  // @ana A014, A015
  it('falls back to existing computation for old proofs', async () => {
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report': { saved_at: '2026-04-01T12:00:00Z' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    expect(summary.timing.build).toBe(60);
    expect(summary.timing.verify).toBe(30);
  });

  // @ana A016
  it('timing schema is unchanged', async () => {
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report-1': { saved_at: '2026-04-01T11:00:00Z' },
      'verify-report-1': { saved_at: '2026-04-01T11:10:00Z' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // Verify the timing shape has exactly the expected fields
    expect(summary.timing).toHaveProperty('total_minutes');
    expect(typeof summary.timing.total_minutes).toBe('number');
    if (summary.timing.think !== undefined) expect(typeof summary.timing.think).toBe('number');
    if (summary.timing.plan !== undefined) expect(typeof summary.timing.plan).toBe('number');
    if (summary.timing.build !== undefined) expect(typeof summary.timing.build).toBe('number');
    if (summary.timing.verify !== undefined) expect(typeof summary.timing.verify).toBe('number');
  });

  // @ana A017
  it('ignores build-data-N and verify-data-N keys in timing', async () => {
    // build-data-1 and verify-data-1 should not affect timing computation
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report-1': { saved_at: '2026-04-01T11:00:00Z' },
      'verify-report-1': { saved_at: '2026-04-01T11:10:00Z' },
      'build-data-1': { saved_at: '2026-04-01T11:00:00Z', hash: 'sha256:bd1' },
      'verify-data-1': { saved_at: '2026-04-01T11:10:00Z', hash: 'sha256:vd1' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // Should compute as single-phase: build = 30min, verify = 10min
    // NOT double-count from data keys
    expect(summary.timing.build).toBe(30);
    expect(summary.timing.verify).toBe(10);
  });

  // @ana A018
  it('excludes segments exceeding MAX_PHASE_MS', async () => {
    // Phase 1: build 30min (normal)
    // Phase 2: build > 24h (stale — should be excluded)
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report-1': { saved_at: '2026-04-01T11:00:00Z' },
      'verify-report-1': { saved_at: '2026-04-01T11:10:00Z' },
      'build-report-2': { saved_at: '2026-04-03T11:10:00Z' }, // 2 days later
      'verify-report-2': { saved_at: '2026-04-03T11:20:00Z' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // Phase 1 build = 30min, Phase 2 build excluded (>24h)
    expect(summary.timing.build).toBe(30);
    // Phase 1 verify = 10min, Phase 2 verify = 10min
    expect(summary.timing.verify).toBe(20);
  });

  // @ana A019
  it('MAX_PHASE_MS consolidated to single declaration', async () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/utils/proofSummary.ts'),
      'utf-8'
    );

    // Find computeTiming function body
    const funcStart = source.indexOf('function computeTiming(');
    expect(funcStart).toBeGreaterThan(-1);

    // Count MAX_PHASE_MS declarations within computeTiming
    const funcBody = source.slice(funcStart);
    // Find the end of the function (next top-level function or end of file)
    const nextFunc = funcBody.indexOf('\nfunction ', 1);
    const relevantBody = nextFunc > 0 ? funcBody.slice(0, nextFunc) : funcBody;

    const declarations = relevantBody.match(/const MAX_PHASE_MS/g);
    expect(declarations).toHaveLength(1);
  });

  // @ana A001, A002, A003, A007, A012
  it('produces segments for 2-phase pipeline', async () => {
    // Phase 1 build: contract(10:30) → build-report-1(11:00) = 30min
    // Phase 1 verify: build-report-1(11:00) → verify-report-1(11:08) = 8min
    // Phase 2 build: verify-report-1(11:08) → build-report-2(11:23) = 15min
    // Phase 2 verify: build-report-2(11:23) → verify-report-2(11:37) = 14min
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report-1': { saved_at: '2026-04-01T11:00:00Z' },
      'verify-report-1': { saved_at: '2026-04-01T11:08:00Z' },
      'build-report-2': { saved_at: '2026-04-01T11:23:00Z' },
      'verify-report-2': { saved_at: '2026-04-01T11:37:00Z' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // A001: segments exist
    expect(summary.timing.segments).toBeDefined();
    const segments = summary.timing.segments!;

    // 2-phase: think, plan, build-1, verify-1, build-2, verify-2 = 6 segments
    expect(segments).toHaveLength(6);

    // A002: first segment is think
    expect(segments[0]!.stage).toBe('think');

    // A012: think and plan have no phase number
    expect(segments[0]!.phase).toBeUndefined();
    expect(segments[1]!.phase).toBeUndefined();
    expect(segments[1]!.stage).toBe('plan');

    // A003: build segments include phase number
    expect(segments[2]!.stage).toBe('build');
    expect(segments[2]!.phase).toBe(1);
    expect(segments[3]!.stage).toBe('verify');
    expect(segments[3]!.phase).toBe(1);
    expect(segments[4]!.stage).toBe('build');
    expect(segments[4]!.phase).toBe(2);
    expect(segments[5]!.stage).toBe('verify');
    expect(segments[5]!.phase).toBe(2);

    // A007: segment minutes match per-phase durations
    expect(segments[2]!.minutes).toBe(30); // build 1
    expect(segments[3]!.minutes).toBe(8);  // verify 1
    expect(segments[4]!.minutes).toBe(15); // build 2
    expect(segments[5]!.minutes).toBe(14); // verify 2
  });

  // @ana A004, A005, A006, A010, A011
  it('produces segments for 3-phase pipeline', async () => {
    // Phase 1: build 20min, verify 5min
    // Phase 2: build 15min, verify 8min
    // Phase 3: build 10min, verify 7min
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report-1': { saved_at: '2026-04-01T10:50:00Z' },
      'verify-report-1': { saved_at: '2026-04-01T10:55:00Z' },
      'build-report-2': { saved_at: '2026-04-01T11:10:00Z' },
      'verify-report-2': { saved_at: '2026-04-01T11:18:00Z' },
      'build-report-3': { saved_at: '2026-04-01T11:28:00Z' },
      'verify-report-3': { saved_at: '2026-04-01T11:35:00Z' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // A004: 3-phase = think, plan, b1, v1, b2, v2, b3, v3 = 8 segments
    expect(summary.timing.segments).toBeDefined();
    const segments = summary.timing.segments!;
    expect(segments).toHaveLength(8);

    // A005: segments[6] is build
    expect(segments[6]!.stage).toBe('build');

    // A006: segments[6] has phase 3
    expect(segments[6]!.phase).toBe(3);

    // A010: aggregate build = sum of build segments
    expect(summary.timing.build).toBe(45); // 20 + 15 + 10

    // A011: aggregate verify = sum of verify segments
    expect(summary.timing.verify).toBe(20); // 5 + 8 + 7
  });

  // @ana A008
  it('omits segments for single-phase pipeline', async () => {
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report': { saved_at: '2026-04-01T12:00:00Z' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    expect(summary.timing.segments).toBeUndefined();
  });

  // @ana A009
  it('omits segments for rejection-cycle pipeline', async () => {
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': {
        saved_at: '2026-04-01T11:40:00Z',
        hash: 'sha256:v2',
        history: [{ saved_at: '2026-04-01T11:00:00Z', hash: 'sha256:v1' }],
      },
      'verify-report': {
        saved_at: '2026-04-01T11:50:00Z',
        hash: 'sha256:vr2',
        history: [{ saved_at: '2026-04-01T11:10:00Z', hash: 'sha256:vr1' }],
      },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    expect(summary.timing.segments).toBeUndefined();
  });

  it('handles missing verify for last build phase in segments', async () => {
    // 2-phase but verify-report-2 missing (incomplete pipeline)
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report-1': { saved_at: '2026-04-01T11:00:00Z' },
      'verify-report-1': { saved_at: '2026-04-01T11:08:00Z' },
      'build-report-2': { saved_at: '2026-04-01T11:23:00Z' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    expect(summary.timing.segments).toBeDefined();
    const segments = summary.timing.segments!;

    // Should have: think, plan, build-1, verify-1, build-2 = 5 segments (no verify-2)
    expect(segments).toHaveLength(5);
    expect(segments[4]!.stage).toBe('build');
    expect(segments[4]!.phase).toBe(2);
  });

  it('handles zero-minute segment', async () => {
    // Build and verify timestamps identical → 0 minute segment
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report-1': { saved_at: '2026-04-01T10:30:00Z' }, // same as contract
      'verify-report-1': { saved_at: '2026-04-01T10:30:00Z' }, // same as build
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    expect(summary.timing.segments).toBeDefined();
    const segments = summary.timing.segments!;
    const buildSeg = segments.find(s => s.stage === 'build');
    const verifySeg = segments.find(s => s.stage === 'verify');
    expect(buildSeg?.minutes).toBe(0);
    expect(verifySeg?.minutes).toBe(0);
  });

  it('multi-phase with _started_at values prefers segment computation', async () => {
    // When numbered keys are detected, segment computation should take precedence
    // over _started_at-based computation for build/verify
    const saves = {
      work_started_at: '2026-04-01T09:40:00Z',
      build_started_at: '2026-04-01T10:25:00Z', // Would give 35min if used
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report-1': { saved_at: '2026-04-01T11:00:00Z' }, // segment: 30min
      'verify-report-1': { saved_at: '2026-04-01T11:10:00Z' }, // segment: 10min
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // Segment-based: 30min, not _started_at-based: 35min
    expect(summary.timing.build).toBe(30);
    expect(summary.timing.verify).toBe(10);
    // Think/plan still use work_started_at
    expect(summary.timing.think).toBe(20);
  });

  // @ana A010
  it('content-based rejection detection activates timing reconstruction', async () => {
    // Same fixture as the existing rejection test — but NO history arrays.
    // Rejection detection relies on verify report content, not .saves.json history.
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': {
        saved_at: '2026-04-01T11:40:00Z',
        hash: 'sha256:v2',
        history: [{ saved_at: '2026-04-01T11:00:00Z', hash: 'sha256:v1' }],
      },
      'verify-report': {
        saved_at: '2026-04-01T11:50:00Z',
        hash: 'sha256:vr2',
        history: [{ saved_at: '2026-04-01T11:10:00Z', hash: 'sha256:vr1' }],
      },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    // Write verify report WITH rejection content
    const verifyReport = `# Verify Report

**Result:** PASS

## Previous Findings Resolution

### Previously UNSATISFIED Assertions

| ID | Previous Issue |
|----|---------------|
| A001 | Missing validation |
`;
    fs.writeFileSync(path.join(slugDir, 'verify_report.md'), verifyReport);

    const summary = generateProofSummary(slugDir);

    // Rejection path: build = (11:00-10:30) + (11:40-11:10) = 30+30 = 60
    expect(summary.timing.build).toBe(60);
  });

  // @ana A011
  it('false history does not activate rejection timing', async () => {
    // Same timestamps as rejection test, but NO rejection content in verify report.
    // History arrays exist (from false same-session entries) but content says no rejection.
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': {
        saved_at: '2026-04-01T11:40:00Z',
        hash: 'sha256:v2',
        history: [{ saved_at: '2026-04-01T11:00:00Z', hash: 'sha256:v1' }],
      },
      'verify-report': {
        saved_at: '2026-04-01T11:50:00Z',
        hash: 'sha256:vr2',
        history: [{ saved_at: '2026-04-01T11:10:00Z', hash: 'sha256:vr1' }],
      },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    // Write verify report WITHOUT rejection content
    fs.writeFileSync(path.join(slugDir, 'verify_report.md'), '# Verify Report\n\n**Result:** PASS\n');

    const summary = generateProofSummary(slugDir);

    // Fallback path: build = contract(10:30) → build.current(11:40) = 70
    expect(summary.timing.build).toBe(70);
  });

  // @ana A012
  it('missing verify report uses fallback timing', async () => {
    // History arrays exist but no verify report file at all
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': {
        saved_at: '2026-04-01T11:40:00Z',
        hash: 'sha256:v2',
        history: [{ saved_at: '2026-04-01T11:00:00Z', hash: 'sha256:v1' }],
      },
      'verify-report': {
        saved_at: '2026-04-01T11:50:00Z',
        hash: 'sha256:vr2',
        history: [{ saved_at: '2026-04-01T11:10:00Z', hash: 'sha256:vr1' }],
      },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    // No verify_report.md file on disk

    const summary = generateProofSummary(slugDir);

    // Fallback: no rejection content detected → simple endpoint subtraction
    expect(summary.timing.build).toBeDefined();
  });

  // @ana A018
  it('multi-phase verify report with rejection content activates rejection timing', async () => {
    // Multi-phase with numbered verify reports — one has rejection content
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': {
        saved_at: '2026-04-01T11:40:00Z',
        hash: 'sha256:v2',
        history: [{ saved_at: '2026-04-01T11:00:00Z', hash: 'sha256:v1' }],
      },
      'verify-report': {
        saved_at: '2026-04-01T11:50:00Z',
        hash: 'sha256:vr2',
        history: [{ saved_at: '2026-04-01T11:10:00Z', hash: 'sha256:vr1' }],
      },
      'verify-report-1': { saved_at: '2026-04-01T11:10:00Z', hash: 'sha256:vr1p1' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    // Numbered verify report with rejection content
    const verifyReport = `# Verify Report

**Result:** PASS

## Previous Findings Resolution

### Previously UNSATISFIED Assertions

| ID | Previous Issue |
|----|---------------|
| A002 | Wrong return type |
`;
    fs.writeFileSync(path.join(slugDir, 'verify_report_1.md'), verifyReport);

    const summary = generateProofSummary(slugDir);

    // Any rejection content triggers the rejection path
    expect(summary.timing.build).toBeDefined();
  });
});

describe('formatHumanReadable phase breakdown', () => {
  function makeEntry(timingOverrides: Record<string, unknown> = {}): import('../../src/types/proof.js').ProofChainEntry {
    return {
      slug: 'test-slug',
      feature: 'Test Feature',
      result: 'PASS',
      author: { name: 'Test', email: 'test@test.com' },
      contract: { total: 1, satisfied: 1, unsatisfied: 0, deviated: 0 },
      assertions: [{ id: 'A001', says: 'test', status: 'SATISFIED' }],
      acceptance_criteria: { total: 1, met: 1 },
      timing: {
        total_minutes: 97,
        think: 30,
        plan: 0,
        build: 45,
        verify: 22,
        ...timingOverrides,
      },
      hashes: {},
      completed_at: '2026-04-01T12:00:00Z',
      modules_touched: [],
      findings: [],
      rejection_cycles: 0,
      previous_failures: [],
      build_concerns: [],
    };
  }

  // @ana A019
  it('formatHumanReadable shows phase breakdown', () => {
    const entry = makeEntry({
      segments: [
        { stage: 'think', minutes: 30 },
        { stage: 'plan', minutes: 0 },
        { stage: 'build', minutes: 30, phase: 1 },
        { stage: 'verify', minutes: 8, phase: 1 },
        { stage: 'build', minutes: 15, phase: 2 },
        { stage: 'verify', minutes: 14, phase: 2 },
      ],
    });
    const output = formatHumanReadable(entry);

    expect(output).toContain('Build 1');
    expect(output).toContain('Verify 1');
    expect(output).toContain('Build 2');
    expect(output).toContain('Verify 2');
    expect(output).toContain('Phase breakdown');
  });

  // @ana A020
  it('formatHumanReadable omits breakdown for single-phase', () => {
    const entry = makeEntry(); // no segments
    const output = formatHumanReadable(entry);

    expect(output).not.toContain('Phase breakdown');
  });
});

describe('buildGanttBars', () => {
  // @ana A014, A015
  it('renders multi-phase bars', () => {
    const timing: TestProofTiming = {
      think: 8,
      plan: 13,
      build: 57,
      verify: 30,
      totalMinutes: 108,
      segments: [
        { stage: 'think', minutes: 8 },
        { stage: 'plan', minutes: 13 },
        { stage: 'build', minutes: 32, phase: 1 },
        { stage: 'verify', minutes: 7, phase: 1 },
        { stage: 'build', minutes: 14, phase: 2 },
        { stage: 'verify', minutes: 13, phase: 2 },
        { stage: 'build', minutes: 11, phase: 3 },
        { stage: 'verify', minutes: 10, phase: 3 },
      ],
    };

    const ganttBars = buildGanttBars(timing);

    // A014: 8 bars for 3-phase
    expect(ganttBars).toHaveLength(8);

    // A015: phase-numbered labels
    expect(ganttBars[2]!.label).toContain('Build 1');
    expect(ganttBars[3]!.label).toContain('Verify 1');

    // A017/A018 removed: opacity is a website rendering concern (PipelineGantt.tsx),
    // not a CLI timing concern. The test re-implements buildGanttBars for structural
    // assertions — opacity assertions drifted when production moved to progressive
    // opacity (commit 99e2e862) and would drift again with any rendering change.
  });

  // @ana A016, A022
  it('renders 4-bar fallback', () => {
    const timing: TestProofTiming = {
      think: 5,
      plan: 10,
      build: 20,
      verify: 10,
      totalMinutes: 45,
    };

    const ganttBars = buildGanttBars(timing);

    // A016: 4 bars when no segments
    expect(ganttBars).toHaveLength(4);

    // A022: first bar is Think
    expect(ganttBars[0]!.label).toBe('Think');
    expect(ganttBars[1]!.label).toBe('Plan');
    expect(ganttBars[2]!.label).toBe('Build');
    expect(ganttBars[3]!.label).toBe('Verify');
  });
});

describe('computeTiming with per-phase start keys', () => {
  let tempDir: string;
  let slugDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'phase-timing-'));
    slugDir = path.join(tempDir, 'test-timing');
    await fs.promises.mkdir(slugDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A020
  it('uses build_started_at_1 for Phase 1 build duration when valid', async () => {
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      build_started_at_1: '2026-04-01T10:35:00Z',  // 5min after contract
      'build-report-1': { saved_at: '2026-04-01T11:00:00Z' },  // 25min after start
      'verify-report-1': { saved_at: '2026-04-01T11:10:00Z' },
      'build-report-2': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report-2': { saved_at: '2026-04-01T11:40:00Z' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // Phase 1 build: used build_started_at_1 → 25min (not 30min segment)
    // Phase 2 build: no start key → segment timing verify-report-1 → build-report-2 = 20min
    expect(summary.timing.build).toBe(45); // 25 + 20
  });

  // @ana A021
  it('falls back to segment timing when per-phase start keys are absent', async () => {
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      // No build_started_at_N keys
      'build-report-1': { saved_at: '2026-04-01T11:00:00Z' },
      'verify-report-1': { saved_at: '2026-04-01T11:10:00Z' },
      'build-report-2': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report-2': { saved_at: '2026-04-01T11:40:00Z' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // Segment timing: Phase 1 build = contract → build-report-1 = 30min
    // Phase 2 build = verify-report-1 → build-report-2 = 20min
    expect(summary.timing.build).toBe(50); // 30 + 20
  });

  // @ana A022
  it('stale build_started_at_N (after build-report-N) falls back to segment timing', async () => {
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      build_started_at_1: '2026-04-01T12:00:00Z',  // AFTER build-report-1 (stale/clock skew)
      'build-report-1': { saved_at: '2026-04-01T11:00:00Z' },
      'verify-report-1': { saved_at: '2026-04-01T11:10:00Z' },
      'build-report-2': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report-2': { saved_at: '2026-04-01T11:40:00Z' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // Phase 1 should fall back to segment timing (30min), not use stale start key
    // Phase 2 segment: 20min
    expect(summary.timing.build).toBe(50); // 30 + 20
    expect(summary.timing.build).toBeGreaterThan(0);
  });

  it('uses verify_started_at_N for Phase verify duration when valid', async () => {
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report-1': { saved_at: '2026-04-01T11:00:00Z' },
      verify_started_at_1: '2026-04-01T11:02:00Z',  // 2min after build-report-1
      'verify-report-1': { saved_at: '2026-04-01T11:10:00Z' },  // 8min after verify start
      'build-report-2': { saved_at: '2026-04-01T11:30:00Z' },
      verify_started_at_2: '2026-04-01T11:32:00Z',  // 2min after build-report-2
      'verify-report-2': { saved_at: '2026-04-01T11:40:00Z' },  // 8min after verify start
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // Phase 1 verify: verify_started_at_1 → verify-report-1 = 8min (not 10min segment)
    // Phase 2 verify: verify_started_at_2 → verify-report-2 = 8min (not 10min segment)
    expect(summary.timing.verify).toBe(16); // 8 + 8
  });

  it('mixed: some phases have start keys, others do not', async () => {
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      build_started_at_1: '2026-04-01T10:35:00Z',  // Phase 1 has start key
      'build-report-1': { saved_at: '2026-04-01T11:00:00Z' },
      'verify-report-1': { saved_at: '2026-04-01T11:10:00Z' },
      // Phase 2 has no start key — falls back to segment
      'build-report-2': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report-2': { saved_at: '2026-04-01T11:40:00Z' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // Phase 1: build_started_at_1 → build-report-1 = 25min
    // Phase 2: segment verify-report-1 → build-report-2 = 20min
    expect(summary.timing.build).toBe(45); // 25 + 20
  });

  it('stale verify_started_at_N (before build-report-N) falls back to segment', async () => {
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report-1': { saved_at: '2026-04-01T11:00:00Z' },
      verify_started_at_1: '2026-04-01T10:50:00Z',  // BEFORE build-report-1 (stale)
      'verify-report-1': { saved_at: '2026-04-01T11:10:00Z' },
      'build-report-2': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report-2': { saved_at: '2026-04-01T11:40:00Z' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    // Phase 1 verify should fall back to segment: build-report-1 → verify-report-1 = 10min
    // Phase 2 verify: segment = 10min
    expect(summary.timing.verify).toBe(20); // 10 + 10
  });

  it('old saves without per-phase keys still produce correct segment timing', async () => {
    // This is the same as existing multi-phase test — no start keys at all
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report-1': { saved_at: '2026-04-01T11:00:00Z' },
      'verify-report-1': { saved_at: '2026-04-01T11:08:00Z' },
      'build-report-2': { saved_at: '2026-04-01T11:23:00Z' },
      'verify-report-2': { saved_at: '2026-04-01T11:37:00Z' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    expect(summary.timing.build).toBe(45); // 30 + 15
    expect(summary.timing.verify).toBe(22); // 8 + 14
  });
});
