# Spec: session-capture — Phase 2: Derive + attach

**Created by:** AnaPlan
**Date:** 2026-06-07
**Scope:** .ana/plans/active/session-capture/scope.md

## Approach

Phase 1 banked the pointer. Phase 2 turns a recorded transcript into durable provenance counts and attaches them — optionally, decoupled, never gating — to the proof entry, exactly mirroring the `commit_hygiene` 4-touch pattern. **Guardrail (absolute): this derive is bounded to provenance — counts, cost, tokens, model, churn, outcome. It is NOT the rule engine. No findings, no verdicts, ever.**

Five pieces:

1. **A deterministic transcript-derive function** (`deriveTranscript`) reads a completed transcript JSONL and produces a `ProvenanceCounts` object: token counts (deduped by `requestId`), `cost_usd` (counts × versioned price table — no network, no clock), `duration_ms`, `turns`, `tool_calls`, `commands_run`, `tests_executed`, `failures_encountered`, `files_touched`, and `model`. Same input → byte-identical output.

2. **A versioned price table** (`src/data/pricing.ts`) — data, not a fetch. Token-type × model → cost-per-1M, stamped with a table version. Cost is a labeled, recomputable estimate, never an invoice.

3. **`module_churn`** — `captureModulesTouched` additionally records per-file added/deleted churn from `git diff --numstat` under a new `module_churn` key. The existing `modules_touched` string array is left exactly as-is.

4. **`ProcessAttestation` attached to the proof** via the `commit_hygiene` 4-touch: type (`proof.ts`), default (`proofSummary.ts`), optional spread at write (`work-proof.ts`), display (`proof.ts`). At `ana work complete`, for slug-scoped phases, the derived record + outcome joins + task shape + `module_churn` are assembled and spread onto the entry as optional `process?: ProcessAttestation`. Capture off, or no matching buffer record → valid proof with the field absent. **Work-complete derivation is authoritative for slug runs** — it fires even if the SessionEnd/Stop hook didn't.

5. **A `SessionEnd` (Claude) / `Stop` (Codex) hook** triggers the *same* `deriveTranscript` for non-work sessions (Think/Learn/untagged Plan), writing the counts back into the buffer record, run **async** so it never delays session teardown.

### Where the derive joins the proof (mirror commit_hygiene exactly)

`commit_hygiene` is the structural template — read its full path and mirror it field-for-field:
- **Capture** → `.saves.json` (artifact.ts). `module_churn` rides here.
- **Read** → `work-proof.ts:104-116` reads `modules_touched` + `commit_hygiene` from completed `.saves.json`. The `ProcessAttestation` derive happens at this same work-complete site: read the buffer record(s) matching this slug, run `deriveTranscript` on the recorded `transcript_path`, assemble the attestation.
- **Spread** → `work-proof.ts:163` `...(commitHygiene.length > 0 ? { commit_hygiene: commitHygiene } : {})`. Add an analogous `...(processAttestation ? { process: processAttestation } : {})`.
- **Type** → `proof.ts:94` `commit_hygiene?: Array<…>`. Add `process?: ProcessAttestation`.
- **Default** → `proofSummary.ts:887` `commit_hygiene: []`. Add the `process` default consistent with its optionality (omit / leave undefined; mirror how the summary defaults optional fields).
- **Display** → `proof.ts:405` Commit Hygiene section. Add a sibling provenance section (counts/cost/model), display-only, gated on presence.

### Outcome joins & task shape (AC9)

At work-complete the attestation also carries:
- **Outcome:** `first_pass_verify` (bool), `assertions_satisfied/total`, `findings{risk,debt,observation}` — sourced from the proof object already being assembled in `work-proof.ts` (the assertions array + findings are right there; read severities off the findings).
- **Task shape:** `size`, `kind`, `multi_phase` — `kind` is already on the proof (`proof.kind`); `size` and `multi_phase` come from scope.md (`Complexity Assessment` — Size + Multi-phase) and/or `plan.md` phase count (`countPhases` is already used at `work-proof.ts:189`).
- **`module_churn`** — read from `.saves.json` alongside `modules_touched`.

