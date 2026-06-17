import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  extractScopeACs,
  joinCoverage,
  evaluateCoverageGate,
  validateContractFormat,
} from '../../src/commands/artifact-validators.js';
import type { ContractSchema } from '../../src/types/contract.js';

/**
 * Unit tests for the scope-AC extractor + the pre-seal coverage gate.
 *
 * Pure-function tests — no temp dirs except the single validateContractFormat
 * case (it reads from a path). Inline fixture strings only; the live-corpus
 * sweep lives in scope-ac-corpus.test.ts.
 */

// A scope exercising all four AC forms in one document.
const FOUR_FORMS_SCOPE = `# Some feature

## Acceptance Criteria

- AC1: dash-bullet form is recognized

## AC2: heading form is recognized

Prose that references one criterion in bold: **AC3** must hold.

AC4: bare-label form is recognized
`;

// A scope that shows AC-signal (the heading) but no recoverable ids.
const AMBIGUOUS_SCOPE = `# Some feature

## Acceptance Criteria

The feature must do the right thing.
Criterion one: it works.
Criterion two: it is fast.
`;

// A build-only scope with no AC section at all.
const NO_AC_SCOPE = `# Some chore

## Overview

Pure refactor — no behavioral acceptance criteria.

## Approach

Move code around.
`;

const THREE_AC_SCOPE = `## Acceptance Criteria

- AC1: alpha
- AC2: beta
- AC3: gamma
`;

const ONE_AC_SCOPE = `## Acceptance Criteria

- AC1: alpha
`;

describe('extractScopeACs', () => {
  // @ana A001
  it('recovers ids from the dash-bullet `- AC1:` form', () => {
    const result = extractScopeACs(FOUR_FORMS_SCOPE);
    expect(result.ids).toContain('AC1');
  });

  // @ana A002
  it('recovers ids from the `## AC2` heading form', () => {
    const result = extractScopeACs(FOUR_FORMS_SCOPE);
    expect(result.ids).toContain('AC2');
  });

  // @ana A003
  it('recovers ids from the `**AC3**` bold form', () => {
    const result = extractScopeACs(FOUR_FORMS_SCOPE);
    expect(result.ids).toContain('AC3');
  });

  // @ana A004
  it('recovers ids from the bare `AC4:` label form', () => {
    const result = extractScopeACs(FOUR_FORMS_SCOPE);
    expect(result.ids).toContain('AC4');
  });

  // @ana A005
  it('marks a clean, well-formed scope as not ambiguous', () => {
    const result = extractScopeACs(FOUR_FORMS_SCOPE);
    expect(result.ambiguous).not.toBe(true);
  });

  // @ana A008
  it('marks an AC section with no recoverable ids as ambiguous (fail-open signal)', () => {
    const result = extractScopeACs(AMBIGUOUS_SCOPE);
    expect(result.ambiguous).toBe(true);
  });

  it('returns empty + non-ambiguous for a build-only scope with no AC section', () => {
    const result = extractScopeACs(NO_AC_SCOPE);
    expect(result.ids).toEqual([]);
    expect(result.ambiguous).toBe(false);
  });

  it('de-duplicates an AC mentioned in both a heading and a bullet', () => {
    const scope = `## Acceptance Criteria

## AC1: heading mention

- AC1: bullet mention of the same criterion
`;
    const result = extractScopeACs(scope);
    expect(result.ids).toEqual(['AC1']);
  });

  it('recovers multi-digit ids (AC10, AC11)', () => {
    const scope = `## Acceptance Criteria

- AC10: tenth
- AC11: eleventh
`;
    const result = extractScopeACs(scope);
    expect(result.ids).toContain('AC10');
    expect(result.ids).toContain('AC11');
  });

  it('never throws on empty input', () => {
    expect(() => extractScopeACs('')).not.toThrow();
    expect(extractScopeACs('').ids).toEqual([]);
    expect(extractScopeACs('').ambiguous).toBe(false);
  });
});

