# Proof Chain Dashboard

111 runs · 47 active · 3 promoted · 612 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 9 | 7 |
| packages/cli/tests/commands/work.test.ts | 6 | 5 |
| packages/cli/tests/commands/artifact.test.ts | 3 | 2 |
| packages/cli/tests/commands/proof.test.ts | 2 | 2 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 47 total)

### packages/cli/src/commands/init/commit.ts

- **test:** No integration test for pull conflict abort path — *ana init commit — persist infrastructure to git*

### packages/cli/src/commands/init/state.ts

- **code:** Build/lint scoping silently degrades when cwd is omitted — no warning that scoping was skipped — *Monorepo build command scoping*
- **code:** Empty catch block swallows all errors including unexpected ones (permission denied, disk full) — *Monorepo build command scoping*
- **code:** pkg.path injected into shell command without sanitization — path with spaces or special chars would produce broken subshell — *Monorepo build command scoping*

### packages/cli/src/commands/work.ts

- **code:** checkConcurrencyGuard has dead `force` parameter — never passed true from production call sites — *Pipeline Concurrency Guards*
- **code:** isTimestampRecent duplicates checkConcurrencyGuard logic — both parse .saves.json, extract timestamp, compare against CONCURRENCY_TIMEOUT_MS — *Pipeline Concurrency Guards*
- **code:** Inside-worktree resume path writes verify_started_at without checking concurrency guard first — *Pipeline Concurrency Guards*
- **test:** Backfill migration logic has no dedicated test — mutation from lesson→closed with conditional metadata preservation is untested — *Remove lesson status from proof system*
- **code:** work.ts duplicates resolves counting logic — JSON and console branches have identical loops — *Upstream Finding Resolution*
- **code:** Two different result parsers with different casing: getVerifyResult returns 'unknown' (lowercase), parseResult in proofSummary returns 'UNKNOWN' (uppercase) — works correctly but fragile coupling between two parallel implementations — *work.ts untested branch coverage*
- **test:** Pull-recovery guards (2 of 5) not directly exercised by any test — *Fix --merge stdout pollution in --json mode*

### packages/cli/src/types/proof.ts

- **code:** commit_hygiene type duplicated in three locations (proof.ts, proofSummary.ts, work.ts inline) rather than imported from a shared definition — *Commit hygiene checks at build-report save*

### packages/cli/src/utils/worktree.ts

- **code:** getBuildCommandString re-reads ana.json instead of receiving command from runBuildCommand — duplicate I/O with misleading 'pnpm run build' fallback — *Run build command during worktree creation*

### packages/cli/tests/commands/init/commit.test.ts

- **test:** Push failure test doesn't test push failure — tests push skip (no remote) — *ana init commit — persist infrastructure to git*

### packages/cli/tests/commands/init/monorepoCommandScoping.test.ts

- **test:** No test for 'tsc' build key or 'eslint' lint key variants individually — *Monorepo build command scoping*
- **test:** Repeated tmpDir/cwdDir setup+teardown boilerplate in every test — no shared beforeEach/afterEach — *Monorepo build command scoping*

### packages/cli/tests/commands/work-ci-mocked.test.ts

- **test:** Broad mock intercept matches any git command with 'pull' in args, not specifically 'git pull --rebase' — *Fix CI Matrix and Broken Tests*
- **code:** createMergedProject duplicated between work-ci-mocked.test.ts and work.test.ts — both have independent copies with different mock routing — *Fix CI Matrix and Broken Tests*
- **test:** A004 assertion uses toBeGreaterThan(0) for exit call count instead of toBe(1) — passes even if process.exit is called multiple times — *Fix CI Matrix and Broken Tests*

### packages/cli/tests/commands/work.test.ts

- **test:** No boundary test at exactly 1-hour timeout — tests use 2-hour-old (stale) and new Date() (fresh), missing 59m59s and 60m01s cases — *Pipeline Concurrency Guards*
- **test:** A019/A020 tests create full git repos with bare remotes — heavyweight setup that could be simplified with targeted spawnSync+runGit mocking — *Pipeline Concurrency Guards*
- **test:** Arrow-line count assertion uses toBeGreaterThanOrEqual(2) — passes with any number >= 2, not specific to the 2-line ready-to-merge case — *work.ts saves.json backward compat bug + worktree dedup + formatting*
- **test:** Conditional PID guard makes 8 tests potential no-ops in environments where getClaudePid() returns null — *Capture actual think time from Ana session start*

### website/components/docs/content/DocsStat.tsx

- **code:** Misspelled DocsStat value key silently renders raw key string — no build-time validation — *Fix prebuild source mutation*

### website/components/docs/proof/FindingsList.tsx

- **code:** Badge opacity 0.75 persists when interactive — reduces contrast for clickable element, potential a11y concern — *FindingsList expand/collapse for proof pages*

### website/components/docs/proof/PipelineGantt.tsx

- **code:** Negative phase values display raw in bar label while bar width is clamped — *Fix Gantt Bar Distortion and Document Timing*
- **code:** Zero-duration bars get minimum 2% width that can push cumulative past 100% if many zero-duration phases exist — *Fix Gantt Bar Distortion and Document Timing*

### website/lib/docs-data/docsStatValues.ts

- **code:** 2 of 9 value keys (skillCount, findings) defined but unused in any MDX file — *Fix prebuild source mutation*

### website/scripts/extract-docs-data.ts

- **code:** Median computation duplicated between extract-docs-data.ts main() and lib/docs-data/proofs.ts getMedianTimings() — *Fix prebuild source mutation*

### General

- **code:** URL reachability not verified — stable URL contract is a deployment assumption — *Documentation links in init and setup*