### SessionEnd/Stop trigger (AC11)

The Phase-1 install-time-gated hook config gains a second hook event: `SessionEnd` (Claude) / `Stop` (Codex), command `ana _capture` with a `--derive` flag (or `_capture` detects `source: 'SessionEnd'`/end payload and switches to derive mode). It runs `deriveTranscript` on the just-finished transcript and **updates** the matching buffer record in place (match by `session_id`) with the derived counts — async, never blocking teardown, still total (exit 0 always). The prune logic from Phase 1 must now also prune this second hook event when the gate flips off.

## Output Mockups

### A buffer record after SessionEnd enriches it (Phase 1 fields + Phase 2 derived block)
```json
{"session_id":"0a2f6d97-…","transcript_path":"/Users/x/.claude/projects/…/0a2f6d97….jsonl","harness":"claude","role":"build","slug":"session-capture","model":"claude-opus-4-6","…":"…",
 "derived":{"tokens":{"input":48211,"output":12903,"cache_create":81002,"cache_read":1442301},"cost_usd":2.47,"price_table_version":"2026-06-01","duration_ms":612344,"turns":38,"tool_calls":141,"commands_run":22,"tests_executed":3424,"failures_encountered":0,"files_touched":7,"model":"claude-opus-4-6"}}
```

### `ProcessAttestation` on a proof entry (slug run, capture on)
```json
"process": {
  "session_id": "0a2f6d97-…",
  "harness": "claude",
  "role": "build",
  "agent_def_hash": "sha256:3f9a…",
  "cli_version": "1.2.2",
  "derived": { "tokens": {"input":48211,"output":12903,"cache_create":81002,"cache_read":1442301},
               "cost_usd": 2.47, "price_table_version": "2026-06-01",
               "duration_ms": 612344, "turns": 38, "tool_calls": 141,
               "commands_run": 22, "tests_executed": 3424, "failures_encountered": 0,
               "files_touched": 7, "model": "claude-opus-4-6" },
  "outcome": { "first_pass_verify": true, "assertions_satisfied": 14, "assertions_total": 14,
               "findings": { "risk": 0, "debt": 1, "observation": 2 } },
  "task_shape": { "size": "large", "kind": "feature", "multi_phase": true },
  "module_churn": { "packages/cli/src/commands/run.ts": { "added": 41, "deleted": 6 } }
}
```
A run with capture off, or no matching buffer record → **no `process` key**. The proof is valid either way.

### `ana proof session-capture` — new provenance section (display-only)
```
  Provenance
  ──────────
  claude · build · opus-4-6      38 turns · 141 tool calls
  tokens  in 48.2k · out 12.9k · cache 1.5M     est. $2.47 (table 2026-06-01)
  churn   7 files · +41/−6
```
Shown only when `entry.process` exists. Never affects PASS/FAIL.

### `module_churn` in `.saves.json` (alongside untouched `modules_touched`)
```json
{
  "modules_touched": ["packages/cli/src/commands/run.ts", "packages/cli/src/utils/forensics.ts"],
  "module_churn": {
    "packages/cli/src/commands/run.ts": { "added": 41, "deleted": 6 },
    "packages/cli/src/utils/forensics.ts": { "added": 88, "deleted": 0 }
  }
}
```

## File Changes

### packages/cli/src/utils/forensics.ts (modify — from Phase 1)
**What changes:** Add `deriveTranscript(transcriptPath, harness): ProvenanceCounts | null`. Reads the JSONL, walks lines, and computes the counts. **Claude:** tokens from `.message.usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}`, **deduped by top-level `requestId`** (a single request can appear on multiple lines — count each `requestId` once); `model` from `.message.model` (per-message present on Claude); `turns` = assistant messages; `duration_ms` from first→last `timestamp`. **Codex:** model is session-level (first-line `session_meta` payload, no per-message model); usage lives in the payload — confirm the exact Codex usage key shape against a real `rollout-*.jsonl`. Tool/command/test/failure counts derive from tool-use entries and their results (count `tool_calls`; `commands_run` = Bash-type tool uses; `tests_executed`/`failures_encountered` parse from test-command results — best-effort, documented). Add `updateSessionRecord(sessionId, derived)` for the SessionEnd path (match by `session_id`, rewrite that line). Define exported `ProvenanceCounts` and extend `SessionRecord` with an optional `derived?: ProvenanceCounts`.
**Pattern to follow:** Pure function, no CLI deps, no network, no `Date.now()` inside the derive (duration from transcript timestamps only) — determinism is a hard contract (AC8: same input → byte-identical output). Mirror the engine purity rule.
**Why:** This is the durable-record producer. It is required anyway for Build/Verify at work-complete; the SessionEnd hook triggers the same function for non-work sessions.

