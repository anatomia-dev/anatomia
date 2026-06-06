# Spec: A — Generalize capture to `ana build` & `ana lint`

**Created by:** AnaPlan
**Date:** 2026-06-06
**Scope:** .ana/plans/active/context-compression-savings/scope.md

## Approach

`ana build` and `ana lint` are siblings of `ana test`, pointed at `commands.build` / `commands.lint`, reusing the proven capture spine — **but they are pure Layer A: capture + return, with NO seal, NO gate, NO marker, NO inline ceiling.** The inline ceiling (`INLINE_CEILING_BYTES`) is a *seal* concept (it exists because oversized output cannot be sha-sealed into the report). Build/lint never seal, so they have no ceiling — they just run, capture to a `.log`, derive counts (which abstain), and print an outcome.

**Do not refactor `test.ts`.** `test.ts`'s `executeCapture` keeps its seal path byte-stable. Build/lint get their own thin engine path that reuses the shared primitives (`resolveCommand`, `runCapture`, `deriveCounts`, `deriveVerdict`) directly. The reused logic is ~15 lines; duplicating it is the deliberate, lower-risk choice over restructuring the load-bearing seal path. **This is a hard boundary:** if implementing A requires editing the seal validators, the inliner, the gate, or `executeCapture`'s sealing branch, stop — you are off-spec.

**One shared engine function, two thin command registrations.** Create `src/commands/capture-command.ts` exporting:
- `executeCommandCapture(params)` — the shared engine path (no chalk, no `process.exit`), parameterized by run kind (`'build' | 'lint'`). Resolves the command string, runs the capture, derives counts (abstains), derives a verdict, returns a structured outcome.
- `registerBuildCommand(program)` and `registerLintCommand(program)` — thin Commander registrations that call `executeCommandCapture` and a shared printer, then `process.exit`.

Both register in `src/index.ts` next to `registerTestCommand`.

**Counts abstain — and that is correct.** `deriveCounts` is hint-only and only recognizes test-runner summaries (`vitest`/`jest`/`pytest`/`go`/`cargo`/`rspec`/`junit`/`dotnet`). Build/lint output will not match, so `deriveCounts` returns `null`. Do not fabricate counts. The recorder and rollup (Spec C) treat null counts as "this verb contributes byte/line/run facts, not pass/fail counts."

**Verdict for build/lint:** call `deriveVerdict(counts, exitCode)` exactly as test does. With `counts === null`, a non-zero exit yields `'fail'` and a zero exit yields `'abstain'`. **However, the recorder row (Spec C) stores `verdict: null` for build/lint by design** (verdict is a test concept). The build/lint *process exit code* is the honest success signal, and Spec B's failure-extraction trigger keys off that non-zero exit — NOT off a verdict. Carry the real captured `exitCode` (`result.exitCode` from `runCapture`) through the outcome so both the process exit and Spec B's trigger can use it.

**Three verbs, full stop.** No `ana check --kind`, no third capture mode, no `build_json`/`lint_json` surface variants (they do not exist in the schema — `surfaceCommandsSchema` types only `build/test/lint/dev/test_json`). Do not invent them.

## Output Mockups

`ana build --stage build --slug context-compression-savings` (success):
```
✓ build captured  (exit 0)
  18432 bytes → .ana/plans/active/context-compression-savings/.captures/build-build-1749189600.log
```

`ana lint --stage build --slug context-compression-savings` (failure — the failure summary block in the mockup below is added by Spec B; in Spec A the failing case prints the outcome line + points at the `.log`):
```
✗ lint failed  (exit 1)
  9214 bytes → .ana/plans/active/context-compression-savings/.captures/lint-build-1749189600.log
```

`ana build --slug s -- nonsense-binary` is **not supported** — build/lint take no checkpoint passthrough in this spec (baseline only). `--surface`, `--stage`, `--slug`, `--json` mirror `ana test`.

No marker line is printed (build/lint do not seal). Compare to `ana test`, which prints `Paste this marker into build_report.md:` — build/lint deliberately do not.

## File Changes

> Machine-readable `file_changes` is in contract.yaml. Prose context below.

