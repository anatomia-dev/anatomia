# Scope: Merge (not clobber) managed .gitignore files on re-init

**Created by:** Ana
**Date:** 2026-06-08
**Issue:** #292 (related: #702 — Codex .gitignore inconsistency)

## Intent

Re-init silently destroys user-added lines in `.claude/.gitignore` and `.ana/.gitignore`, and `.codex/` ships no `.gitignore` at all. Users legitimately customize these files; their additions vanish on the next `ana init` with no warning. Concretely, the Claude Code harness runtime lock `.claude/scheduled_tasks.lock` is not ignored by stock and gets swept into `ana init commit`, re-dirtying the tree every session.

The user wants re-init to **guarantee Anatomia's stock entries are present while preserving everything the user added** — across all three managed surfaces (`.ana/`, `.claude/`, `.codex/`) — and to stop the runtime lock from being committed.

## Complexity Assessment

- **Kind:** fix
- **Size:** medium
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/init/assets.ts` — new `mergeGitignore` helper; `.ana` stock block (~line 96); `.claude` stock + write sites (224–251); net-new `.codex/.gitignore` creation in `createCodexConfiguration` (~758).
  - `packages/cli/src/commands/init/state.ts` — `preserveUserState` (~706): change the `.gitignore → NOT copied` policy (doc at 694) to a **pre-swap merge** call for `.ana/.gitignore`.
  - `packages/cli/src/commands/init/commit.ts` — add `.claude/scheduled_tasks.lock` to `EXCLUDED_PREFIXES` (line 47).
  - `packages/cli/tests/commands/init.test.ts` — preservation, migration, idempotency, A044, and force-add tests.
- **Blast radius:** All three managed surfaces, two platforms. Downstream coupling into `ana init commit`'s force-add path. Ships to **every customer** on next `ana init`/CLI update — including non-Node repos (stock is project-type-independent; see Constraints). The `.ana` change is sequenced **inside the atomic swap window**, so it interacts with crash-safety.
- **Estimated effort:** ~0.5–1 day. One helper + three call sites + commit.ts one-liner + a focused test matrix. Most of the cost is the test matrix and getting legacy migration right, not the merge code.
- **Multi-phase:** no

## Approach

Replace three wholesale `.gitignore` writes with **one merge model, applied at three call sites.**

**The reframe that makes this the minimal correct change:** today we wholesale-write the *entire file*. The fix is to wholesale-write **only our region** — a managed block delimited by sentinels — and leave everything outside it untouched. This preserves the original intent of commit `58f1fac0` (guarantee stock presence after agent-memory was committed by accident) while removing the overreach (destroying lines that were never ours). Not a new mechanism — the same write, scoped.

**Managed-block design** (chosen over naive-union and ownership-tracking — see Rejected Approaches):

```
# >>> Anatomia managed (do not edit) >>>
<stock lines for this surface>
# <<< Anatomia managed <<<

