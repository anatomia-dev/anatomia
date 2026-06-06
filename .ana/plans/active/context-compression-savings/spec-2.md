# Spec: B — Compact failures into the agent-facing return

**Created by:** AnaPlan
**Date:** 2026-06-06
**Scope:** .ana/plans/active/context-compression-savings/scope.md

## Approach

Today a failing run gives the agent a marker (test) or an outcome line (build/lint after Spec A) that points at a `.log` the agent must separately re-read to see what failed — and that re-read happens inside the fix loop, exactly when context pressure is worst. B makes the **agent-facing return** self-sufficient on failure: it carries a mechanically-extracted, capped failure summary so the agent can fix from the return alone.

**Deterministic and mechanical — no LLM.** A new `src/utils/failure-extract.ts` does pure pattern-matching: scan captured bytes for failure-shaped lines (per-runner patterns + generic `Error`/`AssertionError`/`file:line:` shapes), keep a window of surrounding context, cap the total, and head+tail the remainder. Same input → identical output. No network, no model call. This is the explicit anti-pattern we avoid (the dark-room LLM-summarizer-of-errors).

**The trigger fires on the real failure signal — this is load-bearing.** Failure extraction runs when *the run did not succeed*:
- **test:** `verdict === 'fail'`.
- **build / lint:** the captured process **exit code is non-zero**. Build/lint have no meaningful verdict (`deriveCounts` abstains → verdict is not a test concept for them); their honest failure signal is the exit code.

A unified predicate — *"the run did not succeed"* — must cover both, or every build/lint failure silently skips extraction, the agent falls back to re-reading the full `.log`, the build fix-loop demo breaks, and Spec C records the full uncompacted output as `returned_*` (the metric lies). Define it once:

```ts
// for test: verdict carries the signal. for build/lint: exit code does.
function runFailed(verdict: CaptureVerdict | null, exitCode: number | null): boolean {
  if (verdict === 'fail') return true;
  if (verdict == null && exitCode !== 0) return true; // build/lint
  return false;
}
```

**Always prepend verdict + counts.** The return opens with the verdict (or, for build/lint, pass/fail-by-exit) and counts (counts where applicable; build/lint show no counts — abstain). Then the extracted failure summary.

**Conservative-first — start generous, tune down later.** The failure modes are asymmetric: under-compacting wastes a little context; over-compacting forces a `.log` re-read, which breaks the fix-loop demo AND makes Spec C's `returned_*` a lie. So the first ship keeps **too much**:
- Cap at **N = 200** failure-region lines (not 50). Tune down against the corpus, not up.
- **3 lines** of surrounding context on each side of a matched failure line.
- No-recognizable-failure fallback: head+tail of **60 + 60** raw lines (never empty).

Record this calibration and its rationale in `failure-extract.ts`'s module doc so a later tightening pass has the starting point and the reasoning.

**Fallback never empty or misleading.** If extraction finds no recognizable failure lines (unknown runner, exotic output), return head+tail of the raw output. Never return an empty summary and never claim "no failures" when the run failed.

**B changes ONLY the agent-facing return.** The `.log` is untouched. For test, the sealed inline block in `build_report.md` is byte-identical to pre-B behavior — the marker's `bytes`/`sha256`/`file` and the sealed bytes do not change. B adds an additive `failureSummary` field to the outcome and prints it; it does not touch `formatMarker`, the inliner, or the seal validators.

**The canonical return string (the B→C contract).** Spec C must measure `returned_*` = exactly what the agent receives. To make measurement equal reality, B composes a single plain-text (ANSI-free) **canonical return** for each outcome and the printer emits that. Add a pure helper in a **new shared module `src/utils/capture-return.ts`** (so neither `test.ts` nor `capture-command.ts` depends on the other):

```ts
// src/utils/capture-return.ts — pure, no chalk; the exact text the agent ingests on stdout.
export function composeAgentReturn(outcome): string
```

`composeAgentReturn` takes a minimal normalized shape (verdict, counts, failureSummary, marker, file, exitCode, kind) so both the test outcome and the build/lint outcome can be passed. Both printers echo its output; Spec C measures it directly.

