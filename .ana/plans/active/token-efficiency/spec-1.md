# Spec: Phase 1 — `ana test --capture` + seal-time capture guarantee + sealed token measurement

**Created by:** AnaPlan
**Date:** 2026-06-05
**Scope:** .ana/plans/active/token-efficiency/scope.md

## Approach

The disease: the most-trusted number a customer reads — *did the tests pass, how many* — is an agent self-report, and **nothing mechanically verifies the agent pasted real output**. `validateBuildReportFormat` (artifact-validators.ts:582) checks only section *headers*. This phase makes test evidence engine-captured and seal-gated: the agent decides; the engine does the mechanics.

Build one capture-aware command, `ana test --capture`, that runs the project's resolved test command through a **new capturing runner** (array-arg spawn, NO shell), tees the **full raw bytes** to a capture file, derives counts deterministically where the runner supports it (best-effort, abstain otherwise), and emits a single **marker line** the agent pastes into the build report. At save, a new **inliner** expands the marker into a verbatim fenced block, then three new pure validators gate the seal: a build report cannot seal without a real captured run whose inlined bytes are byte-for-byte identical to the capture file. Measure the byte→token delta with a stamped tokenizer (`o200k_base` via `js-tiktoken`) into a per-slug append-only ledger that folds into a new `token_economy` field on the proof chain at `ana work complete`, reusing the existing artifact-hash seal (zero new crypto).

**The two load-bearing invariants — encode them explicitly:**
- **Fail-OPEN on counts.** A runner with no structured mode is the *common* case (pytest needs a plugin; go/cargo emit streaming JSONL; dotnet is TRX). Abstain → marker carries `count=N/A` and the build **still seals**.
- **Fail-CLOSED on preservation.** No marker / no capture file / sha256 mismatch / byte-length mismatch → **no seal**. There is no `--no-verify` escape and no capture-less seal.

**Preservation is the universal spine** (`tee → sha256 → inline → re-sha256 → compare` — nothing language-specific). **Count-parsing is additive, best-effort, and barred from the preservation path** — adding a customer's stack = adding a fixture row; the guarantee auto-extends.

**Decisions resolved from scope open questions:**
- *Marker format / inliner mechanism* (scope: "Plan's design call"): marker emitted by `ana test --capture`, expanded by a save-time inliner that runs **before** the validators and **before** the save-hash. Exact marker grammar defined in Output Mockups below.
- *Surface resolution* (scope open question): `--surface <name>` → `surfaces[name].commands.test` (or `surfaces[name].test_json` when `--json-counts` opt-in is set); no `--surface` → top-level `commands.test`. Both already exist in ana.json.
- *`ana gain` headline* (scope: "Lean: absolute + stamped ruler"): lead with the absolute byte/token integer plus the visible stamped tokenizer name. No ratio, no `%`, no `$`.
- *Tokenizer load* (scope: bundle-size risk): `js-tiktoken` is imported **lazily** (dynamic `import()` inside the ledger writer / `ana gain` only), never at module top-level of any always-loaded command, so cold CLI startup is unaffected.

**Path corrections (scope had these wrong — they are facts now):**
- Validators live in `src/commands/artifact-validators.ts`, **not** `src/utils/`.
- The save-time gate is in `src/commands/artifact.ts` at **TWO** call sites: `saveArtifact` (line 929) **and** `saveAllArtifacts` (line 1325). `ana artifact save-all` is the path Plan/Build actually use — wiring only one site leaves the guarantee bypassable. **Both sites get the inliner + three validators.**

## Output Mockups

