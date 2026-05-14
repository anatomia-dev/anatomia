# Scope: Commit hygiene checks at build-report save

**Created by:** Ana
**Date:** 2026-05-13

## Intent

Build agents make normal `git commit` calls during the build phase — code changes, test additions, dependency updates. These commits go through whatever hooks the project has (or doesn't have). But `ana artifact save build-report` commits with `--no-verify`, bypassing all hooks. Between these two commit types, there's no mechanical check that inspects the full branch diff for pipeline-specific footguns.

This became a real problem: a worktree's `pnpm install` regenerated lockfile specifiers, Build committed the lockfile alongside a fix, and the mismatch broke Vercel deploys for hours. The project had a pre-commit hook that should have caught it, but the check validated disk state (both files in sync on disk) rather than staged-vs-committed state. The hook gap was patched for our repo, but the underlying problem is general: Build agents can commit things that break deployment, and nothing in the pipeline validates the branch diff before handoff to Verify.

The fix: at `ana artifact save build-report` time — the moment when Build's code is complete and committed — inspect the full branch diff for high-confidence, universal footguns. Surface findings as warnings during the save, and write them to `.saves.json` so Verify can see what was flagged.

This runs for every user, every pipeline run. The checks must be conservative (near-zero false positives), fast (single git diff + pattern matching), and universal (not tied to any stack, package manager, or CI provider).

## Complexity Assessment
- **Kind:** feature
- **Size:** medium — 1 new function in artifact.ts, 1 new section in .saves.json, updates to proofSummary.ts to surface findings, optional Verify awareness
- **Files affected:**
  - `packages/cli/src/commands/artifact.ts` — new `runCommitHygieneChecks()` called at build-report save, writes findings to .saves.json
  - `packages/cli/src/utils/proofSummary.ts` — `generateProofSummary()` reads hygiene findings from .saves.json, includes in proof summary
  - `packages/cli/src/types/proof.ts` — optional `commit_hygiene` field on ProofChainEntry if findings persist to proof chain
  - `packages/cli/tests/` — new test file or test group for hygiene checks
- **Blast radius:** The check runs inside `saveArtifact` but only for `build-report` types (gated by `typeInfo.baseType === 'build-report'`, same pattern as `captureModulesTouched`). Scope, plan, contract, and verify-report saves are unaffected. The check inspects the branch diff (already computed by `captureModulesTouched`) — no additional git operations needed beyond pattern matching on the file list. Warnings print to terminal; findings write to `.saves.json`. Neither blocks the save.
- **Estimated effort:** 3-4 hours plan+build+verify
- **Multi-phase:** no

## Approach

Add a `runCommitHygieneChecks()` function that runs at `ana artifact save build-report` time, immediately after `captureModulesTouched()`. It reuses the same branch diff (modules_touched list) to avoid redundant git operations, then runs pattern-based checks against the file list and optionally reads file content for deeper inspection.

Findings are:
1. **Printed as warnings** during the save — Build sees them immediately and can address before handing off to Verify
2. **Written to `.saves.json`** under a `commit_hygiene` key — Verify can read them, and they persist to the proof chain through `generateProofSummary()`

Findings are warnings, not blocks. The save always completes. Build can choose to fix the issue and re-save, or proceed and let Verify evaluate. This matches the pipeline philosophy: Build produces, Verify evaluates, the developer decides.

### Checks (high-confidence, universal)

**1. Dependency lockfile desync.** If a lockfile is in the branch diff AND a dependency manifest is also in the diff, verify they were committed together. If the lockfile is in the diff but its manifest is NOT, flag it — the lockfile was changed without the corresponding package.json/Gemfile/etc., which means specifiers may have drifted.

Coverage:
- `pnpm-lock.yaml` ↔ `package.json` (any workspace)
- `package-lock.json` ↔ `package.json`
- `yarn.lock` ↔ `package.json`
- `Gemfile.lock` ↔ `Gemfile`
- `poetry.lock` ↔ `pyproject.toml`
- `go.sum` ↔ `go.mod`
- `Cargo.lock` ↔ `Cargo.toml`

False positive risk: Low. A lockfile changing without its manifest is almost always unintentional. The one edge case — `pnpm install` updating a transitive dependency without changing package.json — is legitimate but rare, and the warning is non-blocking.

**2. Secrets in committed files.** Scan the branch diff files for patterns from the existing `SECRET_PATTERNS` array in `src/engine/findings/rules/secrets.ts`. The scan engine already has battle-tested patterns for Stripe, OpenAI, Anthropic, AWS, GitHub, database URLs, SendGrid, Twilio, etc. Reuse them directly — don't reinvent.

This is different from the scan-time check: the scan runs at `ana scan` on the full codebase. This check runs at build-report save on only the files Build changed. It catches secrets that Build introduced during this pipeline run.

False positive risk: Low — the existing patterns are hardened against false positives with post-match validation and placeholder filtering. The test/fixture exclusion list from the scan applies here too.

**3. Merge conflict markers.** Scan diff files for `<<<<<<<`, `=======`, `>>>>>>>` patterns. These should never survive to a committed file.

False positive risk: Near zero. The only legitimate case is documentation about merge conflicts, which is rare enough to accept the false positive.

**4. Environment files in diff.** If `.env`, `.env.local`, `.env.production`, or similar files appear in the branch diff, flag them. These should almost never be committed. `.env.example` and `.env.test` are excluded (legitimate to commit).

False positive risk: Low. The exclusion list handles the common legitimate cases.

### Checks NOT included (too many false positives or too opinionated)

- **Files outside spec's file_changes** — Build legitimately changes files not listed in the spec (imports, shared types, test fixtures). Too many exceptions.
- **Large binary files** — many projects intentionally commit binaries (WASM, fonts, images). No universal threshold.
- **Debug artifacts (console.log, debugger)** — that's the project's linter's job, not the pipeline's.
- **TODO/FIXME comments** — Build adds these intentionally for known limitations.

## Acceptance Criteria
- AC1: `runCommitHygieneChecks()` runs at `ana artifact save build-report` time, after `captureModulesTouched()`, gated by `typeInfo.baseType === 'build-report'`
- AC2: The check reuses the `modules_touched` list from `.saves.json` — no additional `git diff` call
- AC3: Lockfile desync detection: flags when a lockfile is in the diff but its dependency manifest is not
- AC4: Secret detection: scans diff files using the existing `SECRET_PATTERNS` array from `src/engine/findings/rules/secrets.ts`
- AC5: Merge conflict marker detection: scans diff files for `<<<<<<<`, `=======`, `>>>>>>>` patterns
- AC6: Environment file detection: flags `.env`, `.env.local`, `.env.production` etc. in the diff, excluding `.env.example` and `.env.test`
- AC7: Findings are printed as warnings during the save (yellow chalk, non-blocking)
- AC8: Findings are written to `.saves.json` under a `commit_hygiene` key with structured data (type, file, severity, message)
- AC9: `generateProofSummary()` reads `commit_hygiene` from `.saves.json` and includes findings in the proof summary
- AC10: The save always completes regardless of findings — warnings never block
- AC11: Scope, plan, contract, and verify-report saves do not trigger hygiene checks
- AC12: Existing tests pass, new tests cover each check type with positive and negative cases

## Edge Cases & Risks

**No modules_touched available.** If `captureModulesTouched` failed (new repo, no remote), `modules_touched` is empty or missing. The hygiene check skips gracefully — nothing to inspect.

**Lockfile without manifest in monorepo.** A workspace `packages/api/package.json` changes but the root `pnpm-lock.yaml` also changes. The check should recognize that ANY `package.json` change satisfies the lockfile's manifest requirement, not just the root one.

**Secret patterns evolve.** The check imports `SECRET_PATTERNS` from the scan engine. If the patterns change, the hygiene check automatically picks up the updates. No separate maintenance.

**Large branch diffs.** A build that touches 200 files means 200 file reads for secret scanning. At ~1ms per file read, that's 200ms — acceptable. The lockfile and env checks are purely list-based (no file reads), so they're instant.

**Secrets in test files.** The scan engine's `SECRET_GLOB_IGNORE` excludes test files. The hygiene check should apply the same exclusions — test API keys in test files are expected.

**False positive on lockfile during dependency update.** If the spec says "add package X" and Build runs `pnpm add X`, both package.json and lockfile change — the check passes (both in diff). If Build runs `pnpm install` to fix something and only the lockfile changes, the check flags it — correct, because the lockfile drift is unintentional.

**verify-report save timing.** The hygiene check writes to `.saves.json` at build-report save time. Verify reads `.saves.json` after it runs. The data is available to Verify without any timing issues.

## Rejected Approaches

**Block the save on findings.** Secrets in committed code are bad, but blocking the save forces Build into a fix-and-retry loop that may exceed the agent's context. Warnings let Build address what it can and hand off to Verify for the rest. The pipeline's strength is independent evaluation, not pre-flight gates.

**Run checks at verify-report save time.** Too late — Verify has already completed its evaluation. The findings need to be visible to both Build (for immediate fixes) and Verify (for independent assessment). Build-report save time is the right checkpoint.

**Add instructions to Build's agent prompt.** Prompt instructions are probabilistic — Build might follow them, might not. Mechanical checks are deterministic. And prompt additions add cognitive load to every Build run. The check is invisible unless it finds something.

**Git hook instead of CLI check.** Hooks are the user's domain. Some users have hooks, some don't. Some use husky, some use lefthook, some use nothing. The CLI check runs regardless of the user's hook setup — it's pipeline infrastructure, not project infrastructure.

**Scan the full worktree, not just the diff.** The scan engine already does a full codebase scan at `ana scan` time. Re-scanning at build-report time would be slow and redundant. The hygiene check only inspects what Build changed — that's the blast radius we care about.

## Open Questions

None. The design decisions are clear:
1. Warn, don't block → yes
2. Reuse modules_touched → yes (no extra git call)
3. Reuse SECRET_PATTERNS → yes (existing battle-tested patterns)
4. Write to .saves.json → yes (available to Verify and proof chain)
5. Four check types → lockfile, secrets, conflict markers, env files

## Exploration Findings

### Patterns Discovered
- `captureModulesTouched()` (artifact.ts:150-181) runs at build-report save time, computes `git diff {merge-base} --name-only`, writes the file list to `.saves.json` as `modules_touched`. The hygiene check reads this list — zero additional git operations.
- `SECRET_PATTERNS` (engine/findings/rules/secrets.ts:40-79) is an exported array of regex patterns with types, severities, and post-match validators. Can be imported directly into the hygiene check.
- `SECRET_GLOB_IGNORE` (secrets.ts:81-104) excludes test files, node_modules, lock files, etc. The hygiene check should apply the same exclusions when reading file content.
- `.saves.json` already stores structured data (`modules_touched`, `pre-check`, artifact entries). Adding a `commit_hygiene` key follows the established pattern.
- `generateProofSummary()` (proofSummary.ts:1632) reads `.saves.json` and extracts timing, hashes, and pre-check data. Adding hygiene findings follows the same extraction pattern.

### Constraints Discovered
- [TYPE-VERIFIED] `SavesData` (proofSummary.ts:121-128) has an index signature `[key: string]: SaveEntry | PreCheckData | undefined`. A new `commit_hygiene` value needs its own type added to this union.
- [OBSERVED] `captureModulesTouched` writes the file list to `.saves.json` synchronously. The hygiene check reads from the same file immediately after — no race condition.
- [OBSERVED] The `modules_touched` list excludes `.ana/` files (`:(exclude).ana` in the git diff). The hygiene check inherits this exclusion — pipeline artifacts are not inspected.
- [OBSERVED] Secret scanning reads file content. In a worktree, `projectRoot` points to the worktree, so `path.join(projectRoot, file)` reads the worktree's files. Correct.

### Test Infrastructure
- The secret detection patterns have no dedicated tests in the CLI (they're exercised via scan integration tests). Hygiene check tests should construct mock modules_touched lists and mock file content, then assert findings.
- `captureModulesTouched` is tested indirectly via `saveArtifact` integration tests. The hygiene check can follow the same pattern.

## For AnaPlan

### Structural Analog
`captureModulesTouched()` in artifact.ts:150-181 — identical shape. Runs at build-report save time, reads `.saves.json`, writes structured data back to `.saves.json`. The hygiene check is a second pass at the same checkpoint.

Also: `runPreCheckAndStore()` in artifact.ts:90-130 — runs at verify-report save time, writes structured data to `.saves.json` under a `pre-check` key. Same pattern, different checkpoint.

### Relevant Code Paths
- `packages/cli/src/commands/artifact.ts:1290-1294` — the `if (typeInfo.baseType === 'build-report')` block where `captureModulesTouched` is called. The hygiene check goes here, immediately after.
- `packages/cli/src/commands/artifact.ts:150-181` — `captureModulesTouched()`, the structural analog.
- `packages/cli/src/engine/findings/rules/secrets.ts:40-79` — `SECRET_PATTERNS` export, reused for secret scanning.
- `packages/cli/src/engine/findings/rules/secrets.ts:81-104` — `SECRET_GLOB_IGNORE`, reused for file exclusions.
- `packages/cli/src/utils/proofSummary.ts:1663-1687` — `.saves.json` reading in `generateProofSummary()`, where hygiene findings are extracted.
- `packages/cli/src/types/proof.ts:47-98` — `ProofChainEntry`, where `commit_hygiene` field would be added if findings persist to the proof chain.

### Patterns to Follow
- `captureModulesTouched()` read-modify-write pattern on `.saves.json`
- `runPreCheckAndStore()` structured data writing to `.saves.json`
- `SECRET_PATTERNS` import and iteration pattern from `checkHardcodedSecrets()`
- Non-blocking warning pattern: `console.log(chalk.yellow('⚠ ...'))` used throughout artifact.ts

### Known Gotchas
- The `modules_touched` list contains relative paths from the project root. When reading file content for secret scanning, these must be joined with `projectRoot` (which is the worktree root during build).
- `SECRET_PATTERNS` use global regexes. The `lastIndex` must be reset between files (the scan engine already does this — `pattern.regex.lastIndex = 0`). The hygiene check must do the same.
- The `SavesData` index signature in proofSummary.ts allows `SaveEntry | PreCheckData | undefined`. Adding `commit_hygiene` data requires either extending the union or using a type assertion. The `pre-check` key established the precedent for non-SaveEntry data in saves.json.
- The lockfile desync check needs to handle monorepo layouts: a single `pnpm-lock.yaml` at the root corresponds to `package.json` files at multiple paths. Any `**/package.json` in the diff satisfies the manifest requirement.

### Things to Investigate
- Should hygiene findings appear in the proof chain as a new field (`commit_hygiene`) or as regular findings with a special category? Regular findings would automatically enter the proof chain, be visible in `ana proof show`, and be tended by Learn. A separate field is cleaner but requires new plumbing. Plan should decide based on whether these findings should be tracked across pipeline runs (like proof findings) or are one-shot warnings.
- Should the secret scan read ALL diff files or only source files (ts, js, py, etc.)? Config files (yaml, json, toml) are excluded by the scan engine's SECRET_GLOB_IGNORE but could contain secrets. The hygiene check operates on a smaller file set (just the diff), so scanning all file types may be justified. Plan should evaluate the false positive risk.