### packages/cli/src/data/pricing.ts (create)
**What changes:** A versioned typed price table. Export a `PRICE_TABLE_VERSION` string and a typed `const` mapping `(model, token_type) → cost_per_1m`. Provide `computeCost(tokens, model): { cost_usd: number; price_table_version: string }` — pure, no network, no clock. Unknown model → cost `0` + a recorded `price_table_version` so the gap is visible and recomputable (never throw).
**Pattern to follow:** `src/data/gotchas.ts` — `export interface …Entry { … }` + `export const … : Entry[] = [ … ]`. Version is an exported const, not a name suffix.
**Why:** Cost must be a labeled, recomputable estimate. A hardcoded versioned table makes it reproducible and honest; a fetch would violate the no-network constraint and make derivation non-deterministic.

### packages/cli/src/commands/artifact.ts (modify)
**What changes:** Extend `captureModulesTouched` (`:181`) to also run `git diff <mergeBase> --numstat -- . ':(exclude).ana'`, parse the `added<TAB>deleted<TAB>path` rows, and write a `module_churn` object (`{ [path]: { added, deleted } }`) into `.saves.json`. **Do not touch `modules_touched`** — it stays the `--name-only` string array. Binary files report `-`/`-` in numstat; coerce to `0`/`0`.
**Pattern to follow:** The existing `runGit(['diff', mergeBase, '--name-only', …])` call right above — add a sibling `--numstat` call, parse, assign `savesData['module_churn']`.
**Why:** Per-file churn is the `(churn)` axis of the dataset row. One-flag extension into a new key — the scope's explicit "do NOT redefine modules_touched."

### packages/cli/src/types/proof.ts (modify)
**What changes:** Add `process?: ProcessAttestation;` to `ProofChainEntry` (next to `commit_hygiene?` at `:94`). Define and export the `ProcessAttestation` interface (session identity + `derived: ProvenanceCounts` + `outcome` + `task_shape` + `module_churn`). Optional — proof integrity never depends on it.
**Pattern to follow:** `commit_hygiene?: Array<{…}>` at `:94` — same optionality posture.
**Why:** Touch 1 of 4. Typed home for the attestation.

### packages/cli/src/utils/proofSummary.ts (modify)
**What changes:** In the summary default object (`:887`, where `commit_hygiene: []` lives), handle `process` consistently with its optionality (leave undefined/omit — it is an optional attach, not a defaulted array). If `SavesData` typing requires it, add the optional field to the relevant type.
**Pattern to follow:** How `commit_hygiene: []` is defaulted at `:887`. `process` is optional, so it defaults to absent.
**Why:** Touch 2 of 4. Keeps the summary type and the entry type in lockstep.

### packages/cli/src/commands/work-proof.ts (modify)
**What changes:** Two edits at the proof-write site:
1. Read `module_churn` from completed `.saves.json` alongside `modules_touched`/`commit_hygiene` (`:104-116`).
2. Assemble the `ProcessAttestation`: find buffer record(s) for this slug in `~/.ana/forensics/sessions.jsonl`, run `deriveTranscript` on the recorded `transcript_path` (authoritative even if SessionEnd already wrote `derived` — re-derive for the proof), join outcome (from the `proof` object: assertions satisfied/total, findings by severity, `first_pass_verify` from `rejection_cycles === 0`), task shape (`proof.kind`; size + multi_phase from scope.md/plan.md `countPhases`), and `module_churn`. Spread onto the entry: `...(processAttestation ? { process: processAttestation } : {})` at `:163` next to the `commit_hygiene` spread. Gate the whole block on `isProcessCaptureEnabled` and presence of a matching buffer record — absent → field omitted, proof still valid.
**Pattern to follow:** The `commit_hygiene` read (`:104-116`) + spread (`:163`). `countPhases` usage at `:189` for phase count. `first_pass_verify` ← `proof.rejection_cycles === 0`.
**Why:** Touch 3 of 4, and the authoritative work-complete derive site. This is where the durable dataset row is sealed for slug runs.

