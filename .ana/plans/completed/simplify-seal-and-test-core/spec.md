# Spec: Simplify `ana test` to its load-bearing core

**Created by:** AnaPlan
**Date:** 2026-06-07
**Scope:** .ana/plans/active/simplify-seal-and-test-core/scope.md

## Approach

One coherent, red-heavy diff. Four interlocking moves; do them together — the marker FORMAT changes, so every producer, consumer, doc, and sync test moves in lockstep or the gate breaks.

**Move 1 — Make the seal deterministic (the fix).** Today `executeCapture` hashes `result.rawBytes` (raw stdout+stderr — carries timing, ordering, progress), so the same outcome mints a different marker every run. Replace it: hash a canonical, normalized representation of the *result* — `stage | slug | counts | verdict` — via a single shared function that lives in the pure `capture-marker.ts` module. Counts and verdict are already deterministic (counts are read by key from the JSON reporter, not scraped from timing text). The same shared function is the source for BOTH the hash input and the idempotency test, so a test cannot pass while the hash silently diverges from the visible fields.

The precise canonical byte layout (this is the contract the idempotency test pins — do not deviate):

```
stage=<stage>\nslug=<slug>\ncounts=<counts>\nverdict=<verdict>
```

- Field order is fixed: `stage`, `slug`, `counts`, `verdict`.
- Separator is a single newline (`\n`); each field is `key=value`. No value can contain `\n`, so the form is unambiguous.
- `<counts>` is the `formatCounts(...)` string — `Np/Nf/Ns` or `abstain`. `<verdict>` is the literal `pass` | `fail` | `abstain`.
- `enginebind` does **NOT** participate in the hash. It is a dormant reserved field, not part of the result summary; excluding it keeps the parse→re-serialize round-trip stable.
- `sha256` = lowercase hex of `sha256(utf8(canonical string))`.

Design the module API so determinism is structural, not by-convention:
- `canonicalCaptureString(input: { stage, slug, counts, verdict }): string` — returns the exact bytes above.
- `captureSha(input: { stage, slug, counts, verdict }): string` — returns `sha256` hex over `canonicalCaptureString(input)`.
- `formatMarker(marker)` stays a pure serializer (takes the precomputed `sha256`, round-trips a parsed marker unchanged).
- `test.ts` computes the seal via `captureSha({ stage, slug, counts: formatCounts(counts), verdict })` — it no longer touches `createHash`/`result.rawBytes` for the seal.

`node:crypto`'s `createHash` is allowed in `capture-marker.ts` — the pure-module boundary forbids chalk/commander/process.exit, not crypto (the module already imports `node:fs`).

**Move 2 — Remove every non-deterministic field.** Drop `bytes` and `lines` from `CaptureMarker`, `formatMarker`, and the parser's required/accepted set. Remove the now-dead `countLines`. Remove `CaptureRunResult.bytes` (interface field + assignment) — it existed *only* to feed the removed marker field; count derivation uses `rawBytes` (the Buffer), never `bytes`. Remove the `bytes`/`lines` console line from `printOutcome`. The marker becomes `stage slug counts verdict sha256 [enginebind]` — every field deterministic.

**Move 3 — Delete the checkpoint machinery.** Remove the `-- <command>` passthrough mode, `isCheckpointSealConflict` + `SEALING_STAGES`, `failOrDegrade`'s checkpoint branch (collapse it to the baseline fail-closed path), the `[command...]` argument and its plumbing in `runTest`/`registerTestCommand`, and the `mode`/`degradedToRaw`/`rawText`/`bytes`/`lines` fields on `TestRunOutcome` and `ExecuteCaptureParams.passthrough`. KEEP `formatCounts`, `inferRunner`, `KNOWN_RUNNERS`, `resolveTestCommandString`, `countHint` — all still load-bearing. No dead code, no half-removed branch.

