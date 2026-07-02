# Proof Chain Dashboard

212 runs · 314 active · 5 promoted · 927 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 38 | 48 | 2026-06-09 |
| cli | 148 | 234 | 2026-07-02 |
| website | 26 | 32 | 2026-07-01 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 17 | 12 |
| packages/cli/src/commands/proof.ts | 10 | 7 |
| packages/cli/src/utils/proofSummary.ts | 9 | 5 |
| packages/cli/src/commands/init/assets.ts | 9 | 4 |
| packages/cli/tests/commands/proof.test.ts | 8 | 7 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 314 total)

### .claude/agents/ana.md

- **code:** Root-level .claude/agents/ana.md and .codex/agents/ana.md were modified beyond the contract's file_changes list (which names only packages/cli/templates/...) — additive, byte-identical to the template edits, and correct dogfooding, but outside declared scope — *The requirements contract — validated upstream intake for the pipeline*

### packages/cli/src/commands/init/index.ts

- **code:** Init ordering asymmetry: code-graph.json is written (runAnalyzer, index.ts:131) before createDirectoryStructure (134), while symbol-index.json is written after (138). Safe today because createDirectoryStructure uses idempotent recursive mkdir, but a latent footgun if that ever clears the staging state dir. — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/src/commands/proof.ts

- **code:** --why flag is silently ignored when `ana proof` is invoked in list mode (no slug, no --last); harmless but the flag accepts input it does nothing with — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/src/commands/req-state.ts

- **code:** getRequirementsSummary counts validation-malformed requirements as open — `ana work status` reports 3 open while `ana req list` reports 1 open + 2 malformed for the same backlog — *The requirements contract — validated upstream intake for the pipeline*
- **code:** claimRequirement reads the requirement file twice (assertRequirementClaimable + claimRequirement each readFileSync the same path) — minor redundant IO, harmless in a single-process CLI — *The requirements contract — validated upstream intake for the pipeline*

### packages/cli/src/commands/work.ts

- **code:** Archive-on-complete commit stages the whole `.ana/requirements/` dir (`git add .ana/requirements/`) rather than only the moved files — can sweep unrelated requirement edits into the completion commit — *The requirements contract — validated upstream intake for the pipeline*

### packages/cli/src/engine/analyzers/graph/buildGraph.ts

- **code:** Stale harvested JSDoc: CodeGraph.filesAnalyzed is a `number` count but its JSDoc reads 'Files whose imports were considered (the parse universe), sorted' — describes an array. Doc drifted from the field during the verbatim harvest. — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/src/engine/analyzers/graph/readGraph.ts

- **code:** Harvested-but-unused surface in Phase 2: CodeGraph.barrelFiles, generatedFiles, inDegree and the readCodeGraph reader have zero src consumers this phase. By design — spec frames Phase 2 as an inert artifact consumed in Phase 3, and instructed harvesting the full type verbatim. Sanctioned, not YAGNI; flagged so Phase 3 closes the loop. — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/src/engine/analyzers/proof-history/index.ts

- **code:** AC3 path-form suppression bug from verify_report_3 is FIXED. isSameStemTestPartner now takes the pairing FileMatcher and routes the final comparison through match(normalizeForTestMatch(partner), normalizeForTestMatch(query)) instead of normalized exact-equality, so suppression is exactly as path-form-tolerant as pairing. Verified live: `node dist/index.js proof context src/utils/proofSummary.ts` (package-relative) and `... packages/cli/src/utils/proofSummary.ts` (repo-relative) BOTH render `top 3 of 39` + `(note: same-stem test partner suppressed)`; grep for proofSummary.test.ts in both outputs returns 0. — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/src/engine/scan-engine.ts

- **test:** Spec-mandated `ana scan` byte-parity regression test is missing — no test asserts scanProject writes no code-graph.json when persistGraphTo is unset. The read-only contract is verified by source inspection only (guarded by `if (options.persistGraphTo)`). — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/src/utils/git-operations.ts

- **code:** Long-standing benign lint warning (NOT a failure): `pnpm run lint` passes exit 0 but emits one 'Unused eslint-disable directive (no-control-regex)' warning in src/utils/git-operations.ts:198. Root cause: commit 83b2446d [security-hardening] added the directive for a rule the cli eslint.config.js never enables (no @eslint/js recommended), so it was redundant from commit; ESLint v9+ reports redundant directives. Untouched by this build; flagged across ~12 prior cycles. Fix is a one-line deletion of the redundant directive (zero behavior change). — *Empirical Proof Benchmark — the measuring instrument (ruler)*

### packages/cli/src/utils/proofSummary.ts

- **code:** proofSummary.ts (+32) and proof.ts (+113) continue growth past the comfort threshold flagged by prior findings (decompose-proof-summary-C1, audit-matrix-orientation-C7); additive and well-contained here but the trajectory persists — *Proof-Context Intelligence — why this file exists and what moves with it*
- **code:** Carried forward from verify_report_3 (unchanged — re-build touched only proof-history/index.ts). Import-layer dedup (isProofPartner) uses fileMatches, whose tier-3 basename rule returns true when a proof partner is stored as a bare basename (legacy data). A legacy bare-basename proof partner would suppress ALL same-basename files from the import layer regardless of directory. Low likelihood (requires legacy bare-basename modules_touched); silently drops real import edges if it occurs. — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/tests/benchmark/aggregate.test.ts