<user content — preserved verbatim, never touched>
```

- **Block first, user content after.** Gitignore is "later pattern wins," so user lines — including `!negations` — take precedence over stock by construction. Deterministic position, no reordering hazard (#6).
- **We regenerate our block wholesale every run.** Add/remove a stock line → the block changes; deprecated stock vanishes, new stock appears; user content is never read for ownership. This is the structural answer to stock evolution (#7) that union cannot provide.
- **One pure helper:** `mergeGitignore(existingContent: string | null, stockBlock: string): string`. Used by all three surfaces. Replaces three wholesale writes — mostly-red diff at the call sites.

**Per-surface wiring (architecture asymmetry — Plan must respect this):**
- `.ana/.gitignore` — written into the **temp tree** by `createDirectoryStructure` *before* the atomic swap. The merge must read the **old live** `.ana/.gitignore` (still present at `existingAnaPath`) and fold its user region into the temp file **inside `preserveUserState`, before the swap destroys the old file** (#9 sequencing). This flips the explicit `.gitignore → NOT copied` policy at state.ts:694.
- `.claude/.gitignore` and `.codex/.gitignore` — written **in place** on the live tree by their `create*Configuration` functions, which run **after** the `.ana` swap. Simple read-before-write; no swap interaction.

**The downstream fix that actually cures the symptom:** add `.claude/scheduled_tasks.lock` to `EXCLUDED_PREFIXES` (commit.ts:47). Gitignoring the lock alone does **not** stop it being committed — it just moves it from the plain-`git add` path to the `git add -f` force-add path (see Edge Cases). The lock needs the **dual treatment** `agent-memory/` and `settings.local.json` already get: gitignored *and* excluded.

## Acceptance Criteria

- **AC1:** After a user adds a line to `.ana/.gitignore`, re-init preserves that line. (Reproduced as currently failing.)
- **AC2:** After a user adds a line to `.claude/.gitignore`, re-init preserves that line.
- **AC3:** `.codex/.gitignore` is created on init with a managed block of Codex-appropriate stock, and user lines survive re-init — parity with the other two surfaces (#702).
- **AC4:** Stock entries are always present and deduped inside the managed block after re-init, even if a user deleted one (stock-guaranteed).
- **AC5:** Re-init twice produces a **byte-identical** `.gitignore` for all three surfaces, with and without user content (idempotency).
- **AC6:** A user `!negation` placed after the managed block continues to win after re-init (negation-order preserved).
- **AC7:** Legacy migration: a pre-existing un-marked file (bare stock lines, no sentinels) is migrated on first re-init — stock lines wrapped into the block, all other lines preserved as user content below.
- **AC8:** `.claude/scheduled_tasks.lock` is in `EXCLUDED_PREFIXES` and is **not** committed by `ana init commit` (neither plain-add nor force-add), and stock `.claude/.gitignore` ignores it.
- **AC9:** The generated/merged `.gitignore` for all three surfaces never ignores `provenance/` (`@ana A044` regression).
- **AC10:** Stock content is identical regardless of project language/framework (no per-language branching).

## Edge Cases & Risks

- **Legacy migration (the one real risk).** Every existing install has an un-marked, already-clobbered file. First re-init under new code must: strip lines matching the current stock set (they regenerate inside the block), wrap the block at top, preserve remaining lines as user content. **Benign failure mode:** a line from *old* stock that we've since removed gets promoted to user content (preserved forever) — an extra ignore line, **not data loss**. Acceptable; test explicitly.
- **Force-add coupling (claim #4 correction).** `discoverGitignoredFiles` (commit.ts:190) enumerates on-disk infra, filters `isExcluded`, then `git check-ignore`-matches → force-adds with `git add -f`. So gitignoring `scheduled_tasks.lock` without excluding it just relocates the commit from the dirty path to the force-add path — still committed. `EXCLUDED_PREFIXES` is the lever.
- **Stock-guaranteed vs. intentional un-ignore (#8).** Block-first/user-after resolves this: stock presence is guaranteed, but a power user can override its *effect* with a `!path` below the block. Present-but-overridable, not paternalistic, not silently dropped. Document as intended.
- **Empty file / comments-only file** — treated as all-user-content; block prepended, content preserved.
- **User line identical to a stock line** — harmless duplication (one inside block, one in user region). Plan decides whether to strip exact stock dups from the user region; default to preserve-verbatim (don't reformat user content).
- **CRLF vs LF** — our block writes LF; user region preserved byte-for-byte (including their CRLF). Do not normalize user content.
- **Missing/absent trailing newline** — block ends with a newline; user region preserved as-is.
- **`.gitignore` deleted by user before re-init** — no existing file → write block only (fresh path), empty user region.
- **Symlink / wrong permissions** — `.ana` path uses atomic rename (replaces a symlink with a regular file); the current `.claude` in-place `fs.writeFile` follows symlinks. Behavior may differ across surfaces. Enumerate; Plan decides whether to detect+warn. Low priority.
- **Marker collision** — sentinel format `# >>> Anatomia managed (do not edit) >>>` … `# <<< Anatomia managed <<<` chosen to be unmistakable and not collide with plausible user content. If a user hand-wrote a matching marker, the parser must fail safe (treat unrecognized/partial markers as user content, never delete).
- **Crash mid-merge.** `.ana` merge happens before the swap on the temp file; a crash leaves the old `.ana/` intact (swap never started) — no partial merge in the live tree. `.claude`/`.codex` in-place writes should route through the atomic write helper so a crash leaves old-or-new, never truncated.

## Rejected Approaches

