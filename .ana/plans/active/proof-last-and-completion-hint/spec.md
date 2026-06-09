# Spec: surface the proof after `work complete` + `ana proof --last`

**Created by:** AnaPlan
**Date:** 2026-06-08
**Scope:** .ana/plans/active/proof-last-and-completion-hint/scope.md

## Approach

Two independent, composable changes on the existing CLI surface. No new subcommands, no new JSON mode.

**Part A — `work complete` surfaces the next command.** After the completion summary, print one gray line `View the full proof: ana proof {slug}`, styled exactly like the existing `→ ana proof audit` gray hint. Add a flat `next_command: "ana proof {slug}"` field to the `--json` results object. The completion summary prints in TWO places, each with a human branch and a JSON branch — **four insertion points total**. Do NOT extract a shared printer (the two human summaries genuinely diverge — see Gotchas).

**Part B — `ana proof --last` (alias `--latest`).** Add a flag to the root `proof` command that selects the most-recent entry without naming a slug, then routes it through the *exact* existing detail-render path so output is byte-shape-identical to naming the slug. The core move: there is no reusable definition of "most recent" today — the sort is locked inside `formatListTable`. Extract one module-level `sortEntriesByRecency(entries)` with a deterministic tie-break, and have both `formatListTable` and `--last` consume it. One definition of recency, used in two places.

**Resolved open question (docs auto-gen):** The docs reference page `website/app/docs/reference/cli/page.tsx` is hand-built and enumerates NO proof flags (not even `--json`). Nothing auto-generates from commander. Only the narrative guide `reading-a-proof.mdx` needs editing. `page.tsx` and `start.mdx` are out of scope.

## Output Mockups

**Part A — `work complete` human output (normal path).** The new line is the last line printed, gray:

```
✓ PASS — Surface the proof after work complete
  12/12 satisfied · 0 deviations
  Chain: 4 runs · 9 findings (+2 new)
  Health: trend improved
  View the full proof: ana proof proof-last-and-completion-hint
```

**Part A — recovery/already-merged path** (simpler summary, same trailing hint):

```
✓ PASS — Surface the proof after work complete
  12/12 satisfied · 0 deviations
  Chain: 4 runs · 9 findings
  View the full proof: ana proof proof-last-and-completion-hint
```

**Part A — `--json` results object** gains one flat field (shown in context):

```json
{
  "slug": "proof-last-and-completion-hint",
  "feature": "...",
  "result": "PASS",
  "contract": { "total": 12, "satisfied": 12, "unsatisfied": 0, "deviated": 0 },
  "new_findings": 2,
  "rejection_cycles": 0,
  "next_command": "ana proof proof-last-and-completion-hint"
}
```

**Part B — `ana proof --last`** produces output identical to `ana proof <resolved-slug>` (the existing `formatHumanReadable` detail card). No new rendering.

**Part B — mutual exclusion error** (`ana proof <slug> --last`):

```
Error: Cannot combine a slug with --last. Pick one selector.
```
(non-zero exit)

**Part B — empty/missing chain** (`ana proof --last`): prints `No proofs yet.` (the list-view grace), exit 0.

## File Changes

### packages/cli/src/commands/proof.ts (modify)
**What changes:**
- Extract the recency sort currently inlined in `formatListTable` (lines ~750-755) into a module-level pure function `sortEntriesByRecency(entries)`. Primary key: `completed_at` descending, `undefined`/missing pushed to end (current behavior). **Secondary key: original append index, descending** — so among equal/missing `completed_at`, the last-appended entry sorts first. Capture the original index before sorting (e.g. map to `{entry, idx}` then sort, or use the index via a paired array). `formatListTable` calls this instead of its inline sort.
- In `handleProofList`, change the options type to `{ json?: boolean; last?: boolean }`.
- Add a mutual-exclusion guard at the top of `handleProofList`: if `slug` AND `options.last` are both set, print `chalk.red('Error: Cannot combine a slug with --last. Pick one selector.')` and `process.exit(1)`.
- Add `--last` resolution: when `options.last` and no `slug`, read the chain using the **graceful** read (mirror the list-view read at lines 794-805, which treats missing/corrupt as empty — NOT the detail-view hard exit). If entries are empty, route through the existing list-view empty branch (human `No proofs yet.`, json empty `wrapJsonResponse('proof', { entries: [] }, chain)`). Otherwise resolve `entry = sortEntriesByRecency(entries)[0]` and render through the IDENTICAL detail branch: human `formatHumanReadable(entry)`, json `wrapJsonResponse(\`proof ${entry.slug}\`, entry, chain)` using the entry's REAL slug.
- In `registerProofCommand` (lines ~2791-2796), add `.option('--latest, --last', 'Show the most recent proof')`. Order `--latest, --last` so commander's canonical key resolves to `options.last`. Pass through to `handleProofList`.