### `ana test --capture` (vitest, structured counts available)
```
$ ana test --capture --stage build --slug token-efficiency
Running: pnpm vitest run   (surface: cli)
  ⏳ tests running…
✓ Captured 4211 bytes → .ana/plans/active/token-efficiency/.captures/test-build-1733419200.log
  Counts (engine-derived): 3234 passed, 0 failed, 2 skipped
  verdict: pass

Paste this marker into build_report.md (the seal expands it verbatim):

  <!-- ana:capture stage=build slug=token-efficiency bytes=4211 sha256=ab12cd…ef90 file=.captures/test-build-1733419200.log counts=3234p/0f/2s verdict=pass tokenizer=o200k_base -->

Token economy (this run): 4211 bytes / 1032 tokens kept out of working context
  (preserved verbatim in the proof — re-incurred only when read)
```

### `ana test --capture` (unknown/unstructured runner — ABSTAIN)
```
$ ana test --capture --stage build --slug some-feature
Running: go test ./...   (surface: default)
  ⏳ tests running…
✓ Captured 1880 bytes → .ana/plans/active/some-feature/.captures/test-build-1733419300.log
  Counts: N/A (no structured mode for this runner — raw output preserved)
  verdict: unverified

Paste this marker into build_report.md:

  <!-- ana:capture stage=build slug=some-feature bytes=1880 sha256=77aa…12 file=.captures/test-build-1733419300.log counts=N/A verdict=unverified tokenizer=o200k_base -->
```

### Marker grammar (the contract between command, inliner, and validators)
- HTML comment, single line, key=value pairs, space-separated. Keys: `stage` (`build|verify`), `slug`, `bytes` (integer, capture file byte length), `sha256` (hex of capture file bytes), `file` (path relative to the slug dir), `counts` (`Np/Nf/Ns` or `N/A`), `verdict` (`pass|fail|unverified`), `tokenizer`.
- The inliner, given a marker, reads `{slugDir}/{file}`, verifies `sha256(bytes) == marker.sha256` and `byteLength == marker.bytes`, then writes immediately after the marker line a fenced block:
  ```
  <!-- ana:capture-begin sha256=ab12…ef90 bytes=4211 -->
  ```text
  …verbatim capture bytes…
  ```
  <!-- ana:capture-end -->
  ```
- Re-running the inliner is **idempotent**: an existing begin/end block for the same marker is replaced, not duplicated.

### Build report after inlining (what seals)
The agent writes only the one-line `ana:capture` marker. After `ana artifact save`/`save-all`, the report contains the marker followed by the expanded verbatim block. `validateCapturePresent` requires ≥1 `stage=build` marker; `validateCaptureInlined` requires `sha256(blockBytes) == marker.sha256`; `validateCaptureNotTruncated` requires `blockByteLength == marker.bytes`.

### `ana gain` (read-only)
```
$ ana gain token-efficiency

  ana gain — token economy (sealed)

  Raw test bytes kept out of working context   4,211 bytes
  Tokens (o200k_base)                          1,032
  Captured runs                                2  (build, verify)
  Preserved verbatim in proof                  ✓  sha256 sealed

  Counterfactual: these bytes are preserved in the proof and
  re-incurred only when an agent reads them. No %-cheaper, no $ claims.
```
`ana gain` with no slug lists sealed `token_economy` across recent proof entries (entries lacking the field are silently skipped — see AC10/back-compat). `ana gain --json` emits the structured envelope.

### `.token_ledger.jsonl` (one line per compressed call)
```json
{"stage":"build","raw_tokens":1032,"view_tokens":1032,"saved_tokens":0,"destination":"artifact","capture_hash":"sha256:ab12…ef90","tokenizer":"o200k_base","bytes":4211}
```

## File Changes

### packages/cli/src/commands/test.ts (create)
**What changes:** New top-level `ana test` command with `--capture`, `--baseline` (flag, not a sibling command), `--stage build|verify`, `--slug <s>`, `--surface <name>`, `--json-counts` (opt-in structured mode), `--json`. Resolves the test command from ana.json (per-surface when `--surface`, else top-level), invokes the capturing runner, writes the capture file + token ledger, prints the marker.
**Pattern to follow:** `src/commands/scan.ts` for the single-purpose command shape (imports, `registerTestCommand(program)`, flag parsing, ana.json resolution). `--capture`/`--baseline` are flags on one command — NOT new nouns (`ana test baseline`/`diff` were rejected in scope).
**Why:** Without an engine-side capture, test evidence stays an unverified transcription.

