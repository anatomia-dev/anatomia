/**
 * Tests for countPhases — the artifact-derived phase counter.
 *
 * Proves AC7: phase counting is format-agnostic and unchanged by the plan.md
 * checkbox removal. countPhases reads the `## Phases` section and the `Spec:`
 * refs, so it must return identical results for old (checkbox) and new
 * (plain-list) plan formats.
 */

import { describe, it, expect } from 'vitest';
import { countPhases } from '../../src/commands/work-state.js';

describe('countPhases', () => {
  const oldFormatPlan = `# Plan: test

## Phases

- [ ] Phase 1
  - Spec: spec.md`;

  const newFormatPlan = `# Plan: test

## Phases

- Phase 1 description
  - Spec: spec.md`;

  const multiPhaseNewFormatPlan = `# Plan: test

## Phases

- Phase 1 description
  - Spec: spec-1.md
- Phase 2 description
  - Spec: spec-2.md
  - Depends on: Phase 1`;

  // @ana A006
  it('counts an old-format (checkbox) plan correctly', () => {
    const result = countPhases(oldFormatPlan);
    expect(result.total).toBe(1);
    expect(result.specs).toEqual(['spec.md']);
  });

  // @ana A007
  it('counts a new-format (plain-list) plan correctly', () => {
    const result = countPhases(newFormatPlan);
    expect(result.total).toBe(1);
    expect(result.specs).toEqual(['spec.md']);
  });

  // @ana A008
  it('counts a multi-phase new-format plan with Depends-on lines correctly', () => {
    const result = countPhases(multiPhaseNewFormatPlan);
    expect(result.total).toBe(2);
    expect(result.specs).toEqual(['spec-1.md', 'spec-2.md']);
  });
});
