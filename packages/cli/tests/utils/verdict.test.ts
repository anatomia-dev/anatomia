import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  deriveVerdict,
  RESULT_HEADLINE_PATTERN,
  evaluateReadBuildReportVeto,
  VERIFY_INDEPENDENCE_CLAIM_ID,
} from '../../src/utils/verdict.js';
import { getVerifyResult } from '../../src/commands/work-state.js';
import { readLocalVerifyResult } from '../../src/commands/artifact.js';
import { extractVerifyResult } from '../../src/commands/pr.js';
import { validateVerifyReportFormat } from '../../src/commands/artifact-validators.js';
import type { ComplianceAttestation, ComplianceVerdictRecord } from '../../src/types/proof.js';

/**
 * Build a minimal verify-report markdown body.
 *
 * @param headline - The `**Result:**` value, or null to omit the line entirely
 * @param rows - Compliance rows as `[id, status]` tuples; omit for no table
 * @returns Report markdown
 */
function report(
  headline: 'PASS' | 'FAIL' | null,
  rows?: Array<[string, string]>,
): string {
  const head = headline ? `**Result:** ${headline}\n\n` : '# Verify Report\n\n';
  if (!rows) return head;
  const tableRows = rows.map(([id, status]) => `| ${id} | does a thing | ${status} | line 1 |`).join('\n');
  return `${head}## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
${tableRows}

## Findings
`;
}

const cleanPass = report('PASS', [['A001', '✅ SATISFIED'], ['A002', '✅ SATISFIED']]);
const contradictedPass = report('PASS', [['A001', '✅ SATISFIED'], ['A003', '❌ UNSATISFIED']]);
const multiContradiction = report('PASS', [['A001', '❌ UNSATISFIED'], ['A002', '❌ UNSATISFIED']]);
const failHeadline = report('FAIL', [['A001', '❌ UNSATISFIED']]);
const noHeadline = report(null, [['A001', '✅ SATISFIED']]);
const passNoTable = report('PASS');

describe('deriveVerdict', () => {
  // @ana A006
  it('returns PASS for a clean passing report with no contradictions', () => {
    const v = deriveVerdict(cleanPass);
    expect(v.result).toBe('PASS');
    expect(v.headline).toBe('PASS');
    expect(v.contradictions).toEqual([]);
  });

  // @ana A007
  it('coerces a PASS to FAIL when a compliance row is UNSATISFIED', () => {
    const v = deriveVerdict(contradictedPass);
    expect(v.result).toBe('FAIL');
    // The raw headline is preserved — only the effective result is coerced.
    expect(v.headline).toBe('PASS');
  });

  // @ana A008
  it('reports the UNSATISFIED contradiction reason naming the row', () => {
    const v = deriveVerdict(contradictedPass);
    expect(v.contradictions.length).toBe(1);
    expect(v.contradictions[0]).toContain('UNSATISFIED row');
    expect(v.contradictions[0]).toBe('PASS headline contradicts UNSATISFIED row A003');
  });

  it('emits one contradiction reason per offending UNSATISFIED row', () => {
    const v = deriveVerdict(multiContradiction);
    expect(v.result).toBe('FAIL');
    expect(v.contradictions).toEqual([
      'PASS headline contradicts UNSATISFIED row A001',
      'PASS headline contradicts UNSATISFIED row A002',
    ]);
  });

  // @ana A011
  it('returns FAIL for a FAIL headline (no contradictions array populated)', () => {
    const v = deriveVerdict(failHeadline);
    expect(v.result).toBe('FAIL');
    expect(v.headline).toBe('FAIL');
    // A FAIL headline is never "contradicted" — contradictions only apply to a coerced PASS.
    expect(v.contradictions).toEqual([]);
  });

  // @ana A012
  it('returns UNKNOWN when no Result line exists', () => {
    const v = deriveVerdict(noHeadline);
    expect(v.result).toBe('UNKNOWN');
    expect(v.headline).toBe('UNKNOWN');
    expect(v.contradictions).toEqual([]);
  });

  it('returns UNKNOWN for empty content', () => {
    const v = deriveVerdict('');
    expect(v.result).toBe('UNKNOWN');
  });

  it('trusts a PASS headline when there is no compliance table (old report format)', () => {
    // Backward-compat: no table = no contradiction signal, so the headline stands.
    const v = deriveVerdict(passNoTable);
    expect(v.result).toBe('PASS');
    expect(v.contradictions).toEqual([]);
  });
});

