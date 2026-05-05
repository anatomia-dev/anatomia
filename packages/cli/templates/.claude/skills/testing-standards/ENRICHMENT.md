<!-- Internal: read by ana-setup only. Not for manual editing. -->

# Testing Standards — Enrichment Guide

**Who reads this:** Only the setup agent during `ana-setup`. NOT read by Build, Plan, Verify, or Think.

**Purpose:** Build and Verify read the skill file to know how to write and run tests.

## What to investigate

Read: Up to 3 test files — ideally one e2e test, one unit test, and one that uses a factory/fixture function. Different test types reveal different mechanism patterns. Find candidates from `git.recentActivity.highChurnFiles` ending in `.test.ts` or `.test.js`. If no high-churn test files, read from the `tests/` or `__tests__/` directory. Also read `vitest.config` or `jest.config` if it exists.

Look for:
- Temp directory patterns (`os.tmpdir`, `mkdtemp`, cleanup in `afterEach`)
- Factory/fixture functions (`createEmpty*`, `buildMock*`, `make*`)
- E2e vs unit split (separate directories? different configs?)
- Assertion style (expect chains, custom matchers, snapshot usage)
- Setup/teardown patterns (`beforeAll`, `beforeEach`, `afterEach` patterns)
- Test isolation (each test creates own state vs shared state)

## What to write

Write to: `## Rules` — add MECHANISM rules for patterns found. Template rules are PHILOSOPHY (universal, correct for all projects). Enrichment rules are MECHANISM (project-specific, from code reading). Keep the philosophy rules. Add mechanism rules alongside them.

Each rule should change how Build writes tests. The decision test: "Would Build write a different test without this rule?"

## Skip conditions

Skip if: `files.test === 0` (no test infrastructure to codify).

## Expected output

2-4 rules added.