**Pattern to follow:** the slug-detail render branch at proof.ts:843-856; the graceful list-view read at proof.ts:794-816; option-alias idiom at scan.ts:399 (extended to two long flags).
**Why:** without the shared comparator the sort drifts between two call sites; without the graceful read `--last` crashes on a fresh repo.

### packages/cli/src/commands/work.ts (modify)
**What changes:** Add the hint to ALL FOUR insertion points.
- **Normal path, JSON** (jsonResults object, ~1198-1220): add `next_command: \`ana proof ${slug}\`,`.
- **Normal path, human** (~1226-1248): after the last summary line printed in the `else` block, add `console.log(chalk.gray(\`View the full proof: ana proof ${slug}\`));` as the final line.
- **Recovery path, JSON** (jsonResults object, ~919-931): add `next_command: \`ana proof ${slug}\`,`.
- **Recovery path, human** (~934-937): after the existing `Chain:` line, add `console.log(chalk.gray(\`View the full proof: ana proof ${slug}\`));`.

**Pattern to follow:** the existing gray hint at work.ts:1240 (`chalk.gray`, literal `ana proof ...` — do NOT route through `agentCommand()`, which is for run-subcommands). `slug` is already in scope at both sites (used at :920 and :1199).
**Why:** the proof is the product; without this the path to reading the just-minted one is a step harder at the place it's created. Missing the recovery path means `--merge` and already-completed runs go silent.

### packages/cli/tests/commands/proof.test.ts (modify)
**What changes:** Add tests for `--last` selection, json parity, alias, mutual-exclusion, empty-chain, and the tie-break. Use the existing `runProof([...])` helper (execs `dist/index.js`) and `createProofChain(entries)` helper. **These are integration tests against the built binary — the CLI must be rebuilt before they pass (see Testing Strategy).**
**Pattern to follow:** existing analogs — empty-chain (proof.test.ts:215-235), reverse-chronological sort (:190), detail view + detail JSON envelope (:594-624, :746-751), undefined `completed_at` (:292).

### packages/cli/tests/commands/work.test.ts (modify)
**What changes:** Add assertions to the existing `ana work complete` describe block (~1244) that the normal completion path prints the `View the full proof: ana proof <slug>` hint (human) and includes `next_command` in the `--json` results. Tests call `completeWork('test-slug', ...)` in-process and assert on captured console output (existing pattern, no rebuild needed).
**Pattern to follow:** existing completion-summary assertions in work.test.ts (e.g. the `ana work complete` block; console capture already wired).

### packages/cli/tests/commands/work-merge.test.ts (modify)
**What changes:** Add assertions that the recovery/already-merged completion path prints the hint (human) and includes `next_command` (json). This is the home for the recovery-path coverage.
**Pattern to follow:** the existing `--merge` / already-completed scenarios in work-merge.test.ts.

### website/content/docs/guides/reading-a-proof.mdx (modify)
**What changes:** Document `ana proof --last` (alias `--latest`) as the way to view the most recent proof without naming a slug, and mention the new `View the full proof:` hint that `work complete` now prints. Add a short prose note near the top "What you see in the terminal" section. Match the existing MDX prose style; use `&apos;` for apostrophes in JSX text content (lint rule).
**Why:** the discoverability gap closes only if the convenience selector is discoverable.

## Acceptance Criteria

