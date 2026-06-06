# Spec: C-core — Instrument pipeline savings + command activity

**Created by:** AnaPlan
**Date:** 2026-06-06
**Scope:** .ana/plans/active/context-compression-savings/scope.md

## Approach

Record exact compression **facts** per capture event into a durable, **unsealed**, **opt-in** record. Bytes/lines/counts only — never tokens, never a percentage of cost, never "saved." Record atoms; derive ratios at read.

This spec ships the entire measurement pipeline **except the config flag declaration** (that is Spec D, build-gated on Scope 1). C-core reads the flag as **raw JSON with `absent = off`**, so it builds and ships independently of Scope 1: when `captureMetrics` is absent (every customer until they opt in) the sidecar is never written. We flip our own dogfood flag on to prove the end-to-end path now.

**1 — The recorder (`src/utils/savings-recorder.ts`).** A pure-ish util: `recordCaptureEvent(projectRoot, slug, row)` appends one JSONL line to `<recordDir>/.ana/state/savings.jsonl`, **only when the flag is on**. It reads `captureMetrics` from `<projectRoot>/.ana/ana.json` (raw `JSON.parse`, `=== 'on'`); absent/`'off'`/malformed → no write, no file, zero cost (AC-C3). `mkdir -p` the `state/` dir on write. `.ana/state/` is already gitignored (`assets.ts:96` writes `state/` into `.ana/.gitignore`), so the sidecar is never committed.

**The row schema (v:1) — phase and run_kind are SEPARATE fields** (the scope's single `phase` conflated them; splitting now avoids a v:1→v:2 bump after rows exist):
```
{
  v: 1,
  ts: string,                                   // new Date().toISOString() — Date is available in the CLI
  slug: string,
  command: 'test' | 'build' | 'lint',           // the verb
  phase: 'build' | 'verify',                     // pipeline stage (--stage)
  run_kind: 'baseline' | 'checkpoint',           // run kind (test: both; build/lint: 'baseline')
  raw_bytes: number,                             // captured bytes (result.bytes)
  raw_lines: number,                             // line count of the raw capture
  returned_bytes: number,                        // bytes of composeAgentReturn(outcome) — POST-B
  returned_lines: number,
  verdict: 'pass' | 'fail' | 'abstain' | null,   // test only; null for build/lint
  passed_count: number | null,                   // test only (from deriveCounts); null otherwise
  failed_count: number | null,
  skipped_count: number | null
}
```

**2 — `returned_*` measures the POST-B representation.** `returned_bytes`/`returned_lines` are computed from `composeAgentReturn(outcome)` (Spec B) — the exact plain text the agent receives — NOT the raw capture. Recording raw as "returned" reintroduces the dishonesty the whole scope exists to avoid. The recorder is called at the same point the return is emitted, from `executeCapture` (test) and `executeCommandCapture` (build/lint), engine-side. **No measurement instruction appears in any agent template** (AC-C2) — the agent runs the thick command unaware it is being measured.

**3 — One shared sidecar, free pipeline rollup.** `.ana/state/` lives inside the worktree checkout, and Verify **reuses Build's worktree**, so Build's runs and Verify's runs append to the *same* `savings.jsonl`. No cross-artifact plumbing — the rollup is a sum over the file.

**4 — Durable rollup → unsealed `metrics` field on the proof entry.** At `ana work complete`, **before the worktree is pruned**, read the worktree's `savings.jsonl`, sum the atoms, and pass a `metricsMeta` object into `writeProofChain` — exactly as `worktreeMeta` is passed today. It lands on an **optional `metrics` field** on `ProofChainEntry`, written only when the rollup is non-empty, **omitted entirely otherwise** (a flag-off entry is byte-identical to today's). This rides the `worktreeMeta` route deliberately: `metrics` is computed in `work.ts` and passed as a param — it never flows through `generateProofSummary`, the `saves`, or `hashes`, which is *why* it is provably outside any integrity hash (AC-C6). `generateProofSummary` and `proofSummary.ts` are NOT touched.

**Ordering (pin this):** in `completeWork` (`work.ts`), the rollup read must happen at step **8c** (the "Capture worktree metadata BEFORE removal" block, ~line 1079), reading from `wtPath/.ana/state/savings.jsonl`, and BEFORE step **8d** `removeWorktree` (~line 1110). Then pass `metricsMeta` alongside `worktreeMeta` at the `writeProofChain` call (~line 1130). If `worktreeUsed` is false, fall back to reading `projectRoot/.ana/state/savings.jsonl`.