### packages/cli/src/commands/proof.ts (modify)
**What changes:** Add a display-only "Provenance" section after the Commit Hygiene section (`:405`), gated on `entry.process` presence. Render harness · role · model, turns/tool-calls, token summary, est. cost + table version, churn. Never influences PASS/FAIL.
**Pattern to follow:** The Commit Hygiene section block at `:405-421` — same `if (… .length > 0 / present)` guard, same `lines.push(chalk.bold(...))` + `BOX.horizontal` divider idiom.
**Why:** Touch 4 of 4. Makes the banked provenance legible without changing proof semantics.

### packages/cli/templates/.claude/settings.json fragment + packages/cli/templates/.codex/hooks.json (modify)
**What changes:** Add the `SessionEnd` (Claude) / `Stop` (Codex) hook event running `ana _capture` (derive mode) to the install-time-gated hook config. The Phase-1 prune must now also remove this second event when the gate flips off.
**Pattern to follow:** The Phase-1 SessionStart entry and its prune. Confirm the Claude `SessionEnd` and Codex `Stop` hook schemas against live installs.
**Why:** Banks non-work sessions (Think/Learn/untagged Plan) before their transcript can be cleared (AC11).

### packages/cli/src/commands/_capture.ts (modify — from Phase 1)
**What changes:** Detect end-of-session invocation (`--derive` flag or the SessionEnd/Stop payload `source`) and switch to derive mode: run `deriveTranscript` on the payload's `transcript_path` (Codex fallback: glob `$CODEX_HOME/sessions/**/rollout-*-<session_id>.jsonl` if the payload lacks the path) and `updateSessionRecord`. **Async, total, exit 0 always.** Still no network.
**Pattern to follow:** The Phase-1 totality contract. The derive runs in the background of the hook process; do not block teardown.
**Why:** The second trigger of the single derive function — non-work sessions get banked counts too.

## Acceptance Criteria

Copied from scope (Phase 2), expanded:

- [ ] AC8: `deriveTranscript` reads a recorded transcript and produces `tokens{input,output,cache_create,cache_read}` (deduped by `requestId`), `cost_usd` (token counts × versioned price table — no network/clock), `duration_ms`, `turns`, `tool_calls`, `commands_run`, `tests_executed`, `failures_encountered`, `files_touched`, and `model` (session-level guaranteed; per-turn best-effort). **Same input → byte-identical output.**
- [ ] AC9: At `ana work complete`, for slug-scoped phases, the derived record + outcome joins (`first_pass_verify`, `assertions_satisfied/total`, `findings{risk,debt,observation}`) + task shape (`size`, `kind`, `multi_phase`) + `module_churn` attach to the proof entry as optional `process?: ProcessAttestation` via the 4-touch `commit_hygiene` pattern. Capture off, or no matching buffer record → valid proof with the field absent.
- [ ] AC10: `captureModulesTouched` additionally records per-file added/deleted churn under a new `module_churn` key from `git diff --numstat`; the existing `modules_touched` string array is unchanged.
- [ ] AC11: A `SessionEnd` (Claude) / `Stop` (Codex) hook triggers the same derive for non-work sessions, writing counts back into the buffer record, run async so it never delays teardown. Provenance-only — no findings/verdicts.
- [ ] AC12: A CI test asserts the capture + derive path performs **no network I/O** (network-denylist), and that **no raw transcript body** is ever persisted to the buffer or the proof — only the pointer + derived counts/hashes.
- [ ] New: `computeCost` is deterministic and stamps `price_table_version`; unknown model → cost 0, no throw.
- [ ] New: deriving the same fixture transcript twice yields `JSON.stringify`-identical output (determinism test).
- [ ] New: a proof entry built with capture off has no `process` key, and `ana proof <slug>` renders identically to before for that entry.
- [ ] New: tests pass with `(cd 'packages/cli' && pnpm vitest run)`; no type errors; lint clean; test count does not decrease.