describe('verdict module honesty boundary (source doc)', () => {
  const verdictSource = fs.readFileSync(
    path.join(__dirname, '../../src/utils/verdict.ts'),
    'utf-8',
  );

  // @ana A019
  it('states the verdict is self-authored (honest boundary)', () => {
    expect(verdictSource).toContain('self-authored');
    expect(verdictSource).toContain('one-word-forgeable');
  });

  // @ana A020
  it('never over-claims that the agent is unable to lie', () => {
    expect(verdictSource).not.toContain("can't lie");
  });

  // @ana A016
  it('the old duplicate parseResult is gone from proofSummary (one parser only)', () => {
    const proofSummarySource = fs.readFileSync(
      path.join(__dirname, '../../src/utils/proofSummary.ts'),
      'utf-8',
    );
    expect(proofSummarySource).not.toContain('function parseResult');
  });
});

describe('RESULT_HEADLINE_PATTERN', () => {
  it('is a shared presence regex matching the **Result:** headline', () => {
    expect(RESULT_HEADLINE_PATTERN.test('**Result:** PASS')).toBe(true);
    expect(RESULT_HEADLINE_PATTERN.test('**Result:** FAIL')).toBe(true);
    expect(RESULT_HEADLINE_PATTERN.test('no result line here')).toBe(false);
  });

  it('has no global flag, so repeated .test() is stateless', () => {
    expect(RESULT_HEADLINE_PATTERN.global).toBe(false);
    // Without /g, lastIndex never advances — two calls on the same input agree.
    expect(RESULT_HEADLINE_PATTERN.test('**Result:** PASS')).toBe(true);
    expect(RESULT_HEADLINE_PATTERN.test('**Result:** PASS')).toBe(true);
  });
});

// Routing tests: one contradicted-PASS fixture, three callers. Each must return
// the COERCED result, not the raw PASS headline — proving the single verdict
// source reaches every consumer.
describe('verdict routing — every consumer sees the coerced result', () => {
  // @ana A013
  it('getVerifyResult returns FAIL for a contradicted-PASS report', () => {
    expect(getVerifyResult(contradictedPass)).toBe('FAIL');
    // Lowercase-unknown contract preserved.
    expect(getVerifyResult(noHeadline)).toBe('unknown');
    expect(getVerifyResult(cleanPass)).toBe('PASS');
  });

  // @ana A015
  it('pr.ts extractVerifyResult returns FAIL for a contradicted-PASS report', () => {
    expect(extractVerifyResult(contradictedPass)).toBe('FAIL');
    // null-for-unknown contract preserved.
    expect(extractVerifyResult(noHeadline)).toBeNull();
    expect(extractVerifyResult(cleanPass)).toBe('PASS');
  });

  describe('readLocalVerifyResult (file-based)', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // @ana A014
    it('returns FAIL for a contradicted-PASS report read from a file', () => {
      const filePath = path.join(tmpDir, 'verify_report.md');
      fs.writeFileSync(filePath, contradictedPass);
      expect(readLocalVerifyResult(filePath)).toBe('FAIL');
    });

    it('returns unknown for a missing file', () => {
      expect(readLocalVerifyResult(path.join(tmpDir, 'nope.md'))).toBe('unknown');
    });
  });
});

