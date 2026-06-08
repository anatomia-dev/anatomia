# Spec: Cross-machine provenance — Phase 1 (write + assemble)

**Created by:** AnaPlan
**Date:** 2026-06-07
**Scope:** .ana/plans/active/cross-machine-provenance/scope.md

## Approach

Today, session provenance is written to a home-global buffer (`~/.ana/forensics/sessions.jsonl`) by a SessionStart hook and a SessionEnd/Stop `--derive` hook, then reconciled at `ana work complete` by matching worktree paths. A home-global file does not cross machines, so a team pipeline (Plan on laptop A, Build on B, Verify on C) yields a silently incomplete proof.

This phase moves capture onto the **`ana artifact save`** checkpoint — the only place where the work-item slug, the harness session, and the on-disk transcript are all available locally — and writes a self-contained per-session file into the work item so it travels git like every other artifact.

Three parts, all in this phase:

1. **`ANA_RUN_ID` correlation key.** `buildCaptureEnv` (run.ts) mints one UUID per launch and injects it. It is the only key shared by both the SessionStart hook and the in-session `ana artifact save` on both harnesses.
2. **SessionStart hook → pointer only.** `ana _capture` (no `--derive`) records `{ session_id, transcript_path, model, source }` into `~/.ana/forensics/pending/{ANA_RUN_ID}.json`. No derive, no git — stays inside the hook's total/never-throw/<250ms contract. The `--derive` branch becomes a tolerated no-op (see Gotchas — cross-version safety).
3. **Derive + write + commit at save.** Both `saveArtifact` and `saveAllArtifacts` call a new `captureProvenanceAtSave` helper that resolves the session, derives counts via `deriveTranscript`, writes `.ana/plans/active/{slug}/provenance/{role}-{session_id}.json`, stages it into the existing `--no-verify` scoped commit, deletes the consumed pointer, and prunes orphan pointers.

**Removal (this phase):** the entire home buffer — `appendSessionRecord`, `updateSessionRecord`, `buildSessionRecord`, `getForensicsBufferPath`, the `SessionRecord` interface — `recordBelongsToWorktree` (the worktree-matching mechanism), and `cost_usd` from `ProvenanceCounts`. `executeDerive`'s body is deleted; the `--derive` flag is *kept* as a no-op.

**Why assembly is in this phase, not Phase 2:** deleting the buffer API (`SessionRecord`, `getForensicsBufferPath`) breaks its only other consumer, `work-proof.ts` — tsc would fail. The buffer deletion and the assembly rewrite are type-coupled and must land together. So this phase also rewrites `assembleProcessAttestation` to read the committed `provenance/*.json` from the merged tree (and deletes `recordBelongsToWorktree`), producing the per-session dataset. The **completeness check**, the **`processCaptureStrict` gate**, the **cross-machine/squash fixtures**, and the **finalized cost-at-display** are Phase 2. The hook install/prune in `ana init` is Phase 3.

Existing installs keep working through this phase because the SessionStart command string (`ana _capture`) is unchanged and `--derive` still exits 0.

## Output Mockups

**Pointer file** `~/.ana/forensics/pending/{run_id}.json` (transient, deleted on consume):
```json
{
  "session_id": "0f9c2a1e-7b3d-4c8a-9e21-5f6b7c8d9e01",
  "transcript_path": "/Users/dev/.claude/projects/-Users-dev-app/0f9c2a1e-....jsonl",
  "model": "claude-opus-4",
  "source": "startup",
  "captured_at": "2026-06-07T22:00:00.000Z"
}
```