describe('joinCoverage', () => {
  it('marks an AC linked by an assertion `ac:` as pinned', () => {
    const contract: ContractSchema = {
      version: '1.1',
      assertions: [{ id: 'X1', says: 's', ac: 'AC1', matcher: 'equals', value: 1 }],
    };
    const join = joinCoverage(ONE_AC_SCOPE, contract);
    const ac1 = join.acs.find(a => a.id === 'AC1');
    expect(ac1?.status).toBe('pinned');
    expect(ac1?.assertions).toEqual(['X1']);
  });

  it('honors one assertion serving multiple ACs via `ac: [AC1, AC2]`', () => {
    const contract: ContractSchema = {
      version: '1.1',
      assertions: [{ id: 'X1', says: 's', ac: ['AC1', 'AC2'], matcher: 'equals', value: 1 }],
    };
    const join = joinCoverage(THREE_AC_SCOPE, contract);
    expect(join.acs.find(a => a.id === 'AC1')?.status).toBe('pinned');
    expect(join.acs.find(a => a.id === 'AC2')?.status).toBe('pinned');
    expect(join.acs.find(a => a.id === 'AC3')?.status).toBe('uncovered');
  });

  it('ignores a waiver whose reason is missing (over-waiving stays visible)', () => {
    const contract: ContractSchema = {
      version: '1.1',
      assertions: [],
      coverage_waivers: [{ ac: 'AC1', kind: 'judgment', reason: '' }],
    };
    const join = joinCoverage(ONE_AC_SCOPE, contract);
    expect(join.acs.find(a => a.id === 'AC1')?.status).toBe('uncovered');
  });

  it('ignores a waiver referencing an AC absent from the scope', () => {
    const contract: ContractSchema = {
      version: '1.1',
      assertions: [{ id: 'X1', says: 's', ac: 'AC1', matcher: 'equals', value: 1 }],
      coverage_waivers: [{ ac: 'AC99', kind: 'retired', reason: 'dropped long ago' }],
    };
    const join = joinCoverage(ONE_AC_SCOPE, contract);
    expect(join.acs.map(a => a.id)).toEqual(['AC1']);
  });
});

describe('evaluateCoverageGate — activation', () => {
  // @ana A018
  it('reports inactive (no-op) for a legacy version 1.0 contract', () => {
    const contract: ContractSchema = {
      version: '1.0',
      assertions: [{ id: 'X1', says: 's', matcher: 'equals', value: 1 }],
    };
    const result = evaluateCoverageGate({ scopeContent: THREE_AC_SCOPE, contract });
    expect(result.active).not.toBe(true);
  });

  // @ana A017
  it('reports inactive for a build-only / no-AC scope', () => {
    const contract: ContractSchema = { version: '1.1', assertions: [] };
    const result = evaluateCoverageGate({ scopeContent: NO_AC_SCOPE, contract });
    expect(result.active).not.toBe(true);
    expect(result.block).toBe(false);
  });

  // @ana A020
  it('activates a version 1.1 contract that has zero `ac:` links over a scope with ACs', () => {
    const contract: ContractSchema = {
      version: '1.1',
      assertions: [{ id: 'X1', says: 's', matcher: 'equals', value: 1 }],
    };
    const result = evaluateCoverageGate({ scopeContent: THREE_AC_SCOPE, contract });
    expect(result.active).toBe(true);
  });

  // @ana A021
  it('blocks a version 1.1 contract with zero `ac:` links and uncovered ACs', () => {
    const contract: ContractSchema = {
      version: '1.1',
      assertions: [{ id: 'X1', says: 's', matcher: 'equals', value: 1 }],
    };
    const result = evaluateCoverageGate({ scopeContent: THREE_AC_SCOPE, contract });
    expect(result.block).toBe(true);
  });

  it('activates numerically — version 1.10 beats the 1.1 minimum (no lexical compare)', () => {
    const contract: ContractSchema = {
      version: '1.10',
      assertions: [{ id: 'X1', says: 's', ac: ['AC1', 'AC2', 'AC3'], matcher: 'equals', value: 1 }],
    };
    const result = evaluateCoverageGate({ scopeContent: THREE_AC_SCOPE, contract });
    expect(result.active).toBe(true);
  });
});

describe('evaluateCoverageGate — block decision', () => {
  // @ana A010
  it('blocks when an AC has no covering assertion and no waiver', () => {
    const contract: ContractSchema = {
      version: '1.1',
      assertions: [
        { id: 'X1', says: 's', ac: 'AC1', matcher: 'equals', value: 1 },
        { id: 'X2', says: 's', ac: 'AC2', matcher: 'equals', value: 1 },
      ],
    };
    const result = evaluateCoverageGate({ scopeContent: THREE_AC_SCOPE, contract });
    expect(result.block).toBe(true);
  });

  // @ana A012
  it('names the uncovered AC id in result.uncovered', () => {
    const contract: ContractSchema = {
      version: '1.1',
      assertions: [
        { id: 'X1', says: 's', ac: 'AC1', matcher: 'equals', value: 1 },
        { id: 'X2', says: 's', ac: 'AC2', matcher: 'equals', value: 1 },
      ],
    };
    const result = evaluateCoverageGate({ scopeContent: THREE_AC_SCOPE, contract });
    expect(result.uncovered).toContain('AC3');
  });

  // @ana A016
  it('blocks an AC with neither an assertion link nor a waiver', () => {
    const contract: ContractSchema = { version: '1.1', assertions: [] };
    const result = evaluateCoverageGate({ scopeContent: ONE_AC_SCOPE, contract });
    expect(result.block).toBe(true);
  });

  // @ana A011
  it('does not block when every AC has a covering assertion', () => {
    const contract: ContractSchema = {
      version: '1.1',
      assertions: [
        { id: 'X1', says: 's', ac: 'AC1', matcher: 'equals', value: 1 },
        { id: 'X2', says: 's', ac: 'AC2', matcher: 'equals', value: 1 },
        { id: 'X3', says: 's', ac: 'AC3', matcher: 'equals', value: 1 },
      ],
    };
    const result = evaluateCoverageGate({ scopeContent: THREE_AC_SCOPE, contract });
    expect(result.block).not.toBe(true);
  });
});

