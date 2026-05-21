# Verify Report: Website Test Suite

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-20
**Spec:** .ana/plans/active/website-test-suite/spec.md
**Branch:** feature/website-test-suite

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/website-test-suite/contract.yaml
  Seal: INTACT (hash sha256:525f09d93f786fec28baeb2405543a98533e191afecae8448c286504b459be20)
```

Seal status: **INTACT**

Tests: 51 passed, 0 failed, 0 skipped (8 files). Build: passed. Lint: 0 errors, 2 warnings (pre-existing in Hero.tsx — unused `formatAge` and `latest` variables, not introduced by this build). Root `pnpm run test -- --run`: both CLI and website pass, exits cleanly.

## Contract Compliance
| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | The website package has a test script that runs vitest without watch mode | ✅ SATISFIED | `website/package.json:12` — `"test": "vitest run"` |
| A002 | Running website tests produces at least 38 passing tests | ✅ SATISFIED | `(cd website && pnpm vitest run)` — 51 passed |
| A003 | The root test command runs both CLI and website tests without hanging | ✅ SATISFIED | `pnpm run test -- --run` — exits 0, both packages pass |
| A004 | Proof stats correctly count entries, assertions, findings, and rejection cycles | ✅ SATISFIED | `website/lib/__tests__/docs-data/proofs.test.ts:84-94` — @ana A004 tag, asserts `stats.entries` toBe(3), `stats.assertions` toBe(12), `stats.findings` toBe(3) |
| A005 | Proof stats returns zeros when there are no proof entries | ✅ SATISFIED | `website/lib/__tests__/docs-data/proofs.test.ts:109-119` — @ana A005 tag, empty dataset, all fields toBe(0) |
| A006 | Only entries with at least one rejection cycle are counted as rejections | ✅ SATISFIED | `website/lib/__tests__/docs-data/proofs.test.ts:98-105` — @ana A006 tag, asserts `stats.rejections` toBe(1) (1 of 3 entries has rejectionCycles > 0) |
| A007 | Median timing computation filters out zero-valued stages before calculating | ✅ SATISFIED | `website/lib/__tests__/docs-data/proofs.test.ts:123-136` — @ana A007 tag, think [3,5,7]→5, plan [8,12]→10, build [10,15,20]→15 |
| A008 | A timing stage where all entries have zero returns zero median | ✅ SATISFIED | `website/lib/__tests__/docs-data/proofs.test.ts:139-148` — @ana A008 tag, verify stage all zeros → toBe(0) |
| A009 | Median timings return zeros when there are no proof entries | ✅ SATISFIED | `website/lib/__tests__/docs-data/proofs.test.ts:151-162` — @ana A009 tag, empty dataset, all stages toBe(0) |
| A010 | Building docs stat values produces all nine expected keys as strings | ✅ SATISFIED | `website/lib/__tests__/docs-data/docs-stat-values.test.ts:19-33` — @ana A010 tag, checks `toHaveLength(9)` and each key's exact string value |
| A011 | DocsStat tags in text are replaced with their computed values | ✅ SATISFIED | `website/lib/__tests__/docs-data/docs-stat-values.test.ts:37-45` — @ana A011 tag, result contains "42" (proofCount value) |
| A012 | Unrecognized DocsStat keys are left unchanged in the output | ✅ SATISFIED | `website/lib/__tests__/docs-data/docs-stat-values.test.ts:48-57` — @ana A012 tag, result contains `<DocsStat` and exact unchanged tag |
| A013 | Import and export lines are removed from MDX source | ✅ SATISFIED | `website/lib/__tests__/docs-data/strip-jsx.test.ts:53-67` — @ana A013 tag, `not.toContain('import')`, `not.toContain('export')`, preserves heading and content |
| A014 | Block components like Callout have their tags removed but children preserved | ✅ SATISFIED | `website/lib/__tests__/docs-data/strip-jsx.test.ts:92-109` — @ana A014 tag, `toContain('inner content')`, `not.toContain('<Callout')` |
| A015 | Full-strip components like PipelineDiagram are removed entirely including children | ✅ SATISFIED | `website/lib/__tests__/docs-data/strip-jsx.test.ts:112-129` — @ana A015 tag, `not.toContain('PipelineDiagram')`, `not.toContain('child content')` |
| A016 | DocsStat tags are resolved to computed values before stripping | ✅ SATISFIED | `website/lib/__tests__/docs-data/strip-jsx.test.ts:132-141` — @ana A016 tag, `toContain('2')` (proofCount = entries.length = 2 from mock), `not.toContain('DocsStat')` |
| A017 | Proof entries data file contains an array of entries with required fields | ✅ SATISFIED | `website/lib/__tests__/docs-data/data-integrity.test.ts:15-33` — @ana A017 tag, checks all 11 required ProofEntry keys via `toHaveProperty` |
| A018 | Skill templates data file contains an array with name and description fields | ✅ SATISFIED | `website/lib/__tests__/docs-data/data-integrity.test.ts:36-47` — @ana A018 tag, checks name/description/sections/rules |
| A019 | Build metadata file contains version, commit SHA, and timestamp | ✅ SATISFIED | `website/lib/__tests__/docs-data/data-integrity.test.ts:63-69` — @ana A019 tag, checks version/commitSha/buildTimestamp |
| A020 | Commands data file includes groups array and total command count | ✅ SATISFIED | `website/lib/__tests__/docs-data/data-integrity.test.ts:72-78` — @ana A020 tag, checks groups, totalCommands ≥ 1 |
| A021 | Data integrity tests are skipped gracefully when data directory does not exist | ✅ SATISFIED | `website/lib/__tests__/docs-data/data-integrity.test.ts:6,13` — @ana A021 tag, `const dataExists = existsSync(...)` at module scope, `describe.skipIf(!dataExists)` |
| A022 | Splitting a headline with emphasis markers produces segments with em flags | ✅ SATISFIED | `website/lib/__tests__/format.test.ts:5-13` — @ana A022 tag, asserts 3 segments, middle has `{ t: 'Ana', em: true }` using `toEqual` |
| A023 | A headline with no emphasis markers produces a single plain segment | ✅ SATISFIED | `website/lib/__tests__/format.test.ts:17-23` — @ana A023 tag, 1 segment, `toEqual({ t: 'No emphasis here.' })` |
| A024 | Emphasis at the start of a string is correctly parsed as the first segment | ✅ SATISFIED | `website/lib/__tests__/format.test.ts:27-33` — @ana A024 tag, `segments[0]` has `{ t: 'Bold', em: true }` |
| A025 | A timestamp from 30 seconds ago formats as seconds with 's ago' suffix | ✅ SATISFIED | `website/lib/__tests__/proof-feed.test.ts:16-20` — @ana A025 tag, fake timers, `toBe('30s ago')` |
| A026 | A timestamp at exactly now formats as '1s ago' not '0s ago' | ✅ SATISFIED | `website/lib/__tests__/proof-feed.test.ts:23-28` — @ana A026 tag, `toBe('1s ago')` |
| A027 | A future timestamp is clamped to '1s ago' instead of showing negative time | ✅ SATISFIED | `website/lib/__tests__/proof-feed.test.ts:31-36` — @ana A027 tag, future +60s, `toBe('1s ago')` |
| A028 | A timestamp from 90 seconds ago formats as minutes | ✅ SATISFIED | `website/lib/__tests__/proof-feed.test.ts:39-43` — @ana A028 tag, `toBe('1m ago')` |
| A029 | A timestamp from 2 hours ago formats as hours | ✅ SATISFIED | `website/lib/__tests__/proof-feed.test.ts:46-50` — @ana A029 tag, `toBe('2h ago')` |
| A030 | A timestamp from 48 hours ago formats as days | ✅ SATISFIED | `website/lib/__tests__/proof-feed.test.ts:53-59` — @ana A030 tag, `toBe('2d ago')` |
| A031 | The copy catalog has all 20 expected top-level sections | ✅ SATISFIED | `website/lib/__tests__/copy.test.ts:5-20` — @ana A031 tag, `toHaveLength(20)` + iterates all 20 names |
| A032 | Navigation links array has 4 entries each with label and href | ✅ SATISFIED | `website/lib/__tests__/copy.test.ts:24-35` — @ana A032 tag, `toHaveLength(4)`, checks type and non-empty for each |
| A033 | Footer has 3 columns each with a title and non-empty links array | ✅ SATISFIED | `website/lib/__tests__/copy.test.ts:38-49` — @ana A033 tag, `toHaveLength(3)`, checks title string and links array |
| A034 | Every footer link has a non-empty label and href | ✅ SATISFIED | `website/lib/__tests__/copy.test.ts:52-63` — @ana A034 tag, nested iteration, checks type and length > 0 |
| A035 | Hero call-to-action has label, command, and href fields | ✅ SATISFIED | `website/lib/__tests__/copy.test.ts:66-75` — @ana A035 tag, `toHaveProperty` for label/command/href, type checks |
| A036 | No production source files were modified — only test files and package.json | ✅ SATISFIED | `git diff main --name-only` shows only: `website/package.json`, 7 test files in `website/lib/__tests__/`, and `.ana/` artifacts. Zero lib/app/components changes. |

## Independent Findings

### Predictions Resolved

1. **Shallow assertions in proofs.test.ts** — Not found. All assertions use exact values (`toBe(3)`, `toBe(12)`, etc.) matched to synthetic fixture data. Strong.
2. **Loose data-integrity checks** — Partially confirmed. Uses `toHaveProperty` (existence-only) for JSON shape validation. However, the contract matchers are `exists`, so the tests are contract-aligned. The supplementary files test (line 80-89) has a silent pass path — `if (existsSync(filePath))` inside the loop means if a supplementary file is missing, the assertion never runs and the test passes. Not a contract violation (no assertion covers this), but a gap.
3. **Strip-jsx DocsStat assertion too generic** — `toContain('2')` at `strip-jsx.test.ts:138` is a weak assertion — the digit "2" could appear in many contexts. However, with the controlled input `'There are <DocsStat value="proofCount" /> proofs.'`, the only "2" comes from the resolved tag. Adequate for this fixture, but fragile if the input string changes.
4. **Copy section count (20) is brittle** — Confirmed as intentional. The test lists all 20 section names explicitly. Any addition to `copy.ts` breaks this test, which is the point — structural integrity detection.
5. **Fake timers cleanup** — Not found. `afterEach(() => vi.useRealTimers())` properly placed at file scope.

### Over-Building

The spec expected 48 tests (40 new + 8 existing). The build produced 51 (43 new + 8 existing). Three extra tests:
- `stripJsx removes JSX comments` — not in spec's test matrix
- `stripJsx removes self-closing components` — not in spec's test matrix
- `getMedianTimings odd vs even entry count` — 2 tests in an extra describe block

These are reasonable additions that test real code paths. Not a concern, but noted per protocol.

### Proof Context Review

Active proof context findings for `proof-feed.ts` (VERSION_FALLBACK, hardcoded version, non-semver tags) and `copy.ts` (dead `/#pipeline` link, non-clickable rows reference) are not addressed by this build and remain active. This build only adds tests — it doesn't touch production code, so these findings are unchanged. No resolution claims.