**Move 4 — Verify runs everything, mechanically.** `--stage verify` resolves the **top-level** `commands.test` and ignores `--surface` (open question resolved: ignore-and-run-full, not refuse — no caller passes `--surface` for verify, and a guard is surface for nothing). This makes "Verify runs the full project" a property of the stage, not a per-scope instruction. A full multi-package run may abstain on counts; that is accepted — an abstaining run still mints a deterministic marker (`counts=abstain`, verdict from exit code).

**Move 5 — Tell the truth, everywhere.** Correct all eight agent defs (per-role, see File Changes), the agent-def marker-description prose, and the three source docstrings. Remove "route every test through `ana test`" and the checkpoint-wrapping instruction; keep the accurate final-seal instruction.

### Integrity story (record, do not relitigate — settled in scope)
The canonical hash is recomputable from the marker's visible fields: it proves **determinism and self-consistency, NOT forgery resistance**. Forgery resistance for the **build** seal is Verify's independent re-run. The **final verify** seal has no re-run and is hand-forgeable — an **accepted residual risk** (the only possible forger is Verify itself, which is adversarially bent and unincentivized). This scope does not gate the verify report and does not change the gate's behavior (AC9).

### Open questions from scope — resolved
- *Verify + `--surface`* → **ignore-and-run-full.** `--stage verify` uses top-level `commands.test` regardless of `--surface`.
- *Canonical serialization* → specified above (newline-separated `key=value`, fixed order, `enginebind` excluded).
- *Codex sync coverage (AC11)* → **extend** the existing `Dogfood Codex` byte-check in `codex-learn-template.test.ts` to loop over all `CODEX_AGENT_FILES` `.md` against templates (mirrors the `.claude` byte-check in `agent-proof-context.test.ts`). Closes the gap for every codex agent, not just build/verify; smaller than a sibling file.

## Output Mockups

The sealed marker, before and after:

```
# BEFORE (non-deterministic — bytes/lines change every run)
<!-- ana:capture stage=build slug=demo counts=47p/0f/2s verdict=pass sha256=<64hex> bytes=246012 lines=3100 -->

# AFTER (deterministic — byte-identical for a stable outcome)
<!-- ana:capture stage=build slug=demo counts=47p/0f/2s verdict=pass sha256=<64hex> -->

# AFTER, abstaining run (full-project / unknown runner)
<!-- ana:capture stage=verify slug=demo counts=abstain verdict=abstain sha256=<64hex> -->
```

Baseline console output (the `bytes / lines captured` gray line is gone):

```
✓ captured  counts: 47 passed, 0 failed, 2 skipped  (verdict: pass)

  Paste this marker into build_report.md:
  <!-- ana:capture stage=build slug=demo counts=47p/0f/2s verdict=pass sha256=<64hex> -->
```

## File Changes

### packages/cli/src/utils/capture-marker.ts (modify)
**What changes:** Add `canonicalCaptureString` and `captureSha` (the shared canonical-hash functions). Remove `bytes` and `lines` from `CaptureMarker`, from `formatMarker`'s emitted parts, and from `parseMarkerText`'s required/parsed set (drop the `bytes` integer check, the `'lines' in fields` discriminator, and the `lines` integer check). Remove `countLines` and the `NL` constant. Correct the module docstring (lines ~5–20: drop "byte + line totals", the "required `lines` field" note, and the closed-token reasoning that names `lines`).
**Pattern to follow:** Keep the pure-module boundary (no chalk/commander/exit; `node:crypto` is fine). Mirror the existing `formatCounts` export shape and JSDoc style. `formatMarker` keeps emitting `enginebind` only when present.
**Why:** This is the determinism fix and the single source of truth for the hash; without the shared function the idempotency test and the hash can drift.

