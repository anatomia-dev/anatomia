# Spec: Merge (not clobber) managed .gitignore files on re-init

**Created by:** AnaPlan
**Date:** 2026-06-08
**Scope:** .ana/plans/active/gitignore-merge-on-reinit/scope.md

## Approach

Replace three wholesale `.gitignore` writes with **one pure merge helper applied at three call sites**, plus a one-line `EXCLUDED_PREFIXES` fix. The model: stop writing the entire file; write **only our managed region** (delimited by sentinels) and leave everything outside it untouched.

**New module — `packages/cli/src/commands/init/gitignore.ts`.** Houses the pure helper and the three stock-block constants. It must NOT live in `assets.ts`: `assets.ts` already imports from `state.ts` (`getTemplatesDir`), and `state.ts` (`preserveUserState`) also needs the helper — co-locating in `assets.ts` would create a `state ↔ assets` circular import. A standalone module is the single source of truth for stock and breaks no cycle. `assets.ts`, `state.ts` both import from it.

**Managed-block design:**
```
# >>> Anatomia managed (do not edit) >>>
<stock lines for this surface>
# <<< Anatomia managed <<<

<user content — preserved verbatim>
```

- **Block first, user content after.** `.gitignore` is "later pattern wins," so user lines — including `!negations` — take precedence over stock by construction. This is the intended precedence and the documented escape hatch for the stock-guaranteed tension: a user can override a stock ignore's *effect* with a later `!path`. State this in the helper's JSDoc.
- **We regenerate our block wholesale every run.** Stock evolves → the block changes; deprecated stock vanishes, new stock appears; user content is never read for ownership.
- The helper signature is `mergeGitignore(existingContent: string | null, stockBlock: string): string`. `stockBlock` is the raw inner stock lines (no sentinels); the helper owns the sentinel wrapping so idempotency logic lives in exactly one place.

### Open items resolved (carry into implementation)
- **Codex stock content is GROUNDED, not guessed.** Derived from the concrete Codex per-developer entries already in `EXCLUDED_PREFIXES` at **commit.ts:55–56** (`.codex/settings.local.json`, `.codex/agent-memory/`) — the same code path that enumerates Codex per-dev state for force-add. Codex stock = `agent-memory/` + `settings.local.json` (paths relative to `.codex/`). It does NOT include `scheduled_tasks.lock` (a Claude-harness runtime lock with no Codex equivalent).
- **`.agents/` is a 4th init-created surface — OUT OF SCOPE (decided).** Init creates `.agents/` (assets.ts:955, the Codex skills-symlink dir) and `EXCLUDED_PREFIXES` lists its per-dev state (`.agents/settings.local.json`, `.agents/agent-memory/`). It is deliberately excluded from this work because: (1) there is no `.agents/.gitignore` today, so there is nothing being clobbered — this is the #292 bug, and `.agents/` has no bug; (2) its per-developer state is already force-add-excluded, so nothing leaks into `ana init commit`. A `.agents/.gitignore` parity pass (same `mergeGitignore` + an `AGENTS_GITIGNORE_STOCK` constant) is a clean follow-up, not part of the clobber fix. Do NOT add a 4th stock constant or call site here.
- **state.ts:694 policy flip.** The `.gitignore → NOT copied` policy becomes a pre-swap merge. Update the doc comment to record WHY: the original commit's intent (stock regenerates to the current CLI's expectations) is preserved — we still regenerate our block from current stock — while the overreach (destroying user lines that were never ours) is removed.

## Output Mockups

**Stock block constants (exact content — these are the user-visible files):**

`ANA_GITIGNORE_STOCK`:
```
# Anatomia runtime state — local to each developer
state/
worktrees/
# Raw test-capture logs — scratch; deleted after the count + sha are sealed into the compact build_report.md marker
plans/active/*/.captures/
```

`CLAUDE_GITIGNORE_STOCK`:
```
# Per-developer state — not committed
agent-memory/
settings.local.json
# Claude Code harness runtime lock — regenerated each session, never committed
scheduled_tasks.lock
```

`CODEX_GITIGNORE_STOCK`:
```
# Per-developer state — not committed
agent-memory/
settings.local.json
```

