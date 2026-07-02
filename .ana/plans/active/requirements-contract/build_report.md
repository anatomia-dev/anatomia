# Build Report: The requirements contract — validated upstream intake

**Created by:** AnaBuild
**Date:** 2026-07-01
**Spec:** .ana/plans/active/requirements-contract/spec.md
**Branch:** feature/requirements-contract

## What Was Built

- **packages/cli/src/utils/req-frontmatter.ts** (created): The pure frontmatter primitive — `parseRequirement` (splits the leading `---` YAML block from the body, preserving unknown keys and the body byte-for-byte, `hadFrontmatter` false for absent/unterminated blocks without throwing), `serializeRequirement` (canonicalizes the enum keys to lowercase, round-trips unknown keys in insertion order, leaves the body untouched), `canonicalizeEnumValue`, and the enum constants `PRIORITY_VALUES` / `STATUS_VALUES` / `RESOLUTION_VALUES` / `PRIORITY_ORDER` + the `RequirementFrontmatter` interface. Zero CLI deps, like `verdict.ts`.
- **packages/cli/src/commands/artifact-validators.ts** (modified): Added `validateReqFormat(filePath)` and its content-based core `validateReqContent(content, stem)`. Checks in order: frontmatter present & parseable → no unknown keys → `req` equals filename stem → `priority`/`status` enum (case-insensitive) → `created` parses as a date → `resolution` present iff `status: archived` (and enum when present) → non-empty `appetite` if present → required sections `## Problem` / `## Evidence` / `## Done Looks Like` present & non-empty, accepting the aliases (`Disease`, `Why This Matters`, `What to Build`). Mirrors `validateScopeFormat`'s message style and exact-enum pattern.
- **packages/cli/src/commands/req-state.ts** (created): Leaf state module modeled on `work-state.ts`. `discoverRequirements` (dual-mode, root only), `buildRequirementList` (parses each file, marks malformed instead of throwing, cross-references `claimed_by` against active slugs for `stale`, sorts by priority then created), `getRequirementsSummary` (the try/catch-wrapped status probe — reads only the requirements dir, returns null when 0 open or on any error), `assertRequirementClaimable` (read-only open-check), `claimRequirement` (rewrites to `status: claimed` + `claimed_by`), `archiveRequirementsForSlug` (moves claimed-by-slug files to `archived/` with `status: archived` + `resolution: completed`).
- **packages/cli/src/commands/req.ts** (created): The `req` command group — `list` (`--json`), `validate <file>`, `new <id>`. `buildRequirementScaffold(id, todayISO)` generates a requirement that passes `ana req validate` unmodified. `new` strips a user-typed `REQ-`/`req-` prefix and refuses to overwrite. Registered under the PIPELINE group.
- **packages/cli/src/index.ts** (modified): `registerReqCommand(program)` wired into the PIPELINE group next to `registerWorkCommand`.
- **packages/cli/src/commands/work.ts** (modified): `StatusOutput` gained optional `requirements?: { open; highestPriority }`; `getWorkStatus` runs the probe once before the empty-slugs branch and threads it into all three output sites via a spread (present only when non-null); `printNotifications` prints the ℹ line when `open > 0`. `startWork` gained `--req`: validates claimable before `mkdir`, claims after `work_started_at`, commits the requirement in the "Start work" commit (`commitSaves` extended with `extraPaths`). `completeWork` archives claimed requirements best-effort (a failure warns and never blocks). `--req <id>` option added to the start command.
- **packages/cli/src/commands/init/state.ts** (modified): New copy-block (step 7b) preserving `.ana/requirements/` wholesale (root + `archived/`) on re-init, plus a `requirements/` line in the `preserveUserState` policy doc comment.
- **packages/cli/templates/.claude/agents/ana.md** & **packages/cli/templates/.codex/agents/ana.md** (modified): Three identical touchpoints — a Check State addendum, one Pipeline State table row, and the "Picking up a requirement" subsection framing requirement content (including `## Leads`) as untrusted data to verify, with the asymmetric-confidence rule, own-file-list derivation, appetite-vs-effort rejection, priority proposal, `## Not This` boundary, Open-Questions answering, `**Requirement:** REQ-<id>` preview line, `ana work start --req` claim, and rejection as a first-class outcome. Codex body stays byte-identical to Claude minus its 7 frontmatter lines.
- **.claude/agents/ana.md** & **.codex/agents/ana.md** (modified): Dogfood copies synced with the updated templates (enforced by the dogfood consistency tests).
- **packages/cli/tests/utils/req-frontmatter.test.ts** (created): Round-trip fidelity, unknown-key preservation, byte-identical body, enum canonicalization, insertion order, `PRIORITY_ORDER` shape.
- **packages/cli/tests/commands/req.test.ts** (created): One test per `validateReqFormat` violation class + valid + aliases + case-insensitive; scaffold validity; `buildRequirementList` rows/malformed/stale/sort; A034 gitignore coverage.
- **packages/cli/tests/commands/work.test.ts** (modified): status ℹ line + `--json requirements` field + byte-identity absent case; `--req` claim (claimed/claimed_by, non-open error with no half-started item, plain start untouched); complete-time archive (moved + resolution completed, archive-failure-still-completes).
- **packages/cli/tests/commands/init/template-propagation.test.ts** (modified): `.ana/requirements/` preservation (root + archived) and the Think requirement-pickup source-content parity assertions.

