# Scope: CLI Polish

**Created by:** Ana
**Date:** 2026-05-24

## Intent

The CLI is the product's front door. Every command's output — its tables, error messages, help text, and empty states — is a design surface. A developer runs `ana proof` and sees their slugs smashing into the PASS column. They type `ana -help` and get an error instead of help. They visit the CLI reference page and two commands are missing. These are polish gaps, not bugs — the CLI works correctly, but it doesn't feel finished. "Every character earns its place" means the table columns align, the error messages guide, and the documentation is complete.

The disease: each command built its own table formatting in isolation. There's no shared column-width convention, no gap standard, and no overflow handling. The proof list uses `padEnd(24)`, the audit matrix uses `Math.max(0, 20 - slug.length)`, and the health hot spots use `padEnd(24)` — three different places with the same hardcoded-width bug. When slugs grew past the original assumptions, all three broke at once.

## Complexity Assessment

- **Kind:** chore
- **Size:** medium — 1 code file with table formatting (~50 lines changed), 1 code file for -help handling (~10 lines), 1 script file for docs extraction (~5 lines), description text edits across 2 files
- **Surface:** cross-surface
- **Files affected:**
  - `packages/cli/src/commands/proof.ts` — dynamic column widths in proof list table, audit matrix recent proofs, and health hot spots. Box trailing space for detail and health views.
  - `packages/cli/src/index.ts` — `-help` interception, `learn` description text
  - `website/scripts/extract-docs-data.ts` — add Learn to funcToFile, extend `buildCommandTree` regex for `.command()` pattern
  - `packages/cli/tests/commands/proof.test.ts` or `scan.test.ts` — table alignment tests
- **Blast radius:** Low. All proof table changes are human-display only — agents use `--json` exclusively (verified: all 5 agent templates reference `--json` for proof commands). The `-help` fix only fires on an invalid input. The docs extraction fix regenerates `commands.json` with additive content.
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** yes — Phase 1: CLI code (tables, -help, descriptions). Phase 2: Docs extraction fix + regeneration.

## Approach

Two phases: first fix the CLI display and UX issues (table alignment, -help handling, description consistency), then fix the docs extraction pipeline so all 12 commands appear on the reference page. Phase 1 is code changes in the CLI package. Phase 2 is a script fix in the website package. Both are low-risk — Phase 1 affects human-display only (agents use --json), Phase 2 is additive content.

### Phase 1: CLI Display Quality

**Dynamic column widths for proof tables.** Replace hardcoded `padEnd(24)` / `Math.max(0, 20 - slug.length)` with dynamic width computed from the data set. For each table, scan the entries to find the longest value in each column, add a 2-char gap, and use that as the column width. This is the foundation fix — it solves the proof list, audit matrix recent proofs, and health hot spots with one pattern. Extract a small helper (`columnWidth(entries, accessor, minWidth)` or similar) used by all three locations.

The 2-char gap between columns is the convention. Currently there's zero gap — `padEnd` values butt directly. Every column should have at least 2 spaces separating it from the next.

**Box trailing space.** The proof detail view (line 214) and health view (line 400) use `padEnd(innerWidth)` on content that fills exactly to `innerWidth`. When the right `│` immediately follows text, it looks cramped. Add a minimum 2-char trailing gap before the right border, same as the scan box fix. This means the content area is `innerWidth - 2` for lines with right-aligned timestamps/dates. The scan box fix (already shipped) handled this for scan.ts — apply the same pattern to proof.ts.

**`-help` interception.** Commander's error handler fires on unknown options. Intercept with `configureOutput({ outputError })` or a `.on('command:*')` handler. When the error contains `-help` as the unknown option, show help instead of the error. This is 5-10 lines in `index.ts`. Does not change behavior for any valid input.

**Description consistency.** Two descriptions break the imperative-verb pattern:
- `learn`: "Learn session management" → "Mark session boundaries for finding triage" (CORRECTED from redundant agent review — original proposal "Tend proof chain — close, promote, route findings" described what the Learn AGENT does, not what the `learn` CLI command does. The CLI command only has `end` — it writes a timestamp, not close/promote/route.)
- `agents`: "Agent dashboard — list agents, manage models" → leave as-is (the dash-separated style works because it leads with a noun that IS the thing)