**Committed provenance file** `.ana/plans/active/{slug}/provenance/build-0f9c2a1e-....json` (one per session; `derived` omitted only when the transcript is unreadable):
```json
{
  "role": "build",
  "harness": "claude",
  "model": "claude-opus-4",
  "agent_def_hash": "sha256:ab12...",
  "cli_version": "1.2.2",
  "session_id": "0f9c2a1e-7b3d-4c8a-9e21-5f6b7c8d9e01",
  "derived": {
    "tokens": { "input": 1200, "output": 4300, "cache_create": 0, "cache_read": 88000 },
    "price_table_version": "2026-06-01",
    "duration_ms": 540000,
    "turns": 22,
    "tool_calls": 41,
    "commands_run": 12,
    "tests_executed": 318,
    "failures_encountered": 0,
    "files_touched": 6,
    "model": "claude-opus-4"
  }
}
```
Note: **no `cost_usd`** in the committed object. `tokens` + `model` + `price_table_version` are committed; cost is computed at display (Phase 2).

**Save UX is unchanged** on the happy path — provenance staging is silent. A true no-work re-validation still prints `No changes to save — artifact is already up to date.` and exits 0 (see the no-changes guard scoping below).

## File Changes

### packages/cli/src/commands/run.ts (modify)
**What changes:** In `buildCaptureEnv`, mint a per-launch `ANA_RUN_ID` with `randomUUID()` and add it to the returned record. Import `randomUUID` from `node:crypto` (the file already imports `createHash` from `node:crypto` — extend that import).
**Pattern to follow:** The existing additive record return at run.ts:146–152. Add `ANA_RUN_ID: randomUUID()` as a sixth field. Update the JSDoc bullet list (run.ts:104–109) to document `ANA_RUN_ID`.
**Why:** Without a shared correlation key, the in-session `ana artifact save` cannot find which transcript belongs to its launch — concurrency-safely, across both harnesses.

### packages/cli/src/utils/forensics.ts (modify)
**What changes:**
- **Delete the home-buffer machinery:** `SessionRecord` interface, `getForensicsBufferPath`, `buildSessionRecord`, `appendSessionRecord`, `updateSessionRecord`. Keep `HookPayload`, `parseHookPayload`, `isProcessCaptureEnabled`, `deriveTranscript`, the `readString`/`readNumber`/`readObject` helpers, and the Claude/Codex derive functions.
- **Drop `cost_usd` from `ProvenanceCounts`** (the interface and both `deriveClaude`/`deriveCodex` return objects). Remove the `computeCost(...)` calls in the derive functions; set `price_table_version: PRICE_TABLE_VERSION` directly (import `PRICE_TABLE_VERSION` from `../data/pricing.js`; `computeCost` is no longer imported here). `model` and `tokens` stay.
- **Add the pointer + provenance-file layer** (new exported functions):
  - `getPendingDir(): string` → `~/.ana/forensics/pending`.
  - `writePendingPointer(runId, pointer): void` — write `{run_id}.json`. Total/never-throw (the hook calls it).
  - `readPendingPointer(runId): PendingPointer | null` — read + JSON.parse, null on any failure.
  - `deletePendingPointer(runId): void` — best-effort unlink.
  - `prunePendingPointers(maxAgeMs): void` — delete `pending/*.json` whose file mtime is older than `maxAgeMs`. Best-effort; swallow errors.
  - `captureProvenanceAtSave(projectRoot, slug, env): string | null` — the orchestrator the save sites call. Resolves the session (see Session resolution below), derives counts, writes `provenance/{role}-{session_id}.json` under `.ana/plans/active/{slug}/`, deletes the consumed pointer, prunes orphans (72h), and returns the **absolute path written** (or `null` if no session/role resolves or capture is off). Total/never-throw — a capture failure must never break a save.
- **New types:** `PendingPointer { session_id: string; transcript_path: string; model: string; source: string; captured_at: string }` and `CommittedProvenance` (the committed file shape — identical to the `SessionProvenance` interface in `src/types/proof.ts`: `role`, `harness`, `model`, `agent_def_hash`, `cli_version`, `session_id`, `derived?`). Import `SessionProvenance` as the file shape rather than redefining it, to keep the writer and the Phase-2 reader on one type.
**Pattern to follow:** The existing total/never-throw style in this file (every public fn swallows IO via try/catch and degrades to a default). Mirror `isProcessCaptureEnabled`'s gate read. Keep `deriveTranscript` unchanged except for the `cost_usd` removal.
**Why:** The buffer is the disease — a home-global channel that does not cross machines. Per-session committed files replace it and travel git for free.

