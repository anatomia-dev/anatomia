# Build Report: Web proof page — Provenance & Session Attestation

**Created by:** AnaBuild
**Date:** 2026-06-30
**Spec:** .ana/plans/active/web-proof-provenance-attestation/spec.md
**Branch:** feature/web-proof-provenance-attestation

## What Was Built

- **website/lib/docs-data/types.ts** (modified): Added `ProofProvenance`, `ProofProvenanceSession`, `ProofProvenanceChurn`, `ProofProvenanceCompleteness`, `ProofAttestation`, `ProofAttestationAgent`, `ProofAttestationVerdict`, and `ProofVerdictVeto` interfaces, and three optional fields on `ProofEntry` (`provenance?`, `attestation?`, `verdictVeto?`). Optionality is the graceful-degradation contract (`?:` per the present-vs-empty rule). The session-row interface deliberately carries no `status`/verdict field (AC4).
- **website/lib/docs-data/index.ts** (modified): Re-exported the eight new types from the barrel, matching the existing loader convention.
- **website/lib/docs-data/provenance.ts** (created): Pure helpers with no CLI/anatrace import — `deriveProvenance(process, priceFn)` (injected cost function), `provenanceTocItem(entry)`, `provenanceMarkdownLines(entry)`. Mirrors the CLI's counting exactly: cache = `cache_create + cache_read`, model-collapse only when all sessions share one model AND all have counts, `costUsd: null` for unpriced (never `0`), `priceTableVersion` sourced from the `CostResult`, churn omitted when empty, counts-unavailable sessions kept.
- **website/lib/docs-data/attestation.ts** (created): Pure helpers — `summarizeAttestation(compliance)`, `summarizeVeto(verdict_veto)`, `attestationTocItem(entry)`, `attestationMarkdownLines(entry)`. Per-agent verdict counting, coverage ratio, rework-indexed labels, notable-verdict cap of 3, `incompleteCount`; veto reason passed through verbatim.
- **website/scripts/extract-docs-data.ts** (modified): Made `extractProofEntries` async; bound `priceFn` once from `packages/cli/src/data/pricing.ts` via a `tsx` dynamic import (the anatrace-core coupling is confined here); conditionally attached the three fields with conditional-spread so pre-1.3.0 entries stay byte-identical.
- **website/components/docs/proof/ProvenanceTable.tsx** (created): Presentational muted-mono card in the IntegritySeal idiom — optional model line, per-session table, TOTAL footer with `(table <version>)`, optional churn and completeness lines. Early-returns `null` on empty sessions. No pass/fail color; unpriced cost renders `n/a`.
- **website/components/docs/proof/SessionAttestation.tsx** (created): Presentational card in the AssertionLedger *structure* with diverged color semantics — `unverifiable` neutral (`--ink-45`), `satisfied` restrained (`--info`), `violated` the only alarm state (`--fail`); prominent coverage ratio, abbreviated hashes, up to 3 notable verdicts, incomplete warning, and the nested veto (quiet for `applied:false`, serious for `applied:true`).
- **website/app/docs/proof/[slug]/page.tsx** (modified): Conditionally renders `<ProvenanceTable>` (when `entry.provenance`) and `<SessionAttestation>` (when `entry.attestation || entry.verdictVeto`) between Findings and the Integrity Seal, each under a `HeadingWithAnchor`; made `tocItems` conditional via `provenanceTocItem`/`attestationTocItem` + `.filter`; appended `provenanceMarkdownLines`/`attestationMarkdownLines` to `buildProofMarkdown`. The out-of-scope raw-fetch fallback path was left untouched.
- **website/lib/__tests__/docs-data/provenance.test.ts** (created): 18 tests (stub `priceFn`).
- **website/lib/__tests__/docs-data/attestation.test.ts** (created): 17 tests.

## PR Summary

