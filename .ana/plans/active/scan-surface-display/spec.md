# Spec: Scan Surface Display

**Created by:** AnaPlan
**Date:** 2026-05-21
**Scope:** .ana/plans/active/scan-surface-display/scope.md

## Approach

Two changes to the scan's terminal output and data quality.

**Surfaces section.** Replace the inline Surfaces sub-item nested under Workspace (scan.ts lines 206-217) with a standalone section between Stack and Intelligence. The new section follows the same header + divider + data lines pattern used by Stack and Intelligence. Each surface gets its own line showing framework (or language fallback) and primary testing framework. The section is gated on `result.surfaces.length > 0` — it renders for monorepos with detected surfaces and is omitted for single-repo projects. The Workspace block loses its Surfaces sub-item but keeps monorepo tool, package count, and primary package.

The new section must be OUTSIDE the `if (result.monorepo.isMonorepo)` block. Surfaces are already empty for single repos by detector design, so `result.surfaces.length > 0` is the only guard needed.

**Branch pattern detection.** Replace the data source in `detectBranchPatterns` (git.ts lines 183-211) from `git branch -r` to `git log --merges --format=%s -50 {defaultBranch}`. Extract branch names from merge commit subjects using two regex patterns: GitHub PR format and git CLI merge format. Count prefix frequency from extracted names. Fall back to the current `git branch -r` approach when no merge history produces parseable branch names. Add `defaultBranch` as a second parameter to `detectBranchPatterns`, mirroring how `detectMergeStrategy` already receives it. Update the call site at line 431 to pass `defaultBranch`.

## Output Mockups

### Surfaces section (monorepo with 2 surfaces)

```
  Surfaces
  ────────
  cli              TypeScript · Vitest
  website          Next.js · Vitest
```

### Surfaces section (3 surfaces, one with no testing)

```
  Surfaces
  ────────
  api              NestJS · Jest
  web              Next.js · Vitest
  shared           TypeScript
```

### Surfaces section (5+ surfaces, overflow)

```
  Surfaces
  ────────
  api              NestJS · Jest
  web              Next.js · Vitest
  admin            Next.js · Vitest
  worker           TypeScript · Vitest
                   (+2 more)
```

### Surfaces section (1 surface)

```
  Surfaces
  ────────
  cli              TypeScript · Vitest
```

### Single-repo (no surfaces section rendered at all)

No change from current output.

### Full context — where Surfaces appears

```
  Stack
  ─────
  Language     TypeScript
  Testing      Vitest
  Workspace    Turborepo (pnpm) · primary: packages/cli

  Surfaces
  ────────
  cli              TypeScript · Vitest
  website          Next.js · Vitest

  Intelligence
  ────────────
  Activity     2 contributors · 3→5→2→4 weekly
```

Note: The Workspace line no longer has a Surfaces sub-item beneath it.

## File Changes

### `packages/cli/src/commands/scan.ts` (modify)

**What changes:** Remove the Surfaces sub-item from inside the Workspace block (lines 206-217). Add a new Surfaces section after the monorepo `if` block closes (after line 218) and before the `!hasStack` fallback block (line 220). The new section follows the Intelligence section pattern: conditional rendering, header + divider, data lines with dynamic padding, overflow indicator.

**Pattern to follow:** The Intelligence section at lines 291-296 — conditional block with header, divider, and data lines using `chalk.gray(label.padEnd(12))`. The Surfaces section differs only in that name padding is dynamic (computed from max name length in displayed set) rather than fixed at 12.

**Why:** The current inline format (`cli · website (Next.js)`) discards per-surface language and testing information that scan.json already knows. The standalone section shows identity + testing per surface.

### `packages/cli/src/engine/detectors/git.ts` (modify)

**What changes:** Replace `detectBranchPatterns` function body. Add `defaultBranch: string | null` as second parameter. Primary path: run `git log --merges --format=%s -50 {defaultBranch}`, parse subjects with two regex patterns to extract branch names, filter bot branches via `isBotBranch`, extract prefixes, count frequency. Fallback path: when `defaultBranch` is null or no parseable branch names found, use the existing `git branch -r` logic. Update the call site at line 431 to pass `defaultBranch`.

**Pattern to follow:** `detectMergeStrategy` at lines 246-268 — same file, same pattern of reading merge commits on defaultBranch with a fallback. Also `detectCommitFormat` at lines 161-178 for the "parse N recent commits and count matches" pattern.

**Why:** Current `git branch -r` reads ephemeral state (which branches exist right now). Merge history reads durable state (which branches were actually merged). On the Anatomia repo, this fixes `primary` from incorrect `fix/` to correct `feature/`.