**Session resolution (inside `captureProvenanceAtSave`):**
1. `role` ← `env.ANA_ROLE` (skip capture and return `null` if empty).
2. `runId` ← `env.ANA_RUN_ID`. If present, read the pointer → `session_id`, `transcript_path`, `model`.
3. **Claude fallback** when no pointer/session: `session_id` ← `env.CLAUDE_CODE_SESSION_ID`; resolve the Claude transcript path from the session id if `transcript_path` is empty (reuse the existing Claude path convention — the session id equals the transcript filename). **Codex** has no fallback (returns `null` → surfaces as a completeness gap in Phase 2).
4. If `transcript_path` is empty but `session_id` is set, attempt the existing Codex glob (`resolveTranscriptPath` logic currently in `_capture.ts` — move/share it; see below).
5. `deriveTranscript(transcript_path, env.ANA_HARNESS)` → counts (or `null`/omitted on unreadable transcript). A session with no derivable counts is still written (metadata-only) so it stays visible.
6. Identity fields from env: `harness` ← `ANA_HARNESS`, `agent_def_hash` ← `ANA_AGENT_DEF_HASH`, `cli_version` ← `ANA_CLI_VERSION`, `model` ← derived model || pointer model || ''.

### packages/cli/src/commands/_capture.ts (modify)
**What changes:**
- `executeCapture` writes a **pointer** keyed by `ANA_RUN_ID` instead of appending a buffer record. Read `process.env.ANA_RUN_ID`; if absent, no-op (nothing to correlate). Build the `PendingPointer` from the payload (`session_id`, `transcript_path`, `model`, `source`) + `captured_at`, call `writePendingPointer`. Keep the project-root + gate + `session_id` guards exactly as they are.
- **Delete `executeDerive`'s body** and the buffer import. The `--derive` flag stays declared on the command but its action becomes a pure no-op that exits 0 (see Gotchas). `detectHarness`/`resolveTranscriptPath` move to `forensics.ts` (shared with `captureProvenanceAtSave`) — or keep `resolveTranscriptPath` exported from forensics and import it here if still needed; `executeDerive` no longer needs them.
- Update imports: drop `appendSessionRecord`, `buildSessionRecord`, `updateSessionRecord`; add the pointer writer.
**Pattern to follow:** The total/never-throw contract documented in this file's header — preserve it verbatim. The SessionStart guard chain (project root → gate → session_id) at executeCapture:117–132.
**Why:** The hook must do no git and no derive (the total contract); it only records a pointer the save later consumes.

### packages/cli/src/commands/artifact.ts (modify — BOTH save sites)
**What changes:** In **both** `saveArtifact` (single) and `saveAllArtifacts` (bundle), immediately before the no-changes guard (saveArtifact ~line 1248; saveAllArtifacts ~line 1663), after `.saves.json` is staged:
1. Call `captureProvenanceAtSave(projectRoot, slug, process.env)`.
2. If it returns a path, `git add` the path's project-relative form and push it onto a **separate** `provenancePaths` array (NOT `stagedPaths`).
3. **No-changes guard scoping (AC9):** the guard's `git diff --staged --quiet -- ...` must check **artifact paths only** (`stagedPaths`), NOT `provenancePaths`. So a true no-work re-validation (artifact byte-identical) still hits status 0 → "No changes to save" → exit 0. Before that exit, `git reset -- ...provenancePaths` to avoid leaving a provenance file staged-but-uncommitted.
4. **Commit pathspec:** the `git commit --no-verify -m ... -- ...` pathspec includes **both** `stagedPaths` and `provenancePaths`, so when artifacts DID change, provenance rides the same commit (AC5 — same commit, no extra commit).
**Pattern to follow:** The "Wiring BOTH save sites is required" precedent (artifact.ts:1477) — both `saveArtifact` and `saveAllArtifacts` are independent paths; wire identically. The existing `.saves.json` stage-then-guard sequence (1240–1254 / 1654–1668) is the structural template. The existing commit at 1262 / 1676.
**Why:** The save already commits `--no-verify` with a scoped pathspec and pushes — provenance folds into that exact commit so it travels the role-correct branch with zero extra git work.

