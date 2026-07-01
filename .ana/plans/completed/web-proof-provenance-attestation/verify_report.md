# Verify Report: Web proof page — Provenance & Session Attestation

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-30
**Spec:** .ana/plans/active/web-proof-provenance-attestation/spec.md
**Branch:** feature/web-proof-provenance-attestation

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../web-proof-provenance-attestation/contract.yaml
  Seal: INTACT (hash sha256:05c3fdedae3f49b2d123079112d1614efc389b0b8d421dcf058b84fc46a621d5)
```

Seal status: **INTACT** — contract unmodified since AnaPlan sealed it.

- **Build:** `(cd website && pnpm run build)` — succeeds; prebuild extractor regenerated `data/docs/proof-entries.json`; all 210 proof pages prerendered (SSG) without error.
- **Tests (sealed verify run):** repo-wide 4117 passed, 0 failed, 2 skipped (verdict: pass).
  `<!-- ana:capture stage=verify slug=web-proof-provenance-attestation counts=4117p/0f/2s verdict=pass sha256=d8f57d6a0912a5b8dbe076770c5c8ac3d39380b6008cfa1e03716ef260b2c225 -->`
- **Website surface:** 13 test files (11 + 2 new), **123 tests passed** — up from baseline 88 (+35). Test count gate satisfied (AC9 + repo-wide no-decrease gate).
- **Lint:** `(cd website && pnpm run lint)` — 0 errors, 2 warnings. Both warnings are in `components/hero/Hero.tsx` (`formatAge`, `latest` unused) — a file this build did **not** touch; pre-existing, not a regression.

## Contract Compliance

All assertions verified by reading the `@ana`-tagged tests and confirming each asserts the contract's exact target/matcher/value. Every tagged test uses exact-value assertions matching the contract (no `toBeDefined`/tautologies); A027's `toBeGreaterThan(0)` aligns with contract matcher `greater 0`.

| ID   | Says                                                       | Status       | Evidence |
|------|------------------------------------------------------------|--------------|----------|
| A001 | One row per pipeline session                               | ✅ SATISFIED | provenance.test.ts:73 — `sessions.length` toBe(2); provenance.ts:99-149 |
| A002 | Cache figure combines cache-create + cache-read            | ✅ SATISFIED | provenance.test.ts:79 — `sessions[0].tokens.cache` toBe(7000), [1] toBe(700); provenance.ts:144 |
| A003 | Total cost = sum of priced sessions                        | ✅ SATISFIED | provenance.test.ts:86 — `totals.costUsd` toBe(4); provenance.ts:129 |
| A004 | Totals report session count                                | ✅ SATISFIED | provenance.test.ts:92 — `totals.sessions` toBe(2); provenance.ts:177 |
| A005 | Churn sums lines across touched files                      | ✅ SATISFIED | provenance.test.ts:98 — `churn.added` toBe(138); provenance.ts:154-161 |
| A006 | Completeness passthrough                                   | ✅ SATISFIED | provenance.test.ts:105 — `completeness.complete` toBe(true); provenance.ts:166-172 |
| A007 | Attestation counts unverifiable per agent                  | ✅ SATISFIED | attestation.test.ts:64 — `agents[0].unverifiable` toBe(48); attestation.ts:73-77 |
| A008 | Attestation exposes coverage.checked                       | ✅ SATISFIED | attestation.test.ts:70 — `coverage.checked` toBe(1); attestation.ts:98 |
| A009 | Records anatrace-core version                              | ✅ SATISFIED | attestation.test.ts:76 — `coreVersion` toBe('0.4.0'); attestation.ts:110 |
| A010 | Shared model shown once when all match                     | ✅ SATISFIED | provenance.test.ts:111 — `model` toBe('claude-opus-4-8'); provenance.ts:88-91,176 |
| A011 | No provenance → no TOC entry                               | ✅ SATISFIED | provenance.test.ts:172 — `provenanceTocItem(undefined)` toBe(null); provenance.ts:194 |
| A012 | No provenance → no markdown                                | ✅ SATISFIED | provenance.test.ts:185 — length toBe(0); provenance.ts:207 |
| A013 | No attestation → no TOC entry                              | ✅ SATISFIED | attestation.test.ts:133 — `attestationTocItem(entry({}))` toBe(null); attestation.ts:140 |
| A014 | Provenance-only shows Provenance TOC                       | ✅ SATISFIED | provenance.test.ts:177 — `.title` toContain('Provenance'); provenance.ts:195 |
| A015 | Provenance-only shows no Attestation TOC                   | ✅ SATISFIED | attestation.test.ts:138 — toBe(null) for provenance-only entry; attestation.ts:140 |
| A016 | Provenance session exposes no status field                 | ✅ SATISFIED | provenance.test.ts:117 — `Object.keys(sessions[0])` not.toContain('status'); types.ts:36-53 (no status field) |
| A017 | Unverifiable tallied separately from violations            | ✅ SATISFIED | attestation.test.ts:82 — `violated` toBe(0) while unverifiable=48; attestation.ts:73-77 |
| A018 | Coverage ratio available (coverage.total)                  | ✅ SATISFIED | attestation.test.ts:88 — `coverage.total` toBe(49); attestation.ts:99 |
| A019 | Genuine violation surfaced in violated count               | ✅ SATISFIED | attestation.test.ts:94 — `violated` toBe(1) on violated fixture; attestation.ts:75 |
| A020 | Unexercised veto → not applied                             | ✅ SATISFIED | attestation.test.ts:109 — `applied` toBe(false); attestation.ts:126 |
| A021 | Veto reason passed through verbatim                        | ✅ SATISFIED | attestation.test.ts:115 — `reason` toContain('build_report.md'); attestation.ts:126 |
| A022 | Applied veto → applied                                     | ✅ SATISFIED | attestation.test.ts:121 — `applied` toBe(true); attestation.ts:126 |
| A023 | Per-session cost from injected priceFn                     | ✅ SATISFIED | provenance.test.ts:123 — `sessions[0].costUsd` toBe(1.5); provenance.ts:124-129 |
| A024 | Unpriced model → no cost (null, not 0)                     | ✅ SATISFIED | provenance.test.ts:129 — `sessions[1].costUsd` toBe(null); provenance.ts:130-132 |
| A025 | Totals count unpriced sessions                             | ✅ SATISFIED | provenance.test.ts:135 — `totals.unpriced` toBe(1); provenance.ts:132,177 |
| A026 | Price-table version from CostResult                        | ✅ SATISFIED | provenance.test.ts:141 — `priceTableVersion` toBe('2026-06-14'); provenance.ts:125 |
| A027 | Provenance present → non-empty markdown                    | ✅ SATISFIED | provenance.test.ts:190 — length toBeGreaterThan(0) (aligns matcher `greater 0`); provenance.ts:209-235 |
| A028 | Attestation absent → empty markdown                        | ✅ SATISFIED | attestation.test.ts:151 — length toBe(0); attestation.ts:155 |

**28 / 28 SATISFIED.**

## Independent Findings

**Predictions (Step 3) resolution — all five refuted; the risky areas were handled correctly:**

1. *Model-collapse rule wrong* — **Not found.** `provenance.ts:88-91` ports the CLI rule exactly: collapse only when `length>0 && every session has derived && every derived.model === first`. Verified in real data: `cross-machine-provenance` (6 sessions, one model) collapses to a single `model` line.
2. *Cache summing dropped a component* — **Not found.** `provenance.ts:144` sums `cache_create + cache_read`; test asserts both 7000 and 700.
3. *Price-table version read from stored per-session stamp* — **Not found.** `provenance.ts:125` sources it from `CostResult.price_table_version`, exactly as the spec demanded.
4. *Attestation palette reuses the ledger's red* — **Not found.** `SessionAttestation.tsx`: `satisfied`→`--info` (restrained), `unverifiable`→`--ink-45` (muted), `violated`→`--fail` only when >0. Palette diverged correctly (AC5).
5. *Weak/tautological tests* — **Not found.** Every contract-tagged test asserts an exact value matching the contract.

**Production-risk predictions:** (a) unpriced model rendering `$0.00`/`NaN` — handled: `costUsd:null` → `n/a` in both the component and markdown. (b) `index.ts` barrel over-building — not a violation: it re-exports **types only**, consistent with the existing loader convention; the page imports helpers directly.

**Surprises (found, not predicted):**
- **Zero unpriced sessions in the entire 210-entry corpus** — the honest-`n/a` path is correct and unit-tested at session level (A024/A025) but never runs end-to-end. Dormant, not broken.
- **The all-unpriced `TOTAL = "n/a"` branch** (`provenance.ts:221-223`, mirrored in `ProvenanceTable.tsx:31-32`) is unreachable by tests — `unpricedProcess()` keeps session 0 priced, so `costUsd===0 && unpriced>0` is never true.
- **Markdown helpers are asserted only by length** (`>0` / `===0`), never by content — string-format regressions would slip through.

**Quality observations:**
- Extractor's attestation guard `Array.isArray(entry.compliance) && length > 0` is **stronger** than the spec's naive `entry.compliance ?` — it prevents an empty `[]` from attaching an empty section. Good defensive call, consistent with the TOC/markdown conditions.
- Coding standards honored: `.js` extensions on relative imports, `import type` separation, named exports, explicit return types, JSDoc `@param`/`@returns` on exported functions, `&apos;` in JSX text (lint clean).
- Data-integrity confirmed: 18 provenance / 4 attestation / 4 verdictVeto cohorts (matches spec); a pre-1.3.0 entry (`proof-list-view`) carries none of the new keys — byte-identical output preserved (AC2).

## AC Walkthrough

- **AC1** ✅ PASS — Full-data proof renders Provenance + Session Attestation between Findings and Integrity Seal (`page.tsx:214-232`). Data verified: `cross-machine-provenance` totals `{sessions:6, costUsd:32.66, unpriced:0}`, model collapsed, rework-indexed labels (`build`, `build 2`, `build 3`). Attestation `attestation-emit-and-guard`: core 0.4.0, per-agent coverage `1/16`, `2/19`. A001–A010 all SATISFIED.
- **AC2** ✅ PASS — Conditional-spread in extractor (`extract-docs-data.ts:237-239`); TOC filtered; markdown conditional. Confirmed `proof-list-view` has no `provenance`/`attestation`/`verdictVeto` keys. A011–A013 SATISFIED.
- **AC3** ✅ PASS — 14 provenance-only entries; `cross-machine-provenance` renders Provenance, not Attestation (`attestation:false, verdictVeto:false`). A014–A015 SATISFIED.
- **AC4** ✅ PASS — `ProvenanceTable.tsx` uses only muted mono vars (`--ink`, `--ink-45`, `--ink-60`, `--hairline`, `--border`); zero pass/fail color; placed after Findings. Data model has no status/verdict field (A016 SATISFIED).
- **AC5** ✅ PASS — `unverifiable`→`--ink-45` (neutral, distinct from ledger red), `satisfied`→`--info` (restrained), `violated`→`--fail` only alarm; coverage ratio prominent (12.5px/600); explicit "Evidence, not a gate" prose. A017–A019 SATISFIED.
- **AC6** ✅ PASS — `applied:false`→quiet single line; `applied:true`→serious `⛔`/`--fail`/`--fail-bg` box; both wired from schema (`summarizeVeto`). A020–A022 SATISFIED.
- **AC7** ✅ PASS — Cost derived at build via injected `priceFn` bound to `computeCost`/`PRICES` from `packages/cli/src/data/pricing.ts` (`extract-docs-data.ts:212-214`); no price table in website; unpriced→`n/a`; `priceTableVersion` travels with data (real data: `2026-06-14`). A003, A023–A026 SATISFIED.
- **AC8** ✅ PASS — `tocItems` built with conditional entries then `.filter(!== null)` (`page.tsx:176-179`); `buildProofMarkdown` appends conditional lines (`page.tsx:73-74`). A027–A028 SATISFIED.
- **AC9** ✅ PASS — New pure helpers unit-tested in `lib/__tests__/docs-data/`; website tests 88 → 123 (does not decrease).
- **AC10** ✅ PASS (judgment-only) — `reading-a-proof.mdx` has `## Provenance` (L107) and `## Session attestation` (L125); page renders "Provenance" then "Session attestation" in matching order; veto nested inside attestation matching the CLI. Section names, order, and honesty framing cohere.
- **Build/lint gates** ✅ PASS — website build succeeds and regenerates JSON with new fields; lint clean for touched files.