- [ ] AC1: `ana work complete <slug>` prints a one-line gray `View the full proof: ana proof <slug>` hint after the summary in **both** completion paths (normal and recovery/already-merged).
- [ ] AC2: `ana work complete <slug> --json` includes `next_command: "ana proof <slug>"` in the results object in **both** completion paths.
- [ ] AC3: `ana proof --last` shows the detail card for the entry with the most-recent `completed_at`.
- [ ] AC4: `ana proof --last --json` returns that entry in JSON byte-shape-identical to `ana proof <slug> --json` — same `wrapJsonResponse('proof <slug>', entry, chain)` envelope with the resolved entry's real slug.
- [ ] AC5: `ana proof --latest` works as an alias of `--last`.
- [ ] AC6: `ana proof <slug> --last` errors clearly ("pick one selector"), non-zero exit.
- [ ] AC7: `ana proof --last` on an empty or missing chain prints `No proofs yet.`, never a crash or the detail-view hard error.
- [ ] AC8: Tie-break is explicit: among entries with equal/missing `completed_at`, `--last` selects the **last-appended** entry, covered by a test asserting the last-pushed entry wins.
- [ ] AC9: Tests pass with `(cd 'packages/cli' && pnpm vitest run)` after a build.
- [ ] AC10: No build errors (`pnpm run build`); no lint errors.

## Testing Strategy

- **Two test surfaces behave differently — this matters:**
  - `proof.test.ts` is **integration**: `runProof()` execs `dist/index.js`. The CLI MUST be rebuilt (`pnpm run build` or the cli-surface build) BEFORE running these tests, or `--last` won't exist in the binary and every new test fails. Run build first, then vitest.
  - `work.test.ts` / `work-merge.test.ts` are **in-process**: they call `completeWork()` directly and spy on console. No rebuild needed.
- **Unit/behavior tests (proof.test.ts):**
  1. `--last` selects the entry with the most-recent `completed_at` (distinct timestamps).
  2. `--last --json` output is shape-identical to `<slug> --json` for the same resolved entry (assert the parsed `command` field is `proof <real-slug>` and the results object matches).
  3. `--latest` reaches the same code path as `--last`.
  4. `<slug> --last` errors (mutual exclusion), non-zero exit.
  5. `--last` on empty/missing chain → `No proofs yet.`, exit 0.
  6. Tie-break: construct two entries with identical `completed_at`, push order [older, newer]; assert `--last` returns `newer` (the last-pushed, highest-index entry). This is the trap — assert the *specific* last-pushed entry, not merely "an append-order winner."
- **Completion-hint tests (work.test.ts + work-merge.test.ts):**
  7. Normal path: human output contains the hint; `--json` results contains `next_command`.
  8. Recovery path: human output contains the hint; `--json` results contains `next_command`.
- **Edge cases:** corrupt `proof_chain.json` + `--last` should behave like empty (graceful read), not crash.

## Dependencies

None. All touched files and helpers exist.

## Constraints

- **JSON shape parity is load-bearing.** `--last --json` must reuse `wrapJsonResponse(\`proof ${entry.slug}\`, entry, chain)` with the resolved entry's actual slug. An agent fetching "the proof I just completed" depends on identical shape — a synthetic label like `proof --last` breaks parity.
- `next_command` is additive to the existing flat `jsonResults` shape — no `hints` array, no envelope change.
- Backward compatible: existing `ana proof` and `ana proof <slug>` behavior unchanged except the intentional equal-timestamp table reordering (below).

## Gotchas

- **Tie-break direction is the trap.** `chain.entries.push(entry)` (work-proof.ts:528) appends **oldest-first**. The existing comparator returns `0` for equal `completed_at`; with a stable sort, `sorted[0]` would be the *oldest* among ties — the WRONG entry for "last." The secondary key must be the original append index, **descending**, so most-recent = max `completed_at`, then last-appended among ties.
- **Intentional table behavior change.** The shared comparator's secondary key also reorders equal-`completed_at` rows in the `ana proof` list table (last-appended-first instead of preserved oldest-first). This is intentional and more correct. Existing table-ordering tests that assert order on equal timestamps may need updating — call this out in the build report.
- **Four insertion points for Part A, not one.** The recovery path (work.ts ~918-938) is easy to miss. Both human branches AND both JSON branches.
- **Do NOT route the hint through `agentCommand()`.** That helper is for `ana run <subcommand>` (plan/build/verify). The proof hint is a literal `ana proof <slug>`, matching the literal `ana proof audit` at work.ts:1240.
- **Commander multi-long-flag key.** `.option('--last, --latest', …)` would expose `options.latest` (commander keys off the *last* long flag). Order `--latest, --last` so the canonical key is `options.last`. Add a test that both `--latest` and `--last` reach the same path.
- **`--last` must use the graceful chain read**, not the detail-view path that hard-exits on a missing chain file (proof.ts:822-826). Mirror the list-view read (proof.ts:794-805).
- **Rebuild before proof.test.ts.** Forgetting this makes every new `--last` test fail with confusing "flag not recognized" behavior, not a logic error.