### packages/cli/src/commands/work-proof.ts (modify)
**What changes:**
- **Delete `recordBelongsToWorktree`** (the 48–84 worktree-matching function) and its `fs`-based transcript-scan logic — the matching mechanism is obsolete now that provenance is committed per-session.
- **Rewrite `assembleProcessAttestation`** to read committed files instead of the home buffer: read every `*.json` under `path.join(projectRoot, '.ana', 'plans', 'completed', slug, 'provenance')`, JSON.parse each (skip unparseable), and collect them as `SessionProvenance[]`. The active dir is already `cp`'d to `completed/` before `writeProofChain` runs (work.ts:1154), so the merged-tree content is present. Drop the `getForensicsBufferPath`/`SessionRecord`/`updateSessionRecord` imports; keep `isProcessCaptureEnabled`. Keep the existing deterministic sort (by `timestamp` if present, else by `session_id`; the committed files have no `timestamp` field — sort by `role` then `session_id` for stable ordering) and the existing `outcome`/`task_shape`/`module_churn` assembly unchanged.
- Return `null` only when `isProcessCaptureEnabled` is false (unchanged). When capture is on, return the attestation even if zero provenance files were found — an empty `sessions[]` is a valid (and, in Phase 2, loudly-incomplete) result. **Note:** the *completeness* field and the empty-sessions "loud" handling are added in Phase 2; in this phase, an empty match simply yields `sessions: []` (do not early-return `null` on zero sessions — that re-introduces silence). Existing tests that asserted `null` on no-buffer must be updated to the committed-file model.
**Pattern to follow:** The current `assembleProcessAttestation` structure (work-proof.ts:115–200) — keep the `outcome`/`task_shape`/`module_churn`/`findings` assembly; replace only the record-sourcing (buffer read + `recordBelongsToWorktree` filter) with the committed-file read. The per-session `derived` is now read directly from the file (no re-derive needed — the file already carries it), so drop the `record.derived ?? deriveTranscript(...)` fallback.
**Why:** Reading committed files is the whole point — assembly no longer depends on any machine's home state, local transcript, or worktree paths (AC2/AC7).

### packages/cli/src/commands/proof.ts (modify — minimal, build-green only)
**What changes:** The provenance display reads `s.derived.cost_usd` at proof.ts:454 and :469. Since `cost_usd` is removed from `ProvenanceCounts`, change those two expressions to compute from the committed tokens/model: `computeCost(s.derived.tokens, s.derived.model).cost_usd` (import `computeCost` from `../data/pricing.js`). This is the minimum to keep tsc/`pnpm run build` green. The full display polish (showing the completeness verdict, finalized total) is Phase 2 — touch ONLY these two expressions here.
**Pattern to follow:** The existing per-session display loop (proof.ts:445–475).
**Why:** `pnpm run build` runs `tsc --noEmit` via pre-commit; a dangling reference to the removed field fails the build.

## Acceptance Criteria

