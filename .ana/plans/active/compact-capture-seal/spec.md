# Spec: Compact the capture seal + fix the count

**Created by:** AnaPlan
**Date:** 2026-06-06
**Scope:** .ana/plans/active/compact-capture-seal/scope.md

## Approach

Separate **evidence** from **attestation**. Today they are fused: the committed raw bytes *are* the evidence (verified byte-for-byte against a hash), and the count is regex-scraped from those same bytes. That fusion forces the dump and ties the count to human output. Split them:

- **Evidence** — `ana test` tees the full output to `.captures/*.log`, computes a sha256 + byte/line totals + counts from it, then **deletes the log** (after hash+count) and never inlines or commits it. A `.captures/` gitignore rule is belt-and-suspenders, not the primary mechanism.
- **Attestation** — a compact, single-line marker carrying `stage, slug, counts, verdict, sha256, bytes, lines`, plus a reserved (unused) L3 engine-binding field. One line, no block.
- **Count source** — derived from a machine-readable reporter. `resolveTestCommandString` learns to prefer top-level `commands.test_json` (today it reads `test_json` only under surfaces). The vitest parser learns to read vitest's JSON-reporter output (structural analog: `parseGo`). This is **opt-in**: a repo without a JSON reporter abstains safely, and the abstain output names the fix.
- **Parser** — the marker becomes a closed token: full-line-anchored, strict field grammar (notably a 64-char lowercase-hex `sha256` and a required `lines` field), parsed outside fenced code regions. A prose *description* of the format (placeholders, fenced examples) no longer parses as a real seal.

This is mostly a **red diff**. The length-addressed inliner (`locateBlock`/`renderBlock`/`inlineCaptures`/`eachMarker`), the 8 MiB inline ceiling, and two of three seal validators are **deleted**, not adapted. The save path stops inlining entirely.

### Decisions resolved (from scope Open Questions + developer review)

- **Count source = opt-in `test_json` (not auto-derive).** Auto-deriving a JSON-reporter flag per runner is the invasive command-mutation this cleanup is removing; it risks clashing with a project's configured reporter and changing which tests run. AC3's honest reach: the abstain is fixed **where a JSON reporter is configured** (`test_json`), not blanket. To keep opt-in honest, abstaining for lack of a JSON reporter **must** print a discoverability hint (AC11) — without it, customers abstain forever and never learn the fix.
- **Fail-case = fully compact (approach A).** Even on failure the committed report carries only the one-line seal. Live-debugging is already covered (the log is on disk *during* the `ana test` run, and Scope 2 Spec B compacts failures into the agent return). Approach C (bounded fail-excerpt) would re-add the inliner + an excerpt validator we are deleting.
- **Validator collapse = delete two, keep present.** `validateCaptureInlined` and `validateCaptureNotTruncated` assume an inlined block and have nothing to check once nothing is inlined — delete them. `validateCapturePresent` stays but is now backed by the **strict** parser, so "present" means "a well-formed compact build seal exists." Well-formedness lives in the parser, not a separate validator.
- **Closed-token robustness = combination, not grammar alone.** A doc author can write a plausible 64-hex example, so the 64-hex grammar does not carry the guarantee by itself — the **full-line anchor + fenced-region skip + required `lines` field** carry it. AC5 tests descriptions / placeholders / fenced examples (the real bug). It must **not** assert that a verbatim real marker pasted raw into prose is caught — that is the forgery surface consciously deferred to L3 (do not over-claim).
- **Old-format tolerance (AC10) is the same mechanism as AC5.** An old-format marker lacks the required `lines` field (and carries the removed `file` field), so it fails the strict grammar → parsed as not-well-formed → not "present" → gate not satisfied. The guarantee: an old-format report causes **no throw** and is **not validated as a well-formed new seal**. D4 and D10 are one mechanism.
- **L3 field is reserved, not implemented.** Add an optional `enginebind` field (named to signal an engine-binding token, not a data field). The parser round-trips it present and absent; both re-serialize unchanged. **Do not** build any nonce/binding machinery — plumbing only. This is the testable form of "adding the token later needs no second format migration" (AC7) — never "verified by inspection."
- **Cleanup timing = `ana test`, after hash+count.** The `.log` is deleted at the end of a successful capture, on the seal path only (per scope line 63 + carry-in). `artifact save` does no cleanup. The gitignore covers the brief in-run window and a crash-before-delete.
- **8 MiB inline ceiling = removed.** It existed only to bound the inlined block size. With no inlining, output size no longer bounds the seal; the only size limit is `runCapture`'s 64 MiB `maxBuffer` (which already fails closed before writing a sink). This also closes the rejected "approach B excerpt-on-overflow" question.