## Testing Strategy

- **Unit tests:**
  - `deriveTranscript` against a committed fixture JSONL (use a trimmed real transcript from the local corpus — strip bodies, keep `usage`/`requestId`/`model`/`timestamp`): assert exact token counts with `requestId` dedup (fixture with a duplicated `requestId` → counted once), exact `turns`/`tool_calls`, `model`, `duration_ms`. Codex fixture (session-level model, no per-message model). Determinism: derive twice, assert byte-identical.
  - `computeCost` — known model+tokens → exact `cost_usd` (specific number, not `> 0`); unknown model → `0` + version stamped.
  - `captureModulesTouched` `module_churn` — temp git repo (`git init -b main`), known diff → exact `{added, deleted}` per file; binary file → `0/0`; `modules_touched` array byte-unchanged.
  - `ProcessAttestation` assembly — given a buffer record + proof object, asserts the outcome joins (`first_pass_verify` from `rejection_cycles`, findings-by-severity counts) and task_shape (size/kind/multi_phase) are correct.
- **Integration tests:**
  - `ana work complete` with capture on + a seeded buffer record → proof entry has `process` with the expected derived/outcome/task_shape/module_churn. With capture off → no `process` key, proof otherwise identical.
  - `ana proof <slug>` renders the Provenance section when `process` present; renders unchanged when absent.
  - SessionEnd `ana _capture --derive` updates the matching buffer line in place (match by `session_id`), async, exit 0; missing transcript → no-op exit 0.
- **Edge cases:**
  - No matching buffer record at work-complete → field absent, no throw.
  - Dangling `transcript_path` (file deleted before derive) → derive returns null → field absent.
  - Codex `transcript_path` empty → glob fallback resolves the rollout file; if none, null → absent.
  - Mixed/duplicate `requestId` across lines → single count.
- **CI guards (AC12):**
  - Network-denylist: stub/deny network at the test boundary; run the full capture+derive path; assert zero network attempts.
  - No-raw-body: assert the buffer line and the `process` attestation contain no transcript message content — only pointer + counts/hashes. Enforcement-style source/output assertion is sanctioned here.

## Dependencies

- **Phase 1 complete** — `forensics.ts` (buffer path, `SessionRecord`, gate), `_capture.ts`, the install-time-gated hook config, and the buffer must exist. Phase 2 extends all of them.

## Constraints

- **Determinism is a hard contract (AC8).** No `Date.now()`, `Math.random()`, or `new Date()` inside `deriveTranscript`/`computeCost`. Duration comes from transcript timestamps. Same input → byte-identical output.
- **No network, ever** (AC12). Price table is local data.
- **No raw transcript body persisted** (AC12) — only the pointer + derived counts/hashes.
- **Never gates the proof.** `process` is optional; absence is a valid, complete proof. Mirror `commit_hygiene`'s decoupling.
- **SessionEnd derive is async and total** — never delays teardown, always exits 0.
- **Provenance-only guardrail.** No findings, no verdicts, no scoring. If a count can't be derived, omit it — never infer a judgement.

## Gotchas