**The metrics rollup shape (atoms summed; ratios derived at read):**
```
metrics: {
  v: 1,
  totals: { runs, raw_bytes, raw_lines, returned_bytes, returned_lines },
  commands: {
    test?:  { runs, failed_runs, raw_bytes, raw_lines, returned_bytes, returned_lines },
    build?: { runs, failed_runs, raw_bytes, raw_lines, returned_bytes, returned_lines },
    lint?:  { runs, failed_runs, raw_bytes, raw_lines, returned_bytes, returned_lines }
  }
}
```
`failed_runs` for test = rows with `verdict === 'fail'`; for build/lint = rows whose row was recorded with a non-zero-exit failure (carry a boolean or derive: build/lint have no verdict, so the recorder must store enough to know a run failed — store `failed_count`/verdict for test, and for build/lint set `failed_runs` via a row-level `failed: boolean` OR include the exit signal). **Decision:** add a `failed: boolean` to the row (true when `runFailed` from Spec B) so the rollup is a clean sum for all three verbs without re-deriving per-verb logic. (This is additive to the v:1 schema above — include it.) Compression and ratio are derived at read (viewer), never stored.

**5 — The viewer is a 4-step pipeline, not one file.** The website consumes a *transformed* `ProofEntry`, not the raw `ProofChainEntry`. Rendering metrics requires:
1. `packages/cli/src/types/proof.ts` — add the optional `metrics` field to `ProofChainEntry`.
2. `website/scripts/extract-docs-data.ts` (~lines 129–220) — extract `metrics` from the chain entry into the website model when present.
3. `website/lib/docs-data/types.ts` (~lines 31–57, `ProofEntry`) — add the optional `metrics` field.
4. `website/components/docs/proof/ProofHero.tsx` — render the metrics block conditionally (`{entry.metrics && ( … )}`), in the meta-stats flex container (~lines 51–93), after the `surface` span. Language: "compressed / emitted / surfaced," counts like "lint 7× · build 1× · test 4× (3 failed)." Render **nothing** (no empty panel) when absent (AC-C9).

**6 — Dogfood.** Set `captureMetrics: "on"` in the **root** `.ana/ana.json` (our own install). Passthrough tolerates the key before Spec D declares it in the schema, and the recorder reads it raw — so a completed pipeline run on this repo produces a populated `metrics` field on its proof entry now (AC-C8). The flag survives Scope 1 + Spec D via `preserveUserState`'s `...parsed.data` spread.

**Honesty rules (non-negotiable):** lines/bytes/counts only; "compressed" not "saved"; never a percentage of cost; unsealed, outside the integrity hash, never consumed by gate/seal; compounding is narrative, not a stored number.

## Output Mockups

Sidecar row (`.ana/state/savings.jsonl`, one JSON object per line):
```json
{"v":1,"ts":"2026-06-06T07:00:00.000Z","slug":"context-compression-savings","command":"build","phase":"build","run_kind":"baseline","raw_bytes":18432,"raw_lines":210,"returned_bytes":410,"returned_lines":6,"verdict":null,"passed_count":null,"failed_count":null,"skipped_count":null,"failed":false}
{"v":1,"ts":"2026-06-06T07:01:12.000Z","slug":"context-compression-savings","command":"test","phase":"build","run_kind":"baseline","raw_bytes":84213,"raw_lines":1290,"returned_bytes":980,"returned_lines":14,"verdict":"fail","passed_count":1240,"failed_count":3,"skipped_count":0,"failed":true}
```

`metrics` block on the proof entry (`proof_chain.json`), present only when the flag is on:
```json
"metrics": {
  "v": 1,
  "totals": { "runs": 12, "raw_bytes": 1840221, "raw_lines": 21044, "returned_bytes": 9120, "returned_lines": 148 },
  "commands": {
    "test":  { "runs": 4, "failed_runs": 1, "raw_bytes": 1420000, "raw_lines": 16800, "returned_bytes": 6200, "returned_lines": 96 },
    "build": { "runs": 1, "failed_runs": 0, "raw_bytes": 18432,   "raw_lines": 210,   "returned_bytes": 410,  "returned_lines": 6 },
    "lint":  { "runs": 7, "failed_runs": 3, "raw_bytes": 401789,  "raw_lines": 4034,  "returned_bytes": 2510, "returned_lines": 46 }
  }
}
```
When the flag is off: the `metrics` key is **absent entirely** (not `null`, not `{}`).

Proof viewer (ProofHero meta-stats), when present:
```
verdict PASS   score 18/18   findings 2   duration 4m12s   surface cli
compressed  emitted 21,044 lines → surfaced 148   ·   test 4× (1 failed) · build 1× · lint 7× (3 failed)
```

## File Changes