- **Naive union (old ∪ new-stock, dedup).** Disqualified by stock evolution (#7): a removed-stock line is byte-identical to a user-added line, so old stock accretes forever or you risk deleting user content. Also order-fragile — appending stock after user lines can silently flip a user `!negation` (#6). Simplest to write, wrong model.
- **Ownership tracking (side-file manifest of "our lines").** Over-engineered: a side-channel state file is machinery to manage a problem the managed block removes by partitioning the file positionally. New file = new failure modes (drift, deletion, merge conflicts). The elegant solution removes; the managed block *is* ownership-tracking via in-file sentinels, no side-file.
- **Issue #292's two-part fix as written** (merge + add lock to stock). Incomplete: omits `EXCLUDED_PREFIXES`, so the lock still force-adds; omits `.codex/` entirely; doesn't address stock evolution or legacy migration.

## Open Questions

- **Codex stock content.** What belongs in `.codex/.gitignore`? `commit.ts` `EXCLUDED_PREFIXES` already references `.codex/settings.local.json` and `.codex/agent-memory/` as per-developer files — these are the natural stock. Plan should confirm against what a real Codex install actually generates (the proof chain flags Codex install paths as untested / unconfirmed against a live install — `session-capture` findings). Mirror the `.claude` stock shape.
- **Dedup of user lines that equal stock** — preserve-verbatim vs strip-exact-dups. Recommend preserve-verbatim. Plan's call.

## Exploration Findings

### Patterns Discovered
- `.ana/.gitignore` stock — assets.ts:96–102 (string constant: `state/`, `worktrees/`, `plans/active/*/.captures/`). No language branching.
- `.claude/.gitignore` stock — assets.ts:224–227 (`agent-memory/`, `settings.local.json`). Written fresh at :236, clobbered in-place at :251.
- `.codex/` config — assets.ts:758–793: writes `agents/`, `config.toml`, `hooks.json`. **No `.gitignore` write site.**
- settings.json merge — assets.ts:258–272: `mergeHooksSettings` + `pruneHookCommand`. **JSON object merge — pattern analog only, not code analog.**
- `atomicWriteFile` — assets.ts:152–183: temp-write + SHA-256 verify + rename. The crash-safe write primitive to route in-place `.gitignore` writes through.
- Force-add — commit.ts: `EXCLUDED_PREFIXES` (47), `discoverDirtyFiles` (98, filters `isExcluded`), `discoverGitignoredFiles` (190, `git check-ignore` → force-add), force-add execution (501–533).

### Constraints Discovered
- [TYPE-VERIFIED] `preserveUserState` (state.ts:706) holds both `existingAnaPath` and `tmpAnaPath` — the only place with access to the **old** `.ana/.gitignore` before the swap. The `.ana` merge belongs here.
- [TYPE-VERIFIED] Orchestration order (index.ts): `createDirectoryStructure` (116, writes temp `.ana/.gitignore`) → `preserveUserState` (124) → swap (134–136) → `createClaude/CodexConfiguration` (169–172, in-place, post-swap).
- [OBSERVED] `createDirectoryStructure` is also called standalone in tests (the A044 test, init.test.ts:57) — block-writing must stay there; user-area preservation stays in `preserveUserState`.
- [OBSERVED] Empirically reproduced: both `.ana` and `.claude` user lines clobbered on re-init; `.codex/.gitignore` absent. Repro on a bare non-framework `package.json` → identical stock (confirms project-type independence).

### Test Infrastructure
- `tests/commands/init.test.ts` — re-init preservation patterns at 648–873 (`preserveUserState(existingAnaPath, tmpAnaPath, newConfig)` against a seeded existing `.ana/`). Mirror these for `.gitignore`.
- A044 contract test at :56–61 (`createDirectoryStructure` → assert `.gitignore` omits `provenance`). Extend to all three surfaces.
- Codex re-init test at :1010 (`re-init overwrites Codex instruction body while preserving .agent.toml config`) — mirror for `.codex/.gitignore`.

## For AnaPlan

### Structural Analog
**`settings.json` merge — assets.ts:258–272 — is the PATTERN analog, NOT the code analog.** Same shape: read existing → merge stock idempotently → preserve user content → write. But it's a *JSON object* merge (`mergeHooksSettings`). `.gitignore` is **line/text** — do not reuse the JSON-merge code. The right mechanic is a managed-block text merge. The structural lesson to copy is the *read-merge-preserve-write* discipline and the dedup-safe idempotency, not the implementation.

### Relevant Code Paths
- `packages/cli/src/commands/init/assets.ts` — `createDirectoryStructure` (~73), `atomicWriteFile` (152), `createClaudeConfiguration` (~199), `createCodexConfiguration` (758), `applyCodexCaptureHooks` (809).
- `packages/cli/src/commands/init/state.ts` — `preserveUserState` (706), the preservation-contract doc comment (675–705), the `.gitignore → NOT copied` policy line (694).
- `packages/cli/src/commands/init/commit.ts` — `EXCLUDED_PREFIXES` (47), force-add discovery + execution (190, 481–533).
- `packages/cli/src/commands/init/index.ts` — orchestration + swap (116–172).

### Patterns to Follow
- Route in-place `.gitignore` writes through `atomicWriteFile` (assets.ts:152) for crash safety — don't add a second write primitive.
- Keep stock as string constants (no language branching) — preserves cross-customer safety.
- One `mergeGitignore` helper, three call sites — the elegant-removal move; don't inline three variants.

### Known Gotchas
- The `.ana` merge MUST run before the atomic swap, reading from `existingAnaPath`. Putting it in a `create*Configuration` function (post-swap) would read the already-swapped fresh file and lose the user lines.
- Adding `scheduled_tasks.lock` to stock `.gitignore` without adding it to `EXCLUDED_PREFIXES` does NOT stop the commit — it relocates it to the force-add path. Both changes are required for AC8.
- `discoverGitignoredFiles` follows symlinks via `readdirSync` recursive (existing proof finding `gitignore-force-add-C2`) — don't widen that surface.
- Marker parser must fail safe: a partial/duplicate/hand-authored sentinel must degrade to treating content as user-owned, never delete.

### Things to Investigate
- Confirm Codex's actual per-developer runtime files for the `.codex/.gitignore` stock (live-install behavior is unconfirmed per proof chain).
- Decide preserve-verbatim vs strip-exact-stock-dups in the user region (recommend preserve).
- Decide whether symlink/permission edge cases warrant detect+warn or are out of scope (recommend out of scope, documented).