**NOTE:** The description must be changed in `learn.ts` line 28 (where the command is declared), not only in `index.ts`. The docs extraction reads descriptions from the source file, not from the runtime. If only `index.ts` changes, `commands.json` will have the old description.

### Phase 2: Docs Extraction

**Add Learn to funcToFile.** One line: `Learn: 'src/commands/learn.ts'`.

**Fix `buildCommandTree` for `program.command()` pattern.** The third pass at extract-docs-data.ts:315-336 already handles `.command()` chains but fails when the parent variable is `program` (a function parameter not in `varToName`). Fix: when `parentVar === 'program'`, treat the child as a top-level command instead of trying to find a parent in `varToName`. This is a 3-line change in the existing third pass, not a new regex.

**Update ana-learn template.** Change `ana proof audit --matrix` to `ana proof audit --matrix --json` at ana-learn.md line 66. This eliminates the agent safety risk for the recent proofs table change. The `--json` path includes all matrix data.

**Add `config get` and `config set` to README commands table.** Both are user-facing commands missing from the README (verified: `config show` and `config delete` are present, `get` and `set` are not).

**Regenerate commands.json.** Run the extract script, verify Doctor and Learn appear in the output, verify the CLI reference page shows all 12 commands.

**Empty surface indicator.** In the proof list table, use `--` (dim) instead of blank space for entries with no surface. One-line change in the same function being modified. Prevents the Date column from visually shifting left on surface-less rows.

## Acceptance Criteria

- AC1: The proof list table (`ana proof`) has aligned columns for all slug lengths. No slug text touches the Result column. A 2-char minimum gap exists between every column.
- AC2: The audit matrix recent proofs section (`ana proof audit --matrix`) has aligned columns for all slug lengths.
- AC3: The health hot spots display (`ana proof health`) has aligned columns for all file path lengths.
- AC4: The proof detail view box and health box have a trailing gap before the right `│` — timestamp/date text does not touch the border.
- AC5: `ana -help` shows the help text instead of an error. `ana proof -help` shows proof help.
- AC6: `ana -h` and `ana --help` continue to work identically to current behavior.
- AC7: The `learn` command description in `--help` uses imperative verb style matching all other commands.
- AC8: `commands.json` includes both `doctor` and `learn` commands with their subcommands.
- AC9: The CLI reference page at anatomia.dev/docs/reference/cli renders Doctor and Learn.
- AC10: All existing `--json` output is unchanged — no formatting changes affect the JSON paths.
- AC11: Tests pass: `pnpm run test -- --run`.
- AC12: The ana-learn template uses `ana proof audit --matrix --json` (not bare `--matrix`), eliminating agent risk from the recent proofs table change.
- AC13: README commands table includes `config get` and `config set`.
- AC14: Empty surfaces in the proof list table show `--` (dim) instead of blank space.

## Edge Cases & Risks

**Dynamic width upper bound.** If a slug is 60 characters long, a dynamic column would consume most of the terminal width. Set a max column width (e.g., 40 chars) and truncate with `…` above that. No current slug exceeds 35 chars, but the guard prevents future surprises.

**Agent template impact — proof commands.** CORRECTION (from redundant agent review): AnaLearn runs `ana proof audit --matrix` WITHOUT `--json` (ana-learn.md line 66). The `--matrix` output includes a "Recent proofs" section at proof.ts:1772-1779 — which IS one of the three tables this scope changes. Mitigation: update the ana-learn template to use `ana proof audit --matrix --json` (verified: `--matrix --json` produces valid JSON). This template change is additive — the JSON output contains all the same data the human output does. All OTHER proof commands used by agents are `--json`. After this template fix, proof table formatting changes are human-only.

**Agent template impact — work status.** CRITICAL: agents DO parse `ana work status` human output (NOT `--json`). All 5 pipeline agents run `ana work status` and read stage names ("ready-for-plan", "ready-for-build", "ready-for-verify"), worktree paths, and slug names from the human output. The `work status` display must NOT change. This scope does NOT touch work.ts or work status formatting.

