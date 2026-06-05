# Scope: Co-change coupling + convention-break intelligence in `ana scan`

**Created by:** Ana
**Date:** 2026-06-05

## Intent

Make `ana scan` reveal the two things it can't see today: **coupling that imports don't show** (files that change together for non-obvious reasons) and **which files violate the team's own conventions**. These are the two outputs that are genuinely useful to *both* readers of the scan — Ana's pipeline (accurate blast-radius when scoping, better code-fit when building) and the casual user at top-of-funnel (the "how did it know that" moment no repo-packer produces).

Hard constraint, set by the user and non-negotiable: **no meaningful dishonesty, no wrong data.** Every surfaced datum is a measured fact or an explicit "no dominant signal" — never an inferred judgment, never a fabricated field, never a number we can't defend. A scan that says the true thing ("your file naming has no dominant style") beats one that invents a violations list.

This is borrowed from CodeScene/Tornhill behavioral analysis (change coupling) and is a straight extension of our own convention analyzer (the majority is already computed; we currently discard the minority).

## Complexity Assessment
- **Kind:** feature
- **Size:** large
- **Surface:** cli
- **Files affected:**
  - New: a co-change analyzer + a `gitIntelligence` assembler (`src/engine/analyzers/behavioral/` or extension of `detectors/git.ts`); a convention-break extractor in `src/engine/analyzers/conventions/`.
  - Modified: `src/engine/scan-engine.ts` (wire + populate the three fields), `src/engine/analyzers/conventions/naming.ts` + `conventions/index.ts` (thread per-file attribution), `src/engine/types/engineResult.ts` (shape reconciliation — see Constraints), `src/commands/scan.ts` (Intelligence + new Consistency rendering), `src/commands/init/assets.ts` + `init/skills.ts` (seed `project-context.md` "What Looks Wrong" + skill injectors), `website/components/ScanSlab.tsx` (mock refresh, optional).
  - Tests: `tests/contract/analyzer-contract.test.ts` (gate) + new unit tests.
- **Blast radius:** Contained. The three fields are currently `null` stubs and unconsumed, so populating them breaks nothing. `EngineResultPartial` validates only `schemaVersion`/`stack`/`commands` → no validator change. Risk concentrates in (a) the per-file attribution threading through naming analyzers, and (b) the sample-cap bump (750→1000) which is a *global* deep-tier perf change affecting pattern + convention sampling, not just this feature.
- **Estimated effort:** ~2–4 days across two phases. Phase A (co-change) is a contained git-log analyzer + display. Phase B (conventions) is attribution threading + extraction + display.
- **Multi-phase:** yes

## Approach

Two independent, independently-shippable phases. Both flow end-to-end: analyzer → `scan.json` → CLI display → generated context → Ana consumption. The honesty bar is enforced by **gates** (nothing renders unless it clears support/confidence) and **honest absence** (suppress entirely rather than show noise).

**Phase A — Co-change coupling** (language-agnostic; runs at every tier including `--quick`).
Mine the commit window for files that change together. Build a co-occurrence count over commits, **excluding oversized commits** (the squash/refactor/rename-sweep guard) and non-product paths. Surface only pairs that clear a **support** gate (changed together ≥ K times) *and* a **confidence** gate (% co-change). Suppress the entire block on shallow clones or below a minimum-history threshold. Populate `gitIntelligence.coChangeCoupling`; leave `churnHotspots`, `busFactor`, `bugMagnetFiles` `null`. Reuse the existing churn git-log pass and filters in `detectRecentActivity`.

**Phase B — Convention breaks + inconsistencies** (deep tier only).
We already compute the majority convention with a confidence and a `mixed` flag at <0.7. Capture the **per-file outliers** against a *confident* majority → `conventionBreaks`. Surface **mixed / no-dominant** conventions and the null-vs-undefined split → `inconsistencies`. Only emit breaks when a confident majority exists (≥0.7); below that there is nothing to break *from*, so it's reported as an inconsistency, not a violation. File-naming breaks are computed over **all** source files (basenames, no parse → exact); function/variable breaks come from the sample and are labeled `scope: "sampled"`.

**Explicitly not in this scope** (see Rejected Approaches): PageRank importance map, bus factor, churn×complexity hotspots, composite AI-readiness score, import-relationship detection.

