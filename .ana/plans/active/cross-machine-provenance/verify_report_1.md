# Verify Report: Cross-machine provenance — Phase 1 (write + assemble)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-08
**Spec:** .ana/plans/active/cross-machine-provenance/spec-1.md
**Branch:** feature/cross-machine-provenance

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../cross-machine-provenance/contract.yaml
  Seal: INTACT (hash sha256:300546c9ebe06e0342606d1641dbc6e6f915113038dcfbf878d0bb7cad0db4af)
```

Seal status: **INTACT** — contract unmodified since the planner sealed it.

**Build:** `pnpm run build` — success (tsc --noEmit + tsup ESM, both packages green).
**Tests (sealed, full suite):** 3540 passed, 0 failed, 2 skipped (3542 total). Baseline was 3528 total (3526p/2s) → **+14, no decrease**.
**Focused Phase 1 suites:** forensics, forensics-derive, _capture, work-proof-process, artifact-provenance — 72 passed.
**Lint:** `pnpm run lint` — 0 errors. 3 pre-existing warnings, none in Phase 1's changed source (git-operations.ts unused-disable; website unused var).

Sealed verify-run marker:
```
<!-- ana:capture stage=verify slug=cross-machine-provenance counts=3540p/0f/2s verdict=pass sha256=070ef8e8802a4d3a95a35f2dd5add6205034687f8e0ee9c2281168b5d49198e3 -->
```

**Scope note:** This is Phase 1 of 3. Assertions **A001–A020** are in scope. A021–A046 belong to Phases 2 & 3 and are verified independently when those phases build.

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Every launched agent gets a unique run id | ✅ SATISFIED | `run.ts:156` adds `ANA_RUN_ID: randomUUID()`; test `run.test.ts:633` asserts defined, non-empty, UUID-format. |
| A002 | Tagging a session never strips existing env | ✅ SATISFIED | `run.test.ts:685` builds `{...process.env, ...env}`, asserts `spawnEnv.PATH` defined and `env` keys all `ANA_*`. |
| A003 | Session start records a lightweight pointer | ✅ SATISFIED | `_capture.ts:136-143` writes pointer; tests `forensics.test.ts:121` (unit) + `_capture.test.ts:98` (compiled CLI) assert `pointer.session_id`. |
| A004 | Session-start hook writes no buffer | ✅ SATISFIED | `forensics.test.ts:133` and `_capture.test.ts:115` assert `sessions.jsonl` / homeBuffer does not exist. |
| A005 | Retired `--derive` is a harmless no-op | ✅ SATISFIED | `_capture.ts:157` empty body, action always `process.exit(0)`; test `_capture.test.ts:220` asserts exit 0, no pointer/buffer. Live-checked: `--derive` exits 0. |
| A006 | Each role's session is its own provenance file | ✅ SATISFIED | `forensics.ts:713` writes `provenance/{role}-{session_id}.json`; test `forensics.test.ts:197` asserts the exact path and `prov.session_id`. |
| A007 | Provenance carries tokens/model, never cost_usd | ✅ SATISFIED | `cost_usd` removed from `ProvenanceCounts`; tests `forensics.test.ts:216`, `forensics-derive.test.ts:176/231`, `artifact-provenance.test.ts:181` assert committed JSON `not.toContain('cost_usd')`. grep confirms no `cost_usd` in `ProvenanceCounts`. |
| A008 | Derived counts include the token totals | ✅ SATISFIED | `derived.price_table_version` set to `PRICE_TABLE_VERSION`; tests `forensics.test.ts:212`, `forensics-derive.test.ts:174/230` assert `'2026-06-01'`. |
| A009 | Provenance ships in the artifact's own commit | ✅ SATISFIED | `artifact.ts:1281` commit pathspec `...stagedPaths, ...provenancePaths`; integration test `artifact-provenance.test.ts:148` asserts exactly 1 new commit listing both files. |
| A010 | save-all also ships provenance in that commit | ✅ SATISFIED | `artifact.ts:1711` same pattern; test `artifact-provenance.test.ts:188` asserts 1 commit, both files. |
| A011 | Re-save by same session → one file | ✅ SATISFIED | overwrite same path; test `forensics.test.ts:266` asserts `listProvenance` equals `['build-sess-1.json']` (count 1). |
| A012 | Separate sessions → separate files | ✅ SATISFIED | test `forensics.test.ts:284` asserts two distinct files (count 2). |
| A013 | No-work re-check exits 0 without committing | ✅ SATISFIED | guard on `stagedPaths` only + `git reset` provenance; test `artifact-provenance.test.ts:255` asserts `exitCode === 0`, no new commit. |
| A014 | No-work re-check prints the up-to-date message | ✅ SATISFIED | test `artifact-provenance.test.ts:256` asserts stdout contains `"No changes to save"`. |
| A015 | No raw conversation text in the committed record | ✅ SATISFIED | derive emits only counts/metadata; tests `forensics.test.ts:218` (`TRANSCRIPT_BODY_SENTINEL`), `forensics-derive.test.ts:209/252` (`SECRET_BODY`) assert absence. |
| A016 | Home-buffer path helper is gone | ✅ SATISFIED | test `forensics.test.ts:104` asserts `getForensicsBufferPath`/`appendSessionRecord`/`updateSessionRecord`/`buildSessionRecord` undefined. grep confirms gone from `src/`. |
| A017 | Worktree-path matcher is gone | ✅ SATISFIED | test `work-proof-process.test.ts:29` asserts source has no `recordBelongsToWorktree`. grep confirms gone from `src/`. |
| A018 | Proof assembled from committed files (3 sessions) | ✅ SATISFIED | `work-proof.ts:70-85` reads `completed/{slug}/provenance/*.json`; test `work-proof-process.test.ts:152` seeds 3, asserts `sessions.toHaveLength(3)`. |
| A019 | Capture off → no provenance block (null) | ✅ SATISFIED | `work-proof.ts:67` early-returns null when disabled; test `work-proof-process.test.ts:251` asserts `toBeNull()`. |
| A020 | Capture on + missing → gap recorded, not hidden | ✅ SATISFIED | empty `sessions[]` returned, not null; test `work-proof-process.test.ts:259` asserts `not.toBeNull()` and `sessions: []`. |

All 20 in-scope assertions SATISFIED. Each `@ana` tag was read and confirmed to use a matcher consistent with the contract (`exists`/`equals`/`not_contains`/`truthy` all map to the test assertions).

## Independent Findings

**Implementation is high quality and closely tracks the spec.** The total/never-throw contract is honored throughout (`writePendingPointer`, `captureProvenanceAtSave`, `executeCapture` all wrap their bodies and degrade to a default). The AC9 crux — the hardest part of this phase — is implemented exactly right: a separate `provenancePaths` array, the no-changes guard checking `stagedPaths` only, `git reset` of provenance on the no-op exit, and both paths in the commit pathspec, wired identically at both save sites. Live-checked the built `dist`: `_capture --derive` exits 0, empty-stdin `_capture` exits 0, `_capture` is hidden from `--help`.

**Test quality is strong, not rubber-stamped.** Assertions are specific (`toBe(700)`, exact file-name arrays, `toHaveLength(3)`), error paths are covered (malformed JSON, unreadable transcript, unwritable HOME, gate off, missing run id), determinism is asserted, and `prunePendingPointers` is tested on **both** sides (deletes stale, keeps fresh). The assembly tests prove home-state isolation and unparseable-file skipping. Integration tests use real `git init -b main` repos and assert via `git show`.

**Prediction resolution (Step 3):**
1. *AC9 guard subtly wrong* — **Surprised/partially confirmed.** The guard itself is correct, but I found that the no-op path rewrites the provenance file to disk and only `git reset`s it (unstage), leaving an **unstaged modification** in the working tree. AC9 as written ("no staged provenance") is met; this is a beyond-AC observation (see Findings).
2. *prune fresh-side untested* — **Not found.** `forensics.test.ts:158` covers both sides.
3. *Claude fallback under-tested* — **Not found.** `forensics.test.ts:309` exercises the `CLAUDE_CODE_SESSION_ID` glob fallback end-to-end; `:335` proves Codex has no fallback.
4. *dangling buffer/recordBelongsToWorktree reference* — **Not found.** grep over `src/` is clean.
5. *stray `cost_usd` reference* — **Not found.** Remaining `cost_usd` hits are all the pricing module's `CostResult` and the legitimate display-time `computeCost(...).cost_usd`.

**Over-building / YAGNI:** `resolveTranscriptPath` is exported but has zero importers anywhere (only an internal call at `forensics.ts:695`). The spec told the builder to keep it exported, so this is a spec hint that did not pan out — minor needless API surface (see Findings). No other scope creep: every new export is either consumed or test-accessed; no dead branches found in the new code.

## AC Walkthrough

- ✅ PASS — `buildCaptureEnv` returns non-empty UUID `ANA_RUN_ID`, merge additive (`run.test.ts:633/685`).
- ✅ PASS — SessionStart writes a pointer with `session_id` (+`transcript_path`), no buffer, no git (`_capture.ts`, `_capture.test.ts:98`; live-checked).
- ✅ PASS — `ana _capture --derive` accepted, exits 0 as a no-op (`_capture.test.ts:220`; live-checked exit 0).
- ✅ PASS — `captureProvenanceAtSave` writes `{role}-{session_id}.json` (no `cost_usd`), deletes the consumed pointer, returns the path (`forensics.test.ts:197/229`).
- ✅ PASS — same-session re-save overwrites one file; distinct session writes a distinct file (`forensics.test.ts:266/284`).
- ✅ PASS — provenance rides the SAME commit at both save sites, no extra commit (`artifact-provenance.test.ts:167/206`).
- ⚠️ PARTIAL — no-work re-validation prints "No changes to save", exits 0, **no provenance staged** — verified. Caveat: the provenance file is left **modified-but-unstaged** in the working tree (the AC's literal "no provenance left staged" is met; the working tree is not clean). See Findings.
- ✅ PASS — `ProvenanceCounts` has no `cost_usd`; derive carries `tokens`+`model`+`price_table_version` (`forensics-derive.test.ts:171`).
- ✅ PASS — buffer + `recordBelongsToWorktree` deleted; grep finds no references in `src/` (`forensics.test.ts:104`, `work-proof-process.test.ts:29`, independent grep).
- ✅ PASS — `assembleProcessAttestation` reads committed `completed/{slug}/provenance/*.json`, one per file, null only when capture off (`work-proof-process.test.ts:152/251/259`).
- ✅ PASS — each file carries ISO `captured_at`; sessions ordered by `captured_at` then `role` (`work-proof-process.test.ts:166`).
- ✅ PASS — orphan pointers >72h pruned, fresh kept (`forensics.test.ts:158`).
- ✅ PASS — no transcript bodies written (`forensics.test.ts:218`, `forensics-derive.test.ts:209/252`).
- ✅ PASS — `pnpm run build` succeeds; suite passes 3540, count up +14 from baseline.

## Blockers

None. I searched specifically for:
- **Unused exports** in new code → only `resolveTranscriptPath` (non-blocking observation, not a contract failure).
- **Unhandled error paths** → every public forensics function and both save-site capture calls are wrapped; capture failure returns `null` and never fails a save (verified in code + via the "non-blocking" try/catch around `git add`).
- **Assertions about external state** → the assembly reads only committed files under the project; home-state isolation is explicitly tested.
- **Missing edge cases from the spec** → unreadable transcript, Codex no-fallback, concurrency (two run ids), unparseable provenance file — all covered.
- **Contract method mismatches** → each tagged test's assertion method matches the contract matcher.

Nothing qualifies as a blocker: all 20 in-scope assertions SATISFIED, all ACs PASS or PARTIAL-with-met-criterion, no regressions (+14 tests), seal INTACT.

## Findings

- **Code — No-work re-validation leaves a dirty working tree:** `packages/cli/src/commands/artifact.ts:1259` (and the save-all twin ~:1690). `captureProvenanceAtSave` writes `provenance/{role}-{id}.json` to disk *before* the no-changes guard. On the no-op path only `git reset -- provenancePaths` runs — it unstages but does not restore working-tree content, so the rewritten file remains as an unstaged modification. On the Claude fallback path `captured_at` is a fresh wall-clock per call, so the file churns on every re-save. AC9's literal requirement ("no provenance left staged") is met; this is beyond-AC. Low severity — provenance is best-effort/non-gating, the no-op path is rare in the real pipeline (saves almost always carry report changes), and the next real save folds the file back in. Worth knowing: a future clean-tree assumption (an `ana` command or a user pre-push hook) could trip on the lingering change. The next engineer could `git checkout -- provenancePaths` (restore) instead of `reset` on the no-op exit to leave the tree pristine.
- **Test — No-work test does not assert a clean working tree:** `packages/cli/tests/commands/artifact-provenance.test.ts:262` asserts only `git diff --staged --quiet` (nothing staged), so it passes despite the unstaged provenance modification above. A `git status --porcelain` empty-check would have surfaced the behavior.
- **Code — `resolveTranscriptPath` exported with no consumer:** `packages/cli/src/utils/forensics.ts:615` is exported but imported by nothing — its sole caller is the internal use at `:695`. Per the project rule "flag exports with zero imports anywhere," the `export` is needless public surface. The spec instructed the builder to keep it exported, so this is partly an upstream hint that didn't pan out; demote to an internal helper if no Phase 2/3 consumer materializes.
- **Upstream — Resolves session-capture-C8:** deleting the home-global buffer read and `recordBelongsToWorktree` from `assembleProcessAttestation` (now reads per-session committed files) resolves the C8 finding that assembly still read the machine-wide `~/.ana/forensics/sessions.jsonl` and still matched worktree paths. Verified by grep: neither symbol remains in `src/`.
- **Upstream — Resolves session-capture-C11:** `executeDerive`'s synchronous full-transcript read before `process.exit(0)` is deleted; the function is now a pure no-op kept only for commander tolerance of un-pruned `--derive` hooks (`_capture.ts:157`).
- **Context — session-capture-C12 still present (accepted):** `parseTestCounts` (`forensics.ts:380`) is unchanged — first-match `/(\d+)\s+passed/` regex, documented best-effort, provenance-only, never gates a verdict. Out of scope for this phase; noted for continuity.

## Deployer Handoff

- This is **Phase 1 of 3**. Do **not** open a PR yet — `ana work status` will gate the PR until Phases 2 and 3 are built and verified.
- Phase 1 is internally green and existing installs keep working: the SessionStart command string (`ana _capture`) is unchanged and `--derive` still exits 0, so un-re-init'd installs are unaffected.
- The end-to-end "provenance travels git in a real ana project" guarantee depends on Phase 3's promise that `.ana/.gitignore` does not ignore `provenance/` (A044). Phase 1's integration test proves the commit mechanics in a bare repo; the gitignore guard is correctly deferred to Phase 3.
- One beyond-AC behavior to be aware of operationally: a true no-work re-save of an artifact leaves a modified-but-unstaged provenance file in the worktree (see Findings). Harmless in the normal pipeline; absorbed by the next real save.

## Verdict

**Shippable:** YES (for Phase 1; full feature ships after Phases 2–3 verify)

All 20 in-scope contract assertions are SATISFIED with specific, contract-aligned tests I read individually. Build, lint, and the full sealed suite are green with the test count rising +14. The hardest piece — the AC9 no-changes-guard scoping — is correct. I independently grep-confirmed the buffer and worktree-matcher deletions, and live-exercised the `_capture` hook contract on the built binary. The findings are observations and one beyond-AC working-tree nit, none of which block this phase. I would stake my name on Phase 1 shipping.
