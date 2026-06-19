# Proof Chain Dashboard

210 runs · 302 active · 5 promoted · 927 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 38 | 48 | 2026-06-09 |
| cli | 147 | 228 | 2026-06-19 |
| website | 25 | 26 | 2026-06-17 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 16 | 11 |
| packages/cli/src/commands/proof.ts | 10 | 7 |
| packages/cli/src/utils/proofSummary.ts | 9 | 5 |
| packages/cli/src/commands/init/assets.ts | 9 | 4 |
| packages/cli/tests/commands/proof.test.ts | 8 | 7 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 302 total)

### packages/cli/src/commands/init/index.ts

- **code:** Init ordering asymmetry: code-graph.json is written (runAnalyzer, index.ts:131) before createDirectoryStructure (134), while symbol-index.json is written after (138). Safe today because createDirectoryStructure uses idempotent recursive mkdir, but a latent footgun if that ever clears the staging state dir. — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/src/commands/proof.ts

- **code:** --why flag is silently ignored when `ana proof` is invoked in list mode (no slug, no --last); harmless but the flag accepts input it does nothing with — *Proof-Context Intelligence — why this file exists and what moves with it*
- **test:** Carried forward from verify_report_3 (unchanged). Live run could not exercise the hidden/imports render path: this worktree has no .ana/state/code-graph.json, so every co-change partner renders under the `unknown` group (`Changed together:`). The graph-present render (hidden/imports grouping, imported_by/imports layers) is covered only by unit/integration tests that write a synthetic graph, not by an end-to-end run against the real repo. Reduced live confidence on that path only. — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/src/engine/analyzers/graph/buildGraph.ts

- **code:** Stale harvested JSDoc: CodeGraph.filesAnalyzed is a `number` count but its JSDoc reads 'Files whose imports were considered (the parse universe), sorted' — describes an array. Doc drifted from the field during the verbatim harvest. — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/src/engine/analyzers/graph/readGraph.ts

- **code:** Harvested-but-unused surface in Phase 2: CodeGraph.barrelFiles, generatedFiles, inDegree and the readCodeGraph reader have zero src consumers this phase. By design — spec frames Phase 2 as an inert artifact consumed in Phase 3, and instructed harvesting the full type verbatim. Sanctioned, not YAGNI; flagged so Phase 3 closes the loop. — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/src/engine/analyzers/proof-history/index.ts

- **code:** AC3 path-form suppression bug from verify_report_3 is FIXED. isSameStemTestPartner now takes the pairing FileMatcher and routes the final comparison through match(normalizeForTestMatch(partner), normalizeForTestMatch(query)) instead of normalized exact-equality, so suppression is exactly as path-form-tolerant as pairing. Verified live: `node dist/index.js proof context src/utils/proofSummary.ts` (package-relative) and `... packages/cli/src/utils/proofSummary.ts` (repo-relative) BOTH render `top 3 of 39` + `(note: same-stem test partner suppressed)`; grep for proofSummary.test.ts in both outputs returns 0. — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/src/engine/scan-engine.ts

- **test:** Spec-mandated `ana scan` byte-parity regression test is missing — no test asserts scanProject writes no code-graph.json when persistGraphTo is unset. The read-only contract is verified by source inspection only (guarded by `if (options.persistGraphTo)`). — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/src/utils/compliance.ts

- **code:** loadCore deviates from spec's prescribed bare-require idiom — resolves package.json, reads exports['.'].import, and require()s the ESM entry by absolute path. Necessary (anatrace-core is import-only ESM; bare require throws ERR_PACKAGE_PATH_NOT_EXPORTED) and well-commented; proven working by the emitted build record. — *Guard the anatrace-core load and emit the first real attestation records*
- **code:** Node version portability: loadCore uses require() on an ESM .mjs entry. Unflagged require(ESM) landed in Node 22.12.0; README states 'Node 22+'. On Node 22.0-22.11 an installed engine would throw ERR_REQUIRE_ESM, get caught, and falsely surface the loud 'anatrace-core not resolvable' line. Works on current toolchain (Node 25 here). — *Guard the anatrace-core load and emit the first real attestation records*
- **code:** Spec's documented edge 'core present but package.json unreadable -> loadCore succeeds, version guard abstains silently' is no longer true. loadCore now reads package.json to find the ESM entry, so an unreadable package.json yields a LOUD abstain, not a silent version abstain. The version guard's production reachability narrows to a present-but-missing/non-string version field (plus the test injection seam). Arguably more correct, but deviates from documented semantics. — *Guard the anatrace-core load and emit the first real attestation records*
- **code:** captureComplianceAtSave's outer try/catch (compliance.ts:237-359) swallows any mid-pipeline core throw (parseSession/extract/runCompliance/scrubDeep) into a silent null abstain. The reorder preserves this; the catch path remains not separately unit-triggered. Pre-existing, not introduced here. — *Guard the anatrace-core load and emit the first real attestation records*