> Machine-readable `file_changes` is in contract.yaml. Prose context below.

### packages/cli/src/utils/savings-recorder.ts (create)
**What changes:** `recordCaptureEvent(projectRoot, slug, row)` (flag-gated append) and `readSidecar(dir)` + `rollupSavings(rows)` → the `metrics` object (or null when empty). Exported row/metrics types. Reads `captureMetrics` raw from ana.json.
**Pattern to follow:** Raw `JSON.parse(fs.readFileSync(...))` guarded by try/catch returning a default (mirrors `work-proof.ts:100–116` reading `.saves.json`). Append with `fs.appendFileSync` after `mkdirSync(recursive)`.
**Why:** The recorder is the whole instrument; the rollup is its read side.

### packages/cli/src/commands/test.ts (modify)
**What changes:** After `composeAgentReturn` (Spec B), call `recordCaptureEvent(projectRoot, slug, row)` with `command: 'test'`, `phase: stage`, `run_kind: mode`, raw/returned bytes+lines, verdict, counts, `failed`. Engine-side; no template change.
**Pattern to follow:** Compute `raw_lines` from the captured bytes, `returned_*` from `composeAgentReturn(outcome)`.
**Why:** Test runs must be measured (the bulk of the compression story).

### packages/cli/src/commands/capture-command.ts (modify — from Spec A/B)
**What changes:** Same `recordCaptureEvent` call with `command: 'build'|'lint'`, `verdict: null`, counts null, `run_kind: 'baseline'`, `failed` from the non-zero-exit signal.
**Pattern to follow:** The test wiring.
**Why:** Build/lint activity + compression are part of the number.

### packages/cli/src/types/proof.ts (modify)
**What changes:** Add optional `metrics?: { v: number; totals: {...}; commands: {...} }` to `ProofChainEntry`, beside `worktree?`/`commit_hygiene?`.
**Pattern to follow:** The existing optional `worktree?` field (lines 101–107) — additive, optional, omitted when absent.
**Why:** The durable record's type.

### packages/cli/src/commands/work-proof.ts (modify)
**What changes:** Add a `metricsMeta?: ProofChainEntry['metrics']` parameter to `writeProofChain` and spread it onto the entry: `...(metricsMeta ? { metrics: metricsMeta } : {})` at the entry literal (~line 164, beside the `worktree`/`commit_hygiene` spreads).
**Pattern to follow:** The `worktreeMeta` parameter and its `...(worktreeMeta ? { worktree: worktreeMeta } : {})` spread (signature line 79; spread line 164).
**Why:** This is the omitted-when-absent guarantee (AC-C6) — undefined `metricsMeta` ⇒ no `metrics` key.

### packages/cli/src/commands/work.ts (modify)
**What changes:** In `completeWork` step 8c (~1079), read+rollup `wtPath/.ana/state/savings.jsonl` (fallback `projectRoot` when no worktree) into `metricsMeta` (null when empty/absent), BEFORE `removeWorktree` (8d, ~1110). Pass `metricsMeta` into `writeProofChain` (~1130).
**Pattern to follow:** The worktree-metadata-before-removal block already at 8c; the `writeProofChain(slug, proof, projectRoot, worktreeMeta)` call.
**Why:** The sidecar lives in the worktree; reading after prune loses it. Ordering is the gotcha.

### website/scripts/extract-docs-data.ts (modify)
**What changes:** When transforming a chain entry, copy `entry.metrics` into the website model if present.
**Pattern to follow:** How the script already maps optional fields (e.g. `scope_summary` → `scopeSummary`, `surface`). Map `metrics` (keep the snake/camel convention the script uses).
**Why:** The site reads the transformed model, not the raw entry — without this, `ProofHero` never sees metrics.

### website/lib/docs-data/types.ts (modify)
**What changes:** Add the optional `metrics` field to `ProofEntry` (~lines 31–57).
**Pattern to follow:** The existing optional fields on `ProofEntry`.
**Why:** Type the transported field.

### website/components/docs/proof/ProofHero.tsx (modify)
**What changes:** Render a metrics block conditionally in the meta-stats flex container after the `surface` span (~line 92), using `{entry.metrics && ( … )}`. Derive compression/ratio at render. "compressed/emitted/surfaced" language; per-command counts with failures.
**Pattern to follow:** The existing `{entry.surface && (<span>…</span>)}` conditional (lines 90–92) and `{entry.scopeSummary && (…)}` (lines 41–50).
**Why:** AC-C9 — render when present, nothing when absent.