### packages/cli/src/utils/capture-runner.ts (create)
**What changes:** The capturing runner. Array-arg spawn (`spawnSync(cmd, args, {...})` — argv array, **NO `shell:true`**, no appended flags), keeps stdout+stderr, tees full raw bytes to the capture sink with an explicit fsync, returns `{ rawBytes: Buffer, exitCode, sink: string }`. Also: best-effort count derivation from captured bytes per known runner (vitest/jest/pytest-json/go-json/cargo-json/rspec-json/junit-xml/dotnet-trx), returning `{ passed, failed, skipped } | null` (null = abstain).
**Pattern to follow:** This is a **security boundary** — model the spawn on a NON-shell `spawnSync` call (argv array form). Do **NOT** extend or reuse `runBuildCommand` (worktree.ts:447) — it is `shell:true` and discards stdout. New file, new boundary.
**Why:** A shell-interpolated test command with a malicious project name/path is an injection surface. Array-arg spawn closes it.

### packages/cli/src/utils/capture-marker.ts (create)
**What changes:** Pure marker helpers — `formatMarker(fields)`, `parseMarkers(reportText): Marker[]`, `inlineCaptures(reportText, slugDir): { text, errors }` (the inliner: expand each marker's verbatim block, idempotent replace, verify sha256+bytes), and the three pure validators that read an already-inlined report. Pure module, no chalk/commander.
**Pattern to follow:** The three validators are structurally identical to `validateBuildReportFormat` (artifact-validators.ts:582) — pure `(filePath) => string | null`. Keep them here (or re-export from artifact-validators.ts) so artifact.ts imports them like the others.
**Why:** Marker/inliner logic must be unit-testable in isolation by the cross-stack corpus without a git/save harness.

### packages/cli/src/commands/artifact-validators.ts (modify)
**What changes:** Add (or re-export) `validateCapturePresent`, `validateCaptureInlined`, `validateCaptureNotTruncated` — each `(filePath) => string | null`. `validateCapturePresent` returns an error string when the build report carries zero `stage=build` capture markers (fail-CLOSED). The other two compare inlined-block sha256/byte-length to the marker. None of them inspect `counts` — counts never block (fail-OPEN).
**Pattern to follow:** `validateBuildReportFormat` at line 582 — same signature, same early-return-on-error shape.
**Why:** These are the mechanical guarantee.

### packages/cli/src/commands/artifact.ts (modify)
**What changes:** At BOTH build-report gates — `saveArtifact` (line 929) and `saveAllArtifacts` (line 1325) — **before** the `validateBuildReportFormat` call and **before** any save-hash: (1) run the inliner against the report file in place (expand markers → verbatim blocks), then (2) run the three new validators, `process.exit(1)` on any error string. Order is load-bearing: inline → validate → existing format check → hash.
**Pattern to follow:** The existing `if (typeInfo.baseType === 'build-report') { const error = validateBuildReportFormat(filePath); if (error) { …process.exit(1); } }` block at 928–934 (and its twin at 1324–1326). Add the inliner+validators in the same conditional, same exit style.
**Why:** The save path is the only choke point Build cannot skip. `save-all` is what the pipeline uses — both sites or it's bypassable.

### packages/cli/src/utils/token-ledger.ts (create)
**What changes:** Append-only writer for `{slugDir}/.token_ledger.jsonl`. One JSON line per capture call: `raw_tokens`, `view_tokens`, `saved_tokens`, `destination: 'context'|'artifact'`, `capture_hash`, `tokenizer`, `bytes`, `stage`. **Interlock:** when `destination === 'artifact'`, `saved_tokens` is `0` by construction (the bytes are preserved, re-incurred at read). Tokenizer is `o200k_base` via **lazy** `import('js-tiktoken')`. Exposes `foldLedger(slugDir): TokenEconomy | null` that sums the ledger for the proof fold.
**Pattern to follow:** Append-only JSONL write; lazy dynamic import for js-tiktoken so it never loads on cold CLI start.
**Why:** Exact token measurement with a sealed, reproducible ruler — not chars/4.

### packages/cli/src/types/proof.ts (modify)
**What changes:** Add `token_economy?: TokenEconomy | undefined` to `ProofChainEntry` (optional — old entries lack it). Define `TokenEconomy` interface (`raw_tokens`, `view_tokens`, `saved_tokens`, `tokenizer`, `captured_runs`, `capture_hashes: string[]`).
**Pattern to follow:** The existing optional fields (`commit_hygiene?`, `worktree?`) and the CROSS-CUTTING header comment at line 16.
**Why:** Carries the sealed measurement on the proof record.

### packages/cli/src/commands/work-proof.ts (modify)
**What changes:** In `writeProofChain` entry construction (line 130), fold the ledger via the existing spread idiom: `...(tokenEconomy ? { token_economy: tokenEconomy } : {})`. Read the ledger the SAME way `modules_touched`/`commit_hygiene` are read (lines 100–116) — reuse that single `.saves.json`/slug-dir read block; do NOT add a new independent reader (proof context flagged "multiple .saves.json readers" as a recurring finding on artifact.ts). Treat the ledger as an artifact via `writeSaveMetadata(slugDir, 'token-ledger', content)` so its hash lifts into `entry.hashes`.
**Pattern to follow:** Lines 100–116 (read) + 163–164 (spread fold). `writeSaveMetadata` (artifact.ts:54) for the hash lift.
**Why:** Seals the measurement into the proof chain reusing existing crypto.

### packages/cli/src/utils/proofSummary.ts (modify)
**What changes:** Add the `token_economy` default (absent/undefined) wherever `generateProofSummary` constructs the summary object, so the 4-location cross-cut is consistent and old entries never error.
**Pattern to follow:** How `generateProofSummary` defaults other optional entry fields (the CROSS-CUTTING note in proof.ts:16 names this as location 2 of 4).
**Why:** Back-compat: entries written without a ledger must read as field-absent, never an error (scope open question 2).

### packages/cli/src/commands/proof.ts (modify)
**What changes:** Display `token_economy` in `formatHumanReadable` when present (location 4 of 4). Skip silently when absent.
**Pattern to follow:** Existing optional-section rendering in `formatHumanReadable` (proof.ts:251+).
**Why:** Completes the cross-cut so the sealed number is visible in `ana proof`.

### packages/cli/src/commands/gain.ts (create)
**What changes:** New read-only `ana gain [slug]` + `--json`. Reads `.ana/proof_chain.json`, surfaces sealed `token_economy`. Absolute bytes/tokens + stamped tokenizer name. No `%`, no `$`, no total-spend denominator. Entries lacking `token_economy` are skipped.
**Pattern to follow:** The read-only `proof context` handler shape (proof.ts `handleProofContext`): `findProjectRoot()` → existence check → read JSON → chalk human output / `wrapJsonResponse` for `--json`.
**Why:** Surfaces the sealed economy without mutating anything.

### packages/cli/src/index.ts (modify)
**What changes:** Register `registerTestCommand(program)` under the PIPELINE group and `registerGainCommand(program)` under INTELLIGENCE.
**Pattern to follow:** The existing `registerXyzCommand(program)` registration blocks (index.ts:53–75).
**Why:** Wires the new commands into the CLI.

### packages/cli/src/commands/init/anaJsonSchema.ts (modify)
**What changes:** Add an optional `test_json: z.string().nullable().optional().catch(null)` to `surfaceObjectSchema` (line 48) — the opt-in structured-mode test command. Per-surface only. `.catch`-soft like its siblings.
**Pattern to follow:** The sibling fields in `surfaceObjectSchema` (lines 48–53), all `.catch()`-guarded.
**Why:** Lets a customer opt a surface into structured counts without us auto-appending flags to their `commands.test`.

### packages/cli/src/commands/init/state.ts (modify)
**What changes:** In `createAnaJson` surface construction, default `test_json: null` on each generated surface object. **Never** auto-derive or auto-append flags — opt-in only (AC7).
**Pattern to follow:** The surface object literal in `createAnaJson` (the `surfaces[surface.name] = { path, language, framework, commands }` block).
**Why:** Ships the field as opt-in; flags are never silently added to a customer's test command.

### packages/cli/package.json (modify)
**What changes:** Add `js-tiktoken` to `dependencies`. Confirm it is imported only via lazy dynamic `import()` (token-ledger.ts / gain.ts), never at top-level of an always-loaded module.
**Pattern to follow:** Existing dependency entries; verify lockfile updates (`pnpm-lock.yaml`).
**Why:** Exact tokenizer. Lazy load keeps cold startup unaffected.

### packages/cli/tests/capture-corpus/ (create — fixtures + invariant sweep)
**What changes:** Cross-stack corpus for `{vitest, jest, pytest, go, cargo, rspec, junit, dotnet}` — each with a `.raw` (passing) and `.fail` (failing/error) capture fixture — plus a `describe.each(STACKS)` invariant test asserting PRESERVE, NO-COMPRESS-IN-ARTIFACT, COUNTS-FROM-CAPTURE, SEAL-BINDS/TAMPER-FIRES, ERROR-NEVER-STRIPPED, NO-FALSE-GREEN, ABSTAIN-ON-UNKNOWN.
**Pattern to follow:** Existing vitest fixtures under `packages/cli/tests/`. Where applicable, seed from RTK's inline-runner tests (Apache-2.0 — attribute in a header comment).
**Why:** This is the bulk of Phase-1 effort and the proof that the guarantee auto-extends per stack.

## Acceptance Criteria

Copied from scope (AC1–AC12), plus implementation criteria:

- [ ] AC1: `ana test --capture [--baseline] [--stage build|verify] [--slug <s>] [--surface <name>]` runs the resolved test command via the new capturing runner (array-arg spawn, NO shell), keeps stdout, tees full raw bytes to `.ana/plans/active/{slug}/.captures/test-{stage}-{epoch}.log` (mode=always, fsync'd, no rotation). `--baseline` is a flag, not a sibling command.
- [ ] AC2: Full raw captured bytes are inlined verbatim into the build report at seal via the marker; inlined bytes are byte-for-byte identical to the capture file (sha256 equal).
- [ ] AC3: `validateCaptureInlined`, `validateCapturePresent`, `validateCaptureNotTruncated` run at the existing save-time `process.exit(1)` gate — at BOTH `saveArtifact` and `saveAllArtifacts` — BEFORE the save-hash.
- [ ] AC4: Counts derived once from captured bytes. Structured mode → engine-computed; otherwise honestly `N/A` and the build still seals (fail-open on counts).
- [ ] AC5: A green verdict on a collection-error / compile-error / empty-suite fixture is a CI-failing bug (NO-FALSE-GREEN). Errors never stripped. Malformed/unknown runner → `verdict: unverified` + raw passthrough (ABSTAIN-ON-UNKNOWN), still writing a preservation marker.
- [ ] AC6: Cross-stack corpus exists for the 8 stacks (`.raw` + `.fail`) with a `describe.each(STACKS)` sweep asserting all seven invariants.
- [ ] AC7: An `ana.json` `test_json` per-surface override ships (opt-in). Flags are never auto-appended to `commands.test`.
- [ ] AC8: Per-slug append-only `.token_ledger.jsonl` records each call (`raw_tokens`, `view_tokens`, `saved_tokens`, `destination`, `capture_hash`, tokenizer). Artifact-bound calls have `saved_tokens == 0` by construction.
- [ ] AC9: Tokens counted with an exact stamped tokenizer (`o200k_base` via `js-tiktoken`), not chars/4. Tokenizer name recorded in ledger and proof entry.
- [ ] AC10: At `ana work complete`, the ledger folds into `token_economy` on `ProofChainEntry`; the ledger is treated as an artifact via `writeSaveMetadata` so its hash lifts into `entry.hashes`. Entries written without a ledger read as field-absent, never an error.
- [ ] AC11: Read-only `ana gain` surfaces sealed `token_economy`. No dollar claims, no `%`, no total-spend denominator.
- [ ] AC12: `--capture` wraps the final `commands.test` baseline only (Build's after-all-changes run and Verify's independent re-run) — NOT per-checkpoint single-file commands. No AnaPlan prompt change in this scope.
- [ ] `js-tiktoken` is lazy-imported only; cold CLI startup time is unchanged (no top-level import in always-loaded modules).
- [ ] The 4-location `token_economy` cross-cut is complete (type, `generateProofSummary` default, `writeProofChain` construction, `proof.ts` display) and old proof entries load without error.
- [ ] Capturing runner uses array-arg spawn with no shell and no appended flags (security boundary).
- [ ] `pnpm vitest run` in `packages/cli` passes; no new lint errors; no test-count regression (baseline 3234 passing / 132 files).

## Testing Strategy

- **Unit (marker/inliner — capture-marker.ts):** `formatMarker`/`parseMarkers` round-trip; `inlineCaptures` expands verbatim and is idempotent (second run produces identical bytes); inliner errors on sha256 mismatch and byte-length mismatch.
- **Unit (validators):** `validateCapturePresent` returns error on zero build markers, null on ≥1; `validateCaptureInlined` fires on tampered block; `validateCaptureNotTruncated` fires on truncated block; none inspect counts.
- **Unit (runner — capture-runner.ts):** array-arg spawn (assert no `shell:true`); raw bytes preserved exactly; count derivation returns correct `{passed,failed,skipped}` for structured fixtures and `null` for unstructured.
- **Unit (ledger):** artifact-destination line has `saved_tokens === 0`; tokenizer name recorded; lazy import does not run on module load.
- **Integration (corpus, `describe.each(STACKS)`):** the seven invariants per stack (PRESERVE, NO-COMPRESS-IN-ARTIFACT, COUNTS-FROM-CAPTURE, SEAL-BINDS/TAMPER-FIRES, ERROR-NEVER-STRIPPED, NO-FALSE-GREEN, ABSTAIN-ON-UNKNOWN).
- **Integration (save gate):** a build report with no marker fails to save at BOTH `saveArtifact` and `saveAllArtifacts`; a report with a valid marker inlines and seals; a tampered inlined block fails save.
- **Integration (proof fold):** ledger folds into `token_economy`; ledger hash appears in `entry.hashes`; a slug with no ledger completes with the field absent (no error).
- **Edge cases:** tee-write failure → run fails closed; empty test output; capture file deleted between test and save → save fails closed; multi-surface `--surface` resolves the right command.

## Dependencies

- `js-tiktoken` (net-new, dependencies, lazy-imported).
- Existing: `writeSaveMetadata` (artifact.ts:54), the build-report save gate (artifact.ts:929 + 1325), `ProofChainEntry` (types/proof.ts:48), ana.json surface schema (anaJsonSchema.ts:48).

## Constraints

- **Security:** capturing runner = array-arg `spawnSync`, no `shell:true`, no appended flags. Never route through `runBuildCommand`.
- **Fail-open on counts, fail-closed on preservation** — encoded explicitly, not implied.
- **No prompt changes.** Everything must reach the installed base via CLI update (validators, commands, ledger, schema). The agent prompt does not propagate (merge-not-overwrite).
- **Back-compat:** old proof entries (no ledger) must load with `token_economy` absent — never an error.
- **No test-count regression** (CI enforces across 3 OS × 2 Node). Baseline: 3234 passing / 132 files.
- **Honesty constraints:** report "raw test bytes kept out of working context (preserved verbatim in the proof)" — never "tokens saved", "% cheaper", or any `$`/total-spend claim. Do NOT write "resolves a prompt contradiction" anywhere (verified false).
- **Generalization:** must work for a Python CLI, Go service, Rust crate, .NET app — preservation is language-agnostic; counts degrade to N/A. The 8-stack corpus is the proof. No hardcoded `packages/` assumptions in the runner.

## Gotchas

- **Two save sites.** `saveArtifact` (929) AND `saveAllArtifacts` (1325). `save-all` is the pipeline path — wiring one leaves it bypassable.
- **Inliner runs before the hash.** Order in artifact.ts: inline → three validators → existing format validator → save-hash. Inlining after hashing would seal an un-expanded marker.
- **Idempotent inlining.** Re-saving a report that already has an expanded block must replace, not stack, the block — else byte-length drifts and `validateCaptureNotTruncated` false-fires.
- **Counts never block.** The validators must not read `counts`. A `verdict=unverified`/`counts=N/A` marker still seals.
- **`runBuildCommand` is a trap.** It is `shell:true` + discards stdout. Do not reuse or extend it.
- **`.saves.json` reader sprawl.** Proof context flags artifact.ts for multiple readers of the same file. Reuse the existing `modules_touched`/`commit_hygiene` read block in work-proof.ts (100–116) for the ledger; don't add a parallel reader.
- **Lazy tiktoken.** A top-level `import 'js-tiktoken'` in an always-loaded module would bloat every `ana` invocation. Dynamic-import it inside the ledger writer and `ana gain` only.
- **tee-write is fatal.** If preservation can't be written, fail closed — no capture-less seal, no `--no-verify`.
- **`.captures/` and `.token_ledger.jsonl` placement.** Inside the slug dir so they travel with the plan and get hashed; confirm `.ana/.gitignore` does not exclude them from the artifact commit if they must be committed (ledger is hashed via writeSaveMetadata; capture files are referenced by the inlined block).

## Build Brief

### Rules That Apply
- All local imports end in `.js`; `node:` prefix for built-ins. Omitting `.js` compiles but crashes at runtime (tsup emits ESM).
- `import type` separate from value imports — never mix.
- Named exports only; no default exports.
- Avoid `any` — use `unknown` + type guards. Define interfaces for the marker, ledger line, and `TokenEconomy`.
- `| null` for checked-and-empty (count abstain returns `null`); `?:` for may-not-be-checked.
- Early returns over nested conditionals.
- Two-layer errors: commands print `chalk.red` + `process.exit(1)`; pure modules (capture-marker.ts, token-ledger.ts) return values/throw, no chalk. Engine/util files stay CLI-dependency-free.
- Explicit return types on all exported functions; `@param`/`@returns` JSDoc on exports (eslint enforces).

### Pattern Extracts

**The save-time build-report gate to extend (artifact.ts:928–934) — twin at 1324–1326:**
```typescript
  if (typeInfo.baseType === 'build-report') {
    const error = validateBuildReportFormat(filePath);
    if (error) {
      console.error(chalk.red(`Error: build_report.md format invalid.\n${error}`));
      process.exit(1);
    }
  }
```
Add, immediately BEFORE the `validateBuildReportFormat` call in both blocks: run the inliner against `filePath` in place, then the three capture validators, each `process.exit(1)` on a returned error string.

**Validator shape to mirror (artifact-validators.ts:582):**
```typescript
export function validateBuildReportFormat(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const requiredSections = [ /* … */ ];
  for (const section of requiredSections) {
    if (!section.pattern.test(content)) {
      return `Missing '${section.name}' section. …`;
    }
  }
  return null; // valid
}
```

**The proof-fold read + spread (work-proof.ts:100–116, 163–164) — reuse this read block for the ledger:**
```typescript
  let modulesTouched: string[] = [];
  let commitHygiene: Array<{ check: string; file: string; severity: string; message: string }> = [];
  try {
    const slugSaves = path.join(anaDir, 'plans', 'completed', slug, '.saves.json');
    if (fs.existsSync(slugSaves)) {
      const savesContent = JSON.parse(fs.readFileSync(slugSaves, 'utf-8'));
      // … read modules_touched, commit_hygiene …
    }
  } catch { /* fall back to empty */ }
  // …
    ...(commitHygiene.length > 0 ? { commit_hygiene: commitHygiene } : {}),
    ...(worktreeMeta ? { worktree: worktreeMeta } : {}),
```
Add the ledger fold as `...(tokenEconomy ? { token_economy: tokenEconomy } : {})`.

**The runner NOT to reuse (worktree.ts:447) — note `shell:true`, `stdio:'pipe'` discards stdout:**
```typescript
    const result = spawnSync(buildCmd, {
      cwd: wtPath, stdio: 'pipe', encoding: 'utf-8', shell: true, timeout: 300000,
    });
    return result.status === 0;
```
The new runner uses the **argv-array** form: `spawnSync(cmd, argsArray, { cwd, encoding: 'buffer', timeout })` — no `shell`, capture `result.stdout`/`result.stderr` as Buffers.

**ana.json surface schema to extend (anaJsonSchema.ts:48–53):**
```typescript
const surfaceObjectSchema = z.object({
  path: z.string().catch(''),
  language: z.string().nullable().catch(null),
  framework: z.string().nullable().catch(null),
  commands: surfaceCommandsSchema,
}).catch({ path: '', language: null, framework: null, commands: {} });
```
Add `test_json: z.string().nullable().optional().catch(null)` and mirror the default in `createAnaJson`.

**`ProofChainEntry` cross-cut header (types/proof.ts:16) — adding a field touches 4 places:**
```
CROSS-CUTTING: Adding a field requires changes in 4+ locations:
  1. Type definition  2. generateProofSummary() default
  3. writeProofChain() construction  4. proof.ts display
```

### Proof Context
- **artifact.ts** — recurring finding: *multiple `.saves.json` readers* (`hasOpposingStageAdvanced` reads on every call; phase inference adds a second reader). Do NOT add a third reader for the ledger — fold it through the existing work-proof.ts read block. `writeSaveMetadata` is already exported "widening public API" — reuse, don't add a sibling.
- **worktree.ts** — finding: `getBuildCommandString` re-reads ana.json (duplicate I/O). Relevant to Phase 2; for Phase 1, don't add redundant ana.json reads in the runner — resolve the command once in test.ts and pass it in.
- **work.ts** — finding: two result parsers with different casing (`'unknown'` vs `'UNKNOWN'`). Not in this phase's path; avoid introducing a third verdict casing — use lowercase `pass|fail|unverified` consistently in the marker.

### Checkpoint Commands
- After capture-marker.ts + capture-runner.ts: `(cd 'packages/cli' && pnpm vitest run capture)` — Expected: new unit tests pass.
- After artifact.ts gate wiring: `(cd 'packages/cli' && pnpm vitest run artifact)` — Expected: existing artifact tests pass + new gate tests pass.
- After all changes: `pnpm run test -- --run` (top-level `commands.test`) — Expected: 3234 + new tests pass, 0 regressions.
- Lint: `(cd 'packages/cli' && pnpm run lint)` — Expected: clean.

### Build Baseline
- Current tests: **3234 passing** (2 skipped, 3236 total)
- Current test files: **132**
- Command used: `(cd packages/cli && pnpm vitest run)` (per-surface `surfaces.cli.commands.test`); top-level baseline `pnpm run test -- --run`
- After build: expected 3234 + new (corpus sweep ≈ 8 stacks × 7 invariants + unit suites) in 132 + new files
- Regression focus: `artifact.ts` save path (gate wiring), `work-proof.ts` (entry construction), `proof.ts` (display), `init/state.ts` + `anaJsonSchema.ts` (surface schema).