- [ ] `buildCaptureEnv` returns `ANA_RUN_ID` as a non-empty UUID; the env merge stays additive over `process.env`.
- [ ] The SessionStart `ana _capture` writes a pointer at `~/.ana/forensics/pending/{ANA_RUN_ID}.json` containing `session_id` (+ `transcript_path` when present); it writes no buffer file and performs no git.
- [ ] `ana _capture --derive` is accepted and exits 0 as a no-op (no pointer, no buffer, no throw).
- [ ] `captureProvenanceAtSave` writes `.ana/plans/active/{slug}/provenance/{role}-{session_id}.json` with the committed shape (no `cost_usd`), deletes the consumed pointer, and returns the written path.
- [ ] A re-save by the same session overwrites the same provenance file (latest counts win); a different session writes a distinct file.
- [ ] Provenance is staged into the SAME commit as the artifact in both `saveArtifact` and `saveAllArtifacts` — no extra commit, no git work in the hook.
- [ ] A true no-work re-validation (artifact unchanged) still prints "No changes to save" and exits 0, with no provenance file left staged.
- [ ] `ProvenanceCounts` no longer has `cost_usd`; `deriveTranscript` output carries `tokens` + `model` + `price_table_version`.
- [ ] The home buffer (`sessions.jsonl`) and `appendSessionRecord`/`updateSessionRecord`/`buildSessionRecord`/`getForensicsBufferPath`/`SessionRecord`/`recordBelongsToWorktree` are deleted; `grep` finds no remaining references in `src/`.
- [ ] `assembleProcessAttestation` reads committed `completed/{slug}/provenance/*.json` (no buffer, no worktree matching), returns one `SessionProvenance` per file, and returns `null` only when capture is off (not when sessions are empty).
- [ ] Orphan pointers older than 72h are pruned opportunistically at save; the pending dir does not grow unbounded.
- [ ] No transcript bodies are written anywhere — only derived counts/metadata.
- [ ] `pnpm run build` succeeds; `pnpm vitest run` passes with test count not decreased.

## Testing Strategy

- **Unit (`tests/utils/forensics*.test.ts`):** rewrite buffer tests to the pointer + provenance-file model. Cover: `writePendingPointer`/`readPendingPointer`/`deletePendingPointer` round-trip; `prunePendingPointers` deletes by mtime past 72h and keeps fresh ones; `captureProvenanceAtSave` writes the committed shape, omits `cost_usd`, omits `derived` on an unreadable transcript, overwrites on re-save, returns `null` when `ANA_ROLE` is empty or capture is off. `deriveTranscript` tests drop `cost_usd` assertions and assert `price_table_version` + `tokens` + `model`. Use temp dirs (`fs.mkdtemp`) for both the fake project (`.ana/ana.json` with `processCapture: 'on'`) and the fake home/pending dir — inject the home dir via an explicit arg or by setting `process.env.HOME`/`os.homedir` indirection; prefer passing the pending dir resolvable from a constant and pointing `os.homedir()` at the temp dir if the existing tests already do so (mirror the current forensics test setup).
- **Unit (`tests/commands/_capture.test.ts`):** drive the compiled CLI with stdin payloads (existing harness). Assert: SessionStart writes the pointer file (not the buffer); `--derive` exits 0 and writes nothing; missing `ANA_RUN_ID` no-ops; gate-off no-ops. **Build (`pnpm run build`) must precede these** — they spawn `dist`.
- **Integration (`tests/commands/artifact*.test.ts` or a new `artifact-provenance.test.ts`):** in a temp git repo (`git init -b main`), with `processCapture: 'on'`, a seeded pointer, and a fake transcript, run `ana artifact save` and `ana artifact save-all`: assert the provenance file is created AND committed in the SAME commit as the artifact (one new commit, `git show --stat` lists both). Assert the no-work re-validation path: second save with identical artifact prints "No changes to save", exits 0, and leaves no staged provenance.
- **Unit (`tests/commands/work-proof-process.test.ts`):** rewrite from the buffer model to the committed-file model. Seed `completed/{slug}/provenance/{role}-{id}.json` files directly (no home buffer), then assert `assembleProcessAttestation` returns one `SessionProvenance` per file with the right roles/counts, that it ignores home state entirely, and that capture-off returns `null` while capture-on with zero files returns an attestation with `sessions: []`. Keep the existing `outcome`/`task_shape`/`module_churn` assertions.
- **Edge cases:** unreadable/binary transcript → `derived` omitted, file still written; missing pointer + Claude fallback via `CLAUDE_CODE_SESSION_ID`; missing pointer + Codex → `null` (no file); two distinct `ANA_RUN_ID`s → two distinct pointers and two distinct provenance files (concurrency); an unparseable provenance file is skipped by assembly, never thrown.

