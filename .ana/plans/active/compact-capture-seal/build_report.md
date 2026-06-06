# Build Report: Compact the capture seal + fix the count

**Created by:** AnaBuild
**Date:** 2026-06-06
**Spec:** .ana/plans/active/compact-capture-seal/spec.md
**Branch:** feature/compact-capture-seal

## What Was Built

Separated test **evidence** from **attestation**: the raw bytes are hashed +
counted then deleted; the committed seal is a single compact line.

- **packages/cli/src/utils/capture-marker.ts** (modified — significant deletion):
  Reshaped `CaptureMarker` — added `lines: number` and optional `enginebind?: string`,
  dropped `file`. `formatMarker` emits `stage slug counts verdict sha256 bytes lines [enginebind]`
  (enginebind only when present). Added `countLines(buf)`. Replaced the loose regex/`parseMarkerText`
  with a **strict, full-line-anchored, fenced-region-skipping** parser (`stage∈{build,verify}`,
  non-empty `slug`/`counts`, `verdict∈{pass,fail,abstain}`, 64-lowercase-hex `sha256`, non-negative
  int `bytes`, **required** non-negative int `lines`; unknown keys ignored). **Deleted** `locateBlock`,
  `renderBlock`, `eachMarker`, `inlineCaptures`, `bufHasAt`, the byte-offset helpers, the
  `BEGIN_PREFIX`/`END_LINE`/`END_SEQ` constants, `InlineResult`, `validateCaptureInlined`,
  `validateCaptureNotTruncated`, and the loose `MARKER_REGEX`/`MARKER_REGEX_G`. `validateCapturePresent`
  now uses the strict parser; `evaluateCaptureGate` runs the present-check only.
- **packages/cli/src/utils/capture-runner.ts** (modified): Added `parseVitestJson` (shape-gates on
  `numTotalTests` + `testResults`, reads `numPassedTests`/`numFailedTests`/`numPendingTests`+`numTodoTests`),
  reached only via the `vitest` hint with the human summary as fallback (`parseVitest = parseVitestJson ?? parseVitestHuman`).
  `deriveCounts`/`deriveVerdict` no-false-green preserved exactly — no per-parser fallthrough reintroduced.
- **packages/cli/src/commands/test.ts** (modified): `resolveTestCommandString` now returns
  `{ command, source: 'test'|'test_json' } | null`, preferring top-level **and** surface `test_json`
  and reporting the source. `executeCapture` derives counts/verdict, **deletes the `.log`** (baseline
  + checkpoint) after hashing from memory, removed the 8 MiB ceiling + `INLINE_CEILING_BYTES`, builds the
  compact marker with `lines` and no `file`, and sets a `countHint` naming `commands.test_json` only when
  counts are null AND the source was not `test_json`. `printOutcome` shows "bytes / lines captured (log
  deleted after sealing)" + the hint; the `file=`-path line is gone.
- **packages/cli/src/commands/artifact.ts** (modified): Deleted `inlineReportCaptures`; removed the
  `inlineCaptures` import; both verify-report save paths no longer inline; `applyCaptureGate` lost its
  `slugDir` arg and runs the present-check gate only.
- **packages/cli/src/commands/init/assets.ts** (modified): Corrected the stale `.captures/` gitignore
  comment ("inlined block" → "deleted after the count + sha are sealed into the compact marker").
- **Agent templates** (modified, all four — Claude + Codex, build + verify): replaced the "expands into a
  verbatim, sha-sealed block" / "sha-sealed into verify_report.md" language with the compact one-line
  marker description; contract-seal wording untouched.
- **Dogfood agent definitions** (modified — `.claude/agents/{ana-build,ana-verify}.md` and `.codex`
  equivalents): synced to the templates (see Deviations).
- **.ana/.gitignore** (modified — dogfood): added `plans/active/*/.captures/`.
- **.ana/ana.json** (modified — dogfood config): added `commands.test_json` =
  `(cd 'packages/cli' && pnpm vitest run --reporter=json)`.