**CLI reference page shows flags but not descriptions.** The `CommandGroup` component renders flag names as compact codes (`Flags: --json --save -q --quick`) but not their description text. The descriptions ARE in commands.json but the rendering component doesn't display them. This means `--help` output is the primary documentation for what each flag does. The help text quality matters more because of this — it's not backed up by a detailed reference page. This scope improves `learn` description and `-help` handling but does NOT redesign the CLI reference rendering (separate scope).

**`-help` interception and exit code.** The interception must match specifically `-help` as the unknown option. CORRECTION (from redundant agent review): Commander's `error()` method calls `outputError` then immediately calls `_exit(exitCode, ...)` which calls `process.exit(1)`. Simply suppressing the error and printing help still exits with code 1. The fix: in the `configureOutput({ outputError })` handler, when detecting `-help`, call `program.outputHelp(); process.exit(0);` to preempt the error exit path. This exits cleanly before Commander's `_exit(1)` runs.

**buildCommandTree `program.command()` pattern.** CORRECTION (from redundant agent review): The scope originally said "extend the regex for `.command()` pattern." This is wrong. `buildCommandTree` ALREADY has a third pass for `.command()` chains (extract-docs-data.ts line 315-336). The issue is that `program` is a function parameter in doctor.ts, not a `const` declared via `new Command()`, so it's never in `varToName`. When the third pass encounters `program.command('doctor')`, it looks up `varToName.get('program')`, gets `undefined`, and skips it (line 320: `if (!parentName) continue`). The fix: treat `program.command('name')` as a root command declaration — when `parentVar === 'program'`, create a top-level command instead of trying to find a parent.

**`pr create` ENOENT error.** Noticed during audit: `ana pr create nonexistent` shows raw `Error: ENOENT: no such file or directory, scandir ...`. This should be caught and replaced with "No active work found for 'nonexistent'." Out of scope for this round — note for a future fix.

## Rejected Approaches

**Shared table formatting utility.** A `formatTable(headers, rows, options)` abstraction used by all commands. Over-engineering for the current scope — each table has different column types (strings, colored strings, ratios). A shared column-width helper is sufficient without a full table abstraction.

**Terminal-width-responsive columns.** Reading `process.stdout.columns` and adjusting column widths to fill the terminal. Adds complexity, breaks reproducible output in tests, and conflicts with the fixed 71-char box convention. Fixed widths (computed from data, not terminal) are more predictable.

**Fixing all error messages across all commands.** The `pr create` ENOENT, `config get (undefined)`, and other edge-case error messages could be improved. But bundling error message polish with table formatting creates a large scope. Table formatting is the visible, consistent issue. Error messages are individual fixes.

## Open Questions

None.

## Exploration Findings

### Patterns Discovered

- Three separate slug-overflow locations in proof.ts: line 571 (`padEnd(24)` in list table), line 1776 (`Math.max(0, 20 - slug.length)` in audit matrix), and line 488 (`padEnd(24)` in health hot spots). All have the same disease — hardcoded width with no overflow handling.
- Box trailing space issue in proof.ts lines 214 and 400 — same visual pattern as the scan.ts bug fixed in scan-display-refresh. Content fills exactly to `innerWidth`, right border touches last character.
- Commander's `-help` behavior: single-dash flags are parsed character by character. `-help` becomes `-h -e -l -p`. `-h` would trigger help but the remaining `-e -l -p` cause errors first. The error handler fires before `-h` is processed.
- `buildCommandTree` at extract-docs-data.ts only matches `new Command('name')`. Doctor uses `program.command('doctor')` which is a different Commander API. The `return new Command` fallback was added for check.ts and symbol-index.ts but doesn't cover the `.command()` pattern.
- Description audit: 10 of 12 commands use imperative verbs ("Detect...", "Scan...", "Start..."). `learn` uses a noun phrase ("Learn session management"). `agents` uses a hybrid ("Agent dashboard — list agents, manage models").

### Constraints Discovered