- Extends the web proof page end-to-end (extract → type → render) to show the three 1.3.0 proof-schema sections the CLI already renders: Provenance, Session Attestation, and the nested Verdict Veto.
- Cost is derived at build time from the CLI's single price table (`packages/cli/src/data/pricing.ts`) via an injected price function, so the website never duplicates the price table and the price-table version travels with the serialized data.
- All three sections are independently conditional: the section, its TOC entry, and its copy-page markdown each omit themselves when the data is absent, leaving the ~192 pre-1.3.0 proof pages byte-identical.
- Provenance is muted-mono with zero pass/fail color and sits subordinate to the verdict; Session Attestation uses its own neutral palette where `unverifiable` is honest abstention, `satisfied` is restrained, and only `violated` is alarm-colored.
- Pure shaping helpers live in `lib/docs-data/` with 35 new Vitest unit tests; the website suite rose from 88 to 123 tests with no regressions.

## Acceptance Criteria Coverage

- AC1 "full data renders, matches CLI" → provenance.test.ts (A001–A006, A010, A023) + attestation.test.ts (A007–A009) — 🔨 data unit-tested; visual parity craft-reviewed
- AC2 "pre-1.3.0 byte-identical" → provenance.test.ts A011/A012, attestation.test.ts A013 + extractor output (192 entries with no new fields, verified) ✅
- AC3 "independently conditional" → attestation.test.ts A014/A015 + `cross-machine-provenance` has provenance, not attestation (verified in generated JSON) ✅
- AC4 "provenance no pass/fail semantics" → provenance.test.ts A016 (session keys exclude `status`) ✅ data; 🔨 palette craft-reviewed
- AC5 "unverifiable neutral, coverage prominent, violated only alarm" → attestation.test.ts A017/A018/A019 ✅ data; 🔨 palette craft-reviewed
- AC6 "veto both branches wired from schema" → attestation.test.ts A020/A021/A022 ✅ data; 🔨 applied:true render craft-reviewed
- AC7 "cost from pricing.ts single source, honest unpriced" → provenance.test.ts A023/A024/A025/A026 + extractor binds `computeCost` ✅
- AC8 "TOC + copy-markdown conditional" → provenance.test.ts A012/A027, attestation.test.ts A028 + page `.filter` wiring ✅
- AC9 "new helpers unit-tested; count doesn't decrease" → 35 new tests; 88 → 123 ✅
- AC10 "page/MDX coherence" → judgment (contract coverage_waiver); section names/order match the shipped prose — human read ✅ (no MDX change)
- New "website test passes, count ≥ current" → 123 passed (13 files) ✅
- New "website build + prebuild extractor regenerates JSON with new fields" → build exit 0; 18 provenance / 4 compliance / 4 veto cohorts, 192 untouched ✅
- New "lint passes" → 0 errors, 0 warnings on changed files ✅

## Contract Coverage

28/28 assertions tagged (`@ana A001`–`A028`), verified present across the two test files. No deviations.

## Implementation Decisions

