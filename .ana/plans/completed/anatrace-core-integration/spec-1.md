# Spec: Phase 1 — Provenance swap (anatrace-core)

**Created by:** AnaPlan
**Date:** 2026-06-13
**Scope:** .ana/plans/active/anatrace-core-integration/scope.md

## Approach

Anatomia hand-maintains two transcript parsers (`deriveClaude`, `deriveCodex`) and a local price table that duplicates anatrace's. This phase deletes that duplication and derives provenance from the published `anatrace-core@0.2.0` engine. It is a **caller migration plus a deletion**, not a bolt-on — the package's `ProvenanceCounts` / `TokenCounts` / `PriceEntry` / `CostResult` / `PRICES` are deliberately frozen to mirror Anatomia's existing shapes field-for-field, so the swap changes internals while preserving the public seam (`captureProvenanceAtSave`) and every committed-record reader.

**Four moving parts:**

1. **`forensics.ts` derive internals → core.** Delete `deriveClaude`, `deriveCodex`, `readTranscriptLines`, `durationFromTimestamps`, `parseTestCounts`, `toolResultText`, and the `readString`/`readNumber`/`readObject` helpers that exist *only* to serve those derivers. Replace `deriveTranscript(path, harness)` with: read the transcript bytes once, wrap them in a core `NamedBlob` (`{ name, bytes }`), call `parseSession(blobs, harness)`, then `deriveCounts(session)`. Both core functions are **synchronous** — the seam stays sync and `captureProvenanceAtSave` is unchanged in shape. Keep the lifecycle untouched: pointer read/write/prune, `resolveTranscriptPath`, the provenance-file write, pointer consumption.

2. **`ProvenanceCounts` type → core.** Stop defining `ProvenanceCounts` locally. Re-export core's type so existing importers (`types/proof.ts`) keep their import path. Core's type adds exactly one key, `derive_version` (value `"3"` at this version), and demotes the four count fields to best-effort — the key set is otherwise identical, so committed-record readers are unaffected.

3. **Pricing → core (developer-confirmed adoption).** `src/data/pricing.ts` becomes a re-export surface for `anatrace-core`'s `PRICES`, `PRICE_TABLE_VERSION`, `computeCost`, and the `TokenCounts` / `PriceEntry` / `CostResult` types. Delete the local table and the local `computeCost` implementation. Core's `computeCost` takes a third arg — `{ priceTable }` — so the two call sites in `proof.ts` (`:292`, `:464`) must thread `{ priceTable: PRICES }`. Tables are **byte-identical at 0.2.0** (same rows, same version `2026-06-08`), so no displayed cost changes today; the value is one shared source going forward.

