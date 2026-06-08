# Spec: session-capture — Phase 1: Capture

**Created by:** AnaPlan
**Date:** 2026-06-07
**Scope:** .ana/plans/active/session-capture/scope.md

## Approach

Phase 1 stands up the capture substrate: every pipeline agent session, on both Claude and Codex, appends exactly one provenance line to a home-anchored buffer the instant it starts. Nothing here derives counts or touches the proof — that is Phase 2. The guardrail is absolute: **capture + provenance pointer only. No findings, no verdicts, no derive.**

Three mechanisms, in dependency order:

1. **Tag at spawn.** `run.ts` injects identity env vars (`ANA_HARNESS`, `ANA_ROLE`, `ANA_SLUG`, `ANA_CLI_VERSION`, `ANA_AGENT_DEF_HASH`) into the child process at the two `spawnSync` sites. Purely additive `env: { ...process.env, ... }` — argv, cwd, stdio, and exit-code propagation are untouched.

2. **A SessionStart hook fires `ana _capture` inside the session.** The hook inherits the injected env and receives the harness payload (`session_id`, `transcript_path`, `model`, `cwd`, `source`, plus Claude's `agent_type`) on stdin. `ana _capture` is hidden, total, and self-identifying — it merges env + payload and appends one JSON line to `~/.ana/forensics/sessions.jsonl`.

3. **Install-time gating (the developer's locked decision).** The hook is added to the generated config **only when `processCapture` is `'on'`**. Opted-out customers get zero hook entries and run zero Anatomia code per session. The runtime no-op in `ana _capture` (reads the gate, exits 0 when off) is the fail-safe for the "flag flipped off without re-init" window, not the primary gate.

### Gating: install-time primary + runtime no-op fail-safe + prune-on-flip-off

This is the load-bearing design decision for Phase 1. Three behaviors must all hold:

- **`processCapture: 'on'` at init/re-init** → our SessionStart hook is merged into `.claude/settings.json` (via `mergeHooksSettings`) and into the generated `.codex/` hook config.
- **`processCapture: 'off'` (or absent) at init/re-init** → our hook is **not** added, AND any previously-added Anatomia hook is **pruned** from the existing config. `mergeHooksSettings` only adds; a new prune step must remove our machine-owned hook — identified by its `ana _capture` command signature — while preserving every user-authored hook. Without this, "turn it off + re-init" leaves a stale hook firing forever.
- **Runtime fail-safe** → even if a hook is present, `ana _capture` reads `isProcessCaptureEnabled` and is a silent no-op when the gate is off.

The hook command stays a dumb delegator (`ana _capture`) — no shell gate logic, no per-platform shell drift. The gate lives in exactly one place in code (`isProcessCaptureEnabled`), mirrored from `isCaptureGateEnabled`.

### The cwd / slug-resolution decision (resolves the scope's [LOAD-BEARING] item)

The scope flags an unverified assumption: that Build/Verify launch from inside `.ana/worktrees/<slug>/`. Investigation of `run.ts` resolves most of the risk:

- `executeRun` calls `findRunProjectRoot()` (walks up from cwd for `.ana/`), then spawns with `cwd: projectRoot`. A worktree carries its own tracked `.ana/`, so launching from inside the worktree resolves `projectRoot` = the worktree, and `detectWorktreeSlug(projectRoot)` recovers the slug from `worktree-meta.json`.
- **The transcript-keying half of the risk is moot**: AC4 records `transcript_path` *verbatim from the hook payload*. We never reconstruct it, so where Claude keys the file does not matter to capture.
- **Slug resolution must be cwd-derived only through the already-resolved `projectRoot`**, never through a second independent cwd read. Resolve `ANA_SLUG` by calling `detectWorktreeSlug(projectRoot)` at the spawn site. From inside the worktree → slug. From the main repo → `null` → empty `ANA_SLUG`, which is an explicitly valid fallback (AC2/AC6).

**Build-time confirmation required (checkpoint, not a design fork):** empirically confirm the real cwd of an `ana run build`/`ana run verify` launch and that `detectWorktreeSlug(projectRoot)` returns the slug. If the real flow turns out to be main-repo launch, the clean degrade (empty slug, still captured) already covers it — no redesign, just document the observed behavior in the build report.

## Output Mockups

### Env injected at the spawn site (Build, Claude, launched from worktree)
```
ANA_HARNESS=claude
ANA_ROLE=build
ANA_SLUG=session-capture
ANA_CLI_VERSION=1.2.2
ANA_AGENT_DEF_HASH=sha256:3f9a…   # sha256 of the resolved agent-def file at spawn
```
Think/Learn inject `ANA_SLUG=` (empty). `ana run plan --slug session-capture` injects that slug; plain `ana run plan` injects empty.

### One buffer line appended to `~/.ana/forensics/sessions.jsonl`
A single JSON object per line (append-only, atomic `O_APPEND`). Phase 1 writes the pointer + provenance; Phase 2 enriches the same record with derived counts.
```json
{"session_id":"0a2f6d97-a83d-4acd-9eae-25915838e250","transcript_path":"/Users/x/.claude/projects/-Users-x-…/0a2f6d97….jsonl","harness":"claude","harness_version":"2.0.14","role":"build","slug":"session-capture","model":"claude-opus-4-6","agent_def_hash":"sha256:3f9a…","cli_version":"1.2.2","cwd":"/Users/x/proj/.ana/worktrees/session-capture","source":"startup","os":"darwin","node":"v22.14.0","timestamp":"2026-06-07T20:58:00.000Z"}
```

### Clean degrade — direct `claude --agent ana` launch (no `ANA_*` env)
Still recorded. `role` falls back to the payload's `agent_type`, `slug` empty, `harness` defaults to `claude`:
```json
{"session_id":"…","transcript_path":"…","harness":"claude","role":"ana","slug":"","model":"…","agent_def_hash":"","cli_version":"","cwd":"…","source":"startup","os":"darwin","node":"…","timestamp":"…"}
```

### `ana _capture` is invisible and total
Hidden from `ana --help`. Prints nothing on the happy path. Exits 0 in every case — gate off, missing/invalid stdin, unwritable buffer, missing env. Never throws, never blocks (sub-300ms), makes no network calls.

## File Changes

### packages/cli/src/commands/run.ts (modify)
**What changes:** At both `spawnSync` sites — `dispatchToCodex` (the `spawnSync('codex', …)` call) and `dispatchToClaude` (the `spawnSync('claude', …)` call) — add an `env` key to the options object: `env: { ...process.env, ...buildCaptureEnv(...) }`. Add a single `buildCaptureEnv(projectRoot, agentSuffix, platform, projectRoot-or-agentDefPath)` helper that assembles the five `ANA_*` vars: `ANA_HARNESS` = platform; `ANA_ROLE` = `agentSuffix || 'ana'`; `ANA_SLUG` = `detectWorktreeSlug(projectRoot) ?? ''` (for build/verify/think/learn) or the `--slug` option value (plan); `ANA_CLI_VERSION` = the CLI version (same source the rest of the CLI uses — find the existing version read); `ANA_AGENT_DEF_HASH` = `sha256` of the resolved agent-def file read at spawn time. Add `--slug <slug>` as an option on the `run` command (consumed only when `agentSuffix === 'plan'`; ignored otherwise).
**Pattern to follow:** The existing options objects at both spawn sites (`{ stdio: 'inherit', cwd: projectRoot }`). The addition is one key. Do not alter `stdio`, `cwd`, or the `process.exit(result.status ?? 1)` propagation.
**Why:** This is the deterministic tagging pillar — without env injection at spawn, the hook cannot self-identify role/slug/harness and capture degrades to fragile correlation.

### packages/cli/src/commands/_capture.ts (create)
**What changes:** New hidden subcommand `ana _capture`. Reads the hook JSON from stdin (the harness writes the payload to the hook process's stdin) and the `ANA_*` env. Resolves `projectRoot` cheaply (or skips it — see gotcha), checks `isProcessCaptureEnabled`, and if on, builds one record and appends it as a single line to `~/.ana/forensics/sessions.jsonl` via the buffer writer. Register in `src/index.ts` with `{ hidden: true }`. The command is **total**: every failure mode (no stdin, malformed stdin, unwritable buffer, missing env, gate off, not a project) results in `process.exit(0)` with no output.
**Pattern to follow:** Command registration via a `registerCaptureCommand(program)` exported function, called from `index.ts` alongside the other `register*` calls but NOT inside a `commandsGroup` (hidden). Stdin read: the codebase's only stdin usage is the readline `confirm()` in `init/state.ts`; for `_capture` read the full stdin stream to a string with a short bounded wait (do not use readline — read `process.stdin` to end, tolerate empty). Gate read mirrors `isCaptureGateEnabled` (`artifact.ts`).
**Why:** One implementation, identical across harnesses — the rejected alternative (a shell hook script) drifts per-platform. Totality is what makes it safe to run inside a live agent session.

### packages/cli/src/utils/forensics.ts (create)
**What changes:** The capture utilities, CLI-agnostic where possible:
- `getForensicsBufferPath(): string` — returns `~/.ana/forensics/sessions.jsonl` (resolve home via `os.homedir()`). Single source of truth for the path so the Phase-2 reader and this writer agree.
- `appendSessionRecord(record): void` — `mkdir -p` the dir, append one `JSON.stringify(record) + '\n'` with an atomic append (`fs.appendFileSync` with the file opened `O_APPEND`, or `fs.writeSync` to an `'a'`-flagged fd). Tolerant of concurrent sessions.
- `buildSessionRecord(env, payload): SessionRecord` — merges `ANA_*` env with the stdin payload into the AC4 field set, applying the clean-degrade fallbacks (role ← `agent_type`, harness ← `'claude'`, empties for absent env). `transcript_path` recorded verbatim from the payload, never reconstructed.
- `isProcessCaptureEnabled(projectRoot): boolean` — mirrors `isCaptureGateEnabled`: parse `.ana/ana.json` via `AnaJsonSchema`, return `false` on any read/parse failure, return `anaJson['processCapture'] === 'on'`. (No test-command carve-out — that carve-out is specific to the capture gate; process capture is unconditional when on.)
**Pattern to follow:** `isCaptureGateEnabled` in `artifact.ts:762` for the gate; `getForensicsBufferPath` centralizes the path the way the codebase centralizes other path helpers. Define a `SessionRecord` interface (exported) for the record shape — Phase 2 extends it with optional derived fields.
**Why:** Centralizing the path + schema here is what lets the Phase-2 work-complete reader and the hook writer agree on one format (a scope "Things to Investigate" item).

### packages/cli/templates/.claude/settings.json (modify)
**What changes:** This is the customer template, currently `{"hooks":{}}`. It must **not** ship the hook unconditionally (install-time gating). Leave the template file as the empty-hooks stock; the hook is injected by `assets.ts` only when `processCapture` is on. (If a template fragment is cleaner than an inline literal, add a separate `templates/.claude/hooks-capture.json` fragment that `assets.ts` reads and merges — builder's choice, but the customer's stock `settings.json` must stay hook-free.)
**Pattern to follow:** Hook entry shape consumed by `mergeHooksSettings` — `{ "SessionStart": [ { "hooks": [ { "type": "command", "command": "ana _capture" } ] } ] }`. Confirm the exact Claude SessionStart hook JSON schema empirically against a live Claude Code install before finalizing the entry shape (matcher presence for `source`, etc.).
**Why:** The customer default is off; shipping the hook in the stock template would defeat install-time gating.

### packages/cli/templates/.codex/hooks.json (create) + packages/cli/templates/.codex/config.toml (create)
**What changes:** Codex hook config: a `SessionStart` hook running `ana _capture`, plus `config.toml` with `[features] hooks = true`. As with Claude, these are installed by the generator **only when `processCapture` is on** — not copied unconditionally.
**Pattern to follow:** `.codex/` assets are currently copied verbatim by `createCodexConfiguration`/`copyCodexAgentFiles` in `assets.ts`. Confirm the Codex hooks.json schema and the `config.toml` `[features] hooks = true` key against a live Codex install. Verify the Codex `SessionStart` payload actually delivers `session_id`/`transcript_path` on stdin (scope notes `transcript_path` may be empty at SessionStart — that is a Phase-2 derive concern; Phase 1 records whatever the payload carries, verbatim).
**Why:** Codex parity for capture. Both harnesses must bank the pointer.

### packages/cli/src/commands/init/assets.ts (modify)
**What changes:** Make hook installation conditional on `processCapture` and add the prune path:
- Read `processCapture` from the project's ana.json (or the in-flight init config) during `createClaudeConfiguration` and the Codex config generation.
- **On (Claude):** merge the capture hook via the existing `mergeHooksSettings` (idempotent, dedupes by matcher+command).
- **On (Codex):** install `hooks.json` + ensure `config.toml` has `[features] hooks = true`.
- **Off (both):** do not add the hook, AND prune any previously-installed Anatomia capture hook. Add a `pruneCaptureHook(existingSettings)` step that removes hook entries whose command is `ana _capture` from each hook-event array (e.g. `SessionStart`, and in Phase 2 `SessionEnd`/`Stop`), leaving all other (user-authored) entries intact. Same prune for the Codex config.
**Pattern to follow:** `mergeHooksSettings` (`assets.ts:577`) for the add; `hookEntryMatches` (`assets.ts:627`) shows the matcher+command identity model — the prune is its inverse, keyed on the `ana _capture` command string. `createCodexConfiguration`/`copyCodexAgentFiles` for the Codex side.
**Why:** This is the developer's locked gating decision. The prune path is what makes "turn it off + re-init" actually remove the hook (the scope/developer's explicit requirement) without clobbering user hooks.

### packages/cli/src/commands/init/anaJsonSchema.ts (modify)
**What changes:** Add `processCapture: z.enum(['on', 'off']).optional().catch(undefined)` — **no `.default()`**, exactly like `captureGate`. Absent must stay absent through re-init and read as off (the migration-safe posture).
**Pattern to follow:** The `captureGate` field directly above it.
**Why:** The gate's typed home. No-default is what keeps existing installs (which lack the field) reading as off.

### packages/cli/src/commands/init/state.ts (modify)
**What changes:** In `createAnaJson`, add `processCapture: 'off'` to the default config object (customer default **off** — next to the existing `captureGate: 'on'` line). Confirm `preserveUserState` does NOT add `processCapture` to any mechanical-override list, so a customer who set it stays set across re-init (same treatment the field's no-default catch implies).
**Pattern to follow:** The `captureGate: 'on'` line in the `createAnaJson` config object.
**Why:** Customer default off is a hard requirement (scope AC7 + the gate-flip risk). This is the single line that must be `'off'`, guarded by a test so a future edit can't flip every customer on.

### .ana/ana.json (modify — dogfood)
**What changes:** Add `"processCapture": "on"` to our own ana.json. Then regenerate our `.claude/settings.json` (gets the SessionStart hook) and our `.codex/` config — i.e. our dogfood install captures.
**Pattern to follow:** Our existing `"captureGate": "on"` is the precedent for a dogfood-on flag.
**Why:** Capture-now-or-lose-forever applies to us first. We start banking our own pipeline runs immediately.

## Acceptance Criteria

Copied from scope (Phase 1), with the gating ACs rewritten for the developer's install-time decision:

- [ ] AC1: `ana run <agent> --platform <claude|codex>` injects `ANA_HARNESS`, `ANA_ROLE`, `ANA_CLI_VERSION`, `ANA_AGENT_DEF_HASH`, and `ANA_SLUG` into the spawned agent's environment, with **no change** to argv, cwd, stdio, or exit-code propagation. `ANA_AGENT_DEF_HASH` is the sha256 of the resolved agent-def file at spawn time.
- [ ] AC2: Build/Verify (launched from inside `.ana/worktrees/<slug>`) inject a non-empty `ANA_SLUG` via `detectWorktreeSlug(projectRoot)`; Think and Learn inject empty `ANA_SLUG`; `ana run plan --slug <s>` injects the given slug and plain `ana run plan` injects empty — all valid.
- [ ] AC3 (**rewritten — install-time gating + prune**): With `processCapture: 'on'`, init/re-init installs the SessionStart hook for both harnesses (Claude via `templates`+`mergeHooksSettings`; Codex via generated `hooks.json` + `config.toml [features] hooks = true`), idempotently, preserving user-authored hooks. With `processCapture` off/absent, init/re-init installs **no** capture hook AND prunes any previously-installed Anatomia capture hook (matched by the `ana _capture` command), leaving user-authored hooks intact.
- [ ] AC4: The hook runs `ana _capture`, which reads stdin payload + `ANA_*` env and appends exactly one JSON line to `~/.ana/forensics/sessions.jsonl` containing: `session_id`, `transcript_path` (verbatim from payload), `harness`, `harness_version`, `role`, `slug`, `model`, `agent_def_hash`, `cli_version`, `cwd`, `source`, `os`, `node`, `timestamp`.
- [ ] AC5: `ana _capture` is **total** — exits 0 in every case (gate off, missing/invalid stdin, unwritable buffer, missing env), never throws, never blocks (sub-300ms), makes **no network calls**. Gate off or `ana` not on PATH → silent no-op, session unaffected.
- [ ] AC6: A direct `claude --agent ana` launch (no `ANA_*` env) is still recorded — `role` falls back to payload `agent_type`, `slug` empty, `harness` defaults to claude. Captured, not dropped.
- [ ] AC7: `isProcessCaptureEnabled` reads the `processCapture` ana.json field, fail-safe to `false` on absent/malformed (mirrors `isCaptureGateEnabled`). New customer installs default **off**; our dogfood `.ana/ana.json` is set **on**.
- [ ] New: install-time gate verified by test — `processCapture: 'on'` produces a settings.json with the hook; `'off'`/absent produces one without it AND prunes a pre-seeded Anatomia hook while keeping a pre-seeded user hook.
- [ ] New: a test asserts `createAnaJson` emits `processCapture: 'off'` (guards the gate-flip risk).
- [ ] New: tests pass with `(cd 'packages/cli' && pnpm vitest run)`; no type errors (`tsc --noEmit`); lint clean.

## Testing Strategy

- **Unit tests:**
  - `buildCaptureEnv` — asserts exact `ANA_*` values for each role (build→slug via worktree meta, plan→`--slug`, think/learn→empty); asserts `ANA_AGENT_DEF_HASH` is a sha256 of the agent-def file content; asserts the spawn options still carry the original `stdio`/`cwd`.
  - `buildSessionRecord` — happy path (full env+payload → all AC4 fields) and clean-degrade (no env → `agent_type` fallback, empty slug, claude default). Assert `transcript_path` is the payload value verbatim.
  - `isProcessCaptureEnabled` — on → true; off → false; absent → false; malformed JSON → false; missing file → false.
  - `appendSessionRecord` — writes one line; two calls append two lines (concurrency-tolerant atomic append); creates the dir if absent.
- **Integration tests:**
  - `ana _capture` totality: pipe valid stdin with gate on → one buffer line; gate off → zero lines, exit 0; empty stdin → exit 0, no throw; unwritable buffer dir → exit 0. Run against `dist/index.js` per the testing-standards note about compiled-artifact integration tests.
  - Init gating: run init/re-init with `processCapture` on → settings.json has the `ana _capture` SessionStart hook; off → no such hook; pre-seed a user hook + an Anatomia hook, re-init with off → user hook survives, Anatomia hook pruned.
- **Edge cases:**
  - Direct-launch (no `ANA_*`) record (AC6).
  - Empty `ANA_SLUG` is valid and written as `""`.
  - Re-init idempotency: on twice → exactly one hook (no duplicate).
  - Temp-dir based: build the `.claude`/`.ana` fixtures in `fs.mkdtemp` dirs; force `git init -b main` for any git-touching fixture.
- **CI network-denylist (Phase 1 scope):** assert `ana _capture` performs no network I/O (the full denylist test is AC12 in Phase 2, but Phase 1 should already carry a no-network assertion for the capture path).

## Dependencies

- None external. Phase 1 is self-contained. `detectWorktreeSlug` (`worktree.ts:114`) and `isCaptureGateEnabled` (`artifact.ts:762`) already exist and are the patterns to mirror.

## Constraints

- **`_capture` sub-300ms, total, zero network.** It runs inside live agent sessions; a slow/throwing hook degrades the user's session.
- **Env addition purely additive.** `{ ...process.env, ...ANA_* }` — never replace `process.env`, never alter argv/cwd/stdio/exit propagation.
- **No raw transcript body ever persisted.** Only the pointer (`transcript_path`) + identity. (Enforced harder by AC12 in Phase 2; hold the line here too.)
- **Customer default off; only dogfood on.** Guarded by test.
- **Every product change works for all customers** — the install-time gate means opted-out customers (any stack) get zero hook entries and zero per-session overhead.
- **Re-init preservation contract** — the prune removes only Anatomia's `ana _capture` hook; user-authored hooks are never touched.

## Gotchas

- **`mergeHooksSettings` only adds.** It has no remove path. The off/prune behavior (AC3) is net-new code — do not assume the merge handles flip-off.
- **Dedup key is `(matcher, command)`** (`hookEntryMatches`, `assets.ts:627`). Our prune keys on the `command === 'ana _capture'` (and Phase-2 `SessionEnd`/`Stop`) regardless of matcher, since it is our machine-owned signature.
- **`_capture` must not resolve project root the expensive way.** Inside a worktree the project root walk is cheap, but do not call schema-validating, throwing helpers on the hot path. If project-root resolution can fail, treat failure as gate-off no-op. Reading the gate needs a project root, though — resolve it defensively (walk up for `.ana/`, like `findRunProjectRoot`), and no-op if not found.
- **`.claude/settings.json` is committed/tracked**, so the hook is present in a worktree checkout and fires there. Good for capture; just be aware the worktree inherits the dogfood hook.
- **Claude SessionStart hook schema is undocumented here** — confirm the exact JSON entry shape (matcher for `source`, payload fields on stdin) against a live install before finalizing the template entry. Same for Codex `hooks.json` + `config.toml [features] hooks = true`.
- **Codex `transcript_path` may be empty at SessionStart.** Record verbatim whatever the payload carries (even empty). The glob fallback is a Phase-2 derive concern, not a Phase-1 capture concern.
- **`ANA_AGENT_DEF_HASH` source file.** Hash the *resolved* agent-def the dispatch actually uses: for Claude the `.claude/agents/<agentName>.md` (confirm the resolved path), for Codex the `.codex/agents/<agentName>.md` prompt file already read in `dispatchToCodex`. Read-and-hash; if the file is unreadable, inject empty (clean degrade, no throw).
- **Don't add the hook to the stock customer template.** The customer's `templates/.claude/settings.json` stays `{"hooks":{}}`; injection is generator-conditional.

## Build Brief

### Rules That Apply
- All relative imports end in `.js`; use `node:` prefix for builtins (`node:fs`, `node:os`, `node:path`, `node:crypto`). Omitting `.js` crashes the built ESM CLI at runtime.
- `import type` for type-only imports, separate from value imports. Named exports only — no default exports.
- Explicit return types on all exported functions; `@param`/`@returns` JSDoc on exported functions (pre-commit eslint rejects missing tags).
- Command layer surfaces errors (`chalk.red` + `process.exit(1)`) — but `_capture` is the deliberate exception: it is total and always exits 0, surfacing nothing. Comment that inversion inline so a future reader doesn't "fix" it.
- Avoid `any`; use `unknown` + narrow. The stdin payload is an untyped boundary — parse to `unknown`, narrow with guards, never let a malformed payload throw.
- `| null` for checked-empty fields; `?:` for maybe-unchecked. `detectWorktreeSlug` returns `string | null` — coerce to `''` for `ANA_SLUG`.
- Tests: pass `--run` to vitest; build `dist` before integration tests against compiled output; `git init -b main` for any git fixture; inline fixtures in `fs.mkdtemp` temp dirs (no standalone manifest files).
- Source-content assertions are acceptable here as *enforcement* tests (verifying the stock template stays hook-free, verifying customer-default-off) — that is the sanctioned exception in testing-standards.

### Pattern Extracts

**Gate to mirror — `isCaptureGateEnabled` (`packages/cli/src/commands/artifact.ts:762`):**
```typescript
export function isCaptureGateEnabled(projectRoot: string): boolean {
  let anaJson: Record<string, unknown>;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(projectRoot, '.ana', 'ana.json'), 'utf-8')) as unknown;
    anaJson = AnaJsonSchema.parse(raw) as Record<string, unknown>;
  } catch {
    return false;
  }
  if (anaJson['captureGate'] !== 'on') return false;
  // (capture-gate-specific test-command carve-out follows — OMIT for processCapture)
  return true;
}
```
`isProcessCaptureEnabled` is this minus the carve-out: `return anaJson['processCapture'] === 'on';`

**Hook merge — `mergeHooksSettings` (`packages/cli/src/commands/init/assets.ts:577`):**
```typescript
const mergedHooks = merged['hooks'] as Record<string, unknown[]>;
const templateHooks = (template['hooks'] || {}) as Record<string, unknown[]>;
for (const hookType of Object.keys(templateHooks)) {
  const templateHookArray = templateHooks[hookType] as HookEntry[];
  const existingHookArray = (mergedHooks[hookType] || []) as HookEntry[];
  for (const templateEntry of templateHookArray) {
    const isDuplicate = existingHookArray.some((e) => hookEntryMatches(e, templateEntry));
    if (!isDuplicate) existingHookArray.push(templateEntry);
  }
  mergedHooks[hookType] = existingHookArray;
}
```
Identity model — `hookEntryMatches` (`assets.ts:627`):
```typescript
function hookEntryMatches(a: HookEntry, b: HookEntry): boolean {
  if (a.matcher !== b.matcher) return false;
  const aCommands = (a.hooks || []).map((h) => h.command);
  const bCommands = (b.hooks || []).map((h) => h.command);
  return bCommands.some((cmd) => aCommands.includes(cmd));
}
interface HookEntry { matcher?: string; hooks?: Array<{ type: string; command: string; timeout?: number }>; }
```
The **prune** is the inverse: for each hook-event array, drop entries where any `hooks[].command === 'ana _capture'`; keep the rest.

**Gate field — `anaJsonSchema.ts` (the `captureGate` precedent to copy verbatim in shape):**
```typescript
// No `.default` — absent must stay `undefined` so an absent flag stays
// absent through re-init and reads as gate-off (the migration mechanism).
captureGate: z.enum(['on', 'off']).optional().catch(undefined),
```

**Default emission — `createAnaJson` (`state.ts`, the dogfood/customer default site):**
```typescript
const anaConfig: Record<string, unknown> = {
  // …
  captureGate: 'on',
  processCapture: 'off',   // <-- ADD. Customer default OFF. Guarded by test.
  lastScanAt: result.overview.scannedAt,
  custom: {},
};
```

**Spawn site shape — `run.ts` (`dispatchToClaude`, the env addition is one key):**
```typescript
const result = spawnSync('claude', args, {
  stdio: 'inherit',
  cwd: projectRoot,
  env: { ...process.env, ...buildCaptureEnv(projectRoot, agentSuffix, 'claude') }, // <-- ADD
});
process.exit(result.status ?? 1);
```
Mirror the identical addition at the `spawnSync('codex', …)` site in `dispatchToCodex`.

**Claude transcript pointer fields (for the buffer record — confirmed on this machine):** top-level keys include `sessionId`, `cwd`, `gitBranch`, `version`, `requestId`, `timestamp`, `type`; the hook SessionStart payload (separate from the JSONL) delivers `session_id`, `transcript_path`, `model`, `cwd`, `source` on stdin — confirm exact payload keys against a live install.

### Proof Context

- **`run.ts`** — Build concern (Platform-Aware CLI): "Advisory pipeline check reads `.saves.json` directly instead of using `determineStage()` — stage field may be stale." Not in your path (you touch the spawn sites, not the advisory check), but do not regress it. No active finding overlaps your env-injection change.
- **`artifact.ts`** — active finding (`fix-false-rejection-archive-C3`): "reads `.saves.json` on every call — four reads per save." Relevant to Phase 2 (`module_churn` adds a `.saves.json` write), noted there; Phase 1 does not touch `artifact.ts`.
- **`assets.ts`** — no active finding for the hook-merge path. The merge mechanism is well-tested; your net-new prune path needs its own coverage.
- No active proof findings block the Phase-1 file set.

### Checkpoint Commands
- After `run.ts` env injection: `(cd 'packages/cli' && pnpm vitest run)` (the `cli` surface test command from ana.json `surfaces.cli.commands.test`) — Expected: existing run.ts tests still pass; new `buildCaptureEnv` tests pass.
- After `_capture` + `forensics.ts`: `(cd 'packages/cli' && pnpm vitest run)` — Expected: new capture/forensics tests pass.
- After all changes (baseline): `pnpm run test -- --run` (ana.json `commands.test`) — Expected: prior count + new tests, no regressions.
- Lint: `(cd 'packages/cli' && pnpm run lint)`.
- Types: `tsc --noEmit` (pre-commit enforces this, not the SWC build).
- Integration tests run against `dist` — run `(cd packages/cli && pnpm run build)` before integration assertions.

### Build Baseline
Run `pnpm run test -- --run` and record exact counts before building.
- Current test files (cli): **138** (`find packages/cli -name '*.test.ts'`).
- Current tests: **3424 passed, 2 skipped (3426 total)** — measured at plan time via `pnpm run test -- --run`.
- Command used: `pnpm run test -- --run` (full) / `(cd 'packages/cli' && pnpm vitest run)` (cli surface).
- After build: expected baseline + new tests across new files (`_capture`, `forensics`, `run.ts` env, init gating).
- Regression focus: `run.ts` (highest-churn file, the shared launch path for all five agents — verify argv/cwd/exit propagation unchanged) and `assets.ts`/init tests (hook merge + new prune).
