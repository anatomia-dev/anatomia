# Spec: CLI Display Quality

**Created by:** AnaPlan
**Date:** 2026-05-23
**Scope:** .ana/plans/active/cli-polish/scope.md

## Approach

Three display diseases share one root cause: hardcoded `padEnd` widths that break when data outgrows assumptions. The fix is a small column-width helper used by all three table locations, plus targeted fixes for box trailing space, `-help` interception, the `learn` description, and empty surface display.

**Column width helper.** Extract a function `columnWidth(items, accessor, minWidth, maxWidth)` that scans entries, finds the longest visible value via `accessor`, adds a 2-char gap, and clamps to `[minWidth, maxWidth]`. Default `maxWidth` is 40. Values exceeding `maxWidth` are truncated with `…` at display time. Place it near the top of `proof.ts` alongside other formatting helpers like `truncateSummary`. This is NOT a shared utility — it lives in proof.ts because all three consumers are in proof.ts.

**Box trailing space.** Lines 214 and 400 in proof.ts use `padEnd(innerWidth)` for lines that include right-aligned text (timestamps, dates). When the left content + right text fills the line, the right `│` touches the last character. Fix: ensure at least 2 chars of padding before the right-aligned text reaches the border. Truncate the left content (feature name, run label) if needed, matching the scan.ts approach at line 162 where content is sliced with `…`.

**`-help` interception.** Commander parses `-help` as `-h -e -l -p`. The error handler fires for unknown options `-e`, `-l`, `-p`. Use `program.configureOutput({ outputError })` to intercept error output. When the error message contains `-help`, call `program.outputHelp()` then `process.exit(0)` to preempt Commander's `_exit(1)`. Place the `configureOutput` call after `.version()` and before command registration in `index.ts`. The interception needs to handle subcommand `-help` too — for `ana proof -help`, Commander routes the error to the `proof` subcommand's error handler. To handle this globally, the `configureOutput` must be set on the root program, and Commander propagates it to subcommands.

**`learn` description.** Change from `'Learn session management'` to `'Manage learn sessions'` in `learn.ts` line 28. This is the source file — the description must change here, not just in `index.ts`, because docs extraction reads from the source.

**Empty surface indicator.** In `formatListTable`, when `entry.surface` is falsy, display `chalk.dim('--')` padded to the surface column width instead of blank space. Prevents the Date column from visually shifting left.

## Output Mockups

### Proof list table (dynamic widths)
```
  Proof History

  Slug                       Result   Assertions  Surface   Date
  cli-polish                 PASS     5/5         cli       May 23
  surface-awareness-bridge   PASS     12/12       cli       May 21
  short                      FAIL     2/5         --        May 20
```

Columns are dynamically sized from data. The `--` appears dim for entries with no surface.

### Audit matrix recent proofs (dynamic widths)
```
  Recent proofs:
    cli-polish                 PASS  0 findings  3h ago
    surface-awareness-bridge   PASS  2 findings  2d ago
```

### Health hot spots (dynamic widths)
```
  proof.ts              12 findings (3 risk, 5 debt, 4 obs)   8 runs
  work.ts               5 findings (1 risk, 4 debt)           6 runs
```

### Box with trailing space
```
┌─────────────────────────────────────────────────────────────────────┐
│  ana proof                                                         │
│  Feature: CLI Polish                                    May 23, …  │
└─────────────────────────────────────────────────────────────────────┘
```

The feature text truncates with `…` if it would leave less than 2 chars before the timestamp.

### -help interception
```
$ ana -help
Usage: ana [options] [command]

Verified AI development. Ship with proof.
...

$ ana proof -help
Usage: ana proof [options] [slug]
...
```

## File Changes

### `packages/cli/src/commands/proof.ts` (modify)
**What changes:** Add `columnWidth` helper function. Replace hardcoded `padEnd(24)` in `formatListTable` (line 571), `Math.max(0, 20 - slug.length)` in audit matrix recent proofs (line 1776), and `padEnd(24)` / `padEnd(35)` in health hot spots (lines 488-490) with dynamic widths computed from data. Fix box trailing space at lines 214 and 400. Add `chalk.dim('--')` for empty surfaces in `formatListTable`.
**Pattern to follow:** The existing `truncateSummary` helper in proof.ts for the truncation convention. The scan.ts box at line 162 for the trailing-space truncation pattern.
**Why:** Slugs exceeding 24 chars crash into adjacent columns. Box text touching the right border looks unfinished.