## PR Summary

- Adds a new **requirement backlog** upstream of work items: hand-written `.ana/requirements/REQ-*.md` files with validated frontmatter, surfaced by a new `ana req` command group (`list`, `validate`, `new`).
- `ana work status` now surfaces open requirements (an ℹ line + a `requirements` field in `--json`), present only when at least one open requirement exists so existing output stays byte-identical when the folder is absent.
- `ana work start <slug> --req REQ-<id>` claims a requirement (`status: claimed`, `claimed_by`); `ana work complete` archives claimed requirements to `archived/` with `resolution: completed`, best-effort so it never blocks completion.
- Re-init (`ana init`) now preserves the requirements backlog wholesale, closing a data-loss gap.
- The Think agent (both Claude and Codex) is taught to pick up requirements and to treat their content — including `## Leads` — as untrusted data to verify, never instructions to obey.

## Acceptance Criteria Coverage

- AC1 "req new scaffolds valid" → req.test.ts "produces a scaffold that validates unmodified and has correct defaults" (A001–A004) ✅
- AC2 "validate rejects each violation class" → req.test.ts validateReqFormat describe, one test per class + valid + case-insensitive (A005–A013) ✅
- AC3 "section aliases accepted" → req.test.ts "accepts aliased section headings" (A014) ✅
- AC4 "req list dual-mode / sorted / malformed / --json" → req.test.ts buildRequirementList describe (A015–A018) ✅
- AC5 "stale claim detection" → req.test.ts "flags a claimed requirement whose slug is no longer active" + negative case (A019) ✅
- AC6 "status ℹ + --json requirements only when open ≥ 1, byte-identical otherwise" → work.test.ts requirements-surfacing describe (A020–A022) ✅
- AC7 "work start --req claim + clean errors, plain start unchanged" → work.test.ts (A023–A026) ✅
- AC8 "complete archives with resolution completed, best-effort" → work.test.ts requirement-archive describe (A027–A029) ✅
- AC9 "re-init preserves .ana/requirements/" → template-propagation.test.ts "preserves .ana/requirements/ byte-identically" (A030) ✅
- AC10 "Think template updated identically in both platforms" → template-propagation.test.ts requirement-pickup describe (A031–A033) ✅
- AC11 "additive only; requirements commit by default" → req.test.ts "stock .ana/.gitignore does not ignore requirements" (A034); no changes to parseArtifactType/saveArtifact/ANA_GITIGNORE_STOCK (verified — see Verification Commands) ✅
- AC12 "test count does not decrease; new behavior covered" → baseline 4117 → 4158 passing (+41). Byte-identity (A022) and preservation (A030) pinned. ✅

Contract coverage: 34/34 assertions (A001–A034) tagged with `@ana`.

## Implementation Decisions

- **`validateReqContent(content, stem)` extracted as the validator core.** `req list` must flag malformed rows for content read off-branch (via `git ls-tree`), where no file path exists. Rather than duplicate the enum/section logic, `validateReqFormat(filePath)` became a thin file-reading wrapper over `validateReqContent`. One validation implementation, reused by both the CLI validator and the list. (Spec stated only the `(filePath)` signature; the core is additive.)
- **`claimRequirement` takes `slug`.** The spec's prose required writing `claimed_by: <slug>` but wrote the signature without a slug parameter. Added `slug`; `assertRequirementClaimable` was factored out so the `--req` path can do a read-only open-check before `mkdir` and the claim can re-check (defense in depth).
- **`commitSaves` extended with `extraPaths`.** `commitSaves` scopes its commit to `.saves.json` via an explicit pathspec, so a separately-staged requirement file would not have been committed. Added an optional `extraPaths` (default empty) so the claimed requirement rides in the same "Start work" commit.
- **Requirements probe threaded via spread.** `const reqField = reqSummary ? { requirements: reqSummary } : {}` spread into all three `StatusOutput` sites keeps the field absent (not `null`/`undefined`) when there are no open requirements — the load-bearing byte-identity requirement (AC6/AC12/A022).
- **Archive placed after completion commit.** In `completeWork` the archive runs after the plans/active→completed move is committed and pushed, wrapped in try/catch — so an archive failure can never undo or block a completion that already succeeded.

## Deviations from Contract