### packages/cli/src/commands/test.ts (modify)
**What changes:** Replace the seal computation — `createHash('sha256').update(result.rawBytes)` becomes `captureSha({ stage, slug, counts: formatCounts(counts), verdict })`. Remove the entire checkpoint path: `mode`, the checkpoint branch in `executeCapture`, `SEALING_STAGES`, `isCheckpointSealConflict`, the conflict guard in `runTest`, `failOrDegrade`'s checkpoint half (keep only the baseline exit-3 fail-closed return), the `[command...]` argument + `passthrough` plumbing, and the `bytes`/`lines`/`mode`/`degradedToRaw`/`rawText` fields on `TestRunOutcome`. Remove `countLines` from imports. Remove the `bytes / lines captured` line(s) in `printOutcome` (both the baseline and the now-deleted checkpoint branch). Make `--stage verify` resolve the top-level command ignoring `--surface`. Correct the top docstring (lines ~1–21: drop "byte/line totals", the checkpoint paragraph, and the checkpoint half of the exit-code contract).
**Pattern to follow:** The surviving baseline path (resolve → runCapture → deriveCounts → deriveVerdict → seal → formatMarker) stays intact; only its hash input changes and its checkpoint sibling is deleted. Two-layer error handling per coding-standards: command surfaces errors, exit codes preserved (0 / 1 / 3).
**Why:** Removes the determinism defect and the abandoned-aspiration machinery (the footgun `compact-capture-seal-C5` flagged).

### packages/cli/src/utils/capture-runner.ts (modify)
**What changes:** Remove `CaptureRunResult.bytes` (interface field ~L54 and its assignment ~L346). Update the `CaptureRunResult` docstring (~L49–55) to drop the byte-length field. `rawBytes` stays (counts derivation + tee).
**Pattern to follow:** `runCapture` still returns `rawBytes`, `exitCode`, `sink`, `usedShell`. Callers that needed a byte length read `rawBytes.byteLength`.
**Why:** `bytes` fed only the removed marker field; leaving it is dead surface.

### Agent defs — per-role, identical within a role across all 4 copies, DIFFERENT between roles

**ana-build.md ×4** — `packages/cli/templates/.claude/agents/ana-build.md`, `packages/cli/templates/.codex/agents/ana-build.md`, `.claude/agents/ana-build.md`, `.codex/agents/ana-build.md` (modify)
**What changes:** Remove the "**Run every test through `ana test`**" sentence and the "**Checkpoints** (per-file…): `ana test --slug {slug} -- {checkpoint command…}`" bullet. Keep the "**Baseline**… `ana test --stage build --slug {slug}`" instruction, but edit its marker description from "(counts + verdict + sha256 + byte/line totals)" to "(counts + verdict + sha256)". The surrounding guidance — run `commands.build`, run Build-Brief checkpoint commands as raw test runs, baseline-passes/fails handling — stays. (The `{checkpoint test command from Build Brief}` placeholder in the build-report template section is a raw command, NOT an `ana test` wrapper — leave it.)
**Why:** The defs must stop instructing the removed checkpoint-wrapping and route-everything behavior; the final seal instruction is what survives.

**ana-verify.md ×4** — same four locations (modify)
**What changes:** In the single capture instruction line: remove the "For the focused command, use `ana test --slug {slug} -- {checkpoint command from the Build Brief}`." sentence; keep the unconditional "Run your independent test re-run through `ana test --stage verify --slug {slug}`" (it already runs the full project — no per-scope condition). Edit the marker description "(counts + verdict + sha256 + byte/line totals; nothing inlined)" to "(counts + verdict + sha256; nothing inlined)". Keep the "`verify_report.md` itself is never gated" note.
**Why:** Verify no longer routes a focused checkpoint through `ana test`; its run is the full-project seal.

> `ana-plan.md` is UNTOUCHED — it authors per-file commands from `commands.test`/`surfaces.*.commands.test` and never wraps them in `ana test`. Do not edit it.