### packages/cli/src/utils/git-operations.ts

- **code:** Long-standing benign lint warning (NOT a failure): `pnpm run lint` passes exit 0 but emits one 'Unused eslint-disable directive (no-control-regex)' warning in src/utils/git-operations.ts:198. Root cause: commit 83b2446d [security-hardening] added the directive for a rule the cli eslint.config.js never enables (no @eslint/js recommended), so it was redundant from commit; ESLint v9+ reports redundant directives. Untouched by this build; flagged across ~12 prior cycles. Fix is a one-line deletion of the redundant directive (zero behavior change). — *Empirical Proof Benchmark — the measuring instrument (ruler)*

### packages/cli/src/utils/proofSummary.ts

- **code:** proofSummary.ts (+32) and proof.ts (+113) continue growth past the comfort threshold flagged by prior findings (decompose-proof-summary-C1, audit-matrix-orientation-C7); additive and well-contained here but the trajectory persists — *Proof-Context Intelligence — why this file exists and what moves with it*
- **code:** Carried forward from verify_report_3 (unchanged — re-build touched only proof-history/index.ts). Import-layer dedup (isProofPartner) uses fileMatches, whose tier-3 basename rule returns true when a proof partner is stored as a bare basename (legacy data). A legacy bare-basename proof partner would suppress ALL same-basename files from the import layer regardless of directory. Low likelihood (requires legacy bare-basename modules_touched); silently drops real import edges if it occurs. — *Proof-Context Intelligence — why this file exists and what moves with it*
- **code:** Carried forward from verify_report_3 (unchanged — the re-build added 0 lines to proofSummary.ts). proofSummary.ts remains oversized after Phase 3's ~138-line addition; proof context confirms decompose-proof-summary-C1 and audit-matrix-orientation-C7 are still active. The also_changes_with assembly/dedup glue could live in the pure engine module rather than the already-large util. — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/src/utils/verdict.ts

- **code:** Circular import between verdict.ts and proofSummary.ts — verdict.ts imports parseComplianceTable, proofSummary.ts imports deriveVerdict — *Verifier Verdict Honesty (light) — the PASS/FAIL verdict stops grading itself*

### packages/cli/tests/benchmark/aggregate.test.ts

- **test:** Determinism test (A034) only asserts same-input idempotence, not stability across input permutations. Implementation genuinely sorts by (task,metric,arm) so cross-permutation determinism holds, but the test would pass even if the explicit sort were removed. — *Empirical Proof Benchmark — the measuring instrument (ruler)*

### packages/cli/tests/benchmark/aggregate.ts

- **code:** aggregate treats 'lower is better' for every numeric metric, including distinctFilesRead/inputTokens/turns — an arm that reads fewer files (even by missing relevant ones) scores a 'win'. Spec-endorsed simplification, but a semantic foot-gun for the next reader. — *Empirical Proof Benchmark — the measuring instrument (ruler)*

### packages/cli/tests/benchmark/harness.test.ts

- **test:** AC7 guard (A036/A037) is a textual substring assertion on scorer.ts source — a future read of a best-effort field via destructuring-rename or computed key would slip past. Legitimate enforcement test, but textual not semantic. — *Empirical Proof Benchmark — the measuring instrument (ruler)*

### packages/cli/tests/benchmark/scorer.ts