describe('evaluateCoverageGate — weak matchers and waivers', () => {
  // @ana A013
  it('treats an AC linked only by a weak matcher as covered, noted as info', () => {
    const contract: ContractSchema = {
      version: '1.1',
      assertions: [{ id: 'X1', says: 's', ac: 'AC1', matcher: 'contains', value: 'x' }],
    };
    const result = evaluateCoverageGate({ scopeContent: ONE_AC_SCOPE, contract });
    expect(result.block).not.toBe(true);
    expect(result.info.some(line => line.includes('AC1'))).toBe(true);
  });

  // @ana A014
  it('accepts a judgment-only waiver as coverage without a test', () => {
    const contract: ContractSchema = {
      version: '1.1',
      assertions: [],
      coverage_waivers: [{ ac: 'AC1', kind: 'judgment', reason: 'output clarity is a human-judgment call' }],
    };
    const result = evaluateCoverageGate({ scopeContent: ONE_AC_SCOPE, contract });
    expect(result.block).not.toBe(true);
  });

  // @ana A015
  it('does not block a deliberately retired AC that carries a reason', () => {
    const contract: ContractSchema = {
      version: '1.1',
      assertions: [{ id: 'X1', says: 's', ac: 'AC1', matcher: 'equals', value: 1 }],
      coverage_waivers: [{ ac: 'AC2', kind: 'retired', reason: 'feature descoped during planning' }],
    };
    const scope = `## Acceptance Criteria

- AC1: alpha
- AC2: retired criterion
`;
    const result = evaluateCoverageGate({ scopeContent: scope, contract });
    expect(result.block).not.toBe(true);
  });
});

describe('evaluateCoverageGate — fail-open and diagnostic', () => {
  // @ana A009
  it('never blocks when the scope AC format is ambiguous (fail open)', () => {
    const contract: ContractSchema = { version: '1.1', assertions: [] };
    const result = evaluateCoverageGate({ scopeContent: AMBIGUOUS_SCOPE, contract });
    expect(result.block).not.toBe(true);
  });

  // @ana A022
  it('always returns a non-empty diagnostic line (active, inactive, and skipped)', () => {
    const active = evaluateCoverageGate({
      scopeContent: THREE_AC_SCOPE,
      contract: { version: '1.1', assertions: [{ id: 'X1', says: 's', ac: ['AC1', 'AC2', 'AC3'], matcher: 'equals', value: 1 }] },
    });
    const inactive = evaluateCoverageGate({
      scopeContent: THREE_AC_SCOPE,
      contract: { version: '1.0', assertions: [] },
    });
    const skipped = evaluateCoverageGate({ scopeContent: AMBIGUOUS_SCOPE, contract: { version: '1.1' } });
    for (const r of [active, inactive, skipped]) {
      expect(r.diagnostic).toBeTruthy();
      expect(r.diagnostic.length).toBeGreaterThan(0);
    }
  });

  it('never throws on a malformed/empty contract', () => {
    expect(() => evaluateCoverageGate({ scopeContent: THREE_AC_SCOPE, contract: {} })).not.toThrow();
    const result = evaluateCoverageGate({ scopeContent: THREE_AC_SCOPE, contract: {} });
    expect(result.active).toBe(false);
  });
});

describe('validateContractFormat — backward compatibility (AC3)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-gate-contract-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // @ana A019
  it('accepts version 1.1 with `ac:` links and `coverage_waivers` with zero errors', () => {
    const contractYaml = `version: "1.1"
sealed_by: "AnaPlan"
feature: "A dogfooding contract that uses the new coverage fields"
assertions:
  - id: A001
    ac: AC1
    says: "something is true"
    block: "it blocks when false"
    target: "result.value"
    matcher: "equals"
    value: 1
  - id: A002
    ac: [AC2, AC3]
    says: "two criteria covered by one assertion"
    block: "it blocks when false"
    target: "result.other"
    matcher: "truthy"
coverage_waivers:
  - ac: AC4
    kind: judgment
    reason: "output readability is a human-judgment call"
file_changes:
  - path: "packages/cli/src/foo.ts"
    action: modify
`;
    const contractPath = path.join(tempDir, 'contract.yaml');
    fs.writeFileSync(contractPath, contractYaml);
    const validationErrors = validateContractFormat(contractPath);
    expect(validationErrors.length).toBe(0);
  });
});