## Build Brief

### Rules That Apply
- All relative imports end in `.js`; built-ins use `node:` prefix. Omitting `.js` compiles but crashes the built ESM CLI at runtime.
- `import type` for type-only imports, kept separate from value imports.
- Exported functions need explicit return types and `@param`/`@returns` JSDoc (eslint enforces; pre-commit rejects missing tags). `sortEntriesByRecency` is the new exported/module helper — give it a JSDoc block.
- Prefer early returns; flatten the mutual-exclusion guard and empty-chain check as guard clauses at the top of the resolution path.
- User-facing errors: `chalk.red` message + `process.exit(1)`.
- In MDX/JSX text, write apostrophes as `&apos;` (react/no-unescaped-entities).

### Pattern Extracts

Existing inline sort to extract (proof.ts:749-755):
```ts
  // Sort entries: most recent first, undefined completed_at pushed to end
  const sorted = [...entries].sort((a, b) => {
    if (!a.completed_at && !b.completed_at) return 0;
    if (!a.completed_at) return 1;
    if (!b.completed_at) return -1;
    return b.completed_at.localeCompare(a.completed_at);
  });
```
The extracted `sortEntriesByRecency` must preserve this primary behavior and ADD the append-index-descending secondary key for the `0`/equal cases. Capture original indices before sorting.

Existing detail-render branch to reuse for `--last` (proof.ts:851-856):
```ts
  // Format and output
  if (options.json) {
    console.log(JSON.stringify(wrapJsonResponse(`proof ${slug}`, entry, chain), null, 2));
  } else {
    console.log(formatHumanReadable(entry));
  }
```
For `--last`, the resolved entry's slug replaces `slug`: `wrapJsonResponse(\`proof ${entry.slug}\`, entry, chain)`.

Existing graceful list-view read to mirror for `--last` (proof.ts:794-816):
```ts
    let chain: ProofChain = { entries: [] };
    if (fs.existsSync(proofChainPath)) {
      try {
        const content = fs.readFileSync(proofChainPath, 'utf-8');
        chain = JSON.parse(content);
      } catch {
        chain = { entries: [] };
      }
    }
    const entries = chain.entries ?? [];
    if (options.json) {
      console.log(JSON.stringify(wrapJsonResponse('proof', { entries }, chain), null, 2));
    } else if (entries.length === 0) {
      console.log('No proofs yet.');
    } else { ... }
```

Existing gray hint style to mirror for Part A (work.ts:1240):
```ts
        healthLine += ' → ana proof audit';
      }
      console.log(chalk.gray(healthLine));
```
The new hint: `console.log(chalk.gray(\`View the full proof: ana proof ${slug}\`));`

### Proof Context
Run `ana proof context packages/cli/src/commands/proof.ts packages/cli/src/commands/work.ts` and curate the top findings before building. If no active findings exist for these files, state so in the build report.

### Checkpoint Commands
- After proof.ts changes (rebuild first): `(cd 'packages/cli' && pnpm run build)` then `(cd 'packages/cli' && pnpm vitest run tests/commands/proof.test.ts)` — Expected: all proof tests pass, new `--last` tests green.
- After work.ts changes: `(cd 'packages/cli' && pnpm vitest run tests/commands/work.test.ts tests/commands/work-merge.test.ts)` — Expected: hint assertions green (in-process, no rebuild needed).
- After all changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: full cli suite green.
- Lint: `(cd 'packages/cli' && pnpm run lint)`

### Build Baseline
Run `(cd 'packages/cli' && pnpm vitest run)` and record exact counts before starting.
- Current tests: {record exact number from terminal}
- Current test files: {record exact number}
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected current + ~8 new tests (6 in proof.test.ts, 1-2 in work.test.ts, 1 in work-merge.test.ts)
- Regression focus: existing `ana proof` table-ordering tests in proof.test.ts (equal-timestamp rows may reorder — intentional); existing `ana work complete` summary assertions in work.test.ts.