- Success (test baseline): the existing marker + counts text, **byte-for-byte as today** (do not alter the agent's paste flow).
- Failure (test/build/lint): `verdict/counts` header + the failure summary.
- The chalk-decorated printer wraps/echoes this plain text; Spec C measures `composeAgentReturn(outcome)` directly. Keep success-path output identical to pre-B (regression-test it).

## Output Mockups

Failing test return (vitest), `ana test --stage build --slug s`:
```
✗ FAIL  counts: 1240 passed, 3 failed, 0 skipped

  FAIL  src/utils/parse.test.ts > parses nested objects
  AssertionError: expected 2 to be 3
    src/utils/parse.test.ts:48:22
      46|   const r = parse(input);
      47|   expect(r.depth).toBe(3);
      48|   expect(r.count).toBe(3);
         |                   ^
  FAIL  src/utils/parse.test.ts > rejects malformed input
  ...
  [showing 3 of 3 failures · full output: .ana/plans/active/s/.captures/test-build-1749189600.log]

  Paste this marker into build_report.md:
  <!-- ana:capture stage=build slug=s bytes=84213 sha256=… file=… counts=1240p/3f/0s verdict=fail -->
```

Failing build return (no runner recognized → fallback head+tail), `ana build --stage build --slug s`:
```
✗ build failed  (exit 1)

  src/server.ts:88:14 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
  src/server.ts:91:3 - error TS2554: Expected 2 arguments, but got 1.
  ...
  Found 2 errors in 1 file.
  [no runner-specific failure pattern matched · showing head+tail of raw · full output: …/.captures/build-build-1749189600.log]
```

Passing run: unchanged from Spec A / current `ana test` (no failure summary printed).

## File Changes

> Machine-readable `file_changes` is in contract.yaml. Prose context below.

### packages/cli/src/utils/failure-extract.ts (create)
**What changes:** New deterministic extractor. `extractFailureSummary(raw: string, opts: { runner?: KnownRunner; maxLines?: number; context?: number; fallbackHead?: number; fallbackTail?: number }): string`. Per-runner failure-line patterns + generic shapes, context window, cap, head/tail, and the non-empty fallback. Pure — no I/O, no chalk.
**Pattern to follow:** The per-runner *count* parsers in `capture-runner.ts:443–592` are the model for a per-runner pattern table (a `Record<KnownRunner, RegExp[]>` of failure-line shapes). Mirror that structure — and like `deriveCounts`, abstain (fall back to head+tail) on unknown rather than guessing.
**Why:** Without a deterministic extractor, the only way to compact failures is an LLM call (rejected) or shipping the raw `.log` (defeats the demo).

### packages/cli/src/commands/test.ts (modify)
**What changes:** (1) In `executeCapture`, after `verdict`/`counts` are computed, when `runFailed(verdict, result.exitCode)` compute `failureSummary = extractFailureSummary(result.rawBytes.toString('utf8'), { runner })` and add it as an additive optional field on `TestRunOutcome`. (2) Add `composeAgentReturn(outcome)`. (3) In `printOutcome`, on a failing run print the `failureSummary` block. **Do not touch** the marker computation (245–267), the seal, or the `.log` write.
**Pattern to follow:** The existing `TestRunOutcome` optional fields (`rawText?`, `marker?`) — add `failureSummary?: string` the same additive way. `printOutcome`'s existing branches (316–352).
**Why:** This is the return the agent reads in the fix loop. AC-B1/B2/B5 live here.

### packages/cli/src/commands/capture-command.ts (modify — created in Spec A)
**What changes:** Apply the same trigger and `failureSummary` field to the build/lint outcome and printer. Because build/lint verdict is null, the trigger relies on the non-zero `exitCode` carried through from Spec A. Reuse `composeAgentReturn` (share it — export from one module, e.g. a small `src/utils/capture-return.ts`, or export from `test.ts` and import; prefer a shared util so neither command depends on the other).
**Pattern to follow:** The test wiring above; the shared extractor.
**Why:** The build/lint fix-loop is the cleanest demo of the thesis; it must compact failures too.

## Acceptance Criteria

Copied from scope (Spec B) and expanded:

- [ ] **AC-B1:** On a failing test/build/lint run, the agent-facing return includes a mechanically-extracted failure summary (failure lines with `file:line` where available + minimal surrounding context), capped at N, remainder head+tailed.
- [ ] **AC-B2:** The return always prepends verdict and counts (counts where applicable; build/lint show abstain/no counts).
- [ ] **AC-B3:** Extraction is deterministic — pure pattern-matching, no LLM, no network, identical output for identical input. Verified by per-stack fixtures.
- [ ] **AC-B4:** When no recognizable failure lines are found, the return falls back to head+tail of raw — never empty or misleading.
- [ ] **AC-B5:** The `.log` is unchanged, and (for test) the sealed inline block in `build_report.md` is byte-identical to pre-B behavior. B changes only the agent-facing return.
- [ ] **AC-B6:** Conservative-first calibration is documented (chosen N=200, context=3, fallback 60/60) with the rationale recorded for later tightening.
- [ ] The failure trigger fires on `verdict === 'fail'` (test) AND non-zero exit (build/lint) — a failing build/lint produces a non-empty failure summary.
- [ ] `composeAgentReturn` produces byte-identical output to pre-B on a passing test baseline (no regression to the marker paste flow).
- [ ] `pnpm run build`, the `packages/cli` test suite, lint, typecheck pass; total test count does not decrease.

## Testing Strategy

- **Unit tests (`failure-extract`):** per-stack fixtures (vitest/jest/pytest/go/cargo/rspec/junit/dotnet) of real *failing* output → assert the summary contains the failing test name + `file:line` and excludes passing noise; identical input → identical output (determinism); cap enforced (a >200-failure input is capped and head+tailed); the no-match fallback returns non-empty head+tail; empty input → non-empty, non-misleading fallback (not a false "no failures").
- **Unit tests (trigger):** a build/lint outcome with `verdict: null, exitCode: 1` triggers a failure summary; with `exitCode: 0` it does not; a test outcome with `verdict: 'fail'` triggers; `verdict: 'abstain'` with `exitCode: 0` does not.
- **Regression test (seal untouched):** a failing test baseline still produces the same `bytes`/`sha256`/`marker` as before B; the `.log` bytes equal the captured bytes. (Assert the marker fields, not just that a marker exists.)
- **Regression test (`composeAgentReturn`):** passing baseline output is byte-identical to the pre-B printed marker block.
- **Edge cases:** captured output containing the literal failure patterns inside a passing test's stdout (don't over-match); multi-byte UTF-8 in failure lines (count by lines, not bytes, for the cap); a runner hint present but output is actually a non-test build failure (fallback path).