### .ana/ana.json (modify — DOGFOOD, root install, not a template)
**What changes:** Add `"captureMetrics": "on"`. This is our own install (dogfood), not the product — it does NOT ship to customers.
**Pattern to follow:** Sibling top-level keys (`mergeStrategy`, `branchPrefix`).
**Why:** AC-C8 — prove the end-to-end metrics path on our own pipeline now.

## Acceptance Criteria

Copied from scope (Spec C, the non-config items) and expanded:

- [ ] **AC-C1:** Each capture event records one atomic row (`ts, command, phase, run_kind, raw_bytes, raw_lines, returned_bytes, returned_lines`, `verdict`+`passed/failed/skipped_count` for test/null otherwise, `failed`, `v:1`) to `.ana/state/savings.jsonl` keyed by slug. `returned_*` reflects the post-B representation.
- [ ] **AC-C2:** Recording is engine-side only — no measurement instruction in any agent template/prompt.
- [ ] **AC-C3:** When the flag is off or absent, the sidecar is not written at all — zero files.
- [ ] **AC-C4:** Build and Verify of one work item append to the same sidecar (shared worktree); the rollup spans both phases.
- [ ] **AC-C5:** At `ana work complete`, when the flag is on, a durable rollup is written to an optional `metrics` field on the proof entry, summing the sidecar atoms; read from the worktree sidecar before the worktree is pruned.
- [ ] **AC-C6:** The `metrics` field is outside any integrity hash, absent entirely when off (flag-off entry byte-identical to today's), and never appears in `build_report.md`.
- [ ] **AC-C8:** The dogfood `.ana/ana.json` has the flag `on`; a completed pipeline run produces a populated `metrics` field on its proof entry.
- [ ] **AC-C9:** The proof viewer renders the metrics block when present and nothing (no empty panel) when absent.
- [ ] **AC-C10:** Reported figures are bytes/lines/counts only — no tokens, no percentage-of-cost, no sealed/economy field. Language is "compressed/emitted/surfaced," never "saved."
- [ ] `phase` (build|verify) and `run_kind` (baseline|checkpoint) are separate row fields.
- [ ] `pnpm run build` (cli + website), full test suites, lint, typecheck pass; total test count does not decrease.

*(AC-C7 — the typed schema flag — is Spec D, build-gated on Scope 1.)*

## Testing Strategy

- **Unit (recorder):** flag `on` → a row is appended with all fields; flag `off` → no file created; flag absent → no file created; malformed ana.json → no write, no throw; `returned_*` equals the byte/line length of the provided `composeAgentReturn` text; build/lint rows carry `verdict: null` and null counts.
- **Unit (rollup):** a fixture `savings.jsonl` with mixed test/build/lint rows → correct per-command sums, `failed_runs` counts, totals; empty/absent file → `null` (so `metricsMeta` is undefined → field omitted).
- **Integration (`work complete`):** a worktree with a `savings.jsonl` → the completed proof entry has a `metrics` field with the summed rollup; a worktree with no sidecar (flag off) → the entry has **no** `metrics` key (assert the key is absent, not null); the read happens before `removeWorktree` (a test where the sidecar is only in the worktree, not main, still produces metrics).
- **Integration (shared sidecar):** appending a "build-phase" row then a "verify-phase" row to one sidecar → the rollup spans both phases.
- **Website:** extraction maps `metrics` when present and omits it when absent; `ProofHero` renders the block for an entry with metrics and renders nothing for one without (assert no empty container).
- **Honesty enforcement:** grep-style test that the rollup/render contains no "token"/"saved"/"%"/cost language (structural-invariant enforcement test — acceptable per testing-standards).

## Dependencies

Spec B merged (`composeAgentReturn` + the failure trigger — `returned_*` and `failed` depend on it). Spec A merged (build/lint outcomes). **No dependency on Scope 1** — the flag is read raw with `absent = off`.

## Constraints

- **Unsealed, additive, omitted-when-off.** `metrics` must never enter `hashes`, `build_report.md`, the seal, or the gate. A flag-off proof entry must be byte-identical to today's — the field is *absent*, not null/empty.
- **`returned_*` must measure the real return** (`composeAgentReturn`), not raw bytes.
- **Read before prune.** The rollup read precedes `removeWorktree`.
- **Zero cost when off.** No sidecar file, no `state/` write, when the flag is off/absent.
- **Bytes/lines/counts only.** No tokenizer, no `js-tiktoken`, no cost math, no "saved."

## Gotchas

- **Worktree vs main `.ana/state/`.** During Build/Verify the recorder runs inside the worktree, writing the worktree's `.ana/state/savings.jsonl`. At `work complete` you run from the main tree — read `wtPath/.ana/state/savings.jsonl`, not the main tree's. Fall back to main only when no worktree was used.
- **`metrics` absent when off — assert the KEY is gone.** `metrics: null` or `{}` would diverge customer proofs byte-for-byte. Omit via the `...(metricsMeta ? {…} : {})` spread; `metricsMeta` is undefined when the rollup is empty.
- **Don't route metrics through `ProofSummary`/`generateProofSummary`/`saves`/`hashes`.** That would put it on the hashed path. Use the `worktreeMeta` param route only.
- **build/lint have null counts** — the rollup must sum them as run/byte/line facts, not pass/fail. The row-level `failed` boolean keeps `failed_runs` a clean sum across all verbs.
- **The website reads a transformed model.** Editing only `page.tsx`/`ProofHero.tsx` without the extract script + `ProofEntry` type means the component never receives `metrics`. All four website-pipeline steps are required.
- **Date is fine here.** `new Date().toISOString()` works in the CLI (the Date restriction is a workflow-script constraint, not a CLI one).
- **`.ana/state/` is already gitignored** (`assets.ts:96`) — do not add it again; just confirm.

## Build Brief

### Rules That Apply
- `.js` imports, `node:` builtins, `import type` separate, named exports, explicit return types + JSDoc on exports.
- Engine/util zero CLI deps: `savings-recorder.ts` is chalk-free.
- `| null` for checked-empty (rollup returns `metrics | null`). Avoid `any`; type the row and metrics shapes.
- Adding a `ProofChainEntry` field is cross-cutting — but `metrics` rides the `worktreeMeta` route, so the touch points are: (1) type, (2) `writeProofChain` param+spread, (3) `work.ts` rollup+call, (4) website pipeline + `ProofHero` display. `generateProofSummary`/`proof.ts` display table need no change for the metrics field (it is not derived from saves).
- Test git-repo fixtures: `git init -b main`. Temp dirs for sidecar tests. Assert specific summed values, not `toBeDefined()`.

### Pattern Extracts

Optional-field spread on the entry (`work-proof.ts:163–164`) — the exact pattern for `metrics`:
```ts
...(commitHygiene.length > 0 ? { commit_hygiene: commitHygiene } : {}),
...(worktreeMeta ? { worktree: worktreeMeta } : {}),
// add:
...(metricsMeta ? { metrics: metricsMeta } : {}),
```

Worktree-metadata-before-removal block (`work.ts:1079–1130`) — where the rollup read slots in:
```ts
// 8c. Capture worktree metadata BEFORE removal …
const wtPath = getWorktreePath(projectRoot, slug);
const worktreeUsed = fs.existsSync(wtPath);
// → read+rollup (wtPath if worktreeUsed else projectRoot)/.ana/state/savings.jsonl HERE
// 8d. Remove worktree
if (worktreeUsed) { await removeWorktree(projectRoot, slug); }
…
const stats = await writeProofChain(slug, proof, projectRoot, worktreeMeta /*, metricsMeta */);
```

Conditional render (`ProofHero.tsx:90–92`):
```tsx
{entry.surface && (
  <span><b style={{ color: "var(--ink)", fontWeight: 500 }}>surface</b> {entry.surface}</span>
)}
{/* add a metrics span here, same conditional pattern */}
```

### Proof Context
Run `ana proof context packages/cli/src/commands/work.ts packages/cli/src/commands/work-proof.ts packages/cli/src/types/proof.ts website/components/docs/proof/ProofHero.tsx`. `work.ts`/`work-proof.ts` are load-bearing (the proof-entry write path) — prioritize any blocker/risk findings there. Curate the top 2–3 per file.

### Checkpoint Commands
- After `savings-recorder.ts`: `(cd 'packages/cli' && pnpm vitest run savings-recorder)` — Expected: recorder + rollup unit tests pass.
- After `work.ts`/`work-proof.ts`: `(cd 'packages/cli' && pnpm vitest run work)` — Expected: complete-flow integration tests pass, metrics-absent-when-off asserted.
- After website edits: `(cd 'website' && pnpm vitest run)` and `(cd 'website' && pnpm run build)` — Expected: extraction + render tests pass, Next build clean.
- After all changes: `pnpm run test -- --run` — Expected: baseline + new pass.
- Lint: `pnpm run lint`. Build: `pnpm run build`.

### Build Baseline
- Current tests at plan time: **3421** (139 files); will be higher after Specs A+B. Re-record at build start.
- Command used: `pnpm run test -- --run`
- After build: expected prior + new (recorder/rollup units, work-complete integration, website extraction/render).
- Regression focus: `work.ts` / `work-proof.ts` (proof-entry write path — a flag-off entry must stay byte-identical); the website build.