## Dependencies

None — this is the first phase. `deriveTranscript`, `computeCost`/`PRICE_TABLE_VERSION`, `isProcessCaptureEnabled`, `parseHookPayload` already exist and are reused.

## Constraints

- **Total hook contract:** `_capture` never throws, never blocks, exits 0, makes no network call, prints nothing on the happy path, stays <250ms. No git, no derive in the hook.
- **`captureProvenanceAtSave` is total** — any failure returns `null`; a capture failure must never fail or alter an `ana artifact save`.
- Both Claude and Codex must work (Codex transcript glob fallback; Codex `.jsonl` plain, no zstd).
- Must work when the agent launched from any directory — the slug is the save arg, the transcript is found via the pointer/`ANA_RUN_ID`, never via cwd.
- Test count must not decrease (CI enforces; coverage thresholds in vitest.config.ts).

## Gotchas

- **Cross-version `--derive` safety (going past the scope, deliberate):** the CLI updates via npm independently of `ana init`. A customer who upgrades but has not re-init'd still has the old `ana _capture --derive` hook in `.claude/settings.json` / `.codex/hooks.json`. If the `--derive` option is *removed*, commander errors on the unknown option *inside their live session*, breaking the total contract. So **keep `--derive` declared** and make its action a pure no-op (`process.exit(0)`). Phase 3 prunes the hook from configs; this flag tolerance protects un-pruned installs indefinitely.
- **No-changes guard must not absorb provenance:** if `provenancePaths` were included in the guard's diff, the guard would never fire (the transcript always grows between saves) and every re-save would commit. Keep `provenancePaths` out of the guard, include it only in the commit pathspec, and `git reset` it on the no-op exit. This is the crux of AC9 — get it exactly right.
- **`cost_usd` removal ripples to Phase 2:** `proof.ts` currently reads `s.derived.cost_usd` (proof.ts:454/469). That line breaks once `cost_usd` is gone. **Phase 2 owns the display fix** — but `pnpm run build` (tsc via pre-commit) will fail in this phase if `proof.ts` still references the removed field. Resolution: in this phase, change the two `proof.ts` cost lines to compute via `computeCost(s.derived.tokens, s.derived.model).cost_usd` so the build stays green; Phase 2 formalizes the display. (Touch only those two expressions — the full display rework is Phase 2.)
- **`os` import:** the Codex glob fallback uses `os.homedir()`/`CODEX_HOME`; keep `node:os` imported wherever that logic lives.
- **Don't touch `executeCapture`-style symbols in `src/commands/test.ts`** — unrelated.
- **Provenance for `ana`/`learn` roles is captured too** (any role with a resolvable session) — the dataset includes them; Phase-2 completeness simply doesn't require them. Do not special-case roles in the writer.
- **`captured_at` / prune use wall-clock** (`new Date()` / file mtime) — that is fine here; this is runtime capture code, NOT the deterministic `deriveTranscript` path (which must stay clock-free).

## Build Brief

### Rules That Apply
- All relative imports end in `.js`; built-ins use the `node:` prefix. Omitting `.js` crashes the built ESM CLI at runtime.
- `import type` for type-only imports, separate from value imports.
- Named exports only; explicit return types on all exported functions; `@param`/`@returns` JSDoc on exported functions (eslint pre-commit enforces).
- Avoid `any` — narrow `unknown` with the existing `readString`/`readNumber`/`readObject` guards for untyped transcript/payload boundaries.
- Total/never-throw functions swallow IO in `try/catch` and degrade to a default — never surface errors from `_capture` or `captureProvenanceAtSave`.
- Tests: temp dirs via `fs.mkdtemp`; force `git init -b main` in any git-repo fixture (CI default-branch varies); `pnpm run build` before any test that spawns `dist`; assert specific counts, not `toBeGreaterThan`.