### packages/cli/tests/commands/template-capture-instruction.test.ts (modify)
**What changes:** Rewrite the assertions that pin the removed forms. The block asserting `ana test --slug {slug} -- {checkpoint command` (and the "all four templates instruct running tests through `ana test`" framing, if it implies route-everything) must no longer assert the checkpoint form. Assert the SURVIVING instructions: build templates contain `ana test --stage build --slug` and do NOT contain `-- {checkpoint command` or "Run every test through"; verify templates contain `ana test --stage verify --slug` and do NOT contain the `-- {checkpoint command` form; codex bodies still mirror claude bodies (keep that block).
**Pattern to follow:** Existing enforcement-test style in this file (read template, assert content). Per testing-standards, source-content assertions are acceptable as template-enforcement tests.
**Why:** This is the "now-wrong test" the scope exists to fix — it WILL fail on checkpoint removal.

### packages/cli/tests/utils/capture-marker.test.ts (modify)
**What changes:** Remove/rewrite the `@ana A024` old-format-rejection test (it rejects an old marker *because it lacks `lines`* — once `lines` is no longer required that marker parses; the assumption is invalid). Remove the `countLines` import + its test, the `bytes`/`lines` fields from the `marker()` factory, and the `bytes=`/`lines=` assertions in the "carries…" and round-trip tests. Add the idempotency + canonical-layout tests (see Testing Strategy). Keep all parser well-formedness tests (fenced, placeholder, non-hex sha256, missing sha256, backtick-wrapped, trailing-prose, enginebind round-trip) — only drop their `bytes=`/`lines=` tokens. Update the file docstring to drop the `lines`-discriminator language.
**Why:** The marker shape changed; these assertions encode the old shape.

### packages/cli/tests/commands/test-command.test.ts (modify)
**What changes:** Remove the entire `describe('isCheckpointSealConflict', …)` block and the `describe('executeCapture — checkpoint', …)` block, and the `isCheckpointSealConflict` import. In `executeCapture — baseline`: drop `expect(outcome.marker).toContain('lines=')`, `expect(outcome.lines).toBe(1)`, the `outcome.bytes` assertion (~L214), and any `bytes`/`lines` marker-content checks. Keep the baseline seal, log-deletion, countHint, exit-1, exit-3, and large-capture tests (the large-capture test keeps verifying the seal works at size — just assert `outcome.marker` exists / verdict, not `outcome.bytes`).
**Why:** Trims the removed surface; keeps the spine coverage.

### packages/cli/tests/utils/capture-runner.test.ts (modify)
**What changes:** The "tees exactly the captured bytes to the sink" test (~L119–128) asserts `result.bytes` — switch those to `result.rawBytes.byteLength` (the surviving field). The tee test stays load-bearing.
**Why:** `CaptureRunResult.bytes` is removed; the byte-length is still derivable from `rawBytes`.

### packages/cli/tests/templates/codex-learn-template.test.ts (modify)
**What changes:** Generalize the `Dogfood Codex Learn` byte-check (AC11). Replace the single-file `ana-learn.md` assertion with a loop over `CODEX_AGENT_FILES` (`import { CODEX_AGENT_FILES } from '../../src/constants.js'`) that byte-checks each `.md` dogfood copy in `.codex/agents/` against its template — mirroring the `.claude` check in `agent-proof-context.test.ts` (A008). Keep the existing `ana-learn.agent.toml` assertion. Leave the learn-specific content tests untouched.
**Pattern to follow:** `agent-proof-context.test.ts` A008 — loop `for (const file of AGENT_FILES) { expect(dogfood).toBe(template) }`.
**Why:** Closes the asymmetric-enforcement gap so the `.codex` ana-build/ana-verify edits (and all future codex `.md` drift) are test-enforced.

> `packages/cli/tests/capture-corpus/invariants.test.ts` — **no edit.** Confirmed: it asserts counts/verdict only; the sole `bytes`/`lines` reference is in a comment. Do not touch.
> `packages/cli/tests/commands/init/template-propagation.test.ts` and `packages/cli/tests/templates/agent-proof-context.test.ts` — keep passing (the latter byte-checks `.claude` dogfood; your `.claude` def edits must land in both template and dogfood or A008 fails).