### Project-specific assumptions

- **Dogfood vs product.** The `.captures/` gitignore rule already exists in the **template generator** (`assets.ts` — added by PR #281); only the **dogfood** `.ana/.gitignore` is missing it. The template generator's comment is stale ("the committed truth is the inlined block in build_report.md") and must be corrected. (Scope's "neither has it" finding is stale — verified against the file.)
- **anaJsonSchema is NOT changed.** Surface-level `test_json` is already typed; top-level `commands` is a loose `z.record(string, unknown)` passthrough, so top-level `test_json` already validates without a schema change. Setting our own `commands.test_json` is a dogfood-config edit to `.ana/ana.json`, not a schema change. (This deviates from the scope's file list — justified here.)
- **Runner-agnostic count path.** The JSON-count path is proven against a concrete non-vitest runner (`go test -json` via the existing `parseGo`, AC9), so it is not hard-wired to vitest — required by "every change must work for all customers."

## Output Mockups

**`ana test --stage build --slug compact-capture-seal` (baseline, count from `test_json`):**
```
✓ captured  counts: 3432 passed, 0 failed, 2 skipped  (verdict: pass)
  246012 bytes / 3100 lines captured (log deleted after sealing)

  Paste this marker into build_report.md:
  <!-- ana:capture stage=build slug=compact-capture-seal counts=3432p/0f/2s verdict=pass sha256=9f2c…<64hex>…a1 bytes=246012 lines=3100 -->
```

**Abstain with discoverability hint (no `test_json` configured — AC11):**
```
✓ captured  counts: abstain  (verdict: abstain)
  18244 bytes / 240 lines captured (log deleted after sealing)
  ℹ No machine-readable count: set `commands.test_json` in .ana/ana.json for a real sealed count.

  Paste this marker into build_report.md:
  <!-- ana:capture stage=build slug=compact-capture-seal counts=abstain verdict=abstain sha256=…<64hex>… bytes=18244 lines=240 -->
```

**Committed seal in `build_report.md` (no block, one line):**
```markdown
## Test Evidence

<!-- ana:capture stage=build slug=compact-capture-seal counts=3432p/0f/2s verdict=pass sha256=9f2c…a1 bytes=246012 lines=3100 -->
```

**Reserved L3 field present (round-trips identically — AC7):**
```
<!-- ana:capture stage=build slug=x counts=1p/0f/0s verdict=pass sha256=…<64hex>… bytes=10 lines=2 enginebind=reserved -->
```

## File Changes

> The machine-readable change list is in `contract.yaml` (`file_changes`). Prose context below.

### packages/cli/src/utils/capture-marker.ts (modify — significant deletion)
**What changes:** Reshape the marker to the compact form and **delete** the inliner machinery. Add `lines: number` and optional `enginebind?: string` to `CaptureMarker`; drop `file`. `formatMarker` emits the new field order (`stage slug counts verdict sha256 bytes lines [enginebind]`), emitting `enginebind` only when present. Replace `parseMarkerText`/`parseMarkers` with a **strict, full-line-anchored, fenced-region-skipping** parser: a line parses as a marker only when, after trimming, it is *exactly* `<!-- ana:capture … -->`, every required key is present (`stage∈{build,verify}`, `slug`, `counts`, `verdict∈{pass,fail,abstain}`, `sha256` = 64 lowercase hex, `bytes` = non-negative int, `lines` = non-negative int), with unknown keys ignored for forward-compat. Lines inside ```` ``` ```` fenced blocks are skipped. **Delete** `locateBlock`, `renderBlock`, `eachMarker`, `inlineCaptures`, `bufHasAt`, the byte-offset helpers, `BEGIN_PREFIX`/`END_LINE`/`END_SEQ` constants, `InlineResult`, `validateCaptureInlined`, `validateCaptureNotTruncated`, and the loose `MARKER_REGEX`/`MARKER_REGEX_G`. `validateCapturePresent` stays but uses the strict parser (a build-stage marker that parses = present). `evaluateCaptureGate` keeps the same signature but now runs only the present-check.
**Pattern to follow:** the existing `formatMarker`/`parseMarkerText` pair is the template for the compact version; preserve the module's purity (no chalk/commander/process.exit).
**Why:** the inliner and block-validators only have meaning when a block is inlined; keeping them is dead, confusing scaffolding. The loose regex is the prose-collision surface (AC5).

### packages/cli/src/utils/capture-runner.ts (modify)
**What changes:** Teach the vitest count path to read vitest's JSON-reporter output. Add a JSON parser (structural analog: `parseGo` — detect a distinctive shape, count, return `TestCounts | null`, abstain on no-match) and make the `vitest` entry try JSON first, then fall back to the existing human-summary parser. Confirm vitest's `--reporter=json` field names against actual output before coding (do not assume — run it). Preserve `deriveCounts` hint-only behavior and `deriveVerdict` no-false-green **exactly** — do not reintroduce the regex fallthrough (proof finding `captured-test-evidence-C3`).
**Pattern to follow:** `parseGo` at `capture-runner.ts:492` — shape-gate (`if (!/…/.test(text)) return null`) then count.
**Why:** the count is the deliverable that fixes the `abstain` on our own repo; a machine-readable reporter is parsed mechanically instead of scraping human output a turbo wrapper mangles.

### packages/cli/src/commands/test.ts (modify)
**What changes:** (1) `resolveTestCommandString` reads top-level `commands.test_json` before `commands.test` (mirroring the surface branch) and reports which source was used — change its return to carry the source (e.g. `{ command, source: 'test'|'test_json' } | null`) so the abstain hint can fire only when `test_json` was *not* used. Update both callers (`executeCapture` here, `isCaptureGateEnabled` in artifact.ts). (2) After computing sha + counts and building the marker, **delete the `.log` sink** (both baseline and checkpoint; the bytes are already in memory). (3) **Remove** `INLINE_CEILING_BYTES` and the over-ceiling fail-closed branch. (4) Build the compact marker with `lines` (count of `0x0a` bytes in the captured output) and no `file`. (5) When the baseline verdict is `abstain` because counts are null **and** `test_json` was not the source, set a structured `countHint` on the outcome naming `commands.test_json`; render it in `printOutcome`. (6) Drop the `file=`-path display line in favor of a "bytes / lines captured (log deleted after sealing)" line.
**Pattern to follow:** existing `executeCapture` structure and `failOrDegrade`; keep the data/print split (no chalk in `executeCapture`).
**Why:** top-level `test_json` is the missing piece for our own abstain; the hint is what makes opt-in honest; deleting the log is the active cleanup the gitignore only backs up.

### packages/cli/src/commands/artifact.ts (modify)
**What changes:** Stop inlining. **Delete** `inlineReportCaptures` and remove the `inlineCaptures` import; `applyCaptureGate` no longer inlines — it runs the present-check gate only (build reports). Remove the `inlineReportCaptures` calls on the verify-report paths (verify reports carry the compact marker as pasted; nothing to inline). Adapt the `resolveTestCommandString` call sites in `isCaptureGateEnabled` to the new return shape. No `.captures` cleanup here (cleanup is in `ana test`).
**Pattern to follow:** the current `applyCaptureGate` gate/exit structure; keep the block message built from real validator errors.
**Why:** inlining is the behavior being removed; the gate's job shrinks to "a well-formed build seal is present."

### packages/cli/templates/.claude/agents/ana-build.md, ana-verify.md + packages/cli/templates/.codex/agents/ana-build.md, ana-verify.md (modify — product change, all four)
**What changes:** Replace the capture-seal description. The build templates' "at save it expands into a verbatim, sha-sealed block" (ana-build.md:110 / .codex ana-build.md:103) becomes language describing a compact, single-line sealed marker (counts + verdict + sha256 + byte/line totals) that is committed as-is — no expansion, no block. Align the verify templates' capture-seal wording (ana-verify.md:179 / .codex:172) to the compact marker. **Only** the *capture* seal language changes — leave the *contract* seal (contract.yaml tamper-check) language untouched.
**Why:** the templates ship to all customers and currently document a block that no longer exists (AC8).

### .ana/.gitignore (modify — dogfood)
**What changes:** add the `plans/active/*/.captures/` rule (with a comment matching the compact-seal reality). The template generator already has the rule.
**Why:** belt-and-suspenders so a missed cleanup never commits raw output (AC6).

### packages/cli/src/commands/init/assets.ts (modify)
**What changes:** the `.captures/` gitignore rule already exists (lines 99–100); fix its stale comment ("the committed truth is the inlined block in build_report.md") to describe the compact seal.
**Why:** the comment documents a block that no longer exists.

### .ana/ana.json (modify — dogfood config)
**What changes:** add `commands.test_json` — a command that runs the suite and emits machine-readable JSON to stdout (e.g. a vitest `--reporter=json` run of the CLI package). Build determines the exact string and confirms its derived count matches the human count (3434).
**Why:** turns our own repo's `abstain` into a real sealed count (AC3); also our dogfood proof that opt-in works.

### Test files (modify)
`packages/cli/tests/utils/capture-marker.test.ts`, `packages/cli/tests/utils/capture-runner.test.ts`, `packages/cli/tests/commands/test-command.test.ts`, and the artifact capture-gate tests. Delete tests for the removed inliner/validators; add tests for the strict parser, JSON count, hint, cleanup, idempotency, and the L3 round-trip. Tag each with its contract assertion id.

## Acceptance Criteria

- [ ] AC1: A baseline `ana test --stage build` emits a single-line sealed marker containing counts, verdict, a sha256 of the captured output, and byte + line totals — and no inlined raw output.
- [ ] AC2: At `artifact save`, a compliant build report seals without inlining; the report contains no verbatim test-output block (`ana:capture-begin` absent).
- [ ] AC3: The count is derived from a machine-readable reporter (`test_json`), not regex over human output. With `commands.test_json` configured, running the seal on this repo produces a real count, not `abstain`. **Honest reach:** fixed where a JSON reporter is configured; a repo without one still abstains safely (AC4).
- [ ] AC4: When no machine-readable reporter is configured/resolvable, the seal abstains safely (fail-open, no fabricated count); the no-false-green guarantee in `deriveVerdict` is preserved.
- [ ] AC5: The marker is a closed token — a report containing the marker text inside a fenced code block or as a placeholder description does not parse as a real seal or satisfy the gate. (Does **not** claim to catch a verbatim real marker pasted raw into prose — deferred to L3.)
- [ ] AC6: The full output is written to `.captures/*.log` during the run and **actively deleted after hash + count** (not merely gitignored); a `.captures/` rule exists in both the dogfood `.ana/.gitignore` and the template generator.
- [ ] AC7: The parser round-trips a marker **with the reserved `enginebind` field present AND with it absent** — both parse as valid and both re-serialize unchanged. (Field reserved only; no binding machinery built.)
- [ ] AC8: The build + verify agent templates (Claude + Codex) describe the compact seal accurately (no "verbatim, sha-sealed block" language); the contract-seal language is untouched.
- [ ] AC9: The JSON-count path is verified against a concrete non-vitest runner (`go test -json` via `parseGo`), proving it is not hard-wired to vitest.
- [ ] AC10: An old-format (inlined) report does not make the new parser throw and is not validated as a well-formed new seal (same mechanism as AC5: missing `lines` / stale `file` → fails strict grammar → gate not satisfied).
- [ ] AC11: When the seal abstains for lack of a JSON reporter, the output names the fix (`set commands.test_json …`).
- [ ] AC12: Re-saving the build report is idempotent — saving twice yields a byte-stable seal.
- [ ] AC13: A capture larger than the old 8 MiB inline ceiling still seals compactly (no capture-error exit) — the ceiling is removed.
- [ ] AC: `(cd packages/cli && pnpm vitest run)` passes with no regression (≥ 3434 tests, net of intentionally deleted inliner/validator tests).
- [ ] AC: `(cd packages/cli && pnpm run lint)` clean.

## Testing Strategy

- **Unit (capture-marker):** strict parser accepts a well-formed compact marker and rejects (a) a fenced example, (b) a placeholder description (`sha256=…`), (c) a non-full-line marker (backtick-wrapped), (d) an old-format marker (no `lines`, has `file`). `formatMarker`→parse round-trip with `enginebind` present and absent, asserting re-serialization is identical both ways. `evaluateCaptureGate`: present compact build marker → not blocked; no marker + enabled → blocked.
- **Unit (capture-runner):** vitest-JSON parser returns real counts on JSON output and falls back to the human parser on human output; `parseGo` JSON path returns counts (AC9); `deriveVerdict(null, 0)`→abstain and `deriveVerdict({0,0,N}, 0)`→abstain preserved.
- **Command (test.ts):** `resolveTestCommandString` prefers top-level `test_json` and reports source; baseline outcome carries a single-line `marker` with `lines` and no `file`; the `.log` is gone after the run; abstain-without-`test_json` sets `countHint`; an >8 MiB fake-runner capture still seals.
- **Command (artifact):** build report with a compact marker saves without inlining and leaves no `ana:capture-begin`; saving twice is byte-stable (AC12).
- **Edge cases:** empty/zero-byte capture (lines=0); fenced marker; old-format report; abstain hint suppressed when `test_json` *is* configured.
- **Bootstrapping:** none — `tests/utils/` and `tests/commands/` already cover this area; extend the existing files.

## Dependencies

- `go` need not be installed: AC9 exercises `parseGo` on a captured `go test -json` fixture string, not a live go run.
- vitest `--reporter=json` (already available via the project's vitest) for the dogfood `test_json` and the JSON-parser fixture.

## Constraints

- **Purity:** `capture-marker.ts` and `capture-runner.ts` stay pure — no chalk/commander/process.exit.
- **No-false-green:** `deriveVerdict` must keep requiring positive evidence for `pass`; never fabricate a count.
- **Security boundary unchanged:** do not touch `runCapture`'s shell-free spawn or its fail-closed `maxBuffer` gate; the log delete is in `test.ts`, after `runCapture` returns.
- **Product reach:** all four agent templates (build+verify × Claude+Codex) must change in lockstep — not just the dogfood `.claude/` copies.
- **Marker back-compat:** runtime back-compat is moot (completed reports are never re-parsed — verified by call-graph in scope), so AC10 is cheap defense-in-depth, not a migration.
- **Test count must not decrease** net of the intentional deletions; CI runs 3 OS × 2 Node.

## Gotchas

- **Two seals.** The templates mention a *contract* seal (contract.yaml tamper-check) and a *capture* seal (test-evidence marker). AC8 touches **only** the capture seal. Do not edit contract-seal wording.
- **Closed-token guarantee is the combination.** Full-line anchor + fenced-skip + required `lines` carry it — not the 64-hex grammar alone (a doc can write a plausible hex). Do not write a test that asserts a verbatim real marker in prose is caught (that's the deferred L3 surface).
- **`lines` is the back-compat discriminator.** Old markers have no `lines` field; requiring it is what makes old markers fail the strict parse (AC10). Ignore *unknown* keys for forward-compat, but *require* the known set.
- **Hint trigger is narrow.** The abstain hint fires only when counts are null **and** `test_json` was not the resolved source — not on every abstain (an unknown runner with `test_json` set is a different story).
- **Confirm vitest JSON field names by running it** — do not assume `numPassedTests` etc.; capture real `--reporter=json` output first.
- **`isCaptureGateEnabled` return-shape adaptation** — `resolveTestCommandString` now returns an object; the gate only needs truthiness, but the call must be updated or it silently breaks gate enablement.
- **Checkpoint logs also get deleted** — keep the in-memory `rawText` for the degrade display; just unlink the file.

## Build Brief

### Rules That Apply
- All relative imports end in `.js`; `node:` prefix for built-ins. Omitting `.js` compiles but crashes at runtime (ESM).
- `import type` for type-only imports, separate from value imports.
- Named exports only; explicit return types on exported functions; `@param`/`@returns` JSDoc on exported functions (eslint enforces).
- `capture-marker.ts` / `capture-runner.ts` are pure — no chalk/commander/process.exit. All user-facing output (the hint, the marker print) lives in `test.ts`.
- Prefer early returns; `| null` for checked-empty fields.
- Mostly-red diff: delete the inliner, the ceiling, and the two block-validators rather than adapting them.

### Pattern Extracts

`capture-runner.ts:492` — `parseGo`, the structural analog for the JSON count parser (shape-gate, then count, abstain on no match):
```ts
const parseGo: Parser = (text) => {
  if (!/"Action":/.test(text) || !/"Test":/.test(text)) return null;
  const count = (action: string): number => {
    const re = new RegExp(`"Action":"${action}"[^}]*"Test":|"Test":[^}]*"Action":"${action}"`, 'g');
    return (text.match(re) || []).length;
  };
  return { passed: count('pass'), failed: count('fail'), skipped: count('skip') };
};
```

`capture-marker.ts:97` — the current `formatMarker`, the template for the compact serializer (add `lines`, drop `file`, append optional `enginebind`):
```ts
export function formatMarker(marker: CaptureMarker): string {
  const parts = [
    `stage=${marker.stage}`,
    `slug=${marker.slug}`,
    `bytes=${marker.bytes}`,
    `sha256=${marker.sha256}`,
    `file=${marker.file}`,
    `counts=${marker.counts}`,
    `verdict=${marker.verdict}`,
  ];
  return `<!-- ana:capture ${parts.join(' ')} -->`;
}
```

`test.ts:98` — `resolveTestCommandString` surface branch already prefers `test_json`; mirror it at top-level and report the source:
```ts
const testJson = commands?.['test_json'];
if (typeof testJson === 'string' && testJson.trim()) return testJson;
const test = commands?.['test'];
return typeof test === 'string' && test.trim() ? test : null;
```

`deriveVerdict` no-false-green (capture-runner.ts:407) — **preserve exactly**:
```ts
if (counts && counts.failed > 0) return 'fail';
if (exitCode !== 0) return 'fail';
if (counts === null) return 'abstain';
if (counts.passed === 0) return 'abstain';
return 'pass';
```

### Proof Context
- `capture-runner.ts` — **(C3, blocker-adjacent)** `deriveCounts` must stay hint-only; do **not** reintroduce the per-parser fallthrough when adding the JSON path — a loose regex can fabricate a count and a false `pass`. The JSON parser is reached only via the `vitest` hint.
- `capture-marker.ts` — **(C4, observation)** the old note about `validateCapturePresent` using a non-block-skipping `parseMarkers` is moot under compaction (no blocks); the strict full-line parser supersedes it.
- `test.ts` — **(C2/C6, observations)** checkpoint argv quoting and the cosmetic `inferRunner` comment are pre-existing; out of scope, do not regress them.

### Checkpoint Commands
- After capture-marker.ts + its tests: `(cd packages/cli && pnpm vitest run tests/utils/capture-marker.test.ts)` — Expected: pass (new strict-parser + round-trip tests green).
- After capture-runner.ts + its tests: `(cd packages/cli && pnpm vitest run tests/utils/capture-runner.test.ts)` — Expected: pass (JSON + go counts).
- After test.ts: `(cd packages/cli && pnpm vitest run tests/commands/test-command.test.ts)` — Expected: pass.
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: ≥ 3434 tests pass (net of deleted inliner/validator tests).
- Lint: `(cd packages/cli && pnpm run lint)` — Expected: clean.

### Build Baseline
- Current tests: **3434** (3432 passed, 2 skipped)
- Current test files: **138**
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ≈ 3434 minus deleted inliner/validator tests plus new strict-parser/JSON/hint/cleanup/idempotency/round-trip tests — net **must not decrease** below the corpus once deletions are accounted for; state the exact delta in the build report.
- Regression focus: `tests/utils/capture-marker.test.ts` (largest deletion surface — inliner/validator tests), `tests/commands/test-command.test.ts` (ceiling + hint + cleanup), artifact capture-gate tests (inlining removed).