- **Test files** (modified): `tests/utils/capture-marker.test.ts`, `tests/utils/capture-runner.test.ts`,
  `tests/commands/test-command.test.ts`, `tests/commands/artifact.test.ts`,
  `tests/capture-corpus/invariants.test.ts`.

## PR Summary

- Compact the capture seal: a test run now commits a single-line attestation (counts, verdict, sha256,
  byte/line totals) instead of inlining the raw output. The save-time inliner, the 8 MiB inline ceiling,
  and the two block validators are deleted, not adapted.
- The marker is a closed token: a strict, full-line-anchored, fenced-region-skipping parser with a
  64-hex `sha256` and a required `lines` field — so fenced examples, placeholder descriptions, and
  old-format inlined markers never parse as a real seal.
- Counts now come from a machine-readable reporter: vitest `--reporter=json` (and any JSON runner like
  `go test -json`) is parsed mechanically; opt-in via `commands.test_json`, with a discoverability hint
  when a project abstains for lack of one.
- The raw capture log is written, hashed + counted, then actively deleted (gitignored as a backstop);
  no large output can fail to seal, since the seal is one line regardless of size.
- All four agent templates (and the dogfood copies) now describe the compact seal accurately.

## Acceptance Criteria Coverage

- **AC1** "single-line sealed marker, no inlined output" → `capture-marker.test.ts` "renders a single-line
  marker" (A001) + `test-command.test.ts` "emits a compact sealed marker" (A001/A002/A003); dogfood seal
  below is one line. ✅
- **AC2** "save seals without inlining; no verbatim block" → `artifact.test.ts` "carries the verify
  report's compact marker through save without inlining" (A004, asserts no `ana:capture-begin`). ✅
- **AC3** "count from a machine-readable reporter; real count on this repo" → `capture-runner.test.ts`
  "reads counts from vitest --reporter=json" (A006) + `test-command.test.ts` "prefers top-level test_json"
  (A007); **dogfood proof:** the sealed baseline below reads `3429p/0f/2s` (not abstain). ✅
- **AC4** "safe abstain, no fabricated count; no-false-green preserved" → `capture-runner.test.ts`
  deriveVerdict null/zero → abstain (A010/A011) + invariants ABSTAIN-ON-UNKNOWN (A009). ✅
- **AC5** "closed token — fenced/placeholder not parsed" → `capture-marker.test.ts` fenced (A012),
  placeholder (A013), backtick-wrapped, trailing-prose. ✅ (does NOT claim to catch a verbatim marker in
  prose — deferred to L3, see Open Issues)
- **AC6** "log written then actively deleted; gitignore in dogfood + generator" → `test-command.test.ts`
  "deletes the capture log after sealing" (A015) + `capture-marker.test.ts` n/a; `.ana/.gitignore` +
  `assets.ts` rules; dogfood run left `.captures` empty. ✅
- **AC7** "reserved enginebind round-trips present AND absent" → `capture-marker.test.ts` enginebind
  round-trip ×2 (A018/A019), re-serialization identical both ways. ✅
- **AC8** "all four templates describe the compact seal; contract-seal untouched" → edits to all four
  templates + dogfood copies; contract-seal wording unchanged. ✅
- **AC9** "JSON count works for a non-vitest runner" → `capture-runner.test.ts` "reads counts from go
  test -json" (A022). ✅
- **AC10** "old-format report doesn't throw, isn't a valid seal" → `capture-marker.test.ts` old-format
  no-throw (A023) + not-accepted (A024); `artifact.test.ts` block-message uses an old-format marker (A024). ✅
- **AC11** "abstain names the test_json fix" → `test-command.test.ts` "sets a countHint naming
  commands.test_json" (A025) + suppression when test_json IS the source. ✅
- **AC12** "idempotent re-save / byte-stable seal" → covered structurally: nothing is inlined or
  rewritten at save (the marker is committed verbatim), so a second save is byte-identical. See Deviations. 🔨
- **AC13** "capture over the old 8 MiB ceiling still seals" → `test-command.test.ts` "still seals a
  capture larger than the old 8 MiB inline ceiling" (A027/A028); dogfood baseline below is ~1.05 MB and
  sealed. ✅