// The deterministic read-build-report veto (Component 3). The veto fires on
// EXACTLY one claim under EXACTLY four conditions: role=verify ∧
// claim=verify-independence ∧ status=violated ∧ source=deterministic. Each test
// flips one condition off and asserts the veto stays silent — and gates on
// `source`, never the drift-prone `reason`.
describe('evaluateReadBuildReportVeto', () => {
  /** Build one compact verdict record with sensible defaults. */
  function verdict(over: Partial<ComplianceVerdictRecord> = {}): ComplianceVerdictRecord {
    return {
      claim_id: VERIFY_INDEPENDENCE_CLAIM_ID,
      says: 'never read the build report',
      status: 'violated',
      reason: 'predicate-not-matched',
      source: 'deterministic',
      ...over,
    };
  }

  /** Build one behavioral attestation with sensible defaults. */
  function record(over: Partial<ComplianceAttestation> = {}): ComplianceAttestation {
    return {
      role: 'verify',
      harness: 'claude',
      session_id: 'sess-1',
      captured_at: '2026-06-16T00:00:00.000Z',
      anatrace_core_version: '0.4.0',
      framework: 'anatomia',
      mandate_hash: 'sha256:a',
      transcript_hash: 'sha256:b',
      coverage: { total: 5, fully_checked: 5, unverifiable: 0 },
      complete: true,
      verdicts: [verdict()],
      ...over,
    };
  }

  // @ana A021 — all four conditions met → veto applies.
  it('applies when verify deterministically violated verify-independence', () => {
    const veto = evaluateReadBuildReportVeto([record()]);
    expect(veto.applied).toBe(true);
    expect(veto.reason).toContain('build_report.md');
  });

  // @ana A022 — a satisfied verify-independence claim does NOT gate.
  it('does not apply when the claim is satisfied (verify avoided the report)', () => {
    const veto = evaluateReadBuildReportVeto([
      record({ verdicts: [verdict({ status: 'satisfied', reason: 'predicate-matched' })] }),
    ]);
    expect(veto.applied).not.toBe(true);
  });

  // @ana A023 — a non-deterministic verdict (LLM-judged or unmarked) never gates.
  it('does not apply when source is not deterministic (llm channel)', () => {
    const veto = evaluateReadBuildReportVeto([
      record({ verdicts: [verdict({ source: 'llm' })] }),
    ]);
    expect(veto.applied).not.toBe(true);
  });

  // @ana A026 — a legacy record (no source at all) is forward-only non-gating.
  it('does not apply when source is absent (pre-Component-3 legacy record)', () => {
    const legacy = verdict();
    delete legacy.source;
    const veto = evaluateReadBuildReportVeto([record({ verdicts: [legacy] })]);
    expect(veto.applied).not.toBe(true);
  });

  // @ana A024 — the veto fires on exactly one claim and one role.
  it('does not apply for a different claim id', () => {
    const veto = evaluateReadBuildReportVeto([
      record({ verdicts: [verdict({ claim_id: 'ana-verify:no-code-branch-mutation:git-push---force' })] }),
    ]);
    expect(veto.applied).not.toBe(true);
  });

  // @ana A024 — a non-verify role never gates, even with the exact violated+deterministic verdict.
  it('does not apply for a non-verify role (build session)', () => {
    const veto = evaluateReadBuildReportVeto([record({ role: 'build' })]);
    expect(veto.applied).not.toBe(true);
  });

  // @ana A027 — no captured records → not applied, stated openly (never a silent skip).
  it('does not apply with no records, and says so openly', () => {
    const veto = evaluateReadBuildReportVeto([]);
    expect(veto.applied).toBe(false);
    expect(veto.reason).toContain('no captured transcript');
  });

  // Edge case (spec): multiple verify sessions (rework) where ONE read the report → veto applies.
  it('applies when any one of several verify sessions read the report', () => {
    const clean = record({
      session_id: 'verify-1',
      verdicts: [verdict({ status: 'satisfied', reason: 'predicate-matched' })],
    });
    const dirty = record({ session_id: 'verify-2' });
    expect(evaluateReadBuildReportVeto([clean, dirty]).applied).toBe(true);
  });
});

// validateVerifyReportFormat shares RESULT_HEADLINE_PATTERN but keeps its
// PRESENCE-only intent — it guards that the Result line exists at save time and
// does NOT derive/coerce the verdict.
describe('validateVerifyReportFormat (presence check, not parser)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-validate-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Write a verify report and validate it. */
  function validate(body: string): string | null {
    const filePath = path.join(tmpDir, 'verify_report.md');
    fs.writeFileSync(filePath, body);
    return validateVerifyReportFormat(filePath);
  }

  // @ana A018
  it('rejects a report missing its Result line', () => {
    const error = validate('# Verify Report\n\nNo verdict here.\n');
    expect(error).not.toBeNull();
    expect(error).toContain('Result');
  });

  it('accepts a report with a Result line in the first 10 lines', () => {
    expect(validate(cleanPass)).toBeNull();
  });

  it('still accepts a contradicted-PASS report — presence, not coercion', () => {
    // The validator only checks the line EXISTS; coercion is deriveVerdict's job.
    expect(validate(contradictedPass)).toBeNull();
  });
});