**Sentinel constants (exact strings):**
```
START: # >>> Anatomia managed (do not edit) >>>
END:   # <<< Anatomia managed <<<
```

**A fresh `.ana/.gitignore` (no user content) — `mergeGitignore(null, ANA_GITIGNORE_STOCK)`:**
```
# >>> Anatomia managed (do not edit) >>>
# Anatomia runtime state — local to each developer
state/
worktrees/
# Raw test-capture logs — scratch; deleted after the count + sha are sealed into the compact build_report.md marker
plans/active/*/.captures/
# <<< Anatomia managed <<<
```

**A merged `.claude/.gitignore` with user content:**
```
# >>> Anatomia managed (do not edit) >>>
# Per-developer state — not committed
agent-memory/
settings.local.json
# Claude Code harness runtime lock — regenerated each session, never committed
scheduled_tasks.lock
# <<< Anatomia managed <<<

# my local scratch
.notes/
!settings.local.json.example
```

## The merge algorithm (implement exactly)

`mergeGitignore(existingContent, stockBlock)` returns the full file content. Define `BLOCK` = `START\n` + `stockBlock` (trimmed of trailing newline) + `\nEND`.

Three input cases:

1. **`existingContent` is null, empty, or whitespace-only** → return `BLOCK + "\n"`. (Block only, one terminating newline.)

**Line-ending-agnostic matching (applies to cases 2 AND 3):** all sentinel and stock-line comparisons match on the line's content **after trimming a trailing `\r`** (and surrounding whitespace). A whole-file-CRLF input (sentinels + stock written with `\r\n`) MUST be recognized as well-formed and regenerate idempotently — it must not be misdetected as legacy and demoted. Case 3 already trims for stock-strip; case 2 sentinel detection must trim identically.

2. **Well-formed managed block present** — exactly one `START` line AND exactly one `END` line (matched line-ending-agnostically, per above), with `START` appearing before `END`:
   - `before` = everything before the `START` line.
   - `after` = everything after the `END` line.
   - `userContent` = `before` concatenated with `after` (in that order; join with a newline only if both are non-empty). This **consolidates any user content that appeared above the start sentinel down below the regenerated block** — deterministic ordering, block always first.
   - Normalize `userContent`: trim leading and trailing blank/whitespace-only lines (the block↔user separator is ours). Preserve the interior **verbatim** — do not normalize interior blank lines, do not touch CRLF inside user lines.
   - Return `BLOCK + "\n"` if `userContent` is empty after trim; else `BLOCK + "\n\n" + userContent + "\n"`.

3. **Legacy / fail-safe** — no markers, OR partial/duplicate/malformed markers (anything that is not exactly-one-well-ordered-pair). Treat the ENTIRE input as candidate user content, NEVER delete a managed region:
   - Split into lines. Drop each line whose trimmed form exactly equals the trimmed form of any line in `stockBlock` (strips the bare stock lines a legacy wholesale-write left behind, including stock comment lines).
   - `userContent` = the surviving lines rejoined; trim leading/trailing blank lines; preserve interior verbatim.
   - Return `BLOCK + "\n"` if empty; else `BLOCK + "\n\n" + userContent + "\n"`.
   - **Fail-safe guarantee:** a partial or hand-authored marker line does NOT match stock, so it survives as user content. The helper never deletes content it doesn't recognize as stock.

**Idempotency (must hold):** feeding the helper's own output back in is a well-formed case with `before` empty → `after` reproduces the same normalized `userContent` → byte-identical result. Verify this is true for all three surfaces, with and without user content.

**A044 invariant (hard gate):** `stockBlock` must NEVER contain the string `provenance` for any surface. It holds by construction (stock is a known constant we regenerate from), but it is an existing contract guard — assert it, never assume it. Per-session provenance travels in git; a generated ignore of it corrupts cross-machine proof-chain assembly.

## File Changes