- **code:** Dead export `totalTokens` — defined with full JSDoc, never called anywhere (cost uses derived.tokens; the edit-token walk inlines its own input+output sum) — *Empirical Proof Benchmark — the measuring instrument (ruler)*
- **code:** The three to-first-correct-edit metrics can disagree on null-ness: wallClockMsToFirstCorrectEdit is null when the editing line lacks a parseable timestamp, even while turnsToResolution/tokensToFirstCorrectEdit are populated. Latent inconsistency; not triggered by the committed fixtures. — *Empirical Proof Benchmark — the measuring instrument (ruler)*

### packages/cli/tests/commands/_capture.test.ts

- **test:** Tag drift: this contract's A009 (package.json anatrace-core dependency == '0.4.0') has no matching @ana A009 tag. The pin test that actually enforces it (tests/commands/_capture.test.ts:220) carries stale IDs '@ana A001, A045, A046' from a prior cycle's contract. A009 verified by source inspection (pin literal '0.4.0', store resolves anatrace-core@0.4.0), but the tag linkage is broken. — *Guard the anatrace-core load and emit the first real attestation records*

### packages/cli/tests/commands/init/code-graph-init.test.ts

- **test:** New init integration test uses `git init` without `-b main`, violating the documented testing standard (CI runners vary init.defaultBranch — has caused CI failures 3 times). Mirrors the pre-existing flawed pattern in template-propagation.test.ts. — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/tests/commands/init/template-propagation.test.ts

- **test:** Pre-existing flaky test: template-propagation 'Claude-only never touches .codex tree' times out at ~5025ms under full-suite concurrency (passes 100% in isolation). Reproduced on main (failed 1/4 runs at 5025ms with no Phase 2 changes), so NOT a regression. Phase 2 adds import-graph build to every `ana init`, which may marginally raise the flake rate. Root cause: a single test spawns the real CLI `init` twice under the default 5000ms timeout. Fix: raise the timeout on these CLI-spawning init tests. — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/tests/commands/proof.test.ts

- **test:** A006 (--why omits Provenance) has no positive-control guard asserting the full card DOES contain 'Provenance'; only A007's Timing has that guard, so A006 could silently pass if the Provenance label were renamed. Live-verified this round, but the test alone is weaker than A007's — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/tests/engine/analyzers/proof-history.test.ts

- **test:** Path-form-mismatch test gap from verify_report_3 is FIXED. proof-history.test.ts:200 (@ana A014) exercises a package-relative query (src/commands/work.ts) against a repo-relative stored partner (packages/cli/tests/commands/work.test.ts) and asserts suppressedTestPartner === true, the test mirror absent, and the real partner present — the exact red-before/green-after case the prior fix brief specified. Suite went 4068 -> 4069 passing, 0 failed. — *Proof-Context Intelligence — why this file exists and what moves with it*

### packages/cli/tests/utils/compliance.test.ts

- **test:** Quiet-direction test (A004) covers only the no-role benign path; spec named 'no role OR no session'. loadCore: () => null is injected but never invoked because the role guard short-circuits first — so the test cannot distinguish a correctly-quiet benign path from a broken loud guard. It correctly pins the ordering intent, but is single-path. — *Guard the anatrace-core load and emit the first real attestation records*

### website/content/docs/concepts/contract.mdx

- **code:** Fix 3 docs section summarizes the coverage-gate activation as 'on a scope whose criteria it can parse', folding in the underlying '>=1 recovered AC' condition rather than enumerating it. This is per explicit spec instruction (do not overstate the gate). Accurate and deliberately terse — noted, not a defect. — *Public-surface honesty touch-ups*

### website/lib/copy.ts

- **code:** Proof context shows two still-present concerns on website/lib/copy.ts from prior cycles: manifesto outbound link points to /#pipeline (no longer exists), and proofFeed copy references clickable rows that are no longer clickable. This build does not touch either — still present, out of scope here. — *Public-surface honesty touch-ups*

### website/lib/proof-feed.ts

- **code:** Pre-existing lint warnings in website (formatAge unused in components/hero or lib/proof-feed; 'latest' unused). 0 errors, gate passes. NOT introduced by this build — the four changed files contain neither symbol. Recorded so the next engineer doesn't attribute them to this change. — *Public-surface honesty touch-ups*