## AC Walkthrough

- **AC1:** `website/package.json` has `"test": "vitest run"` script → ✅ PASS — confirmed at line 12
- **AC2:** `cd website && pnpm vitest run` passes with 38+ tests → ✅ PASS — 51 tests passed
- **AC3:** `pnpm run test -- --run` (root) runs both CLI and website tests without hanging → ✅ PASS — both packages pass, turbo exits cleanly
- **AC4:** proofs.test.ts tests getProofStats and getMedianTimings with mocked node:fs → ✅ PASS — `vi.mock('node:fs')`, `vi.resetModules()` + dynamic import pattern, 8 tests covering stats and medians
- **AC5:** docs-stat-values.test.ts tests pure functions with no mocking → ✅ PASS — direct imports, no vi.mock calls, 5 tests
- **AC6:** strip-jsx.test.ts tests with 5 mocked data accessor imports → ✅ PASS — 3 modules mocked (proofs ×3 fns, skills ×1, gotchas ×1 = 5 imports), 8 tests
- **AC7:** data-integrity.test.ts validates real JSON files with describe.skipIf → ✅ PASS — `existsSync` at module scope, `describe.skipIf(!dataExists)`, 6 tests covering all specified files
- **AC8:** format.test.ts tests splitHeadline parsing → ✅ PASS — 4 tests covering emphasis, no emphasis, emphasis at start, emphasis at end
- **AC9:** proof-feed.test.ts tests formatAge boundary behavior → ✅ PASS — 6 tests with `vi.useFakeTimers()`, covers seconds/minutes/hours/days/zero-clamp/future-clamp
- **AC10:** copy.test.ts validates structural integrity → ✅ PASS — 6 tests covering sections, nav links, footer columns, footer link completeness, hero CTA, pricing plans
- **AC11:** Zero production code changes → ✅ PASS — `git diff main --name-only` shows only test files, package.json, and .ana artifacts
- **AC12:** All new test files in `lib/__tests__/` or `lib/__tests__/docs-data/` → ✅ PASS — confirmed via `ls`: 4 files in `lib/__tests__/`, 4 files in `lib/__tests__/docs-data/`
- **Tests pass:** ✅ PASS — `(cd website && pnpm vitest run)` — 51 passed
- **No build errors:** ✅ PASS — `(cd website && pnpm run build)` — compiled and generated 178 static pages