## Acceptance Criteria

- [ ] AC1: `sha256` is computed over `canonicalCaptureString(stage|slug|counts|verdict)` via one shared function — not over raw runner output.
- [ ] AC2: `bytes` and `lines` removed from `CaptureMarker`, `formatMarker`, parser required/accepted set; `countLines` removed; the `bytes`/`lines` console line removed from `printOutcome`.
- [ ] AC3: Two captures of the same outcome produce a byte-identical marker, asserted by a new test that pins the exact canonical byte layout. (Fresh local contract id — see contract.yaml; not "A026".)
- [ ] AC4: Checkpoint passthrough mode removed — `isCheckpointSealConflict`, `SEALING_STAGES`, the degrade-to-raw path, `rawText`/`degradedToRaw`/`mode`, the `[command...]` argument, AND `CaptureRunResult.bytes` — no dead code. (`formatCounts`, `inferRunner`, `KNOWN_RUNNERS`, `countHint` stay.)
- [ ] AC5: `ana test` exposes only `--slug` (required), `--stage` (build|verify), `--surface <name>`, `--json`. No `--all`. `--surface` absent = full project, falling back to top-level `commands.test`.
- [ ] AC6: `--stage verify` runs the full project regardless of `--surface` (ignore-and-run-full).
- [ ] AC7: "route every test through `ana test`" and the checkpoint-wrapping instruction removed from every ana-build/ana-verify def + dogfood copy; marker-description prose updated to drop "byte/line"; the final-seal instruction remains. Edits identical within each role, different between roles. `ana-plan.md` unchanged.
- [ ] AC8: `template-propagation.test.ts`, `agent-proof-context.test.ts`, and the rewritten `template-capture-instruction.test.ts` pass; the `@ana A024` old-format test removed or rewritten.
- [ ] AC9: Save-time present-check gate behavior unchanged — a build report still requires exactly one well-formed `build` marker; only the parsed field set changes. No new re-parse path introduced.
- [ ] AC10: Source docstrings corrected: `test.ts`, `capture-marker.ts`, `capture-runner.ts`.
- [ ] AC11: Codex dogfood `ana-build.md`/`ana-verify.md` synced AND covered by a byte-check test (generalized `codex-learn-template.test.ts`).
- [ ] AC12: Full suite green (`(cd packages/cli && pnpm vitest run)`); no fragile/cosmetic-prose assertions added; diff removes the removed-machinery tests and adds only the idempotency/canonical tests. One clean diff.
- [ ] AC13 (new): No new dependents on `result.bytes` / marker `bytes`/`lines` anywhere in `src/` after the change (`grep` clean).
- [ ] AC14 (new): `pnpm run lint` clean; `pnpm run build` succeeds.

## Testing Strategy

- **Unit (capture-marker.test.ts):**
  - **Canonical layout (AC3):** assert `canonicalCaptureString({stage:'build',slug:'demo',counts:'47p/0f/2s',verdict:'pass'})` equals the exact string `stage=build\nslug=demo\ncounts=47p/0f/2s\nverdict=pass`.
  - **Idempotency (AC3):** call the seal path twice on identical inputs; assert the two `formatMarker(...)` lines are byte-identical.
  - **Hash binds visible fields:** assert the marker's `sha256` equals `captureSha(sameInput)` recomputed independently (proves determinism / self-consistency).
  - **Hash discriminates:** assert `captureSha` differs when `verdict` (or `counts`) changes — the hash actually binds the result.
  - **Shape:** `formatMarker` output contains `stage`/`slug`/`counts`/`verdict`/`sha256` and does NOT contain `bytes=` or `lines=`; parser accepts the 5-field marker; parser still rejects non-hex / missing `sha256` (well-formedness preserved).
