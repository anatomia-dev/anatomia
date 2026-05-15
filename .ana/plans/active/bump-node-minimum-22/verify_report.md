# Verify Report: Bump Node Minimum to 22, Add Node 24 to CI

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-15
**Spec:** .ana/plans/active/bump-node-minimum-22/spec.md
**Branch:** feature/bump-node-minimum-22

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/bump-node-minimum-22/contract.yaml
  Seal: INTACT (hash sha256:c879061356e931e6ef694946ad8db2c1b703d35adb767c125836d4a8a4252a77)
```

Tests: 2297 passed, 2 skipped (104 files). Build: success. Lint: 0 errors, 1 pre-existing warning (unused eslint-disable directive).

## Contract Compliance

Testing strategy is build-only (no code changes, no new tests, no `@ana` tags expected). All assertions verified by source inspection.

| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | Root package requires Node 22 or higher | ✅ SATISFIED | `package.json` engines.node = `>=22.0.0` |
| A002 | CLI package requires Node 22 or higher | ✅ SATISFIED | `packages/cli/package.json` engines.node = `>=22.0.0` |
| A003 | Website package requires Node 22 or higher | ✅ SATISFIED | `website/package.json` engines.node = `>=22.0.0` (normalized from `>=20.11`) |
| A004 | CLI builds against Node 22 as the syntax floor | ✅ SATISFIED | `packages/cli/tsup.config.ts:6` target = `'node22'` |
| A005 | CI tests against Node 22 and Node 24 | ✅ SATISFIED | `.github/workflows/test.yml:23` node-version: `[22, 24]` |
| A006 | CI no longer tests against end-of-life Node 20 | ✅ SATISFIED | `.github/workflows/test.yml:23` — no `20` in matrix. Grepped full file, no Node 20 references |
| A007 | Coverage uploads from the lowest supported Node version | ✅ SATISFIED | `.github/workflows/test.yml:66` `if: matrix.node-version == 22` |
| A008 | Coverage upload step name reflects Node 22 | ✅ SATISFIED | `.github/workflows/test.yml:65` `Upload coverage (Node 22 only)` |
| A009 | README tells users Node 22 is required | ✅ SATISFIED | `README.md:56` `Requires Node.js 22+.` |
| A010 | Getting started page tells users to install Node 22 | ✅ SATISFIED | `website/content/docs/start.mdx:10` `Node.js 22 or later` |
| A011 | Troubleshooting page references Node 22 as minimum | ✅ SATISFIED | `website/content/docs/guides/troubleshooting.mdx:15` `Node 22+` |
| A012 | Root contributing guide requires Node 22 | ✅ SATISFIED | `CONTRIBUTING.md:13` `Node.js 22+` |
| A013 | CLI contributing guide requires Node 22 | ✅ SATISFIED | `packages/cli/CONTRIBUTING.md:12` `Node.js 22+` |
| A014 | CLI contributing guide describes the updated CI matrix | ✅ SATISFIED | `packages/cli/CONTRIBUTING.md:398` and `:414` both say `Node 22/24` |
| A015 | Architecture doc describes the updated CI matrix | ✅ SATISFIED | `packages/cli/ARCHITECTURE.md:225` `Node 22/24` |
| A016 | Deployment skill reflects the current CI runners | ✅ SATISFIED | `.claude/skills/deployment/SKILL.md:12` `Node 22, 24` |
| A017 | tsconfig comment references Node 22 as the baseline | ✅ SATISFIED | `tsconfig.base.json:35` `Node 22+` |
| A018 | Website copy tells visitors Node 22 is required | ✅ SATISFIED | `website/lib/copy.ts:475` `Node 22+` |
| A019 | Generated docs file reflects the updated Node version from sources | ✅ SATISFIED | `website/public/llms-full.txt:1071` `Node.js 22 or later` |
| A020 | Generated docs file has no stale Node 20 references from source pages | ✅ SATISFIED | Grepped `llms-full.txt` for `Node.js 20 or later` and `Node 20+` — no matches |
| A021 | All existing tests still pass after the version bump | ✅ SATISFIED | 2297 passed, 2 skipped, 0 failed |
| A022 | CLI builds without errors | ✅ SATISFIED | `pnpm run build` exit 0, clean output |

## Independent Findings

**Predictions resolved:**

1. "Builder missed one of three CONTRIBUTING.md locations" — **Not found.** All three (lines 12, 398, 414) updated.
2. "website/package.json format normalization inconsistent" — **Not found.** Correctly normalized from `>=20.11` to `>=22.0.0`.
3. "llms-full.txt contains residual Node 20 references" — **Not found.** Grepped — zero matches for `Node.js 20 or later` or `Node 20+`.
4. "tsconfig comment overlooked" — **Not found.** Updated at line 35.
5. "Coverage gate uses string comparison" — **Not found.** Uses numeric `== 22` as specified.

**Production risks:**

1. "Missed engines field" — **Not found.** All three package.json files updated.
2. "Stale llms-full.txt" — **Not found.** Regenerated via prebuild, contains Node 22 references, no Node 20 references.

**Surprise finding:** The branch is 4 commits behind main. The merge base is `8ca96801`, which predates the `fix-gantt-bar-distortion` plan save (`5b95dc00`). The PR diff will show deletion of `fix-gantt-bar-distortion` artifacts (scope.md, spec.md, contract.yaml, plan.md). This needs a rebase before merge to avoid accidentally deleting another scope's plan artifacts. Not a build quality issue — it's a branch timing issue.

**Over-building check:** No over-building detected. The builder made exactly the string replacements specified in the spec plus the expected prebuild regeneration side effects (dynamic stat updates in MDX files). No new files, no new exports, no new code paths.

**Residual Node 20 grep:** Searched all `.json`, `.ts`, `.yml`, `.md`, `.mdx`, `.txt` files for `Node 20`, `node20`, `>=20`, `node-version.*20`. All matches are in `.ana/` plan artifacts (spec, build report, worktree-context) — no source file contamination.

## AC Walkthrough

- **AC1:** `engines.node` is `>=22.0.0` in root `package.json`, `packages/cli/package.json`, and `website/package.json` — ✅ PASS (verified via `node -e` reading each file's engines.node field)
- **AC2:** `tsup.config.ts` target is `node22` — ✅ PASS (`packages/cli/tsup.config.ts:6`)
- **AC3:** CI test matrix is `node-version: [22, 24]` — ✅ PASS (`.github/workflows/test.yml:23`)
- **AC4:** Coverage upload gated on `matrix.node-version == 22` — ✅ PASS (`.github/workflows/test.yml:66`, numeric comparison)
- **AC5:** Branch protection required status checks — -- UNVERIFIABLE (post-merge manual step, requires admin permissions)
- **AC6:** README says "Requires Node.js 22+" — ✅ PASS (`README.md:56`)
- **AC7:** `start.mdx` says "Node.js 22 or later" — ✅ PASS (`website/content/docs/start.mdx:10`)
- **AC8:** `troubleshooting.mdx` says "Node 22+" — ✅ PASS (`website/content/docs/guides/troubleshooting.mdx:15`)
- **AC9:** `llms-full.txt` regenerated via prebuild — ✅ PASS (contains `Node.js 22` at line 1071, no stale Node 20 references)
- **AC10:** All remaining documentation references updated — ✅ PASS (verified: `CONTRIBUTING.md:13`, `packages/cli/CONTRIBUTING.md:12,398,414`, `packages/cli/ARCHITECTURE.md:225`, `.claude/skills/deployment/SKILL.md:12`, `tsconfig.base.json:35`, `website/package.json` engines, `website/lib/copy.ts:475`)
- **AC11:** All tests pass — ✅ PASS (2297 passed, 2 skipped, 0 failed)
- **AC12:** No build errors — ✅ PASS (build exit 0, clean output)
- **AC13:** No lint errors — ✅ PASS (0 errors, 1 pre-existing warning)

## Blockers

No blockers. All 22 contract assertions satisfied. All 12 verifiable ACs pass (AC5 is post-merge). No regressions — test count matches baseline (2297 passed, 2 skipped). No unused exports in changed files (no new exports added). No unhandled error paths (no new code). No assumptions about external state (string replacements only). The rebase requirement is a deployer concern, not a blocker.

## Findings

- **Upstream — Branch 4 behind main, PR diff includes cross-scope deletions:** The feature branch was created from `8ca96801` before `fix-gantt-bar-distortion` plan artifacts were committed to main (`5b95dc00`). The PR diff will show deletion of `fix-gantt-bar-distortion/scope.md`, `spec.md`, `contract.yaml`, `plan.md`, and truncation of `.saves.json`. Rebase onto main before merge to avoid accidental deletion.
- **Code — Dynamic stat updates outside spec file_changes:** `website/content/docs/concepts/pipeline.mdx`, `website/content/docs/guides/reading-a-proof.mdx`, `website/content/docs/guides/using-ana-learn.mdx`, `website/content/docs/guides/verifying-changes.mdx`, `website/content/docs/start.mdx:75`, `website/content/docs/guides/troubleshooting.mdx:43,133` — all have `ana:dynamic` marker updates (proof count 90->103, rejection count 19->21) from running `pnpm prebuild`. These are correct and expected side effects of regeneration, but they appear in the PR diff as unspecified changes. Not a problem — just context for the reviewer.
- **Upstream — Contract A021 test count snapshot:** Contract specifies `value: 2297` for test count. This is correct for the current branch but is a point-in-time snapshot. If main gains tests before merge, the assertion value won't match post-merge reality. No action needed — the assertion verified what it should have.
- **Code — Pre-existing lint warning:** `anatomia-cli:lint` reports unused eslint-disable directive for `no-control-regex`. Not introduced by this build. Pre-existing.

## Deployer Handoff

1. **Rebase required before merge.** The branch is 4 commits behind main. Without rebase, the PR will delete `fix-gantt-bar-distortion` plan artifacts from `.ana/plans/active/`. Run `git rebase main` on the feature branch before merging.
2. **Post-merge: update branch protection.** AC5 requires updating required status checks to `Test (ubuntu-latest, Node 22)` and `Test (ubuntu-latest, Node 24)`. This requires admin permissions and depends on the new check names existing in CI first — so it must happen after merge.
3. **All changes are string replacements.** No code behavior changes. No dependency updates. No new files. Safe to merge after rebase.

## Verdict
**Shippable:** YES

22/22 contract assertions SATISFIED. 12/13 ACs pass (AC5 is post-merge manual step). Tests pass (2297/2297). Build clean. Lint clean. No regressions. No scope creep beyond expected prebuild side effects. The rebase-before-merge requirement is documented in Deployer Handoff.