### `packages/cli/src/index.ts` (modify)
**What changes:** Add `program.configureOutput({ outputError })` to intercept `-help` as unknown option and show help instead of an error.
**Pattern to follow:** Commander's `configureOutput` API.
**Why:** `ana -help` currently shows an error instead of help. Common user expectation.

### `packages/cli/src/commands/learn.ts` (modify)
**What changes:** Change `.description('Learn session management')` to `.description('Manage learn sessions')`.
**Pattern to follow:** All other commands use imperative verb descriptions ("View proof chain...", "Check project health...").
**Why:** Description consistency across `--help` output.

### `packages/cli/tests/commands/proof.test.ts` (modify)
**What changes:** Add tests for dynamic column alignment (long slugs don't touch adjacent columns, 2-char minimum gap), empty surface `--` indicator, and box trailing space.
**Pattern to follow:** The existing test structure using `createProofChain`, `runProof`, and string assertions on stdout.
**Why:** Verify table alignment works for edge-case slug lengths.

## Acceptance Criteria

- [ ] AC1: The proof list table has aligned columns for all slug lengths. No slug text touches the Result column. A 2-char minimum gap exists between every column.
- [ ] AC2: The audit matrix recent proofs section has aligned columns for all slug lengths.
- [ ] AC3: The health hot spots display has aligned columns for all file path lengths.
- [ ] AC4: The proof detail view box and health box have a trailing gap before the right `│`.
- [ ] AC5: `ana -help` shows help text instead of an error. `ana proof -help` shows proof help.
- [ ] AC6: `ana -h` and `ana --help` continue to work identically.
- [ ] AC7: The `learn` command description uses imperative verb style.
- [ ] AC10: All existing `--json` output is unchanged.
- [ ] AC11: Tests pass: `pnpm run test -- --run`.
- [ ] AC14: Empty surfaces in the proof list table show `--` (dim) instead of blank space.

## Testing Strategy

- **Unit tests:** Add tests to `proof.test.ts` following the existing pattern — create a proof chain with entries that have long slugs (e.g., 30+ chars), run `ana proof` with `FORCE_COLOR=0`, and assert column alignment. Test that a 2+ space gap exists between slug text and the next column. Test the `--` empty surface indicator appears when surface is null.
- **Integration tests:** Run `ana -help` and `ana proof -help` via execSync and verify they exit 0 with help text. Run `ana --help` and verify it still works.
- **Edge cases:** Slug exactly at max width (40 chars) — verify truncation with `…`. All entries with same-length slugs — verify minimum column width. Single entry — verify table still renders correctly.

## Dependencies

None. All changes are to existing files.

## Constraints

- `--json` output paths must not be affected. The JSON paths are completely separate code paths in proof.ts.
- `ana work status` output must NOT change — agents parse it. This scope does not touch work.ts.
- Box width stays at 71 chars (project convention).

## Gotchas

- **ANSI color codes and padEnd.** In `formatListTable`, `padEnd` is applied BEFORE chalk coloring (line 573: `entry.result.padEnd(9)` then `resultColor(resultPadded)`). This is correct — chalk-wrapped strings have invisible escape chars that break `padEnd`. Verify this pattern is maintained after changes.
- **configureOutput propagation.** Commander propagates `configureOutput` to subcommands automatically. Setting it on the root program handles both `ana -help` and `ana proof -help`. No per-subcommand setup needed.
- **Commander's error message format.** The error for unknown options is `error: unknown option '-e'` (from `-help` being parsed as `-h -e -l -p`). Match on the presence of `help` in the context — specifically, check if the raw `process.argv` contains `-help` rather than parsing Commander's error string, which is more robust.
- **The `--` dim indicator and FORCE_COLOR=0.** Tests run with `FORCE_COLOR=0` so chalk output is stripped. Tests should assert `--` appears in the surface column position, not that it has dim styling.
- **Hot spots also have hardcoded widths.** The scope identifies `padEnd(24)` and `padEnd(35)` at lines 488-490. Both need dynamic width — the findings column (`"12 findings (3 risk, 5 debt, 4 obs)"`) varies in length too.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Explicit return types on all exported functions. Internal helpers can use inference.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Early returns over nested conditionals.
- Engine files have zero CLI deps — but proof.ts is a command file, chalk is fine here.
- Always use `--run` with pnpm test to avoid watch mode hang.

### Pattern Extracts

**Existing formatListTable (proof.ts:547-584) — the target:**
```typescript
function formatListTable(entries: ProofChainEntry[]): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold('  Proof History'));
  lines.push('');

  // Header row
  const slugCol = 'Slug'.padEnd(24);
  const resultCol = 'Result'.padEnd(9);
  const assertCol = 'Assertions'.padEnd(13);
  const surfaceCol = 'Surface'.padEnd(12);
  const dateCol = 'Date';
  lines.push(chalk.bold(`  ${slugCol}${resultCol}${assertCol}${surfaceCol}${dateCol}`));

  // ...
  for (const entry of sorted) {
    const slug = entry.slug.padEnd(24);
    const resultColor = entry.result === 'PASS' ? chalk.green : chalk.red;
    const resultPadded = entry.result.padEnd(9);
    const result = resultColor(resultPadded);
    const ratio = `${entry.contract.satisfied}/${entry.contract.total}`;
    const assertions = ratio.padEnd(13);
    const surface = (entry.surface ?? '').padEnd(12);
    const date = entry.completed_at ? formatLocalDate(entry.completed_at) : '';
    lines.push(`  ${slug}${result}${assertions}${surface}${date}`);
  }
```

**Health hot spots (proof.ts:488-490) — the other target:**
```typescript
      const nameCol = displayName.padEnd(24);
      const findingsCol = `${mod.finding_count} findings (${sevParts.join(', ')})`;
      lines.push(`  ${nameCol}${findingsCol.padEnd(35)}${mod.entry_count} runs`);
```

**Scan.ts box truncation (scan.ts:162-165) — the trailing-space pattern:**
```typescript
    if (finalSummary.length > innerWidth - 3) {
      finalSummary = finalSummary.slice(0, innerWidth - 3) + '…';
    }
    const summaryPadded = `  ${finalSummary}`;
    lines.push(chalk.cyan(BOX.vertical) + summaryPadded.padEnd(innerWidth) + chalk.cyan(BOX.vertical));
```

**Test pattern (proof.test.ts:32-49) — how tests run CLI commands:**
```typescript
  function runProof(args: string[] = []): { stdout: string; stderr: string; exitCode: number } {
    const cliPath = path.join(__dirname, '../../dist/index.js');
    try {
      const stdout = execSync(`node ${cliPath} proof ${args.join(' ')}`, {
        encoding: 'utf-8',
        cwd: process.cwd(),
        env: { ...process.env, FORCE_COLOR: '0' },
      });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string; status?: number };
      return { stdout: execError.stdout || '', stderr: execError.stderr || '', exitCode: execError.status || 1 };
    }
  }
```

### Proof Context

**proof.ts** (12 cycles, last 2026-05-20):
- [blocker] Hot module column widths hardcoded at padEnd(24)/padEnd(35) — this is exactly what we're fixing
- [observation] Hardcoded literal 10 in proof.ts:810 instead of MIN_ENTRIES_FOR_TREND — out of scope, don't touch

**index.ts** (2 cycles, last 2026-05-05):
- [observation] commandsGroup() is Commander v14-specific — not relevant to this change

### Checkpoint Commands
- After proof.ts changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: 2906+ tests pass
- After index.ts changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: same + new tests pass
- After all changes: `pnpm run test -- --run` — Expected: all tests pass across both packages
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2906 passed, 2 skipped (2908 total)
- Current test files: 122
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected 2906 + ~6-8 new tests
- Regression focus: `packages/cli/tests/commands/proof.test.ts` — existing table display tests