None — the contract was followed exactly. Every assertion A001–A034 is satisfied by a tagged test using the contract's matcher intent (equals/truthy/exists/contains/greater as specified). The implementation-signature adjustments above (`claimRequirement` slug parameter, `validateReqContent` core, `commitSaves` extraPaths) are additive helper-shape choices that do not change any asserted behavior; they are recorded as Implementation Decisions and Open Issues, not as deviations from an assertion.

## Test Results

### Baseline (before changes)
Command: `(cd packages/cli && pnpm vitest run)`
Tests: 4117 passed, 0 failed, 2 skipped (177 test files)

### After Changes
Command: `ana test --stage build --slug requirements-contract` (runs `pnpm run test -- --run`)
Tests: 4158 passed, 0 failed, 2 skipped

<!-- ana:capture stage=build slug=requirements-contract counts=4158p/0f/2s verdict=pass sha256=428d793740d5931d2727094812e100b19ac17508f609c441b115effdde33e2c4 -->

### Comparison
- Tests added: 41 (12 frontmatter, 17 req command/validator/gitignore, 9 work integration, 4 init preservation + template parity — minus 1 net from counting; net +41 passing)
- Tests removed: 0
- Regressions: none (two dogfood consistency tests failed transiently mid-build because templates were updated before their dogfood copies were synced; fixed in commit "Sync dogfood ana.md agent files with updated templates" — final run is fully green)

### New Tests Written
- tests/utils/req-frontmatter.test.ts: parse/serialize round-trip, unknown-key preservation, byte-identical body, enum canonicalization, insertion order, PRIORITY_ORDER
- tests/commands/req.test.ts: validateReqFormat (every violation class + valid + aliases + case-insensitive), scaffold validity, buildRequirementList (rows/malformed/stale/sort), gitignore coverage
- tests/commands/work.test.ts: status ℹ + JSON + byte-identity; --req claim (+ error, + plain-start-untouched); archive-on-complete (+ best-effort failure)
- tests/commands/init/template-propagation.test.ts: requirements preservation; Think requirement-pickup parity (subsection present both platforms, codex==claude minus frontmatter, untrusted framing)

## Verification Commands

```
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run tests/commands/req.test.ts tests/utils/req-frontmatter.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/work.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/init/template-propagation.test.ts)
(cd packages/cli && pnpm vitest run tests/templates/agent-proof-context.test.ts tests/templates/codex-learn-template.test.ts)
ana test --stage build --slug requirements-contract
(cd packages/cli && pnpm run lint)
# AC11 additive-only spot checks (should show no diff to these symbols):
git diff main..HEAD -- packages/cli/src/commands/artifact.ts   # parseArtifactType / saveArtifact untouched
git diff main..HEAD -- packages/cli/src/commands/init/gitignore.ts  # ANA_GITIGNORE_STOCK untouched
```

## Git History
```
feba50ae [requirements-contract] Cover A034 — requirements are not gitignored
9ce471f0 [requirements-contract] Sync dogfood ana.md agent files with updated templates
9b3ab2f4 [requirements-contract] Teach Think to pick up requirements (both platforms)
f6493549 [requirements-contract] Preserve .ana/requirements/ across re-init
31df0971 [requirements-contract] Wire requirements into work status, start --req, and complete
133dabb1 [requirements-contract] Add req frontmatter primitive, validator, and command group
```

## Open Issues

- **Dogfood template sync is a manual coupling.** Changing the Think template requires updating both `packages/cli/templates/.{claude,codex}/agents/ana.md` and the repo-root dogfood copies `.{claude,codex}/agents/ana.md`, enforced by `tests/templates/*`. This build synced them, but the coupling is easy to forget on the next template change. (build_data: observation / monitor)
- **`claimRequirement` signature diverged from the spec's literal signature** (added `slug`). Behavior matches AC7; recorded for traceability. (build_data: observation / acknowledge)
- **`validateReqContent` core added beyond the spec's `(filePath)` signature** to let `req list` validate off-branch content without a second parser. Additive, single-implementation. (build_data: observation / acknowledge)
- **`commitSaves` gained `extraPaths`.** A shared helper now has an additional responsibility (committing a claimed requirement alongside `.saves.json`). Backward compatible, but it widens a hot-file helper's surface. (build_data: debt / monitor)
- **`req list` on a commitless repo returns empty silently.** When `getCurrentBranch()` is null the list falls to `git ls-tree origin/<branch>` which fails → `[]`. A real project always has commits, so this is benign, but the empty result is not explained. (build_data: observation / monitor)

Second pass — what I noticed but hadn't written down: the archive step emits a separate commit + push (`[slug] Archive claimed requirement(s)`) after the completion commit; this is intentional (best-effort, must not be entangled with the completion commit) and is covered by the archive tests, so it is not a concern. The `created` field relies on the `yaml` package's core schema parsing unquoted ISO dates as strings (not Date objects); `validateReqFormat` handles both a string and a `Date` defensively, so a schema change would not break it. No other concerns surfaced.