## Acceptance Criteria
- AC1: `coChangeCoupling` entries appear only when support ≥ K **and** confidence ≥ threshold (conservative defaults; configurable in code).
- AC2: Commits touching more than N files are excluded from the co-occurrence computation (squash/refactor guard).
- AC3: `gitIntelligence` is `null` on a shallow clone or below a minimum-commit threshold — honest absence, not partial data.
- AC4: Each `coChangeCoupling` entry carries **support counts** (e.g. `together`/`of`), not only a percentage. (Requires the shape extension in Constraints.)
- AC5: `hasImportRelationship` is **never fabricated** — left `null`/omitted, since no import resolution is in scope.
- AC6: `conventionBreaks` is populated only for conventions whose majority confidence ≥ 0.7; mixed conventions are reported in `inconsistencies`, never as breaks.
- AC7: File-naming breaks are computed over all source files; sample-bounded breaks (function/variable) are labeled `scope: "sampled"`.
- AC8: Generated/vendored paths are excluded from both phases (via `isNonProductFilePath`).
- AC9: `aiReadinessScore`, `churnHotspots`, `busFactor`, `bugMagnetFiles`, `complexityHotspots` remain `null`.
- AC10: `--quick` still produces Phase A (git-only) and skips Phase B (AST-dependent).
- AC11: Deep-tier scan stays within the perf budget (sub-5s typical / sub-15s 10K-file monorepo) with the sample cap raised to 1000.
- AC12: CLI renders new lines only when data clears its gate — no empty "Consistency" or coupling sections.
- AC13: Existing consumers are unaffected; `EngineResultPartial` is unchanged; `analyzer-contract.test.ts` updated for the populated/extended fields.

## Edge Cases & Risks
- **Squash-merge inflates coupling** — a squashed PR bundles a whole feature into one commit, so everything looks coupled. Mitigated by the commit-size cap (AC2) + support/confidence gates (AC1). This is the single biggest correctness risk.
- **Renames appear as delete+add** under `--name-only`, breaking both churn attribution and coupling. Recommend `-M` rename detection; the commit-size cap mitigates rename-sweep commits.
- **Fresh / thin-history repos (our sniper customer)** — Phase A goes silent (correct, per AC3). Phase B must still fire (it needs no history), so a freshly vibe-coded repo still gains convention value. Verify the fresh-repo experience isn't empty.
- **No-majority conventions** — our own repo's file naming is the live example (PascalCase 0.63 / kebab 0.21 / camel 0.16, confidence 0.61). Must report as `inconsistencies`, never a breaks list.
- **`nullStyle` is occurrence-count based, not file-based** — the `inconsistencies.variants.fileCount` field assumes file counts; null/optional are match counts. Reconcile the semantic (count vs fileCount) rather than mislabel.
- **Sample-cap bump 750→1000 is global** — it also feeds pattern + convention sampling and adds ~33% parse cost to every deep scan. Validate as a perf change in its own right, not a Phase-B side effect.
- **Monorepo cross-package coupling noise** — large monorepos produce many weak pairs; the support threshold + top-K output bound it.

## Rejected Approaches
- **PageRank file-importance map (Aider repo-map).** Highest-craft idea, validated against aider's actual source (`/tmp/aider-eval/aider/repomap.py`), but needs symbol-reference extraction + import resolution + a sampling-completeness strategy. Higher cost/risk; deferred to its own scope. The `complexityHotspots` stub stays reserved for it.
- **Bus factor / ownership.** Human/org signal with near-zero agent value, and noisy on small teams (bus factor 1 is true of nearly every file in a 3-person startup — our core customer). Cut.
- **Churn × complexity hotspots.** ~90% redundant with the existing "Hot files" line (`git.recentActivity.highChurnFiles`). A *true* hotspot needs a complexity metric we don't compute — that's a separate scope, not a re-display.
- **Composite AI-readiness score.** A single opaque 0–100 number invites "this is made up" and directly undermines the honesty bar. Ship the verifiable facts now; earn a score later once the inputs are trusted. `aiReadinessScore` stays `null`.
- **`hasImportRelationship` via import resolution.** Deferred with PageRank; the field is left `null` rather than fabricated `false`.
- **Cross-repo similarity (the zauth.inc idea).** Fraud-detection signal, off-market for us.

## Open Questions
*(Design-judgment calls for AnaPlan — the factual ones are already resolved in Exploration Findings.)*
- Coupling window model: reuse the adaptive 14/30-**day** window, or a last-**N-commits** window (more robust across repo velocities)? Lean last-N bounded (~500–1000 commits) with a perf cap.
- Coupling confidence definition: `co / min(changesA, changesB)` vs `co / union(changesA, changesB)` — pick the one that reads most honestly and resists asymmetry.
- Default thresholds: support K, confidence %, commit-size cap N — need calibration against real repos (start ~K=3, conf≥0.6, N≈25).
- Should the typed shapes be extended now (support count on coupling; `hasImportRelationship` nullable)? Recommend yes — both are required for honesty and both touch the contract test.

## Exploration Findings

### Patterns Discovered
- `detectors/git.ts:359-413` (`detectRecentActivity`) already runs `git log --name-only` over an adaptive window with `isNonProductFilePath` + source-extension filtering — the exact scaffold Phase A extends. Co-change should share this pass (add a commit delimiter to the format string to recover commit boundaries).
- `detectors/git.ts:361-362` — shallow-clone guard returns `null`. Reuse verbatim for coupling suppression (AC3).
- `analyzers/conventions/index.ts:74` — file naming derives from `sampledFilePaths` basenames (path is in hand → attributable today). `:77-82` — function/class/variable naming come from `parsedFiles` (file-of-origin must be threaded for attribution).
- `analyzers/conventions/naming.ts:262-271` (`analyzeNamingConvention`) returns `{majority, confidence, mixed, distribution}` with `mixed = majorityPercent < 0.7`. **The honesty gate already exists** — breaks are simply the discarded minority when `!mixed`.
- `analyzers/conventions/codePatterns.ts:149` (`detectNullStyle`) already computes `nullCount` vs `optionalCount` → feeds a `null-style` inconsistency directly.