## Acceptance Criteria

- [ ] AC1: For monorepos with detected surfaces, the scan terminal output renders a "Surfaces" section between Stack and Intelligence, with a header and divider matching the existing section style.
- [ ] AC2: Each surface displays on its own line with: name (left-aligned, padded), framework or language (framework preferred when present, language as fallback), and primary testing framework (first entry from the surface's testing array, omitted when empty).
- [ ] AC3: The section displays up to 4 surfaces. When more exist, a `(+N more)` overflow indicator renders below the last surface, matching the existing overflow style.
- [ ] AC4: Single-repo projects (empty surfaces array) render no Surfaces section. No empty state, no placeholder.
- [ ] AC5: The Surfaces sub-item line is removed from the Workspace block in the Stack section. Workspace continues to show monorepo tool, package count, and primary package.
- [ ] AC6: The `--json`, `--save`, `--quiet` code paths are unchanged. Only the `formatHumanReadable` rendering path is modified.
- [ ] AC7: Init's `displaySuccessMessage` surface display (state.ts:987-1007) is unchanged and continues to show per-surface test commands independently.
- [ ] AC8: `detectBranchPatterns` reads merge commit messages on the default branch to determine prefix frequency and primary prefix.
- [ ] AC9: The return type of `detectBranchPatterns` is unchanged: `{ prefixes: Record<string, number>; primary: string | null }`.
- [ ] AC10: When merge-based detection produces no parseable branch names — shallow clones, repos with no merges, repos where all merge subjects are unparseable custom messages — `detectBranchPatterns` falls back to the current behavior of reading remote branches.
- [ ] AC11: Bot branch prefixes (dependabot/, renovate/, etc.) are excluded from merge-based detection, consistent with the existing `isBotBranch` filter.
- [ ] AC12: On the Anatomia repo, the fix produces `primary: 'feature/'` (matching the 96% merge history) instead of the current incorrect `primary: 'fix/'`.
- [ ] AC13: Tests pass with `(cd packages/cli && pnpm vitest run)`.
- [ ] AC14: No build errors with `pnpm run build`.

## Testing Strategy

- **Unit tests (git-workflow.test.ts):** Add tests for the merge-based `detectBranchPatterns` path. Create temp repos with merge commits (use `git merge --no-ff` to create merge commits with parseable subjects). Test: (1) GitHub-style merge subjects produce correct prefix counts and primary. (2) `Merge branch 'prefix/name'` format is parsed correctly. (3) Bot branches in merge subjects are excluded. (4) Repos with no merge commits fall back to remote branch detection (existing test covers this — verify it still passes). (5) Mixed parseable and unparseable subjects — only parseable ones count.
- **Unit tests (scan display):** `formatHumanReadable` is not exported, so test via `detectGitInfo` output assertions and scan command subprocess tests. For the Surfaces section: the existing scan.test.ts tests scanProject results and CLI subprocess output. Add assertions that verify surface section content appears in the terminal output for monorepo scans.
- **Edge cases:** (1) Surface with null framework AND null language — name only, no detail. (2) Surface with no testing array entries — framework/language only. (3) Exactly 4 surfaces — no overflow. (4) 5 surfaces — overflow shows `(+1 more)`. (5) 1 surface — section still renders. (6) `defaultBranch` is null — skip merge path, use fallback.

## Dependencies

None. Both changes modify existing code with no new dependencies.

## Constraints

- `formatHumanReadable` is not exported and not directly unit-testable. Test via subprocess or by asserting on the data that feeds it.
- Engine files (`src/engine/`) must have zero CLI dependencies — no chalk, no commander. The branch detection changes stay within this boundary.
- The return type of `detectBranchPatterns` must not change — same `{ prefixes, primary }` shape.
- Content width limit: 69 chars inside the box. Surface lines (2 indent + max-name-pad + framework + separator + testing) must fit. Even worst case: 2 + 16 + 7 + 3 + 6 = 34 chars — well within limit.

## Gotchas

- **Surfaces block nesting.** The current Surfaces lines (206-217) are INSIDE the `if (result.monorepo.isMonorepo)` block that closes at line 218. The new section must be OUTSIDE this block. If you add it inside, it renders between Workspace and the `!hasStack` fallback, which is wrong. Place it after the monorepo block closes but before the `!hasStack` check.
- **GitHub merge subject org prefix.** `Merge pull request #N from anatomia-dev/feature/slug` — the branch name is everything after `from org/`. The org name (`anatomia-dev`) is NOT part of the branch. The regex must capture only what comes after `from [^/]+/` to get `feature/slug`.
- **Name padding is dynamic, not fixed.** Stack and Intelligence use `padEnd(12)`. Surfaces must compute padding from the longest name in the displayed set (up to the 4-surface cap) plus a gap. Using a fixed pad will misalign when names are short (`api`, `web`) or long (`nestjs-backend`).
- **`detectBranchPatterns` signature change.** Adding `defaultBranch` parameter means the call site at line 431 must be updated. Currently `detectBranchPatterns(cwd)`, becomes `detectBranchPatterns(cwd, defaultBranch)`. The `defaultBranch` variable is already in scope at line 418.
- **Merge commit format edge case.** Some merge subjects end with `into main` or `into 'main'`. The regex for `Merge branch 'name'` must not accidentally capture `into main` as part of the branch name. Use a non-greedy match or anchor to the closing quote.

## Build Brief

### Rules That Apply
- All local imports use `.js` extensions: `import { foo } from './bar.js'`.
- Engine files (`src/engine/`) have zero CLI dependencies — no chalk in git.ts.
- Prefer early returns over nested conditionals.
- Use `| null` for checked-and-empty fields, `?:` for unchecked.
- Explicit return types on exported functions. Internal helpers can use inference.
- Use `--run` flag with vitest to avoid watch mode.

### Pattern Extracts

**Intelligence section header pattern (scan.ts lines 291-295):**
```typescript
  if (intelLines.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Intelligence'));
    lines.push(chalk.gray('  ' + BOX.horizontal.repeat(12)));
    lines.push(...intelLines);
  }
```

**Stack data line pattern (scan.ts line 174):**
```typescript
    lines.push(`  ${chalk.gray(label.padEnd(12))} ${value}`);
```

**Overflow pattern (scan.ts lines 213-215):**
```typescript
      const overflow = result.surfaces.length > MAX_SURFACES
        ? ` ${chalk.dim(`(+${result.surfaces.length - MAX_SURFACES} more)`)}`
        : '';
```

**detectMergeStrategy — merge log pattern (git.ts lines 246-248):**
```typescript
function detectMergeStrategy(cwd: string, defaultBranch: string | null): GitInfo['mergeStrategy'] {
  if (!defaultBranch) return null;
  const output = gitExec(`git log --merges --oneline -20 ${defaultBranch}`, cwd);
```

**detectCommitFormat — parse-and-count pattern (git.ts lines 161-178):**
```typescript
function detectCommitFormat(cwd: string): GitInfo['commitFormat'] {
  const output = gitExec('git log --format=%s -50', cwd);
  if (!output) return null;

  const messages = output.split('\n').filter(Boolean);
  if (messages.length === 0) return null;

  const conventionalPattern = /^(feat|fix|chore|docs|refactor|test|ci|style|perf|build)(\(.+\))?(!)?:/;
  const matchCount = messages.filter(m => conventionalPattern.test(m)).length;
  const confidence = matchCount / messages.length;

  return {
    conventional: confidence > 0.5,
    confidence: Math.round(confidence * 100) / 100,
    sampleSize: messages.length,
  };
}
```

**isBotBranch filter (git.ts lines 109-113):**
```typescript
function isBotBranch(name: string): boolean {
  for (const prefix of BOT_BRANCH_PREFIXES) {
    if (name.startsWith(prefix)) return true;
  }
  return false;
}
```

### Proof Context

- `scan.ts`: `formatHumanReadable` not exported — surfaces display tested structurally, not via rendered output. (From: Scan Surface Detection)
- `git.ts`: `detectBranches` and `detectBranchPatterns` both run `git branch -r` independently — two subprocess calls for the same data. (From: Fix scan branch detection) — This change partially addresses this: `detectBranchPatterns` primary path no longer uses `git branch -r`. The fallback path still does, but that's the minority case.
- `git.ts`: Multi-remote repos — `origin/` prefix stripping ignores non-origin remotes. (From: Fix scan branch detection) — Not addressed by this change; out of scope.

### Checkpoint Commands

- After scan.ts changes: `(cd packages/cli && pnpm vitest run tests/commands/scan.test.ts)` — Expected: existing tests pass
- After git.ts changes: `(cd packages/cli && pnpm vitest run tests/engine/detectors/git-workflow.test.ts tests/engine/detectors/git-detection.test.ts)` — Expected: existing + new tests pass
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2720+ tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2720 passed, 2 skipped (2722 total)
- Current test files: 120
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2735+ tests in 120 files (new tests in git-workflow.test.ts, possibly scan.test.ts)
- Regression focus: `tests/engine/detectors/git-workflow.test.ts` (branchPatterns tests), `tests/engine/detectors/git-detection.test.ts` (integration tests on Anatomia repo), `tests/commands/scan.test.ts` (scan output assertions)
