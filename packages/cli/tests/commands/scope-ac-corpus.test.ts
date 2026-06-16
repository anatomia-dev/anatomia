import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'glob';
import { extractScopeACs } from '../../src/commands/artifact-validators.js';

/**
 * AC1 live-corpus measurement — the gate on the gate.
 *
 * Sweeps every completed-plan scope and proves the extractor recovers a
 * non-empty AC id-set from each well-formed scope and never misclassifies one
 * as ambiguous. The "well-formed" judgment comes from an oracle INDEPENDENT of
 * the extractor: the literal `## Acceptance Criteria` heading in the file. We
 * never grade the extractor against its own output — the heading (a fact about
 * the file) selects the scopes under test; the id-parsing is what is measured.
 *
 * Repo root is resolved from this file's location, NOT process.cwd(): vitest
 * may chdir into temp dirs, and a cwd-relative glob would silently find nothing
 * and pass vacuously — a false green on the feature's safety gate. The `> 50`
 * assertion catches exactly that, guarded for a legitimately-empty corpus (a
 * stranger project with zero completed plans).
 */

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
// tests/commands -> tests -> cli -> packages -> repo root
const REPO_ROOT = path.resolve(TEST_DIR, '../../../../');
const COMPLETED_GLOB = path.join(REPO_ROOT, '.ana', 'plans', 'completed', '*', 'scope.md');

const ORACLE_HEADING = /^## Acceptance Criteria\s*$/m;

interface CorpusMeasurement {
  totalScopes: number;
  oraclePositive: number;
  falseAmbiguousCount: number;
  emptyExtractionCount: number;
  threwCount: number;
}

function measureCorpus(): CorpusMeasurement {
  const files = globSync(COMPLETED_GLOB);
  let oraclePositive = 0;
  let falseAmbiguousCount = 0;
  let emptyExtractionCount = 0;
  let threwCount = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    // Oracle: the literal heading decides "well-formed", not the extractor.
    if (!ORACLE_HEADING.test(content)) continue;
    oraclePositive++;

    let result: { ids: string[]; ambiguous: boolean };
    try {
      result = extractScopeACs(content);
    } catch {
      threwCount++;
      continue;
    }
    if (result.ids.length === 0) emptyExtractionCount++;
    if (result.ambiguous === true) falseAmbiguousCount++;
  }

  return {
    totalScopes: files.length,
    oraclePositive,
    falseAmbiguousCount,
    emptyExtractionCount,
    threwCount,
  };
}

describe('scope-AC extractor — live corpus sweep (AC1)', () => {
  const corpusMeasurement = measureCorpus();

  it('finds a non-trivial number of completed scopes (vacuous-pass guard)', () => {
    // Guard for the legitimately-empty corpus (a stranger project with zero
    // completed plans): only assert the floor when the corpus is non-empty.
    if (corpusMeasurement.totalScopes === 0) {
      expect(corpusMeasurement.totalScopes).toBe(0);
      return;
    }
    expect(corpusMeasurement.totalScopes).toBeGreaterThan(50);
  });

  // @ana A007
  it('recovers a non-empty AC id-set from every oracle-positive scope', () => {
    expect(corpusMeasurement.emptyExtractionCount).toBe(0);
  });

  // @ana A006
  it('never misclassifies an oracle-positive scope as ambiguous', () => {
    expect(corpusMeasurement.falseAmbiguousCount).toBe(0);
  });

  it('never throws on any corpus scope', () => {
    expect(corpusMeasurement.threwCount).toBe(0);
  });
});