- **`requestId` dedup is mandatory** — Claude writes the same `requestId` across multiple JSONL lines; summing usage per-line double-counts. Dedup by top-level `requestId` before summing `usage`.
- **`usage` is at `.message.usage`, not top-level**; `requestId` IS top-level; `model` is at `.message.model` (Claude, per-message). Codex has **no per-message model** — model is in the first-line `session_meta` payload only.
- **Codex usage key shape is unconfirmed** — inspect a real `~/.codex/sessions/**/rollout-*.jsonl` before finalizing the Codex branch; the spike's structured-diff/exit-code claims are overstated (scan finding INFERRED) — rely only on `usage` + the pointer.
- **`module_churn` must not redefine `modules_touched`** — downstream consumers (`work-proof.ts:109`, `proof-health.ts:580/612/632`, `proofSummary.ts:1119`) assume `modules_touched` is a path string array. Add `module_churn` as a separate key only.
- **The proof-write lives in `work-proof.ts`, not `work.ts`** — stale references elsewhere say otherwise.
- **`artifact.ts` reads `.saves.json` multiple times per save** (active finding `fix-false-rejection-archive-C3`). Your `module_churn` write is in `captureModulesTouched` which already reads/writes `.saves.json` once — fold the numstat into the same read/write, do not add a new file read.
- **Price-table staleness** — stamp `price_table_version`; treat cost as estimate, never invoice. Unknown model → 0 + version, never throw.
- **Buffer can hold multiple records per slug** (e.g. a Plan with `--slug` plus a Build, both tagged the same slug). At work-complete, decide deterministically which record(s) feed the attestation — match by `(slug, role)` for the phase being completed, newest `timestamp` wins. Document the choice.
- **`contract_assertions_touched` is OUT OF SCOPE** — `@ana A0NN` tags are inert comments with no parser. Do not add extraction here.
- **Phase-2 hook events extend the Phase-1 prune** — the off/flip prune must remove `SessionEnd`/`Stop` `ana _capture` entries too, not just `SessionStart`.

## Build Brief