- [VERIFIED] All 5 agent templates use `--json` for proof commands. Zero references to human-formatted proof output in agent templates. Table formatting changes are human-only.
- [VERIFIED] `--json` paths in proof.ts are completely separate code paths (JSON is emitted directly from the data structures, not from the formatted strings). Table changes cannot affect JSON output.
- [CRITICAL] All 5 pipeline agents parse `ana work status` HUMAN output — not `--json`. They look for stage names, worktree paths, and slugs in the human-formatted text. Work status display format MUST NOT change. This scope does not touch work.ts.
- [OBSERVED] The CLI reference page (CommandGroup component) renders flag names but not descriptions. `--help` is the primary documentation for flag behavior. Scope improves help text but does not change the reference page rendering (separate scope).
- [OBSERVED] The `pr create` command has an uncaught `readdirSync` on a nonexistent directory (line 247). This produces a raw ENOENT error instead of a user-friendly message. Noted for future fix, not in scope.
- [OBSERVED] `ana config get nonexistent.field` returns `(undefined)` with parentheses. Functional but not helpful. Noted for future fix.
- [OBSERVED] `setup` help text doesn't mention the main use case (`claude --agent ana-setup`). The subcommands (check, complete, index) are internal — the primary entry point is the agent. Help text could note this.
- [OBSERVED] `help [command]` subcommand visible in some help outputs (work, artifact, verify, pr, config, learn) but not others. Commander adds it automatically when using `.addCommand()`. Cosmetic inconsistency — not worth fixing.

### Test Infrastructure

- `proof.test.ts` has tests for proof list, health, and audit displays. Table alignment tests can follow the existing pattern — construct a proof chain with known entries and assert on output formatting.

## For AnaPlan

### Structural Analog

Phase 1: The scan.ts box fix (scan-display-refresh scope) — same class of display fixes, same validation approach. The existing `formatListTable` at proof.ts:547 is the direct target.

Phase 2: The existing `buildCommandTree` function at extract-docs-data.ts:389 — add a second regex pass following the existing `return new Command` pattern.

### Relevant Code Paths

- `packages/cli/src/commands/proof.ts` lines 547-585 — `formatListTable` (proof list)
- `packages/cli/src/commands/proof.ts` lines 1772-1779 — audit matrix recent proofs
- `packages/cli/src/commands/proof.ts` lines 486-490 — health hot spots
- `packages/cli/src/commands/proof.ts` lines 206-215 — detail view box
- `packages/cli/src/commands/proof.ts` lines 388-401 — health view box
- `packages/cli/src/index.ts` lines 31-77 — program setup, error handling
- `website/scripts/extract-docs-data.ts` lines 449-461 — funcToFile map
- `website/scripts/extract-docs-data.ts` lines 389-435 — buildCommandTree

### Patterns to Follow

- scan-display-refresh box fix pattern for trailing space
- The existing `return new Command` regex fallback at extract-docs-data.ts:398 for the `.command()` pattern
- The `formatListTable` header/row structure for maintaining the 2-char gap convention

### Known Gotchas

- Commander's `configureOutput` method must be called before `parseAsync`. Place it right after `.version()` in index.ts.
- The `buildCommandTree` `.command()` regex must distinguish top-level registration (in index.ts via `program.command()`) from subcommand registration (inside a command file via `parentCmd.command()`). The funcToFile map already handles this — the regex just needs to find the command declaration inside the mapped file.
- The proof list table uses `chalk.green` / `chalk.red` for result coloring. The dynamic width calculation must account for the colored string's visible width (same ANSI issue as scan.ts). Since `padEnd` is applied to the string BEFORE coloring (line 573: `const resultPadded = entry.result.padEnd(9)`), this is currently correct — but verify after changes.
- When regenerating commands.json, the website build must succeed. Run `cd website && pnpm run build` to verify.

### Things to Investigate

- Whether `formatRelativeTime` output width varies significantly (e.g., "3h ago" vs "23h ago" vs "3d ago"). If so, the date column in the audit matrix should also be dynamic-width or right-aligned.
- Whether the proof list table should show a `--` or blank for entries with no surface, instead of empty space. Currently empty surfaces are just blank — which makes the date column appear to shift left on those rows.