- **AC (suite)** `(cd packages/cli && pnpm vitest run)` passes, no regression → 3429 passed, 2 skipped. ✅
- **AC (lint)** `(cd packages/cli && pnpm run lint)` clean on changed files. ✅

## Implementation Decisions

- **JSON parser reads fields by key, not whole-blob `JSON.parse`.** The capture concatenates stdout+stderr,
  so the vitest JSON object can be wrapped in surrounding noise; reading `"numPassedTests":(\d+)` by key
  (the `parseGo` shape) is robust where `JSON.parse(entireCapture)` would throw. Tested with embedded stderr.
- **`skipped = numPendingTests + numTodoTests`.** Vitest's human summary folds `.skip` (pending) and
  `.todo` into "skipped"; the JSON path sums them to match. The dogfood count (`2s`) matches the human
  `pnpm vitest run` output exactly.
- **Log deleted at `ana test` time, both baseline and checkpoint.** Per the spec's deliberate flip from
  the register's save-time recommendation: self-cleaning, matches scope, and the in-memory `rawText` is
  kept for the checkpoint degrade display.
- **`resolveTestCommandString` collapsed surface/top-level branches** into one `commands` lookup that
  prefers `test_json` at both levels — less duplication than mirroring the branch.
- **`enginebind` captured only when the key is present** (`'enginebind' in fields`), so an absent field
  re-serializes to a byte-identical marker (no `enginebind=undefined`).

## Deviations from Contract

### A026: Saving the same build report twice produces an identical sealed result
**Instead:** Verified by construction/inspection rather than a dedicated automated re-save test.
**Reason:** With the inliner deleted, `applyCaptureGate` no longer writes to the report — it only reads
it for the present-check. The committed marker is whatever the agent pasted; save mutates nothing in the
report body, so a second save is trivially byte-identical. The prior idempotency risk (re-inlining a block)
no longer exists. No code path remains that could make a re-save differ.
**Outcome:** Functionally guaranteed (no write path), but I did not add an explicit two-save byte-stability
test — verifier should assess whether an explicit regression test is wanted.

### File-list deviations (spec/contract `file_changes` incomplete)
**Instead:** Also modified `tests/commands/artifact.test.ts`, `tests/capture-corpus/invariants.test.ts`,
and the dogfood agent definitions (`.claude/agents/{ana-build,ana-verify}.md` + `.codex` equivalents),
none of which were in the contract's `file_changes`.
**Reason:** The two test files import deleted inliner symbols (would not compile); the dogfood agent files
are held byte-identical to the templates by `templates/agent-proof-context.test.ts`, which failed until
synced.
**Outcome:** Adapted to spec **intent** (inliner deleted → its tests deleted; templates changed → dogfood
copies follow). Contract.yaml not modified (sealed).

## Test Results

### Baseline (before changes — origin/main)
Command: `(cd packages/cli && pnpm vitest run)`
```
Test Files  138 passed (138)
Tests  3432 passed | 2 skipped (3434)
```

### After Changes
Command: `(cd packages/cli && pnpm vitest run)`
```
Test Files  138 passed (138)
Tests  3429 passed | 2 skipped (3431)
```

### Test Evidence (engine-sealed dogfood baseline via the built CLI)
This run used `commands.test_json` (vitest `--reporter=json`) — the count is engine-derived, not abstain,
which is the AC3 dogfood proof. The ~1.05 MB output sealed compactly (AC13) and the `.log` was deleted (AC6):

<!-- ana:capture stage=build slug=compact-capture-seal counts=3429p/0f/2s verdict=pass sha256=feaf6587dac46cb49ba468795e07234be93387d70e1e63edf11d3014f9ebef22 bytes=1048890 lines=207 -->