## Blockers

None. Searched specifically for:
- **Unused exports** — new exports (`deriveProvenance`, `summarizeAttestation`, `summarizeVeto`, TOC/markdown helpers) all imported by the extractor and/or `page.tsx`; types re-exported via `index.ts` consistent with convention. No orphans.
- **Unhandled error paths** — helpers degrade gracefully (no `derived` → `countsAvailable:false` row; empty churn → omitted line; absent sub-fields → `?? ''`/`?? null`); no throw/`console.error` added to the extractor branch (matches gotcha).
- **Byte-identical regression** — verified a pre-1.3.0 entry serializes without any new key; conditional-spread and TOC/markdown conditionals all present.
- **External-state assumptions** — the sole cross-package coupling (`computeCost`/`PRICES`) is confined to `extract-docs-data.ts` via dynamic import; helpers stay pure/injectable.
- **Missing edge cases** — counts-unavailable, unpriced, empty churn, incomplete completeness, both veto branches all covered by unit tests.

No hard contract failure, no failing AC, no regression, no guardrail violation qualifies as a blocker.

## Findings

- **Test — Markdown helpers asserted only by length, not content:** `website/lib/__tests__/docs-data/provenance.test.ts:192` (and `attestation.test.ts:157`) check `.length > 0` / `=== 0` only. The helpers emit specific strings (`n/a` total, `churn: N files · +X/−Y`, `· N unpriced`, session separators). A format regression — wrong separator, `$0.00` instead of `n/a` — would keep the tests green. Contract only requires the length checks (A027/A012/A028), so this doesn't fail; but the next engineer touching these helpers has no assertion guarding the output shape.
- **Test — All-unpriced `TOTAL="n/a"` branch never exercised:** `website/lib/docs-data/provenance.ts:221-223` (mirrored `ProvenanceTable.tsx:31-32`) renders `n/a` only when `unpriced>0 && costUsd===0`. `unpricedProcess()` keeps session 0 priced, so this branch is dead in tests. Add a fully-unpriced fixture to cover it.
- **Code — Honest-unpriced path dormant in the corpus:** `website/components/docs/proof/ProvenanceTable.tsx:31` — across all 210 entries there are 0 unpriced sessions and 0 null `costUsd`. The `n/a` cost cell and n/a total are correct and unit-tested at session level, but never render in production today. First proof with an unknown model will be the first real exercise — worth a glance then.
- **Test — JSX components have no automated palette/positioning tests:** `website/components/docs/proof/SessionAttestation.tsx` — AC4/AC5/AC6's visual dimension (neutral `unverifiable`, restrained `satisfied`, `applied:true` alarm, placement after Findings) is verified by build success + code read only. The spec acknowledges the node env has no React renderer; noting reduced automated confidence against future visual regressions (e.g. someone swapping `--ink-45` for `--fail`).
- **Code — Unnecessary HTML entity in a JS comment:** `website/components/docs/proof/SessionAttestation.tsx:19` — the JSDoc block comment contains `ledger&apos;s`; `&apos;` is a JSX-text escape, not needed in a `/* */` comment, where it renders literally. Cosmetic.
- **Code — Redundant guard:** `website/lib/docs-data/provenance.ts:176` — `allSameModel && rawSessions.length > 0`; `allSameModel` already requires `length > 0`, so the second clause is dead. Trivial.