### packages/cli/src/commands/init/gitignore.ts (create)
**What changes:** New module. Exports: `mergeGitignore(existingContent: string | null, stockBlock: string): string`; the three stock constants `ANA_GITIGNORE_STOCK`, `CLAUDE_GITIGNORE_STOCK`, `CODEX_GITIGNORE_STOCK`. Sentinel strings are module-private constants.
**Pattern to follow:** Pure function — zero CLI dependencies (no chalk/ora), no `fs`. Mirrors the read-merge-preserve-write *discipline* of `mergeHooksSettings` (assets.ts:591) but is text/line-based, not JSON. Explicit return type, named exports, `@param`/`@returns` JSDoc (enforced by lint).
**Why:** Single source for stock + the one place sentinel/idempotency logic lives. Without it, three call sites drift.

### packages/cli/src/commands/init/assets.ts (modify)
**What changes:** (1) `createDirectoryStructure` (~96–102): replace the inline `gitignoreContent` string + `fs.writeFile` with `mergeGitignore(null, ANA_GITIGNORE_STOCK)` written to the temp `.gitignore` (plain `fs.writeFile` — it's in the temp tree, the whole `.ana` is atomically swapped later). Import `ANA_GITIGNORE_STOCK` + `mergeGitignore` from `./gitignore.js`. (2) `createClaudeConfiguration` (224–251): delete the inline `claudeGitignoreContent` constant; at both write sites (fresh :236 and in-place re-init :251) read the existing `.claude/.gitignore` if present, call `mergeGitignore(existing, CLAUDE_GITIGNORE_STOCK)`, and write via `atomicWriteFile` (crash-safe). (3) `createCodexConfiguration` (~758): net-new — in both the fresh and re-init branches, read existing `.codex/.gitignore` if present, `mergeGitignore(existing, CODEX_GITIGNORE_STOCK)`, write via `atomicWriteFile`.
**Pattern to follow:** `atomicWriteFile` (assets.ts:152) for every in-place live-tree write — do not add a second write primitive.
**Why:** These are the three clobber sites. Routing in-place writes through `atomicWriteFile` matches the existing crash-safety contract for live-tree writes.

### packages/cli/src/commands/init/state.ts (modify)
**What changes:** In `preserveUserState` (~706), add a step (re-init path): read the OLD live `.ana/.gitignore` from `existingAnaPath`, call `mergeGitignore(oldContent, ANA_GITIGNORE_STOCK)`, write the result to `path.join(tmpAnaPath, '.gitignore')` (plain `fs.writeFile` — temp tree). This MUST run before the caller's atomic swap (it does — `preserveUserState` is invoked at index.ts:124, swap at 134). If the old file is absent, the temp block-only file from `createDirectoryStructure` already stands — skip or pass null (both yield the same block-only output). Update the policy doc comment at ~694: change `.gitignore → NOT copied` to describe the pre-swap merge and record that the original commit's stock-guarantee intent is preserved (block regenerates to current expectations) while the user-clobber overreach is removed.
**Pattern to follow:** The existing `try/catch`-guarded reads in `preserveUserState` (e.g. learn/, proof-chain copies) — absent source degrades gracefully.
**Why:** This is the only place with access to the old `.ana/.gitignore` before the swap destroys it. Putting the `.ana` merge in a `create*Configuration` function (post-swap) would read the already-swapped fresh file and lose user lines.

### packages/cli/src/commands/init/commit.ts (modify)
**What changes:** Add `'.claude/scheduled_tasks.lock'` to the `EXCLUDED_PREFIXES` array (line 47–59).
**Pattern to follow:** The existing `.claude/agent-memory/` + `.claude/settings.local.json` entries — same dual treatment (gitignored AND excluded).
**Why:** Gitignoring the lock alone only relocates it from the plain-add path to the `git add -f` force-add path (`discoverGitignoredFiles`, commit.ts:190). The exclusion is the lever that actually stops the commit. Both changes required for AC8.

### packages/cli/tests/commands/init/gitignore.test.ts (create)
**What changes:** Unit tests for the pure `mergeGitignore` helper — all three input cases, idempotency, A044, negation/ordering, CRLF, fail-safe. See Testing Strategy.
**Pattern to follow:** Vitest, inline string fixtures (no temp files needed — pure function). Exact-value assertions.

### packages/cli/tests/commands/init.test.ts (modify)
**What changes:** Integration tests — `.ana` preservation via `preserveUserState`; `.claude`/`.codex` preservation + creation via `createClaudeConfiguration`/`createCodexConfiguration`; A044 extended to all three surfaces. Mirror the existing `preserveUserState` re-init tests (648–766) and the A044 test (56–61).
**Pattern to follow:** Existing `preserveUserState(existingAnaPath, tmpAnaPath, newConfig)` fixtures; `createDirectoryStructure` standalone calls.

### packages/cli/tests/commands/init/commit.test.ts (modify)
**What changes:** Assert `isExcluded('.claude/scheduled_tasks.lock')` returns `true`. Mirror the existing exclusion tests (~672–730).
**Pattern to follow:** Existing `isExcluded` / `discoverGitignoredFiles` exclusion tests.

## Acceptance Criteria

- [ ] AC1: After a user adds a line to `.ana/.gitignore`, re-init preserves that line.
- [ ] AC2: After a user adds a line to `.claude/.gitignore`, re-init preserves that line.
- [ ] AC3: `.codex/.gitignore` is created on init with a managed block of Codex stock (`agent-memory/`, `settings.local.json`), and user lines survive re-init.
- [ ] AC4: Stock entries are always present inside the managed block after re-init, even if a user deleted one. "Deduped" here means the managed block itself carries no duplicate stock lines — it does NOT mean cross-region dedup: a user-region line that happens to equal a stock line is preserved verbatim and intentionally left as-is (see AC6/A021), never stripped against the block.
- [ ] AC5: Re-init twice produces a byte-identical `.gitignore` for all three surfaces, with and without user content.
- [ ] AC6: A user `!negation` placed after the managed block continues to win (stays below the block) after re-init.
- [ ] AC7: Legacy migration: a pre-existing un-marked file (bare stock lines, no sentinels) is migrated on first re-init — stock wrapped into the block, all other lines preserved below.
- [ ] AC8: `.claude/scheduled_tasks.lock` is in `EXCLUDED_PREFIXES` (`isExcluded` returns true) and stock `.claude/.gitignore` ignores it.
- [ ] AC9: The generated/merged `.gitignore` for all three surfaces never ignores `provenance/` (A044 regression guard).
- [ ] AC10: Stock content is identical regardless of project language/framework (no per-language branching).
- [ ] AC11: User content that appeared above the start sentinel is consolidated below the regenerated block (deterministic ordering).
- [ ] AC12: A partial/duplicate/hand-authored sentinel degrades to user content — never deleted (fail-safe).
- [ ] AC13: A whole-file-CRLF managed file (sentinels + stock as `\r\n`) is detected as well-formed and regenerates byte-identically — not misdetected as legacy and demoted.
- [ ] Full CLI suite passes: `(cd packages/cli && pnpm vitest run)` — 3582 → 3582 + new tests.
- [ ] No build errors: `(cd packages/cli && pnpm run build)`.
- [ ] Lint clean: `(cd packages/cli && pnpm run lint)`.

## Testing Strategy

- **Unit tests (gitignore.test.ts — pure helper):**
  - null/empty/whitespace-only input → returns block-only output (contains both sentinels, the stock lines).
  - well-formed re-merge → user content below block preserved verbatim; output idempotent (feed output back → byte-identical) for each surface, with and without user content.
  - user content ABOVE the start sentinel → consolidated below block on regenerate (AC11).
  - user `!negation` below block → still present and positioned after END after re-merge (AC6).
  - legacy bare-stock file (+ a user line) → stock stripped & wrapped in block, user line preserved below (AC7).
  - legacy benign promotion → a line matching OLD/removed stock (not in current `stockBlock`) survives as user content (documented benign behavior — extra ignore, not data loss).
  - user line identical to a current stock line, in well-formed user region → preserved verbatim (not stripped — preserve-verbatim).
  - CRLF inside a user line → preserved byte-for-byte.
  - whole-file-CRLF managed input (sentinels + stock written as `\r\n`) → detected well-formed, regenerates byte-identical, no legacy-demotion (AC13).
  - fail-safe: only a START marker / only an END / duplicate START / END-before-START → entire content treated as user content, nothing deleted (AC12).
  - A044: `mergeGitignore(null, X)` for X ∈ {ANA, CLAUDE, CODEX} never contains `provenance`.
  - stock identity: ANA/CLAUDE/CODEX stock constants contain no language/framework tokens (AC10) — assert exact expected stock strings.
- **Integration tests (init.test.ts):**
  - `.ana`: seed an existing `.ana/.gitignore` with a user line + stock, run `preserveUserState`, assert the temp `.gitignore` keeps the user line and the managed block (AC1, AC4).
  - `.claude`: existing `.claude/` with a user-modified `.gitignore`, run `createClaudeConfiguration`, assert user line preserved + `scheduled_tasks.lock` present (AC2, AC8).
  - `.codex`: fresh init creates `.codex/.gitignore` with stock; re-init with a user line preserves it (AC3).
  - A044 extended: generated `.gitignore` for all three surfaces never contains `provenance` (AC9).
- **Integration tests (commit.test.ts):** `isExcluded('.claude/scheduled_tasks.lock')` === true (AC8).
- **Edge cases:** empty file, comments-only file, `.gitignore` deleted before re-init (fresh path), trailing-newline-absent input.

## Dependencies
None. All touched modules exist; `atomicWriteFile` already present.

## Constraints
- Stock content project-type-independent — no language/framework branching (cross-customer safety).
- In-place live-tree writes (`.claude`, `.codex`) route through `atomicWriteFile` — crash leaves old-or-new, never truncated.
- A044: stock must never contain `provenance` — hard invariant.
- `.js` extensions on all relative imports (ESM runtime requirement); `node:` prefix on built-ins.
- Backward compatible: every existing install has a clobbered un-marked file — legacy migration must handle it on first re-init without data loss.

## Gotchas
- The `.ana` merge MUST run inside `preserveUserState` (pre-swap), reading from `existingAnaPath`. Post-swap is too late.
- Adding `scheduled_tasks.lock` to stock without adding it to `EXCLUDED_PREFIXES` does NOT stop the commit — it relocates it to the force-add path. Both required.
- On re-init the `.ana` temp `.gitignore` is written twice (block-only by `createDirectoryStructure`, then re-merged by `preserveUserState`). Harmless — both writes are to the temp tree before the atomic swap.
- The marker parser must fail safe: partial/duplicate/hand-authored sentinels degrade to user content, never trigger a delete.
- Sentinel AND stock-line matching is line-ending-agnostic — trim a trailing `\r` before comparing in BOTH case 2 (well-formed detection) and case 3 (stock-strip). A whole-CRLF managed file misdetected as legacy would demote its own block to user content and break idempotency (AC13).
- Separator between block and user region is OURS (normalize to one blank line) — but user content interior is preserved verbatim (including CRLF). Don't over-normalize.
- `worktree.test.ts:306` asserts `.ana/.gitignore` contains `worktrees/` via a different code path (worktree util) — `worktrees/` stays in stock, so it still passes. Don't remove it from `ANA_GITIGNORE_STOCK`.

## Build Brief

### Rules That Apply
- All relative imports end in `.js`; built-ins use `node:` prefix. Omitting `.js` compiles but crashes the built CLI at runtime.
- Named exports only — no default exports.
- Explicit return types on exported functions; `@param`/`@returns` JSDoc on exports (lint-enforced).
- `gitignore.ts` is pure — zero CLI deps (no chalk/ora), no `fs`. Engine-style purity.
- Tests: assert exact expected values (`toBe`/`toEqual` on full strings), not `toBeDefined`. Behavior over implementation. Inline fixtures in temp dirs; force `git init -b main` if any test inits a repo (none here should need to).
- When a test searches output (find/match), assert the search succeeded before asserting its value.

### Pattern Extracts

Stock + clobber site to replace (assets.ts:221–227, 236, 251):
```ts
  const claudeGitignorePath = path.join(claudePath, '.gitignore');
  const claudeGitignoreContent = `# Per-developer state — not committed
agent-memory/
settings.local.json
`;
  // ...fresh:  await fs.writeFile(claudeGitignorePath, claudeGitignoreContent, 'utf-8');  (:236)
  // ...re-init: await fs.writeFile(claudeGitignorePath, claudeGitignoreContent, 'utf-8'); (:251)
```

`atomicWriteFile` signature to route in-place writes through (assets.ts:152):
```ts
async function atomicWriteFile(destPath: string, content: string, fileName: string): Promise<void>
```

`EXCLUDED_PREFIXES` — the grounding source for Codex stock + the one-line add (commit.ts:47–59):
```ts
const EXCLUDED_PREFIXES = [
  '.ana/proof_chain.json',
  '.ana/PROOF_CHAIN.md',
  '.ana/plans/',
  '.ana/state/',
  '.ana/worktrees/',
  '.claude/settings.local.json',
  '.claude/agent-memory/',
  // ADD: '.claude/scheduled_tasks.lock',
  '.codex/settings.local.json',   // ← Codex per-dev state: source for CODEX stock
  '.codex/agent-memory/',         // ← Codex per-dev state: source for CODEX stock
  '.agents/settings.local.json',
  '.agents/agent-memory/',
];
```

A044 existing guard to extend to all three surfaces (init.test.ts:56–61):
```ts
it('generated .ana/.gitignore does not ignore provenance', async () => {
  const tmpAnaPath = path.join(tmpDir, '.ana-gitignore');
  await createDirectoryStructure(tmpAnaPath);
  const gitignore = await fs.readFile(path.join(tmpAnaPath, '.gitignore'), 'utf-8');
  expect(gitignore).not.toContain('provenance');
});
```

`preserveUserState` re-init test shape to mirror for `.ana/.gitignore` (init.test.ts:648–673):
```ts
const existingAnaPath = path.join(tmpDir, '.ana-existing');
// ...seed existingAnaPath with prior state + ana.json {artifactBranch:'main'}...
const tmpAnaPath = path.join(tmpDir, '.ana-tmp');
await createDirectoryStructure(tmpAnaPath);
const newConfig = { anaVersion: '1.0.0', lastScanAt: new Date().toISOString() };
await preserveUserState(existingAnaPath, tmpAnaPath, newConfig);
// ...assert tmpAnaPath/.gitignore preserves the user line...
```

### Proof Context
- [test] (template-propagation-C3) `atomicWriteFile`'s SHA-256 integrity-failure branch is untested — relevant because `.claude`/`.codex` gitignore writes now route through it. Not in scope to add that test, but don't assume that branch is covered.
- [build concern] (session-capture) The Codex install/prune path is untested and the Codex on-disk schema is unconfirmed against a live install. Mitigation here: Codex stock is derived from `EXCLUDED_PREFIXES` (commit.ts:55–56), an in-repo source of truth — not from an assumed live-install layout. Test the `.codex/.gitignore` create + preserve path explicitly to close part of this gap.
- No other active findings on `commit.ts`/`state.ts` overlap these assertions.

### Checkpoint Commands
- After `gitignore.ts` + its unit test (`tests/commands/init/gitignore.test.ts`): `(cd packages/cli && pnpm vitest run tests/commands/init/gitignore.test.ts)` — Expected: all new helper tests pass.
- After assets.ts/state.ts changes: `(cd packages/cli && pnpm vitest run tests/commands/init.test.ts)` — Expected: 100 prior + new integration tests pass, A044 green on all surfaces.
- After commit.ts change: `(cd packages/cli && pnpm vitest run tests/commands/init/commit.test.ts)` — Expected: 4 prior + new exclusion test pass.
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 3582 + new tests pass, 2 skipped.
- Lint: `(cd packages/cli && pnpm run lint)`.

### Build Baseline
- Current tests: 3582 passing, 2 skipped (3584 total).
- Current test files: 146.
- Command used: `(cd packages/cli && pnpm vitest run)`.
- Affected-file baseline: `init.test.ts` + `init/commit.test.ts` = 104 tests passing.
- After build: expected 3582 + new tests (new `gitignore.test.ts` file → 147 files).
- Regression focus: `init.test.ts` (A044 + preserveUserState fixtures), `commit.test.ts` (exclusion tests), `worktree.test.ts:306` (asserts `worktrees/` in `.ana/.gitignore` — stays in stock).