### Constraints Discovered
- [TYPE-VERIFIED] `gitIntelligence.coChangeCoupling` (`engineResult.ts:289-294`) = `{fileA, fileB, coChangePercentage, hasImportRelationship}`. Two honesty gaps: (a) no support count → **extend the shape**; (b) `hasImportRelationship` needs import resolution we are not building → leave `null`/make nullable. Siblings `churnHotspots`/`busFactor`/`bugMagnetFiles` stay `null`.
- [TYPE-VERIFIED] `conventionBreaks` (`engineResult.ts:347-352`) = `{convention, expected, file, actual}` — requires per-file attribution the naming analyzers currently discard.
- [TYPE-VERIFIED] `inconsistencies` (`engineResult.ts:339-346`) = `{category, variants:[{pattern, percentage, fileCount}]}` — fits mixed-convention + null-style; note the `fileCount` vs occurrence-count semantic for null-style.
- [TYPE-VERIFIED] `createEmptyEngineResult` (`engineResult.ts:379-417`) nulls all three — keep null defaults; populate in `scan-engine.ts` only when gates pass.
- [OBSERVED] `EngineResultPartial` validates only `schemaVersion`/`stack`/`commands` → no validator change needed.
- [OBSERVED] `analyzeNamingConvention(names: string[], language)` — adding attribution is a signature/threading change through `naming.ts` + `index.ts`. Carry `{name, file}` cleanly; do not bolt on a parallel pass (foundation, not scaffolding).

### Test Infrastructure
- `tests/contract/analyzer-contract.test.ts` — the gate; asserts `EngineResult` completeness via `createEmptyEngineResult()`. Update for populated/extended fields.
- `tests/utils/scaffold-generators.test.ts`, `tests/scaffolds/all-scaffolds.test.ts` — context generators.
- `tests/commands/injectors.test.ts` — skill Detected injectors.
- `tests/commands/check.test.ts` — mock `scan.json` (intelligence fields optional).
- New unit tests required: co-change computation against synthetic git-log fixtures (incl. squash-merge and rename cases), break attribution, gate behavior, thin-history suppression.

## For AnaPlan

### Structural Analog
`detectors/git.ts` → `detectRecentActivity` (the churn miner) is the structural analog for the Phase A co-change analyzer: same `git log --name-only` over a window, same `isNonProductFilePath` + source-ext filtering, same null-on-shallow guard. Build coupling sharing that pass. For Phase B, `analyzers/conventions/index.ts` orchestration + `naming.ts` is the analog — a parallel "breaks" extraction over the same classified data.

### Relevant Code Paths
- `src/engine/detectors/git.ts:359-413` — churn miner to extend / share.
- `src/engine/scan-engine.ts:1011-1022, 1104-1143` — git detection call site + the `EngineResult` assembly where the three fields are returned (currently null).
- `src/engine/analyzers/conventions/naming.ts:190-271, 389-455` — majority/confidence + the per-type naming analyzers needing attribution.
- `src/engine/analyzers/conventions/index.ts:71-91` — where file vs parsed naming is sourced (attribution thread point).
- `src/engine/types/engineResult.ts:277-362` — the three target field shapes.
- `src/commands/scan.ts:268-320` — the Intelligence section where new lines render.

### Patterns to Follow
- Filtering via `isNonProductFilePath` (both phases).
- Shallow-clone null guard (`git.ts:361-362`).
- The honesty gate = the existing `<0.7 mixed` flag in `naming.ts` — don't invent a new threshold; breaks are the minority when not mixed.
- The grouped-object pattern for `gitIntelligence` (populate one sibling, leave the rest null).

### Known Gotchas
- `hasImportRelationship` honesty trap — `null`, never `false`.
- `coChangePercentage` without support is misleading — extend the shape.
- Per-file attribution gap in naming analyzers — the main new plumbing in Phase B.
- `nullStyle` is occurrence-count, not fileCount — don't mislabel in `inconsistencies`.
- Sample-cap bump (750→1000) is a global deep-tier perf change — validate independently.
- Squash-merge inflation + rename-as-add/delete — commit-size cap + `-M`.

### Things to Investigate
- Coupling window model (days vs last-N-commits) and confidence formula — design judgment, calibrate against real repos.
- Threshold defaults (support K, confidence, commit-size N) — empirical.
- Whether to extend the typed `coChangeCoupling` shape (support count) and make `hasImportRelationship` nullable now — recommended yes; both touch `analyzer-contract.test.ts`.
- Best home for the new analyzer (extend `git.ts` vs a new `analyzers/behavioral/` module) — recommend a new module that shares the churn git-log pass, keeping `git.ts` focused.