4. **`transcript_hash` + honest version display.**
   - Record `transcript_hash` (sha256 of the transcript bytes that were derived) on `SessionProvenance` — the **wrapper**, beside `captured_at`, NOT inside `derived`. `derived` is core's frozen type and must not gain Anatomia fields. `transcript_hash` is present iff the transcript was readable (same honesty rule as `derived`). `derive_version` rides inside `derived` for free.
   - Fix the latent pricing-display mismatch (`proof.ts:299` showed each record's *stamped* `price_table_version` while `:292/:464` recomputed cost from the *current* table). Root cause: two sources for "which table." Resolution: **source the displayed version from the `CostResult` that `computeCost` returns** (`cost.price_table_version`), so the label always matches the table actually used. The per-record stamped version stays in committed JSON as a historical fact; display never claims a version it didn't compute against.

**Re-baseline discipline.** Core's `deriveCounts` will not reproduce the old regex derive's exact numbers (different token-dedup and turn-counting). The derive tests must be rewritten to assert **invariants, not literals**: determinism (same bytes → `JSON.stringify`-identical output), no raw transcript body in any committed record, Codex `files_touched > 0` once the fixture carries a real `apply_patch` body, `derive_version === "3"`, `price_table_version === "2026-06-08"`. Where an exact literal is genuinely re-baselined against core, the build report must state the old → new value and why — never a silent snapshot regeneration.

**Network-freedom goes transitive.** Today `_capture.test.ts` scans the *source text* of three files for network imports. `anatrace-core` is now a runtime dependency, so the guarantee must cover it: add an assertion that the installed `anatrace-core` package's runtime dependencies are a subset of an allowlist of `{ yaml }`. Core's only runtime dep is `yaml` (verified) — the test locks that and fails loudly if a future bump adds a network-capable transitive dep.

**Findings this swap closes** (note in the build report): `session-capture-C12` and the two derive build-concerns (`parseTestCounts` best-effort regex; Codex `files_touched=0`; empty `harness_version`) are resolved by delegating the derive to core.

## Output Mockups

`ana proof <slug>` Provenance section is **visually unchanged** at 0.2.0 (byte-identical price table). The committed provenance JSON gains two fields:

```jsonc
// .ana/plans/active/{slug}/provenance/build-<session_id>.json
{
  "role": "build",
  "harness": "claude",
  "model": "claude-opus-4-8",
  "agent_def_hash": "sha256:…",
  "cli_version": "1.2.2",
  "session_id": "0a2f6d97-…",
  "captured_at": "2026-06-13T21:00:00.000Z",
  "transcript_hash": "sha256:…",        // NEW — byte-identity attestation only
  "derived": {
    "tokens": { "input": 700, "output": 200, "cache_create": 0, "cache_read": 0 },
    "price_table_version": "2026-06-08",
    "derive_version": "3",               // NEW — from core deriveCounts
    "duration_ms": 21000,
    "turns": 3,
    "tool_calls": 3,
    "commands_run": 1,
    "tests_executed": 12,
    "failures_encountered": 2,
    "files_touched": 1,
    "model": "claude-opus-4-8"
  }
}
```

When the transcript is unreadable: the row is still written with identity metadata, and **both** `derived` and `transcript_hash` are omitted (no guessed values).

## File Changes

### packages/cli/package.json (modify)
**What changes:** Add `anatrace-core` to `dependencies`, pinned exact: `"anatrace-core": "0.2.0"` (no caret/tilde — AC1 requires an exact pin). Run the install so `pnpm-lock.yaml` updates and the package resolves from the registry (no local link).
**Pattern to follow:** Existing `dependencies` block ordering/style in this file.
**Why:** Without the dependency, nothing in this phase can import the engine.

### packages/cli/pnpm-lock.yaml (modify)
**What changes:** Regenerated by `pnpm install`. Verify `anatrace-core@0.2.0` and its single transitive runtime dep `yaml` appear.
**Why:** The transitive network-freedom test reads the installed dependency tree.

### packages/cli/src/data/pricing.ts (modify)
**What changes:** Replace the file's contents with re-exports from `anatrace-core`: `PRICES`, `PRICE_TABLE_VERSION`, `computeCost`, and the `TokenCounts`, `PriceEntry`, `CostResult` types. Delete the local `PRICES` array, the local `computeCost` body, and the local type definitions. Keep the module path stable so the rest of the codebase still imports from `../data/pricing.js`.
**Pattern to follow:** Re-export with `export { … } from 'anatrace-core'` for values and `export type { … } from 'anatrace-core'` for types (coding-standards: types and values in separate statements).
**Why:** Deletes the duplicated price table (one shared cost source across Anatomia / anatrace / crack3d) while preserving the local import surface.

### packages/cli/src/utils/forensics.ts (modify)
**What changes:** Delete the hand-rolled derive (`deriveClaude`, `deriveCodex`, `readTranscriptLines`, `durationFromTimestamps`, `parseTestCounts`, `toolResultText`, and any of `readString`/`readNumber`/`readObject` left with no other caller — check each before deleting; `readString` is also used by `readPendingPointer`/`parseHookPayload`, so it stays). Rewrite `deriveTranscript(transcriptPath, harness)` to: read bytes (`fs.readFileSync` → `Uint8Array`), build `[{ name, bytes }]`, call `parseSession(blobs, harness as Harness)` → on `null` return `null`; else `deriveCounts(session)`. Stop importing/stamping `PRICE_TABLE_VERSION` locally (core's `deriveCounts` stamps it). In `captureProvenanceAtSave`, compute `transcript_hash` from the same bytes and add it to the written `SessionProvenance` when (and only when) the transcript was readable. Re-export core's `ProvenanceCounts` type so `types/proof.ts` keeps its import.
**Pattern to follow:** The existing `deriveTranscript` null-on-unreadable contract; the existing `captureProvenanceAtSave` total/never-throws try-catch (AC13 — the new `parseSession`/`deriveCounts` calls live inside that same catch).
**Why:** This is the core of the swap. The lifecycle is correct; only the inner mechanics move to core.
**Note:** `resolveTranscriptPath` carries an existing finding (`cross-machine-provenance-C2`: exported with zero external importers). Do not add new exports with zero importers in this refactor; if a deleted helper was the only reason a symbol was exported, drop the `export`.

### packages/cli/src/types/proof.ts (modify)
**What changes:** Add `transcript_hash?: string` to `SessionProvenance` with a JSDoc note that it is sha256 byte-identity attestation only (it does NOT imply the provenance can be regenerated without retained bytes — AC17). The `ProvenanceCounts` import already points at `../utils/forensics.js`; keep it (forensics now re-exports core's type).
**Pattern to follow:** The existing `captured_at` JSDoc on `SessionProvenance` (capture-metadata, not part of the deterministic derive).
**Why:** `transcript_hash` is capture metadata on the wrapper, not a derived count.

### packages/cli/src/commands/proof.ts (modify)
**What changes:** Update the two `computeCost` call sites (`:292`, `:464`) to the 3-arg core signature: `computeCost(s.derived.tokens, s.derived.model, { priceTable: PRICES })` — import `PRICES` from `../data/pricing.js` alongside `computeCost`. Change the displayed table-version source: instead of reading `s.derived.price_table_version` at `:299`, take it from the returned `CostResult` (`cost.price_table_version`) so the label matches the table actually used.
**Pattern to follow:** The existing `formatHumanReadable` provenance grid; do not restructure the rendering — only the cost call and the version source change.
**Why:** Core's `computeCost` requires `{ priceTable }`; the version-source fix removes the stamped-vs-computed mismatch (AC6).

### packages/cli/tests/utils/forensics-derive.test.ts (modify)
**What changes:** Re-baseline against core. Convert the exact-literal token/turn/tool assertions to invariant assertions where core's numbers differ; keep determinism, no-raw-body-escape, and dedup-behavior assertions. **Rewrite the Codex fixture** so its `apply_patch` / `custom_tool_call` carries a real patch body (a `*** Begin Patch` / `*** Update File:` / `*** End Patch` envelope) that core's Codex adapter parses, and add a positive `files_touched > 0` assertion in the Codex block (AC5). Add a committed/inline Codex rollout fixture that exercises the capture/save path, not just inline derive.
**Pattern to follow:** The existing `fs.mkdtempSync` + `writeFixture` temp-file pattern in this file.
**Why:** Core derives Codex `files_touched` only from a real `apply_patch` body; the current bodyless fixture cannot demonstrate it.

### packages/cli/tests/utils/forensics.test.ts (modify)
**What changes:** Update token/derive literals if core re-baselines them. Add: a committed provenance record carries `transcript_hash` when the transcript is readable, and omits both `transcript_hash` and `derived` when unreadable (identity row still written). Keep the no-raw-body and no-`cost_usd` assertions.
**Why:** Locks AC3 (transcript_hash present/absent honesty) and the unchanged lifecycle.

### packages/cli/tests/data/pricing.test.ts (modify)
**What changes:** Update `computeCost` calls to the 3-arg signature `computeCost(tokens, model, { priceTable: PRICES })`. The exact-cost literals (`36.75`, `0.56363`, unknown→`0`/`priced:false`) survive because core's `PRICES` is byte-identical. Confirm the re-exported `PRICE_TABLE_VERSION === '2026-06-08'`.
**Why:** Signature migration; proves adoption changes no cost today (AC6).

### packages/cli/tests/commands/_capture.test.ts (modify)
**What changes:** Add a transitive network-freedom assertion: read the installed `anatrace-core` package.json `dependencies`, assert the set is a subset of the allowlist `{ 'yaml' }` (fail with the offending dep name otherwise). Keep the existing source-text scan of the three Anatomia files.
**Pattern to follow:** The existing `networkPatterns` enforcement test (`:196-215`).
**Why:** The dependency's tree must be inside the no-network guarantee, not just Anatomia's own source.

### packages/cli/tests/commands/work-proof-process.test.ts (modify — only if needed)
**What changes:** These tests build their own `SessionProvenance` via the `prov()` helper (type-shape only). If adding `transcript_hash` to `SessionProvenance` does not break compilation (it is optional), no change is required. Touch only if a literal assertion references the now-core-derived counts.
**Why:** Assembly tests are shape-only; the swap should not disturb them.

## Acceptance Criteria

- [ ] AC1: `anatrace-core@0.2.0` is a pinned (exact, no caret) `packages/cli` dependency; the CLI builds and the published package resolves (no local link).
- [ ] AC2: `forensics.ts` contains no hand-rolled Claude/Codex transcript parsing or regex count derivation; counts come from `anatrace-core` `parseSession` + `deriveCounts`.
- [ ] AC3: Provenance records carry `transcript_hash` (on `SessionProvenance`) and `derive_version` (inside `derived`); an unreadable transcript still writes an identity row with both omitted (no guessed values).
- [ ] AC4: Committed `proof_chain.json` entries and `provenance/*.json` records lacking core fields still read without error (backward-compat test).
- [ ] AC5: Derive works for Claude and Codex; Codex `files_touched` is derived (no longer hardcoded 0), demonstrated by a rewritten Codex fixture with a real `apply_patch` body and a `files_touched > 0` assertion.
- [ ] AC6: Cost is computed via core pricing with `{ priceTable: PRICES }` threaded to `proof.ts:292,464`; unknown model → `priced: false`; the displayed `price_table_version` matches the table actually used (sourced from `CostResult`).
- [ ] AC12 (Phase 1 slice): Test count does not decrease; determinism, no-raw-body-escape, and Codex `files_touched > 0` are preserved as assertions; any exact-literal change is justified in the build report.
- [ ] AC13 (Phase 1 slice): All core calls at capture time are inside `captureProvenanceAtSave`'s total try-catch — a malformed transcript degrades to an absent derived block, never a thrown save.
- [ ] AC17 (Phase 1 slice): No field or JSDoc claims provenance can be regenerated without retained bytes; `transcript_hash`/`derive_version` are byte-identity attestation only.
- [ ] Network-freedom is transitive: a test asserts `anatrace-core`'s runtime deps ⊆ `{ yaml }`.
- [ ] `pnpm vitest run` (in `packages/cli`) passes; `pnpm run lint` passes.

## Testing Strategy

- **Unit tests:** Re-baselined derive tests (invariants); pricing signature migration; `transcript_hash` present/absent honesty.
- **Integration tests:** Codex rollout fixture through the capture/save path; backward-compat read of a legacy provenance record (no `derive_version`/`transcript_hash`).
- **Edge cases:** Malformed/adversarial transcript → `deriveTranscript` returns `null`, save completes, identity row written without `derived`; unknown model → `priced:false`; transitive dependency allowlist violation fails loudly.

## Dependencies

- `anatrace-core@0.2.0` published on npm (verified). No other prerequisites — this phase ships standalone.

## Constraints

- **Both harnesses.** Claude and Codex must both derive. Codex acceptance requires the rewritten fixture (AC5).
- **Backward compatibility.** Old committed records predate `derive_version`/`transcript_hash`; all readers must tolerate their absence (verified safe today: untyped parse + name-access at `work-proof.ts:132-143`, `proof.ts:289-301` guards `s.derived`).
- **Totality.** `ana artifact save` and the live agent session must never break on a capture failure.
- **Determinism.** Derive output must be `JSON.stringify`-identical across runs (core is pure — no clock/network/randomness).
- **Test count must not decrease** (CI runs 3 OS × 2 Node).

## Gotchas

- `parseSession`/`deriveCounts` are **synchronous** — do not make `captureProvenanceAtSave` async; read bytes with `fs.readFileSync`, not the promises API.
- `parseSession` returns `NormalizedSession | null` — a `null` must map to the existing "derived omitted" path, exactly like an unreadable file today.
- `readString` is shared by `readPendingPointer`/`parseHookPayload` — do not delete it when removing the derivers.
- Core's `computeCost` does **not** default `priceTable` — omitting it is a type error. Thread `{ priceTable: PRICES }` at every site.
- The Codex `apply_patch` body must be the real envelope core parses (`*** Begin Patch` … `*** End Patch`) — a bare `{ name: 'apply_patch' }` yields `files_touched: 0` (the current fixture's bug).
- Do not assert exact post-swap token literals in the contract — assert invariants. Core's dedup differs from the old regex derive.
- `transcript_hash` lives on `SessionProvenance`, never inside `derived` (core's frozen `ProvenanceCounts`).

## Build Brief

### Rules That Apply
- All local imports end in `.js`; bare specifiers (`anatrace-core`, `node:fs`) do not. Built CLI is ESM — a missing `.js` crashes at runtime.
- `import type` for type-only imports, separate from value imports. Never mix in one statement.
- Named exports only; no default exports.
- Explicit return types on all exported functions; `@param`/`@returns` JSDoc on exported functions (pre-commit `tsc --noEmit` + eslint enforce both).
- `| null` for "checked and empty"; `?:` for "may not have been checked." `transcript_hash` is `?:` (optional — present only when the transcript was read).
- Capture-path code is **total**: failures degrade to an absent record, never a throw. The engine-style empty/degrading catch in `captureProvenanceAtSave` is intentional — keep it.
- Temp-dir test pattern: `fs.mkdtempSync(path.join(os.tmpdir(), …))`, write inline JSONL fixtures, derive, assert.

### Pattern Extracts

The seam to preserve — `deriveTranscript` (forensics.ts:588-595), keep the signature and null-contract, swap the body:
```ts
export function deriveTranscript(
  transcriptPath: string,
  harness: string,
): ProvenanceCounts | null {
  const lines = readTranscriptLines(transcriptPath);   // ← replaced by: read bytes → NamedBlob → parseSession
  if (lines === null) return null;
  return harness === 'codex' ? deriveCodex(lines) : deriveClaude(lines);  // ← replaced by: deriveCounts(session)
}
```

The total save orchestrator — every new core call goes inside this try (forensics.ts:668-724, abridged):
```ts
export function captureProvenanceAtSave(projectRoot, slug, env): string | null {
  try {
    // … pointer/session/transcript resolution unchanged …
    const derived = transcriptPath ? deriveTranscript(transcriptPath, harness) : null;
    const provenance: SessionProvenance = {
      role, harness, model: derived?.model || pointerModel || '',
      agent_def_hash: env['ANA_AGENT_DEF_HASH'] ?? '',
      cli_version: env['ANA_CLI_VERSION'] ?? '',
      session_id: sessionId,
      captured_at: pointer?.captured_at || new Date().toISOString(),
      ...(derived ? { derived } : {}),
      // ← add: ...(transcriptHash ? { transcript_hash: transcriptHash } : {})
    };
    // … write file, consume pointer, prune …
    return filePath;
  } catch {
    return null; // Total: a capture failure must never break a save.
  }
}
```

The cost call sites to migrate (proof.ts:292 and :464):
```ts
const c = computeCost(s.derived.tokens, s.derived.model);  // → computeCost(…, { priceTable: PRICES })
// …
if (!provTableVersion) provTableVersion = s.derived.price_table_version;  // → from the CostResult: c.price_table_version
```

The network-freedom test to extend (_capture.test.ts:196-215) scans these three files' source for the `networkPatterns`; add a sibling assertion reading `anatrace-core`'s installed `package.json` `dependencies` and asserting `⊆ { 'yaml' }`.

### Proof Context
- `packages/cli/src/utils/forensics.ts` — `session-capture-C12` (parseTestCounts best-effort regex), Codex `files_touched=0`, empty `harness_version`: **all resolved by this swap** — note in the build report. `cross-machine-provenance-C2`: `resolveTranscriptPath` exported with zero importers — do not add new zero-importer exports.
- `packages/cli/src/commands/proof.ts` — heavily touched (17 cycles); keep changes surgical (only the two cost calls + version source). No active finding blocks this work.
- `packages/cli/src/data/pricing.ts` — no active proof findings.

### Checkpoint Commands
- After forensics + pricing + proof changes: `(cd 'packages/cli' && pnpm vitest run tests/utils/forensics-derive.test.ts tests/utils/forensics.test.ts tests/data/pricing.test.ts)` — Expected: green after re-baseline.
- After all changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: ≥ 3700 passing (no decrease).
- Lint: `(cd 'packages/cli' && pnpm run lint)` — Expected: clean.
- Build: `(cd 'packages/cli' && pnpm run build)` — Expected: resolves `anatrace-core`.

### Build Baseline
- Current tests: **3700 passed, 2 skipped (3702 total)** across **152 test files**.
- Command used: `pnpm vitest run` (run from `packages/cli`).
- After build: expected ≥ 3700 passing (new transitive-deps test + new transcript_hash tests added; any retired literal is replaced by an invariant, not dropped).
- Regression focus: `forensics-derive.test.ts`, `forensics.test.ts`, `pricing.test.ts`, `work-proof-process.test.ts`, and any test importing from `../data/pricing.js`.