### packages/cli/src/commands/capture-command.ts (create)
**What changes:** New module. `executeCommandCapture(params: { kind: 'build' | 'lint'; stage: 'build' | 'verify'; slug: string; surface?: string; projectRoot: string; now: number })` returns a structured outcome `{ kind, exitCode, counts, verdict, bytes, file, rawText?, captureError? }`. Plus `registerBuildCommand` / `registerLintCommand` and a shared `printCommandOutcome` (the chalk boundary).
**Pattern to follow:** `src/commands/test.ts` — mirror `resolveTestCommandString` (→ a generic `resolveCommandString(anaJson, key, surface)` that reads `commands.{key}` / `surfaces[surface].commands.{key}`, with NO `_json` variant for build/lint), the `executeCapture` resolve→run→derive sequence (lines 144–268) **minus** the inline-ceiling block (215–223) and the entire seal/marker branch (245–267), and `printOutcome` (316–352) **minus** the marker-print lines (349–351). Reuse `resolveCommand`, `runCapture`, `deriveCounts`, `deriveVerdict` from `capture-runner.js` and `inferRunner` from `test.js` (or inline an equivalent — note build/lint will almost always infer no runner and abstain).
**Why:** Without it, the thick-command thesis is locked to `ana test` and the build/lint demo (and Spec C's measurement of them) cannot exist.

### packages/cli/src/index.ts (modify)
**What changes:** Import and register `registerBuildCommand` and `registerLintCommand` alongside `registerTestCommand`.
**Pattern to follow:** The existing `registerTestCommand` import (line 26) and call (line 68).
**Why:** Commander won't expose the verbs otherwise.

### packages/cli/templates/.claude/agents/ana-build.md (modify)
**What changes:** Replace the prose build/lint instructions with the thick commands. Today (lines ~105, ~107) the template says "Run `commands.build` from ana.json first to compile the project" and references running checkpoint/lint commands as prose. Change the build instruction to `ana build --stage build --slug {slug}` and add a lint instruction `ana lint --stage build --slug {slug}`, consistent with how the template already instructs `ana test --stage build --slug {slug}` (lines ~109–111). Keep the `ana test` instructions unchanged.
**Pattern to follow:** The existing `ana test` instruction block in the same file (the "Run every test through `ana test`" section) — match its phrasing and flag style.
**Why:** The thick command only delivers value if the agent actually runs it instead of a bare shell command. Engine-side capture is invisible unless the agent invokes `ana build`/`ana lint`.

### packages/cli/templates/.claude/agents/ana-verify.md (modify)
**What changes:** Where the verify template references "build command from ana.json commands.build" and "lint command from ana.json commands.lint" (lines ~166–174), instruct `ana build --stage verify --slug {slug}` and `ana lint --stage verify --slug {slug}`. Mirror the existing `ana test --stage verify --slug {slug}` phrasing (line ~179). Keep `ana test` unchanged.
**Pattern to follow:** The file's own `ana test --stage verify` instruction.
**Why:** Verify runs build/lint too; its runs must be captured (and, for Spec C, measured) the same way.

### packages/cli/templates/.codex/agents/ana-build.md (modify)
**What changes:** Identical edit to the `.claude/ana-build.md` change above (this file mirrors it).
**Pattern to follow:** Same as `.claude` counterpart.
**Why:** Codex users get the same thick-command behavior.

### packages/cli/templates/.codex/agents/ana-verify.md (modify)
**What changes:** Identical edit to the `.claude/ana-verify.md` change above.
**Pattern to follow:** Same as `.claude` counterpart.
**Why:** Codex parity.

**ana-plan templates are NOT edited** — Plan is authoring-only and never runs commands (it writes checkpoint command strings into the Build Brief; it does not execute them).

## Acceptance Criteria

Copied from scope (Spec A) and expanded:

- [ ] **AC-A1:** `ana build` and `ana lint` exist, registered under the pipeline group, resolving `commands.build` / `commands.lint` (with the same `--surface` resolution `ana test` has), reusing `resolveCommand` + `runCapture` with no re-authoring of the capture spine.
- [ ] **AC-A2:** Build/lint capture is pure Layer A — emits NO marker, captures to a `.log`, engages no seal and no gate; a build/lint capture never blocks an artifact save and is never sha-sealed into a report.
- [ ] **AC-A3:** On output `deriveCounts` does not recognize (the common build/lint case), counts are `null` (abstain) — never fabricated.
- [ ] **AC-A4:** The four agent templates (`.claude` + `.codex` × `ana-build` + `ana-verify`) instruct `ana build` / `ana lint` in place of prose build/lint commands, consistent with how each instructs `ana test`. `ana-plan` is unchanged.
- [ ] **AC-A5:** No third capture mode, no `ana check --kind`, no `build_json`/`lint_json` variants introduced.
- [ ] The real captured `exitCode` (not a verdict-mapped code) is carried through the build/lint outcome and used as the process exit, so a failing build/lint exits non-zero.
- [ ] `pnpm run build`, the `packages/cli` test suite, lint, and typecheck pass; total test count does not decrease.

## Testing Strategy

- **Unit tests (`executeCommandCapture`):** build/lint resolution from top-level `commands.build`/`commands.lint`; per-surface resolution via `--surface`; missing-command error path (no `commands.build` configured → clean error, not a crash); counts abstain on non-test output; a non-zero exit is carried through as a non-zero `exitCode`; the capture `.log` is written under `.captures/{kind}-{stage}-{epoch}.log`.
- **Unit tests (no-seal invariant):** assert the outcome carries no `marker` and no `sha256`, and that no `<!-- ana:capture -->` marker text is printed — the structural guarantee that build/lint are Layer A.
- **Template enforcement tests:** assert each of the four templates contains `ana build`/`ana lint` invocations and no longer instructs the bare-prose build/lint commands. (Source-content assertion is acceptable here — template content is what's being enforced; see testing-standards.)
- **Edge cases:** `commands.build` present but empty string → treated as not-configured (mirror `resolveTestCommandString`'s `.trim()` guard); `--surface` naming a surface with no build command → clean null/error; a command string that `resolveCommand` refuses (shell metacharacter) → the `CaptureCommandError` surfaces as a clean CLI error, not a stack trace.

## Dependencies

None external. Builds on the existing capture spine (already merged).

## Constraints

- **No seal/gate contact.** Do not import or call `evaluateCaptureGate`, `validateCapturePresent`, `validateCaptureInlined`, `validateCaptureNotTruncated`, `inlineCaptures`, `formatMarker`. If you reach for any of these, you are off-spec.
- **Security boundary preserved.** Build/lint resolve through `resolveCommand` (shell-free, refuses metacharacters) exactly as test does. Never add a shell fallback. `commands.build` may be a `(cd '<dir>' && …)` wrapper — `resolveCommand` already handles it.
- **Backward compatible.** Adding two commands changes nothing about `ana test`. `test.ts` is not edited in this spec.

## Gotchas

- **The inline ceiling does not apply to build/lint.** Do not copy lines 215–223 of `test.ts`. There is no seal, so there is no "too large to seal." A 70 MiB build log just captures (subject only to `runCapture`'s 64 MiB `maxBuffer`, which throws a `CaptureCommandError` — surface that cleanly).
- **`deriveVerdict` with null counts + zero exit → `'abstain'`, not `'pass'`.** That is correct and expected for a green build. Do not coerce it to `'pass'`. The row in Spec C stores `verdict: null` for build/lint regardless.
- **Carry `result.exitCode`, not a mapped code.** Test maps `verdict==='fail'?1:0`. Build/lint must exit with the *actual* captured exit code so a failing build is a non-zero CLI exit AND Spec B can trigger on it.
- **`runCapture` needs the captures dir to exist.** Mirror test.ts: `fs.mkdirSync(capturesDir, { recursive: true })` before `runCapture`.
- **Template line numbers drift.** Find the prose build/lint instructions by content ("commands.build", "run the build", "run the linter"), not by line number.

## Build Brief

### Rules That Apply
- All local imports use `.js` extensions and `node:` prefix for built-ins (ESM runtime crashes otherwise). `import type` separate from value imports.
- Engine/util files have zero CLI deps (no chalk/ora/commander). Keep `executeCommandCapture` chalk-free; put all chalk in the `printCommandOutcome` / register functions (command layer). `capture-command.ts` straddles both — keep the engine function pure and the register/print functions in the same file as the CLI boundary (mirrors how `test.ts` colocates `executeCapture` + `printOutcome` + `runTest`).
- Explicit return types on all exported functions; `@param`/`@returns` JSDoc on exports (eslint enforces).
- Prefer early returns. Use `| null` for checked-and-empty (e.g. `counts: TestCounts | null`).
- Named exports only.
- Test git-repo fixtures must force the branch (`git init -b main`). Use temp dirs (`fs.mkdtemp`) for capture-sink tests; inline fixture command strings.

### Pattern Extracts

Generic command-string resolver — generalize `resolveTestCommandString` (`test.ts:98–116`), dropping the `_json` branch (build/lint have no `_json` variant):
```ts
export function resolveCommandString(
  anaJson: Record<string, unknown>,
  key: 'build' | 'lint',
  surface: string | undefined,
): string | null {
  if (surface) {
    const surfaces = anaJson['surfaces'] as Record<string, unknown> | undefined;
    const surfaceObj = surfaces?.[surface] as Record<string, unknown> | undefined;
    if (!surfaceObj) return null;
    const commands = surfaceObj['commands'] as Record<string, unknown> | undefined;
    const v = commands?.[key];
    return typeof v === 'string' && v.trim() ? v : null;
  }
  const commands = anaJson['commands'] as Record<string, unknown> | undefined;
  const v = commands?.[key];
  return typeof v === 'string' && v.trim() ? v : null;
}
```

Resolve→run→derive core, distilled from `executeCapture` (`test.ts:170–227`) with the seal/ceiling removed:
```ts
// read ana.json, resolve the command string for `kind`
const resolved = resolveCommand(cmdString, projectRoot);       // throws CaptureCommandError
const runner = inferRunner(cmdString);                          // build/lint: usually undefined
const relFile = path.join('.captures', `${kind}-${stage}-${now}.log`);
const sink = path.join(slugDir, relFile);
fs.mkdirSync(path.dirname(sink), { recursive: true });
const result = runCapture({ program: resolved.program, args: resolved.args, cwd: resolved.cwd, env: resolved.env, sink });
const counts = deriveCounts(result.rawBytes, runner);          // null for build/lint
const verdict = deriveVerdict(counts, result.exitCode);        // used internally; row stores null
return { kind, exitCode: result.exitCode ?? 1, counts, verdict, bytes: result.bytes, file: relFile, rawText: result.rawBytes.toString('utf8') };
```

Registration, mirroring `registerTestCommand` (`test.ts:396–408`):
```ts
program.command('build')
  .description('Run the build with engine-captured evidence (no seal)')
  .option('--stage <stage>', 'Pipeline stage: build or verify', 'build')
  .option('--slug <slug>', 'Work item slug (required)')
  .option('--surface <name>', 'Resolve the per-surface build command')
  .option('--json', 'Output JSON')
  .action((options) => runCommandCapture('build', options));
```

### Proof Context
Run `ana proof context packages/cli/src/commands/test.ts packages/cli/src/index.ts packages/cli/templates/.claude/agents/ana-build.md` before building. No active proof findings are known for the new `capture-command.ts` (it does not exist yet). If `ana proof context` reports findings on `test.ts` or `index.ts`, prioritize any tagged blocker/risk.

### Checkpoint Commands
Surface = cross-surface (primary `cli`). Use the `cli` surface command for focused checkpoints, top-level `commands.test` for the final baseline.
- After `capture-command.ts`: `(cd 'packages/cli' && pnpm vitest run capture-command)` — Expected: new tests pass.
- After template edits: `(cd 'packages/cli' && pnpm vitest run)` for any template-enforcement test file — Expected: pass.
- After all changes: `pnpm run test -- --run` — Expected: baseline + new tests pass, count does not decrease.
- Lint: `pnpm run lint`. Build: `pnpm run build`.

### Build Baseline
Measured at plan time (`pnpm run test -- --run` from repo root):
- Current tests: **3421** (3419 passed, 2 skipped)
- Current test files: **139**
- Command used: `pnpm run test -- --run`
- After build: expected **3421 + new** (`capture-command` unit tests + template-enforcement tests). Re-record the live baseline at build start — Scope 1 / token-efficiency may merge first and shift the floor.
- Regression focus: `src/index.ts` (registration), the four template files (template-enforcement tests elsewhere may assert template content).