### Pattern Extracts

Additive env return — extend with `ANA_RUN_ID` (run.ts:146–152):
```ts
  return {
    ANA_HARNESS: platform,
    ANA_ROLE: agentSuffix || 'ana',
    ANA_SLUG: slug,
    ANA_CLI_VERSION: getCliVersionSync(),
    ANA_AGENT_DEF_HASH: agentDefHash,
  };
```

Stage-then-guard-then-commit, single-save (artifact.ts:1239–1262) — insert provenance capture before line 1249, keep guard on `stagedPaths` only, add `provenancePaths` to the commit pathspec:
```ts
  const savesPath = path.join(slugDir, '.saves.json');
  if (fs.existsSync(savesPath)) {
    try {
      const savesRelPath = path.relative(projectRoot, savesPath);
      runGit(['add', savesRelPath], { cwd: projectRoot });
      stagedPaths.push(savesRelPath);
    } catch { /* */ }
  }

  // 8a. Check if there are staged changes
  const diffResult = spawnSync('git', ['diff', '--staged', '--quiet', '--', ...stagedPaths], { cwd: projectRoot });
  if (diffResult.status === 0) {
    console.log(chalk.yellow('No changes to save — artifact is already up to date.'));
    process.exit(0);
  }
  ...
  const commitResult = spawnSync('git', ['commit', '--no-verify', '-m', commitMessage, '--', ...stagedPaths], { stdio: 'pipe', cwd: projectRoot });
```

Total/never-throw gate read to mirror (forensics.ts:226–235):
```ts
export function isProcessCaptureEnabled(projectRoot: string): boolean {
  let anaJson: Record<string, unknown>;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(projectRoot, '.ana', 'ana.json'), 'utf-8')) as unknown;
    anaJson = AnaJsonSchema.parse(raw) as Record<string, unknown>;
  } catch {
    return false;
  }
  return anaJson['processCapture'] === 'on';
}
```

### Proof Context
Run `ana proof context src/commands/artifact.ts src/utils/forensics.ts src/commands/_capture.ts src/commands/run.ts` and review. The structural analog is the completed `session-capture` work — read its `verify_report_2_r1.md` for the human-FAIL on the `recordBelongsToWorktree` prefix collision (the matching mechanism this rework deletes). No other active proof findings are expected on these files; state so in the build report if `ana proof context` returns none.

### Checkpoint Commands
- After forensics.ts + run.ts changes: `(cd packages/cli && pnpm vitest run tests/utils/forensics.test.ts tests/utils/forensics-derive.test.ts)` — Expected: pass.
- After `_capture.ts`: `(cd packages/cli && pnpm run build && pnpm vitest run tests/commands/_capture.test.ts)` — Expected: pass (build first; the test spawns `dist`).
- After artifact.ts: `(cd packages/cli && pnpm run build && pnpm vitest run tests/commands/artifact*.test.ts)` — Expected: pass.
- After work-proof.ts: `(cd packages/cli && pnpm run build && pnpm vitest run tests/commands/work-proof-process.test.ts)` — Expected: pass on the committed-file model.
- After all changes: `pnpm run test -- --run` — Expected: full suite green, count ≥ baseline.
- Lint: `pnpm run lint`.

### Build Baseline
Measured 2026-06-07 via `pnpm run test -- --run`:
- Current test files: **145 passed**
- Current tests: **3528 (3526 passed, 2 skipped)**
- Command used: `pnpm run test -- --run`
- After build: expect 3528 + new tests across the rewritten forensics/_capture/artifact/work-proof suites; **count must not drop below 3528**. Regression focus: `tests/commands/work-proof-process.test.ts` (rewritten to the committed-file model in THIS phase — replace every buffer assertion, skip none); `tests/commands/proof*.test.ts` (the two `cost_usd` display expressions change to `computeCost(...)`); any test importing a deleted forensics buffer symbol.
