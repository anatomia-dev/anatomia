# Scope: surface the proof after `work complete` + `ana proof --last`

**Created by:** Ana
**Date:** 2026-06-08

## Intent

The proof is the pipeline's payoff, but reading the *just-minted* one carries friction at two touchpoints, and both force a human or agent to remember and retype a slug:

1. `ana work complete` mints a proof and prints its *stats* (`✓ PASS — {feature} · N/M satisfied · Chain: …`) but never points at the command to view the full card.
2. `ana proof` has no "show me the latest" selector. To see the most recent proof you read the history table, find the top row, and retype its slug.

GitHub issue #290 (good first issue). Closes the discoverability gap — distinct from #272 (proof exploration: search/diff/timeline), which is the larger feature. This is the small discoverability + convenience-selector slice; keep them separate.

**The disease:** the proof is the product, but the path to *reading the latest one* is a step harder than it should be at both the place it's created (`work complete`) and the place it's viewed (`ana proof`). The outcome: make reading the just-minted proof frictionless for both the human and the agent driving the pipeline.

## Complexity Assessment

- **Kind:** feature
- **Size:** small
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/proof.ts` — extract recency comparator; add `--last`/`--latest`, mutual-exclusion guard, empty-chain grace
  - `packages/cli/src/commands/work.ts` — hint line + `next_command` JSON field at **both** completion print sites
  - `packages/cli/tests/commands/proof.test.ts` — `--last` selection, tie-break, json parity, alias, mutual-exclusion, empty-chain
  - `packages/cli/tests/commands/work.test.ts` (and/or `work-merge.test.ts`) — hint present on both completion paths (human + json)
  - `website/content/docs/guides/reading-a-proof.mdx` (+ possibly `start.mdx`) — document `--last`/`--latest` and the new hint
- **Blast radius:** Extracting the comparator changes the equal-`completed_at` ordering of the existing `ana proof` table (last-appended-first instead of oldest-first among ties) — an intentional, tiny behavior change. No other command consumes the comparator. The `next_command` field is additive to the `work complete --json` envelope. Hint line is additive to human output.
- **Estimated effort:** ~2-3 hours including tests and docs
- **Multi-phase:** no

## Approach

Two independent, composable changes on the existing CLI surface — no new subcommands, no new JSON mode.

**Part A — `work complete` surfaces the next command.** After the completion summary, print one gray line — `View the full proof: ana proof {slug}` — styled like the existing `→ ana proof audit` hint. Add a `next_command: "ana proof {slug}"` field to the `--json` results so the agent that ran `work complete` can chain to it programmatically. The slug being completed is already in scope at both print sites. **Critical:** the completion summary prints in TWO places — the normal path and the crash/already-merged recovery path — each with a human branch and a JSON branch. The hint must land in all four, or `--merge` and recovery completions go silent.

**Part B — `ana proof --last` (alias `--latest`).** Add a flag to the root `proof` command that selects the most-recent entry without naming a slug and routes it through the *exact* existing detail-render path, so its output is identical to naming the slug. "Most recent" reuses one shared definition of recency (see below), with the tie-break made explicit. Guard the mutually-exclusive `<slug> --last` combination, and route the empty-chain case through the existing graceful "No proofs yet." path rather than the detail-view hard error.

The unifying move: there is currently no reusable definition of "most recent" — the sort is locked inside `formatListTable`. Extract it once, give it a deterministic tie-break, and let both the table and `--last` consume it. One definition of recency, used in two places.

## Acceptance Criteria

- AC1: `ana work complete <slug>` prints a one-line gray `View the full proof: ana proof <slug>` hint after the summary in **both** completion paths (normal and recovery/already-merged).
- AC2: `ana work complete <slug> --json` includes `next_command: "ana proof <slug>"` in the results object in **both** completion paths.
- AC3: `ana proof --last` shows the detail card for the entry with the most-recent `completed_at`.
- AC4: `ana proof --last --json` returns that entry in JSON byte-shape-identical to `ana proof <slug> --json` — same `wrapJsonResponse('proof <slug>', entry, chain)` envelope with the resolved entry's real slug, not a synthetic label.
- AC5: `ana proof --latest` works as an alias of `--last`.
- AC6: `ana proof <slug> --last` errors clearly ("pick one selector"), non-zero exit, never silently prefers one.
- AC7: `ana proof --last` on an empty or missing chain prints "No proofs yet." (the list-view grace), never a crash or the detail-view hard error.
- AC8: Tie-break is explicit and correct: among entries with equal/missing `completed_at`, `--last` selects the **last-appended** entry (genuinely most recent), and this is covered by a test asserting the last-pushed entry wins.

## Edge Cases & Risks

- **Tie-break direction (the trap).** `entries[]` is append **oldest-first** — `chain.entries.push(entry)` at `work-proof.ts:528` (and `[...chain.entries, entry]` at `:446`). The existing comparator returns `0` for equal `completed_at`; with a stable sort, `sorted[0]` would be the *oldest* among ties — the **wrong** entry for "last." The comparator must add a secondary key on original append index, **descending**, so "most recent" = max `completed_at`, then last-appended among ties. Test #6 must assert the last-pushed equal-timestamp entry wins — not merely "an append-order winner."
- **Intentional behavior change to the table.** The shared comparator's secondary key also reorders equal-timestamp rows in the `ana proof` list table (last-appended-first instead of preserved oldest-first). This is more correct and should be called out in the build report as intentional. Existing table tests that assert ordering on equal timestamps may need updating.
- **Both completion print sites.** Recovery path `work.ts:918-938` (json `:932`, human `:934-937`) and normal path `work.ts:1197-1249` (json `:1224`, human `:1226-1248`). The recovery human summary is simpler (no health/resolves lines) and uses local `runs`/`findingsCount`; the normal path uses `stats.*`. Add the hint line to both human branches and the `next_command` field to both `jsonResults` objects. Do not extract a shared printer (see Rejected Approaches).
- **JSON shape parity.** `--last --json` must reuse `wrapJsonResponse(\`proof ${entry.slug}\`, entry, chain)` with the resolved entry's actual slug. An agent fetching "the proof I just completed" depends on identical shape — a synthetic label like `proof --last` would break parity.
- **Empty/missing chain + `--last`.** Route to the list-view empty path (`"No proofs yet."`, proof.ts:812), not the detail-view `process.exit(1)` error (proof.ts:822-826). Existing empty-chain tests (proof.test.ts:215-235) are the analog.
- **Commander two-long-flag alias.** The repo only has short+long aliases (`-q, --quiet`). For `--last`/`--latest`, commander derives the option key from the *last* long flag in the string — `.option('--last, --latest', …)` would expose `options.latest`, not `options.last`. Order it `.option('--latest, --last', …)` so the canonical key is `options.last`, OR verify the resolved key explicitly. Confirm with a test that `--latest` and `--last` both reach the same code path.

## Rejected Approaches

- **Extract a shared completion-summary printer** (to DRY the hint across the two print sites). Rejected: the two summaries already diverge — the normal path prints health and resolves-claims lines the recovery path doesn't, and they source stats differently (`stats.*` vs local `runs`/`findingsCount`). A shared printer would have to parameterize that divergence — a separate refactor out of proportion for a good-first-issue. Duplicate the one hint line + one JSON field at each site instead. (Contrast: the *sort* extraction below is genuine logic duplication of a pure comparator and is cheap — different cost, different call.)
- **`--last` as a subcommand** (`ana proof last`). Rejected: a flag on the root command fits the existing `[slug]` + `--json` shape with no new surface, per the issue's design note.
- **A `hints` array in the JSON envelope.** Rejected: no `hints` convention exists in the `wrapJsonResponse` envelope today. A flat `next_command` field is consistent with the existing flat `jsonResults` shape (`slug`, `feature`, `result`, …).
- **Duplicate the sort into `--last`.** Rejected: the comparator is pure logic and would drift; extract one `sortEntriesByRecency` (or equivalent) and consume it in both `formatListTable` and `--last`. The elegant solution removes the duplication.

## Open Questions

- Docs reference page: confirm whether `website/app/docs/reference/cli` auto-generates the flag list from the commander definition (if so, `--last`/`--latest` appear for free and only the narrative guide needs a manual edit). Resolve during planning — does not block the CLI change.

## Exploration Findings

### Patterns Discovered
- Root `proof` command registration: `proof.ts:2791-2796` — `.argument('[slug]').option('--json').action(handleProofList)`. No `--last` today.
- `handleProofList(slug, options)`: `proof.ts:786-857`. No slug → list/table (`:794-816`, empty → `"No proofs yet."` at `:812`). Slug → `chain.entries.find(e => e.slug === slug)` (`:843`), then `formatHumanReadable(entry)` (human, `:855`) or `wrapJsonResponse(\`proof ${slug}\`, entry, chain)` (json, `:853`). Detail path hard-exits if the chain file is missing (`:822-826`).
- Recency sort: `proof.ts:750-755`, a local `const sorted` **inside** `formatListTable` — descending `completed_at.localeCompare`, undefined pushed to end. Not a standalone function; extract to reuse.
- Append convention: `chain.entries.push(entry)` at `work-proof.ts:528` — oldest-first. Determines tie-break direction.
- `wrapJsonResponse` signature: `src/utils/proofSummary.ts:461` — `wrapJsonResponse<T>(command, results, chain)`.
- Completion summary + hint style: `work.ts:1226-1248`; existing `→ ana proof audit` gray hint at `:1240` is the Part A style analog.
- `work complete --json` **exists** at both sites (`work.ts:1224` normal, `:932` recovery) — resolves the issue's open question; Part A's JSON half is in scope, not deferred.

### Constraints Discovered
- [TYPE-VERIFIED] `chain.entries.push(entry)` (work-proof.ts:528) — append oldest-first; tie-break for "last" must select highest index.
- [TYPE-VERIFIED] Two completion print sites, each with json + human branches (work.ts:918-938, work.ts:1197-1249) — four insertion points.
- [OBSERVED] No `hints`/`next_command` convention in `wrapJsonResponse` envelope today — `next_command` is a new additive field.
- [OBSERVED] Repo option aliases are short+long only (scan.ts:399, init/index.ts:69-70) — two-long-flag alias is unprecedented here; verify commander key resolution.

### Test Infrastructure
- `tests/commands/proof.test.ts` — `runProof([...])` helper; existing analogs: empty-chain (`:215-235`), reverse-chronological sort (`:190`), single entry (`:279`), undefined `completed_at` (`:292`), detail view + detail JSON envelope (`:594-624`, `:746-751`).
- `tests/commands/work.test.ts` / `work-merge.test.ts` — completion-summary assertions; home for the "hint present on both paths" tests.

## For AnaPlan

### Structural Analog
- **Part A:** the existing `→ ana proof audit` gray hint at `work.ts:1240` — same `chalk.gray` one-line style, same "append a pointer after the summary" shape. The hint line mirrors it; the `next_command` field mirrors the existing flat fields in `jsonResults` (work.ts:1198-1220, 919-931).
- **Part B:** the slug-detail render path in `handleProofList` (proof.ts:843-856) — `--last` resolves an entry, then routes through the identical `formatHumanReadable` / `wrapJsonResponse(\`proof ${slug}\`, …)` branch. Resolve the entry, reuse the render.

### Relevant Code Paths
- `proof.ts:2791-2796` — root command registration (add `--last, --latest`; pass through to `handleProofList`)
- `proof.ts:786-857` — `handleProofList` (add `--last` resolution, mutual-exclusion guard, empty-chain grace)
- `proof.ts:750-755` — sort to extract into a shared recency comparator with explicit append-index tie-break
- `work-proof.ts:528` — confirms append-oldest-first (tie-break direction)
- `work.ts:918-938` and `work.ts:1197-1249` — both completion print sites
- `proofSummary.ts:461` — `wrapJsonResponse` signature

### Patterns to Follow
- Gray hint: `console.log(chalk.gray(...))` exactly as `work.ts:1240`.
- Detail render reuse: `formatHumanReadable(entry)` / `wrapJsonResponse(\`proof ${entry.slug}\`, entry, chain)` from proof.ts:853-855.
- Empty-chain grace: the list-view `"No proofs yet."` branch at proof.ts:809-812, not the detail-view exit.
- Option alias idiom: extend the short+long pattern (scan.ts:399) to two long flags, ordering so `options.last` is the canonical key.

### Known Gotchas
- Tie-break direction flips on the append convention — secondary sort key on append index, **descending**. Oldest-first input means naive `sorted[0]` returns the oldest among ties.
- Four insertion points for Part A, not one — recovery path is easy to miss.
- `--last --json` must use the resolved entry's **real slug** in the envelope label for shape parity.
- Commander names a multi-long-flag option off the last long flag — order `--latest, --last` for an `options.last` key, or verify explicitly.
- Extracting the comparator changes equal-timestamp ordering in the existing table — intentional; update any ordering tests and note it in the build report.

### Things to Investigate
- Whether `website/app/docs/reference/cli` auto-generates the flag list from commander (affects how much doc editing Part B needs). Design-judgment for the planner; does not block the CLI change.

## Test List (for Build)

1. `--last` selects the entry with the most-recent `completed_at` (distinct timestamps).
2. `--last --json` output is byte-shape-identical to `<slug> --json` for the same resolved entry.
3. `--latest` alias reaches the same code path as `--last`.
4. `ana proof <slug> --last` errors clearly (mutual exclusion), non-zero exit.
5. `--last` on empty/missing chain → `"No proofs yet."`, no crash.
6. Equal-`completed_at` tie-break → the **last-appended** (highest-index) entry wins. Construct two entries with identical `completed_at`, push order [older, newer]; assert `--last` returns `newer`.
7. The `View the full proof: ana proof <slug>` hint appears on **both** completion paths (human), and `next_command` is present in **both** JSON paths.