### Comparison
- **Net: 3434 → 3431 (−3 tests); 138 test files unchanged (none added or removed).**
- This is a deletion-heavy scope; the small net is the deletion of the inliner test surface offset by new
  compact-seal tests:
  - `capture-runner.test.ts`: 24 → 28 (**+4**: vitest-JSON ×3 incl. stderr-embedded + go-json A022).
  - `capture-marker.test.ts` + `test-command.test.ts` + `capture-corpus/invariants.test.ts`: 116 → 109
    (**−7 net**). **Deleted suites:** the inliner length-addressed round-trip suite, the two block-validator
    describes (`validateCaptureInlined`/`validateCaptureNotTruncated`), the per-stack PRESERVE+SEAL-BINDS and
    ERROR-NEVER-STRIPPED rows + the inliner-adversarial (end-delimiter/backtick) describe in
    `invariants.test.ts`, and the "exit 3 over 8 MiB ceiling" test. **Added:** strict-parser/closed-token
    rows (fenced/placeholder/backtick/trailing/missing-sha A029/bad-hex/unknown-key), enginebind round-trip
    ×2, old-format ×2, JSON-count + source/null tests, log-deletion, abstain-hint ×2, removed-ceiling-seal.
  - `artifact.test.ts`: 206 → 206 (the verify-inline test and the truncation block-message test were
    rewritten in place to the compact/present-check reality).
- Tests removed (suite-level intentional deletions): yes, see above. **Regressions: none.**

### New / notable tests
- `capture-marker.test.ts`: strict closed-token parser, enginebind round-trip, old-format tolerance,
  present-check gate.
- `capture-runner.test.ts`: vitest `--reporter=json` counts (incl. stderr-embedded), go `-json` counts.
- `test-command.test.ts`: top-level `test_json` preference + source, log deletion, abstain hint (+ suppression),
  removed-ceiling seal.

## Verification Commands
```
(cd packages/cli && pnpm run build)        # includes tsc --noEmit typecheck
(cd packages/cli && pnpm vitest run)       # expect 3429 passed, 2 skipped (3431)
(cd packages/cli && pnpm run lint)         # see Open Issues re: pre-existing warning
```
To reproduce the sealed dogfood count (uses commands.test_json):
```
node packages/cli/dist/index.js test --stage build --slug compact-capture-seal
```

## Git History
```
d229be69 [compact-capture-seal] Update agent templates + dogfood config for compact seal
dfbebcb4 [compact-capture-seal] Compact the capture seal; delete the inliner
afb37ba6 [compact-capture-seal] Add machine-readable JSON count path for vitest
```
(Branch was rebased onto origin/main mid-build after a PR merged; the rebase replayed cleanly and
`test.ts` auto-merged with main's new `isCheckpointSealConflict` addition — both coexist.)

## Open Issues

See `build_data.yaml` for the structured companion. Summary:

1. **Spec/contract `file_changes` omitted two test files** (`artifact.test.ts`, `capture-corpus/invariants.test.ts`)
   that import deleted inliner symbols — both had to change to compile/run. Adapted to spec intent.
2. **Spec/contract `file_changes` omitted the dogfood agent definitions** — a dogfood-vs-template
   exact-match test failed until `.claude` (test-enforced) and `.codex` (for consistency) copies were synced.
3. **The build report is saved with the worktree's built CLI**, not the PATH `ana` (which points at the
   main-tree dist that predates compaction and whose old gate would reject a file-less compact marker).
   Transitional bootstrap — resolves once this PR merges and `ana` is rebuilt from main.
4. **Pre-existing eslint warning** in `packages/cli/src/utils/git-operations.ts:198` (unused eslint-disable)
   surfaces on every commit hook — not introduced by this build; untouched file.
5. **AC5 deferred surface:** the strict parser intentionally does NOT catch a verbatim real marker pasted
   raw into prose (outside a fence) — that forgery surface is consciously deferred to the reserved
   `enginebind`/L3 token. AC5/A012/A013 cover descriptions, placeholders, and fenced examples only.
6. **AC12 (idempotent re-save):** guaranteed by construction (save no longer writes the report body) but
   not covered by a dedicated automated test — see Deviations.

Second pass: re-examined the diff for unused imports/params (printOutcome's `slug` removed; failOrDegrade's
`file` removed; capture-marker no longer imports `createHash`/`path`), the no-false-green path (deriveVerdict
unchanged, JSON parser hint-only), and the `lines` back-compat discriminator (old markers fail strict parse).
The six items above are the complete set.