- **Unit (test-command.test.ts):** baseline still seals; failing baseline exits 1; shell-needing command exits 3; `--stage verify` with `--surface` set seals a `stage=verify` marker resolved from the top-level command.
- **Enforcement (template-capture-instruction.test.ts, codex-learn-template.test.ts):** surviving instructions present, removed forms absent, codex `.md` dogfood == template byte-for-byte.
- **Gate (capture-marker.test.ts):** present new-shape build marker → not blocked; missing marker + enabled → blocked; fenced/placeholder → blocked.
- **Edge cases:** abstaining run (`counts=abstain`) still mints a deterministic, gate-valid marker; large-capture run still seals (no `bytes` assertion).
- **Regression focus:** the full `capture-corpus/invariants.test.ts` sweep and `agent-proof-context.test.ts` A008 must stay green.

## Dependencies

None external. `CODEX_AGENT_FILES` already exists in `packages/cli/src/constants.ts`.

## Constraints

- **Gate behavior frozen (AC9).** `evaluateCaptureGate`/`validateCapturePresent`/`parseMarkers` keep their present-check semantics; only the parsed field set narrows. Do not add a verify-report gate (out of scope; accepted residual risk). Confirm no NEW path re-parses historical/saved reports — the gate runs only on the report being saved (`artifact.ts:803`).
- **Pure-module boundary.** `capture-marker.ts` stays free of chalk/commander/process.exit. `node:crypto` is permitted.
- **ESM imports.** All local imports end in `.js`; `import type` for type-only imports (coding-standards).
- **Per-role lockstep.** Apply AC11's coverage FIRST, then the def edits — the two `.codex` copies are not test-enforced until it lands. `.claude` edits must hit both template and dogfood or `agent-proof-context.test.ts` A008 fails.
- **Stale dist.** Run `(cd packages/cli && pnpm run build)` before any test that reads compiled output / terminal behavior (testing-standards).

## Gotchas

- `template-capture-instruction.test.ts` and the `@ana A024` test in `capture-marker.test.ts` WILL fail on the change — they are the "now-wrong test" trap; rewrite them, do not weaken them.
- Dropping required `lines` widens the accepted-seal shape: any line with the five core fields now parses as a seal. Safe — no live path re-parses historical reports. Record, don't guard.
- `capture-runner.test.ts` asserts `result.bytes` — switch to `result.rawBytes.byteLength`, don't delete the tee test.
- The build-report template section's `{checkpoint test command from Build Brief}` placeholder is a RAW command, not an `ana test` wrapper — leave it.
- `result.bytes` and marker `bytes`/`lines` have zero consumers in `src/`, the proof chain, or `website/` (verified) — removal is safe; confirm with a final grep (AC13).

## Build Brief

### Rules That Apply
- All local imports end in `.js`; `node:` prefix for built-ins; `import type` separate from value imports (coding-standards).
- `capture-marker.ts` / `capture-runner.ts` are pure — no chalk/commander/ora/process.exit. `node:crypto` is allowed.
- Exported functions need explicit return types + `@param`/`@returns` JSDoc (eslint enforces; pre-commit rejects missing tags).
- Prefer early returns; `| null` for checked-empty fields.
- Tests assert specific values (`toBe(1)`, exact marker bytes), never `toBeDefined`/range matchers when the fixture count is known (testing-standards).
- Source-content assertions are acceptable ONLY as template/structural enforcement tests (the agent-def sync tests) — elsewhere, mock the trigger and assert output.
- The seal/hash logic belongs in the pure module; the command layer (`test.ts`) calls into it.

### Pattern Extracts

The seal computation to replace — `test.ts:303–312` (current):
```ts
  // 6. Baseline — seal the COMPACT marker (no inlined block, no file path).
  const sha = createHash('sha256').update(result.rawBytes).digest('hex');
  const marker = formatMarker({
    stage: params.stage,
    slug: params.slug,
    counts: formatCounts(counts),
    verdict,
    sha256: sha,
    bytes: result.bytes,
    lines,
  });
```
Becomes (shape): `const sha = captureSha({ stage: params.stage, slug: params.slug, counts: formatCounts(counts), verdict });` then `formatMarker({ stage, slug, counts: formatCounts(counts), verdict, sha256: sha })`.