## Blockers

None. All 36 contract assertions satisfied. All 14 acceptance criteria pass. No test failures. No regressions (marketing-stats.test.ts still passes with its original 8 tests). No unused exports in new test files (test files export nothing). No unused parameters — all function parameters in test helpers (`setupMockData`, `readJson`) are used. No unhandled error paths — test files don't have error handling, which is correct for tests. No external state assumptions beyond what's mocked (node:fs, fake timers, data directory existence check).

## Findings

- **Test — Supplementary files silent pass on missing:** `website/lib/__tests__/docs-data/data-integrity.test.ts:85-86` — The `existsSync` guard inside the for-loop means if `agent-templates.json`, `context-files.json`, or `search-index.json` don't exist, the assertion is never executed and the test passes vacuously. The `describe.skipIf(!dataExists)` only checks the directory — individual files could be missing without detection. Low risk since these files are always generated by prebuild, but the test claims to validate integrity while silently skipping missing files.

- **Test — toContain('2') is fragile in strip-jsx DocsStat test:** `website/lib/__tests__/docs-data/strip-jsx.test.ts:138` — Asserts `toContain('2')` where "2" is the resolved proofCount. With the current fixture `'There are <DocsStat value="proofCount" /> proofs.'` this works, but if the input string were changed to include a "2" elsewhere, the assertion would pass regardless. A more precise assertion like `toBe('There are 2 proofs.')` would be stronger.