## Dependencies

Spec A merged (build/lint commands + the `exitCode`-carrying outcome). Builds on the existing capture spine.

## Constraints

- **No LLM, no network, no async.** `extractFailureSummary` is synchronous and pure.
- **No seal contact.** Do not touch `formatMarker`, the inliner, the validators, or the marker bytes. The sealed block must stay byte-identical (AC-B5) — there is a regression test for it.
- **Determinism is a contract, not a nicety** — no `Date`, no ordering by anything non-deterministic, no `Set` iteration order dependence in the output.

## Gotchas

- **The build/lint trigger is the bug to avoid.** `verdict === 'fail'` alone misses build/lint (their verdict is null). Use the unified `runFailed(verdict, exitCode)` predicate. A failing build must extract.
- **Measure lines, cap by lines — not bytes** (a multi-byte char must not split a line or skew the cap).
- **Fallback must never read as "clean."** If the run failed but no pattern matched, the header still says failed and the body is head+tail of raw — never an empty string, never "no failures found."
- **Do not change the passing-success output.** The agent's marker-paste flow depends on it; `composeAgentReturn` for a passing baseline must equal today's text. There is a regression test.
- **`returned_*` is downstream of this.** Whatever `composeAgentReturn` emits IS what Spec C measures. If you print extra chalk lines outside `composeAgentReturn`, decide deliberately whether they count as "returned" (recommendation: measure only `composeAgentReturn`, the substantive agent payload — document it).

## Build Brief

### Rules That Apply
- `.js` import extensions, `node:` builtins, `import type` separate. Named exports. Explicit return types + JSDoc on exports.
- Util files: zero CLI deps (no chalk). `failure-extract.ts` and `composeAgentReturn` are pure; chalk stays in the printers.
- Test behavior, not implementation: assert on the summary string's content, not which regex matched. Assert specific expected values (the failing test name, the `file:line`), not `toBeDefined()`.
- Inline fixture data in temp/strings; do not commit standalone manifest files (security-advisory false positives).
- Cover the error path: empty input, unknown runner, oversized input.

### Pattern Extracts

Per-runner table modeled on the count-parser structure (`capture-runner.ts:594–603`):
```ts
const FAILURE_PATTERNS: Partial<Record<KnownRunner, RegExp[]>> = {
  vitest: [/^\s*(?:FAIL|×|❯)\s/, /^\s*AssertionError/, /^\s+at .*\.test\.[tj]sx?:\d+/],
  pytest: [/^FAILED\s/, /^E\s+/, /^\s*assert /, /Error$/],
  go:     [/^--- FAIL:/, /\.go:\d+:/],
  cargo:  [/^---- .* stdout ----/, /^thread '.*' panicked/, /assertion .*failed/],
  // jest / rspec / junit / dotnet similar — keep generous; tune down against the corpus
};
const GENERIC = [/\bError\b/, /\bAssertionError\b/, /(^|\s)[\w./-]+:\d+:\d+/]; // file:line:col
```

Generic `file:line` recognition (the universally useful signal) plus a head/tail helper:
```ts
function headTail(lines: string[], head: number, tail: number): string[] {
  if (lines.length <= head + tail) return lines;
  return [...lines.slice(0, head), `… ${lines.length - head - tail} lines elided …`, ...lines.slice(-tail)];
}
```

### Proof Context
Run `ana proof context packages/cli/src/commands/test.ts packages/cli/src/utils/failure-extract.ts packages/cli/src/commands/capture-command.ts`. Prioritize any blocker/risk findings tagged on `test.ts` (it is load-bearing and shared with the seal). No active findings expected for the new files.

### Checkpoint Commands
- After `failure-extract.ts`: `(cd 'packages/cli' && pnpm vitest run failure-extract)` — Expected: per-stack fixtures pass.
- After `test.ts` wiring: `(cd 'packages/cli' && pnpm vitest run test.ts)` (or the test file for capture) — Expected: trigger + seal-regression tests pass.
- After all changes: `pnpm run test -- --run` — Expected: baseline + new tests pass.
- Lint: `pnpm run lint`. Build: `pnpm run build`.

### Build Baseline
Measured at plan time (will be ≥ this after Spec A):
- Current tests at plan time: **3421** (139 files). Spec A adds tests; re-record the live baseline at build start.
- Command used: `pnpm run test -- --run`
- After build: expected prior + new (`failure-extract` per-stack fixtures + trigger + seal-regression).
- Regression focus: `test.ts` — the seal/marker path must stay byte-identical; the passing-success output must not change.