## Deployer Handoff

- This ships a purely **additive**, **non-gating** website feature: three independently-conditional proof-page sections (Provenance, Session Attestation, nested Verdict Veto) driven by 1.3.0 proof-schema data. Pre-1.3.0 proof pages (~192) are byte-identical — verified at the data layer.
- Cost figures are **recomputable estimates** from the CLI's single price table (`packages/cli/src/data/pricing.ts`), baked in at extraction with the price-table version (`2026-06-14`) traveling alongside. A slight drift from the figure shown at completion time is documented, intended CLI-parity behavior — not a bug.
- The cross-package coupling to `anatrace-core` (via `computeCost`/`PRICES`) is confined to `extract-docs-data.ts` and runs only at build time; no new npm dependency was added to the website.
- 2 lint warnings remain in `components/hero/Hero.tsx` — pre-existing, unrelated to this work.
- The honest-`n/a` unpriced path is currently dormant (no unknown-model sessions in the corpus). Correct and unit-tested, but its end-to-end render is unproven until such a proof exists.

## Verdict

**Shippable:** YES

All 28 contract assertions SATISFIED, all 9 pinned acceptance criteria PASS, AC10 coherent by human read. Website tests rose 88 → 123; repo-wide 4117 pass / 0 fail; build regenerates the data with the new fields on the expected cohorts; lint clean for touched files. The four risky areas the spec flagged (model-collapse, cache summing, price-table-version source, attestation palette) were each implemented correctly and verified against real data. The six findings are observations and test-coverage gaps for the next engineer — none blocks shipping. I'd stake my name on this.