- **Code — Over-building: 3 extra tests beyond spec:** `website/lib/__tests__/docs-data/strip-jsx.test.ts:69-78,80-88` and `website/lib/__tests__/docs-data/proofs.test.ts:164-182` — Builder added JSX comment removal test, self-closing component test, and odd-vs-even median describe block (2 tests). These cover real code paths and pass. Not harmful but unspecified — the proofs odd-vs-even tests overlap with A007 (which already tests odd count) and A008's describe block.

- **Upstream — Lint warnings pre-exist in Hero.tsx:** `website/components/hero/Hero.tsx:3,16` — `formatAge` imported but unused, `latest` assigned but unused. These are pre-existing (not introduced by this build) but surface on every `pnpm run lint`. If a future build touches Hero.tsx, these should be addressed.

- **Upstream — Proof context findings still active:** `website/lib/proof-feed.ts` — VERSION_FALLBACK single-shot evaluation (dynamic-marketing-stats-C2), hardcoded v1.0.2 version, non-semver tag risk. `website/lib/copy.ts` — dead `/#pipeline` manifesto link, non-clickable proof feed row copy. All pre-existing, not addressed by this test-only build.

## Deployer Handoff

This is a test-only change. Zero production code modified. The 7 new test files and the package.json test script addition are safe to merge.

Post-merge: the root `pnpm run test -- --run` now runs both CLI and website tests via Turborepo. The website surface is no longer silently skipped. Data-integrity tests will be skipped on fresh clones (no `data/docs/` directory until prebuild runs) — this is intentional and correct.

The 2 pre-existing lint warnings in Hero.tsx (`formatAge` unused, `latest` unused) should be cleaned up in a future build that touches that file.

## Verdict
**Shippable:** YES

All 36 contract assertions SATISFIED. All 14 acceptance criteria pass. 51 tests green. Build compiles. Lint clean (0 errors). No regressions. Findings are minor observations — a silent-pass gap in supplementary file validation, a fragile `toContain` assertion, and 3 extra tests beyond spec. None block shipping.