- **`extractProofEntries` made async.** The CLI price source is a cross-package `.ts` resolved by a `tsx` dynamic `import()` (the established `extractGotchas` pattern); that is inherently async, so the function became `async` and its single `main()` call site now awaits it. No other caller exists.
- **Compliance guard is `length > 0`, not mere presence.** An empty `compliance: []` attaches no `attestation` key (matches the CLI's `compliance?.length` render guard and keeps the section from rendering an empty card). A veto with no records still renders the section (veto-only), matching `renderSessionAttestation`.
- **Types re-exported from the `lib/docs-data/index.ts` barrel.** The page imports helpers directly from `provenance.ts`/`attestation.ts`, but the sibling loaders all re-export their types from the barrel; adding the eight new types there matches that convention (the spec flagged this as a check — a barrel export was consistent, not required).
- **New helper value imports use `.js` in the extractor; type imports within `lib/` use no extension.** Matches the file's existing split (`docsStatValues.js` value import vs `../lib/docs-data/types` type import) under `moduleResolution: bundler`.
- **Token abbreviation formatter in `ProvenanceTable`.** The CLI abbreviates (7.4k / 1.4M); reproduced a small `k`/`M` formatter for information parity (visual, not unit-tested).

## Deviations from Contract

None — contract followed exactly. All 28 assertions addressed with the specified target/matcher/value.

## Test Results

### Baseline (before changes)
Command: `(cd website && pnpm vitest run)`
```
Test Files  11 passed (11)
     Tests  88 passed (88)
```

### After Changes
Command: `(cd website && pnpm vitest run)`
```
Test Files  13 passed (13)
     Tests  123 passed (123)
```

Sealed project-wide capture (`ana test --stage build`):
<!-- ana:capture stage=build slug=web-proof-provenance-attestation counts=4117p/0f/2s verdict=pass sha256=7a3e39bec5b263c86c454dced2d0bfc82c92ece1271d03c78732cc6a0d6ab0c1 -->

### Comparison
- Tests added: 35 (18 provenance + 17 attestation), across 2 new website test files
- Tests removed: 0
- Regressions: none (website 88 → 123 all green; project-wide 4117 passed / 0 failed / 2 skipped)
- The 2 skipped are pre-existing project-wide skips, not introduced here.

### New Tests Written
- `website/lib/__tests__/docs-data/provenance.test.ts`: `deriveProvenance` (row count, cache summing, cost totals, session count, churn, completeness, model-collapse on/off, priceFn injection, unpriced→null, unpriced totals, priceTableVersion, counts-unavailable degradation, churn-omitted, no `status` key), `provenanceTocItem` (present/absent), `provenanceMarkdownLines` (present/absent).
- `website/lib/__tests__/docs-data/attestation.test.ts`: `summarizeAttestation` (three counts, coverage.checked/total, core version, violated=0 vs violated=1, notable cap 3, incompleteCount), `summarizeVeto` (both `applied` branches, reason passthrough, null), `attestationTocItem` (absent / provenance-only / present), `attestationMarkdownLines` (present/absent).

## Verification Commands
```
(cd website && pnpm run build)      # prebuild extractor + typecheck + page render; exit 0
(cd website && pnpm vitest run lib/__tests__/docs-data/provenance.test.ts lib/__tests__/docs-data/attestation.test.ts)
(cd website && pnpm vitest run)     # 123 passed (13 files)
(cd website && pnpm run lint)       # 0 errors/warnings on changed files
```
Spot-check generated data (from website/):
```
node -e 'const d=require("./data/docs/proof-entries.json"); console.log(d.filter(e=>e.provenance).length, d.filter(e=>e.attestation).length, d.filter(e=>e.verdictVeto).length)'
# → 18 4 4  (and 192 entries with none)
```

## Git History
```
4888c807 [web-proof-provenance-attestation] Render Provenance + Session Attestation sections
bf25ec46 [web-proof-provenance-attestation] Derive provenance/attestation/veto in extractor
2a00d2d0 [web-proof-provenance-attestation] Add provenance + attestation pure helpers with tests
201b89a9 [web-proof-provenance-attestation] Add provenance/attestation types to ProofEntry
```

## Open Issues

1. **Extractor's `pricing` dynamic import is untyped (`any`).** `pricing.computeCost`/`pricing.PRICES` are unchecked at website compile time; an anatrace-core rename would surface only at extractor runtime. Mirrors the existing `extractGotchas` pattern, so not a new risk class — but worth monitoring. (severity: observation)
2. **Unpriced-cost path is unit-tested only.** All 18 real provenance cohorts are fully priced, so `costUsd: null` / `totals.unpriced` / the `n/a` render are not exercised by a real built page. The logic is asserted by unit tests (A024/A025); the visual is not. (severity: observation)
3. **`applied:true` veto render is unverified against real data.** All 4 real veto records are `applied:false`; the alarm-styled serious treatment for `applied:true` is craft-only (its data mapping is unit-tested, A022). (severity: observation)
4. **Palette/positioning for AC4/AC5/AC6 is craft-reviewed, not unit-tested.** The node-env Vitest does not collect component JSX (per the spec's testing strategy), so the "no verdict color on provenance," neutral-`unverifiable`, restrained-`satisfied`, violated-only-alarm decisions need a human read of the built page across the 5 cohorts. The *data* driving them is unit-tested. (severity: observation)

Second pass — reviewed for undocumented concerns: no unused imports/params (lint clean), no weakened assertions, no skipped tests, byte-identical constraint verified against the generated JSON (192 untouched entries), and the out-of-scope raw-fetch fallback was left untouched. The four items above are coverage-boundary observations, not defects. No blocking issues; the build is complete and green.