The codex dogfood byte-check to mirror — `agent-proof-context.test.ts:74–82`:
```ts
  it('dogfood agent definitions match the shipped templates exactly', () => {
    const dogfoodDir = path.join(__dirname, '../../../../.claude/agents');
    const files = [...AGENT_FILES];
    for (const file of files) {
      const template = readTemplate(file);
      const dogfood = readFileSync(path.join(dogfoodDir, file), 'utf-8');
      expect(dogfood, `${file} dogfood should match template`).toBe(template);
    }
  });
```
Apply the same loop for `.codex` over `CODEX_AGENT_FILES` (`.md` files) in `codex-learn-template.test.ts`.

The marker serializer to trim — `capture-marker.ts:110–122`:
```ts
export function formatMarker(marker: CaptureMarker): string {
  const parts = [
    `stage=${marker.stage}`,
    `slug=${marker.slug}`,
    `counts=${marker.counts}`,
    `verdict=${marker.verdict}`,
    `sha256=${marker.sha256}`,
    `bytes=${marker.bytes}`,   // remove
    `lines=${marker.lines}`,   // remove
  ];
  if (marker.enginebind !== undefined) parts.push(`enginebind=${marker.enginebind}`);
  return `<!-- ana:capture ${parts.join(' ')} -->`;
}
```

### Proof Context
- **`test.ts`** — `compact-capture-seal-C5`: `isCheckpointSealConflict` over-builds beyond its contract (refuses explicit `--stage` + checkpoint). This scope DELETES it — the finding is resolved by removal. `captured-test-evidence-C2`: checkpoint passthrough loses argv quoting — moot once checkpoint is gone.
- **`capture-marker.ts`** — `captured-test-evidence-C4`: `validateCapturePresent` uses `parseMarkers` (per-line, fence-skipping) for the present-check; gate behavior must stay as-is (AC9). The finding notes a forgery surface deferred to `enginebind` — unchanged by this scope.
- **`capture-runner.ts`** — `captured-test-evidence-C3` (rspec loose regex) and the abstain-on-unknown behavior are unrelated to this change; do not touch `deriveCounts`/`deriveVerdict`.

### Checkpoint Commands
- After `capture-marker.ts` + `capture-runner.ts`: `(cd packages/cli && pnpm vitest run tests/utils/capture-marker.test.ts tests/utils/capture-runner.test.ts)` — Expected: green (after the tests are updated).
- After `test.ts`: `(cd packages/cli && pnpm vitest run tests/commands/test-command.test.ts)` — Expected: green.
- After agent-def edits: `(cd packages/cli && pnpm vitest run tests/commands/template-capture-instruction.test.ts tests/templates/agent-proof-context.test.ts tests/templates/codex-learn-template.test.ts)` — Expected: green.
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 138 files, all tests pass, 2 skipped (count shifts by the net test delta — removed-machinery tests gone, idempotency/canonical tests added).
- Lint/build: `pnpm run lint` and `(cd packages/cli && pnpm run build)` — clean.

### Build Baseline
- Current tests: **3429 passed, 2 skipped (3431 total)**
- Current test files: **138**
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: net change from removing the checkpoint/conflict/bytes/lines tests (≈8–10 removed) and adding the canonical/idempotency tests (≈4–6 added). File count likely stays 138 (no test file deleted). The exact total is not pinned — assert green, not a fixed number.
- Regression focus: `capture-marker.test.ts`, `test-command.test.ts`, `capture-runner.test.ts`, `template-capture-instruction.test.ts`, `agent-proof-context.test.ts`, `codex-learn-template.test.ts`, `capture-corpus/invariants.test.ts`.