### Rules That Apply
- `.js` import extensions + `node:` builtins; `import type` separate; named exports; explicit return types + JSDoc on exports.
- Engine/util purity: `forensics.ts` and `pricing.ts` are CLI-dependency-free (no chalk/ora/commander). Display lives in `proof.ts` (command layer).
- Determinism: no `Date.now`/`Math.random`/`new Date()` inside derive/cost. (Also a workflow-script constraint, but here it's the AC8 contract.)
- `unknown` + narrow for the transcript JSON boundary; never `any`. A malformed line must be skipped, not throw the derive.
- Tests: `--run` flag; build `dist` before integration; `git init -b main` for git fixtures; inline/trimmed fixtures in temp dirs (strip transcript bodies — also satisfies the no-raw-body and the GH-advisory-false-positive rules).
- Specific-value assertions: exact token counts and exact `cost_usd`, never `toBeGreaterThan(0)`. The fixture has a known count.

### Pattern Extracts

**The 4-touch `commit_hygiene` template — mirror field-for-field.**

Touch 1 — type (`packages/cli/src/types/proof.ts:94`):
```typescript
  commit_hygiene?: Array<{
    check: string;
    file: string;
    severity: string;
    message: string;
  }>;
  // ADD sibling: process?: ProcessAttestation;
```

Touch 2 — default (`packages/cli/src/utils/proofSummary.ts:887`):
```typescript
    build_concerns: [],
    commit_hygiene: [],
    // process is optional → defaults to absent (do not seed an empty object)
  };
```

Touch 3 — read + spread (`packages/cli/src/commands/work-proof.ts`):
```typescript
// read (around :104-116):
let commitHygiene: Array<{ check: string; file: string; severity: string; message: string }> = [];
…
if (Array.isArray(savesContent['commit_hygiene'])) { commitHygiene = savesContent['commit_hygiene']; }
// ADD: read savesContent['module_churn']; assemble processAttestation from buffer + derive.

// spread (:163):
...(commitHygiene.length > 0 ? { commit_hygiene: commitHygiene } : {}),
// ADD sibling: ...(processAttestation ? { process: processAttestation } : {}),
```
Outcome join — `first_pass_verify` is `proof.rejection_cycles === 0`; phase count via `countPhases(planContent)` already imported and used at `:189`.

Touch 4 — display (`packages/cli/src/commands/proof.ts:405`):
```typescript
  const commitHygiene = entry.commit_hygiene || [];
  if (commitHygiene.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Commit Hygiene'));
    lines.push(chalk.gray('  ' + BOX.horizontal.repeat(14)));
    …
  }
  // ADD sibling block: if (entry.process) { … Provenance section … }
```

**Churn capture site — `captureModulesTouched` (`packages/cli/src/commands/artifact.ts:181`):**
```typescript
const diffResult = runGit(['diff', mergeBase, '--name-only', '--', '.', ':(exclude).ana'], { cwd: projectRoot });
const modulesList = diffResult.stdout ? diffResult.stdout.split('\n').filter(Boolean) : [];
// ADD a sibling --numstat call; parse "added\tdeleted\tpath" rows ('-' → 0) into module_churn.
savesData['modules_touched'] = modulesList;                 // unchanged
savesData['module_churn'] = churnMap;                       // new key
fs.writeFileSync(savesPath, JSON.stringify(savesData, null, 2));
```

**Price table shape — mirror `src/data/gotchas.ts`:**
```typescript
export interface GotchaEntry { id: string; triggers: Record<string,string>; skill: string; text: string; }
export const GOTCHAS: GotchaEntry[] = [ { id: 'vitest-watch-mode', /* … */ } ];
// pricing.ts: export const PRICE_TABLE_VERSION = '2026-06-01';
//             export interface PriceEntry { model: string; input: number; output: number; cache_create: number; cache_read: number; } // per-1M
//             export const PRICES: PriceEntry[] = [ … ];
```

**Claude transcript line shape (confirmed on this machine):**
- top-level: `sessionId`, `requestId`, `cwd`, `gitBranch`, `version`, `timestamp`, `type` (`user`|`assistant`), `uuid`, `parentUuid`.
- `.message`: `role`, `model`, `id`, `usage`, `content`, `stop_reason`.
- `.message.usage`: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` (no unified cache field).
- **Dedup tokens by top-level `requestId`.**

**Codex session shape (confirmed):** `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`; each line `{ payload, timestamp, type }`; first line `type: "session_meta"` (model + config in payload); **no per-message model**; filename UUID believed == `session_id` == `thread_id` (verify string-equality once before relying on it).

### Proof Context
- **`artifact.ts`** — active finding `fix-false-rejection-archive-C3`: ".saves.json read on every call — four reads per save." Directly relevant: fold `module_churn` into the existing `captureModulesTouched` read/write; do not add a fifth `.saves.json` read.
- **`work-proof.ts`** — no blocking active finding on the proof-write path; the `commit_hygiene` read/spread is well-formed prior art to mirror.
- **`proof.ts` / `proofSummary.ts` / `types/proof.ts`** — no active findings overlapping the `commit_hygiene` touch points.
- No active proof finding's `related_assertions` overlaps this contract's assertions.

### Checkpoint Commands
- After `pricing.ts` + `deriveTranscript`: `(cd 'packages/cli' && pnpm vitest run)` — Expected: derive + cost unit tests pass (exact counts, determinism).
- After `module_churn`: `(cd 'packages/cli' && pnpm vitest run)` — Expected: churn test passes; existing `captureModulesTouched`/`modules_touched` tests unchanged.
- After the 4-touch attach: `(cd 'packages/cli' && pnpm vitest run)` — Expected: work-complete + proof-display tests pass; capture-off path renders identically.
- After all changes (baseline): `pnpm run test -- --run` — Expected: ≥ 3424 + new tests, no regressions, test count does not decrease.
- Lint: `(cd 'packages/cli' && pnpm run lint)`. Types: `tsc --noEmit`. Build `dist` before integration tests.

### Build Baseline
- Current test files (cli): **138**. Current tests: **3424 passed, 2 skipped (3426 total)** — `pnpm run test -- --run`, measured at plan time (post Phase 1 this will be higher; re-measure at Phase 2 start).
- Command used: `pnpm run test -- --run` (full) / `(cd 'packages/cli' && pnpm vitest run)` (cli surface).
- After build: baseline + new tests across `pricing.ts`, `deriveTranscript`, `module_churn`, the 4-touch attach, and the SessionEnd derive.
- Regression focus: `work-proof.ts` (proof assembly — verify capture-off path is byte-identical to today), `artifact.ts` (`.saves.json` write — `modules_touched` must not change), `proof.ts` (display — existing entries without `process` render unchanged).