- **test:** Determinism test (A034) only asserts same-input idempotence, not stability across input permutations. Implementation genuinely sorts by (task,metric,arm) so cross-permutation determinism holds, but the test would pass even if the explicit sort were removed. — *Empirical Proof Benchmark — the measuring instrument (ruler)*

### packages/cli/tests/benchmark/aggregate.ts

- **code:** aggregate treats 'lower is better' for every numeric metric, including distinctFilesRead/inputTokens/turns — an arm that reads fewer files (even by missing relevant ones) scores a 'win'. Spec-endorsed simplification, but a semantic foot-gun for the next reader. — *Empirical Proof Benchmark — the measuring instrument (ruler)*

### packages/cli/tests/benchmark/harness.test.ts

- **test:** AC7 guard (A036/A037) is a textual substring assertion on scorer.ts source — a future read of a best-effort field via destructuring-rename or computed key would slip past. Legitimate enforcement test, but textual not semantic. — *Empirical Proof Benchmark — the measuring instrument (ruler)*

### packages/cli/tests/benchmark/scorer.ts

- **code:** Dead export `totalTokens` — defined with full JSDoc, never called anywhere (cost uses derived.tokens; the edit-token walk inlines its own input+output sum) — *Empirical Proof Benchmark — the measuring instrument (ruler)*
- **code:** The three to-first-correct-edit metrics can disagree on null-ness: wallClockMsToFirstCorrectEdit is null when the editing line lacks a parseable timestamp, even while turnsToResolution/tokensToFirstCorrectEdit are populated. Latent inconsistency; not triggered by the committed fixtures. — *Empirical Proof Benchmark — the measuring instrument (ruler)*

### packages/cli/tests/commands/init/code-graph-init.test.ts

- **test:** New init integration test uses `git init` without `-b main`, violating the documented testing standard (CI runners vary init.defaultBranch — has caused CI failures 3 times). Mirrors the pre-existing flawed pattern in template-propagation.test.ts. — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/tests/commands/init/template-propagation.test.ts

- **test:** @ana tag namespace collision in template-propagation.test.ts — pre-existing A029/A030 tags (a prior contract) coexist with this contract's A029/A030 in the same file; a naive tag scan could match the wrong test — *The requirements contract — validated upstream intake for the pipeline*
- **test:** Pre-existing flaky test: template-propagation 'Claude-only never touches .codex tree' times out at ~5025ms under full-suite concurrency (passes 100% in isolation). Reproduced on main (failed 1/4 runs at 5025ms with no Phase 2 changes), so NOT a regression. Phase 2 adds import-graph build to every `ana init`, which may marginally raise the flake rate. Root cause: a single test spawns the real CLI `init` twice under the default 5000ms timeout. Fix: raise the timeout on these CLI-spawning init tests. — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/tests/commands/proof.test.ts

- **test:** A006 (--why omits Provenance) has no positive-control guard asserting the full card DOES contain 'Provenance'; only A007's Timing has that guard, so A006 could silently pass if the Provenance label were renamed. Live-verified this round, but the test alone is weaker than A007's — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/tests/commands/req.test.ts

- **test:** The `req list --json` emission path (runReqList) is never directly tested — A017/A018 are verified against buildRequirementList data, not the JSON mapping that reshapes malformed rows to {req, malformed, error} — *The requirements contract — validated upstream intake for the pipeline*

### packages/cli/tests/engine/analyzers/proof-history.test.ts

- **test:** Path-form-mismatch test gap from verify_report_3 is FIXED. proof-history.test.ts:200 (@ana A014) exercises a package-relative query (src/commands/work.ts) against a repo-relative stored partner (packages/cli/tests/commands/work.test.ts) and asserts suppressedTestPartner === true, the test mirror absent, and the real partner present — the exact red-before/green-after case the prior fix brief specified. Suite went 4068 -> 4069 passing, 0 failed. — *Proof-Context Intelligence — why this file exists and what moves with it*

### website/components/docs/proof/ProvenanceTable.tsx

- **code:** Honest-unpriced path (n/a cost cell + n/a total) is dormant in the entire 210-entry corpus — 0 unpriced sessions, so the feature is correct and unit-tested at session level but unexercised end-to-end — *Web proof page — Provenance & Session Attestation*

### website/components/docs/proof/SessionAttestation.tsx

- **test:** JSX components (ProvenanceTable, SessionAttestation) have no automated tests for palette/positioning (AC4/AC5/AC6 visual dimension) — env limitation acknowledged in spec; verified by build success + code read only — *Web proof page — Provenance & Session Attestation*
- **code:** JSDoc comment contains an &apos; HTML entity inside a plain JS block comment (ledger&apos;s) — unnecessary escaping, renders literally in source — *Web proof page — Provenance & Session Attestation*

### website/lib/__tests__/docs-data/provenance.test.ts

- **test:** Markdown helpers asserted only by length, not content — format regressions (n/a total, churn line, separators) would pass unnoticed — *Web proof page — Provenance & Session Attestation*

### website/lib/docs-data/provenance.ts

- **test:** The all-unpriced TOTAL='n/a' branch is never exercised — unpricedProcess() keeps session 0 priced, so totals.costUsd is never 0 while unpriced>0 — *Web proof page — Provenance & Session Attestation*
- **code:** Redundant guard: model field uses `allSameModel && rawSessions.length > 0` but allSameModel already requires length > 0 — dead sub-condition — *Web proof page — Provenance & Session Attestation*

