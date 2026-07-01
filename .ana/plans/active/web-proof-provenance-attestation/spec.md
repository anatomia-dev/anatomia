# Spec: Web proof page — Provenance & Session Attestation

**Created by:** AnaPlan
**Date:** 2026-06-30
**Scope:** .ana/plans/active/web-proof-provenance-attestation/scope.md

## Approach

Extend the web proof page's data contract **end-to-end** — extract → type → render — so it covers the three 1.3.0 proof-schema branches (`process`, `compliance`, `verdict_veto`) that the CLI already renders and the shipped prose already describes. Three **independently-conditional** sections; when the data is absent the section, its TOC entry, and its copy-page markdown line all omit themselves, leaving the ~192 pre-1.3.0 proof pages byte-identical.

The CLI's `formatHumanReadable` / `renderSessionAttestation` (`packages/cli/src/commands/proof.ts`) is the **exact information contract** — mirror what it shows and how it computes. The shipped guide (`website/content/docs/guides/reading-a-proof.mdx`, §Provenance and §Session attestation) is already written and defines section names, order, and honesty framing; no MDX change is expected.

**Render order (matches CLI + prose):** Hero → Timeline → Assertion Ledger → Findings → **Provenance** → **Session Attestation (veto nested)** → Integrity Seal.

### Four design decisions locked in

1. **Cost via injected price function — coupling touches one file.** `packages/cli/src/data/pricing.ts` re-exports `computeCost` / `PRICES` from `anatrace-core`. The website's `tsx` (build) and Vitest (test) resolve this cross-package import successfully — **verified**: `computeCost({input:7363,output:25976,cache_create:56657,cache_read:1390876},'claude-opus-4-8',{priceTable:PRICES})` returns `{cost_usd:1.735759, priced:true, price_table_version:'2026-06-14'}` — exactly the `$1.74` the CLI/prose show, and an unknown model returns `{cost_usd:0, priced:false}`. **But** the cross-package import lives ONLY in `extract-docs-data.ts`. The pure shaping helper `deriveProvenance(process, priceFn)` takes an **injected** `priceFn: (tokens, model) => CostResult`; the extractor binds the real `computeCost`, tests pass a stub. This keeps the helper pure and unit-testable without dragging `anatrace-core` into the website's test resolution, and it does **not** duplicate the price table (the rejected approach). Cost is derived **at extraction** and baked into `ProofEntry`, so the price-table version travels with the serialized data.

2. **Price-table version: mirror the CLI exactly.** There is one `PRICES` table. `computeCost` recomputes against it and stamps `CostResult.price_table_version`. Display that stamp — **never** the per-session stored `derived.price_table_version` (which can disagree once the shared table moves forward). This is precisely what the CLI does (`proof.ts` lines 300–303). Cost is a labeled, recomputable **estimate**, not a stored invoice; a slight drift from the figure shown at completion time is the CLI's own documented behavior.

3. **Pure helpers live in `lib/docs-data/`, not in components.** The website Vitest `include` glob is `lib/__tests__/**/*.test.ts` — **component tests are not collected** (`buildGanttBars` is exported but currently untested for this reason). To satisfy AC9, every pure helper goes in `lib/docs-data/` (`provenance.ts`, `attestation.ts`), imported by both the extractor and the tests, mirroring the existing `lib/docs-data/proofs.ts` + `lib/__tests__/docs-data/proofs.test.ts` pattern. The conditional TOC/markdown fragments are also pure helpers here (so AC8 is mechanically testable without a DOM).

4. **Palette honesty is the design, not decoration.** Provenance reuses `IntegritySeal`'s muted mono vocabulary with **zero** pass/fail color. Session Attestation gets its **own** palette where neutral is the default state — it must not reuse `AssertionLedger`'s red `unsatisfied` for `unverifiable`. See Gotchas.

### Resolved open questions

- **Cost at extraction vs render** → extraction (injected `priceFn`), so `ProofEntry` stays the single serialized contract.
- **Veto placement** → nested inside the Session Attestation section (CLI parity: `renderSessionAttestation` calls `renderVerdictVeto`). The section renders when `attestation` records exist **or** a `verdictVeto` exists, so the veto is never silent. In current data the 4 veto slugs are exactly the 4 compliance slugs, so they always co-occur.
- **Decomposition** → single spec (developer decision, 2026-06-30).
- **Churn on missing/zero data** → omit the churn line entirely (developer decision). Mirrors the CLI's `churnFiles > 0` guard.

## Output Mockups

The page must reproduce the information the CLI shows. The CLI text render (source of truth) for the richest proof:

```text
── Provenance ──────────────────────────────────────────
  model  claude-opus-4-8
  session  turns  tools    in    out  cache   cost
  ana         51     21  7.4k  26.0k   1.4M  $1.74
  plan        70     30  7.3k  53.1k   1.9M  $2.98
  build      115     52  7.8k  62.6k   5.1M  $4.92
  verify     120     53  8.1k  37.3k   4.6M  $3.97
  TOTAL  4 sessions                          $13.61  (table 2026-06-14)
  churn  9 files · +1638/−0
  completeness  ✓ complete (plan 1/1 · build 1/1 · verify 1/1)

── Session Attestation ───────────────────── 3 transcripts
  core v0.4.0 · framework anatomia
  plan · 49 claims   ✓ 1 satisfied · 0 violated · 48 unverifiable
        coverage 1/49 checked · 48 unverifiable
        mandate sha256:ab12cd… · transcript sha256:9f0dd7…
  … (build, verify records)
  verdict veto: not applied — verify did not read build_report.md
  veto is forward-only; pre-veto verdicts were self-reported.
```

**Web translation (behavioral requirements, not pixel spec — craft is the builder's):**

- **Provenance** — a bordered, muted, mono card in `IntegritySeal`'s idiom: an optional single `model` line (only when every session shares one model), a per-session table (`session · turns · tools · in · out · cache · cost`), a **TOTAL** footer row (`N sessions`, summed cost, `unpriced` count when any, trailing `(table <version>)`), an optional churn line, and an optional completeness line. **No** `--pass`/`--fail` color anywhere; cost renders as plain ink; unpriced session cost is `n/a`, never `$0.00`.
- **Session Attestation** — a `core vX · framework Y` identity line, then per-agent rows: `<label> · <N> claims`, the three counts (`satisfied` / `violated` / `unverifiable`), a **prominent** coverage ratio (`coverage 1/49 checked · 48 unverifiable`), abbreviated mandate/transcript hashes, up to 3 notable (non-satisfied) verdicts with reason, and an incomplete-coverage warning when `complete` is false. Ends with the nested veto line(s).
- **Verdict veto** — `applied:false` → one quiet line (`verdict veto: not applied — <reason>`) plus the forward-only boundary note. `applied:true` → a distinct, serious treatment (the one place alarm color is warranted for the veto), wired from the schema.

## File Changes

Verified each marker against the filesystem on 2026-06-30. `lib/docs-data/index.ts` is a co-change partner of `types.ts` — Build must check whether the new helpers/loaders need re-exporting there (they may not; the page imports helpers directly).

### website/lib/docs-data/types.ts (modify)
**What changes:** Add three optional fields to `ProofEntry` — `provenance?`, `attestation?`, `verdictVeto?` — and the interfaces they reference. Optionality **is** the graceful-degradation contract (per the `| null` vs `?:` rule: use `?:` here because these fields may not have been *present* on the source entry, not "checked and empty").
**Pattern to follow:** The existing `ProofTiming` / `ProofAssertion` interfaces in the same file — flat, serializable, camelCase.
**Why:** Without the type additions the extractor output and the page have no typed contract; downstream code would reach for `any`.

### website/lib/docs-data/provenance.ts (create)
**What changes:** Pure helpers, no CLI/anatrace import:
- `deriveProvenance(process, priceFn)` → the `ProofProvenance` shape: per-session rows (rework-indexed label, model, turns, toolCalls, tokens `{input,output,cache}` where `cache = cache_create + cache_read`, `costUsd`), model-collapse flag, TOTAL summary (`sessions`, `costUsd`, `unpriced`), `priceTableVersion` (from the first `CostResult`), churn (or `null`), completeness (or `null`). Sessions lacking `derived` are kept with `countsAvailable:false` and null numbers (CLI "counts unavailable" behavior).
- `provenanceTocItem(entry)` → the TOC entry or `null`.
- `provenanceMarkdownLines(entry)` → `string[]` for the copy-page content (empty when absent).
**Pattern to follow:** `buildGanttBars` in `components/docs/proof/PipelineGantt.tsx` (pure, early-return on empty) and the label/model-collapse logic in `proof.ts` lines 447–475. Mirror the CLI's counting exactly.
**Why:** Single source of the provenance data shape; testable without a DOM or the price table.

### website/lib/docs-data/attestation.ts (create)
**What changes:** Pure helpers:
- `summarizeAttestation(compliance)` → `ProofAttestation`: engine identity, per-agent rework-indexed label, the three counts, `coverage {checked,total,unverifiable}`, `complete`, up to 3 notable (non-satisfied) verdicts, and an `incompleteCount`.
- `summarizeVeto(verdict_veto)` → `ProofVerdictVeto | null` (`applied`, `reason`).
- `attestationTocItem(entry)` and `attestationMarkdownLines(entry)`.
**Pattern to follow:** The counting/labeling in `renderSessionAttestation` (`proof.ts` lines 705–743).
**Why:** Separates the neutral-palette attestation semantics from provenance; testable.

### website/scripts/extract-docs-data.ts (modify)
**What changes:** Import `computeCost, PRICES` from `../../packages/cli/src/data/pricing.ts` (dynamic `import(path.join(...))` under `tsx`, consistent with how `extractGotchas` already imports CLI source). In `extractProofEntries`, add three conditional branches: when `entry.process` → attach `provenance: deriveProvenance(entry.process, (t,m)=>computeCost(t,m,{priceTable:PRICES}))`; when `entry.compliance` → attach `attestation: summarizeAttestation(entry.compliance)`; when `entry.verdict_veto` → attach `verdictVeto: summarizeVeto(entry.verdict_veto)`. Spread each conditionally (`...(entry.process ? { provenance } : {})`) so absent branches add no key — matching the existing `...(entry.phases ? ... : {})` pattern.
**Pattern to follow:** The conditional-spread already used at `extractProofEntries` line 204; the cross-package dynamic import at `extractGotchas` line 647.
**Why:** The extractor is where build-time cross-package reads belong; keeping the `priceFn` binding here confines the `anatrace-core` coupling to one file.

### website/components/docs/proof/ProvenanceTable.tsx (create)
**What changes:** Presentational component taking `ProofProvenance`. Early-return `null` on empty sessions. Bordered mono card (IntegritySeal idiom): optional model line, per-session table, TOTAL footer, optional churn line, optional completeness line.
**Pattern to follow:** `IntegritySeal.tsx` (border/mono/key-value rows) extended to a table with a totals row; `PipelineGantt`'s empty-guard.
**Why:** Provenance is "IntegritySeal as a per-session table with a totals row."

### website/components/docs/proof/SessionAttestation.tsx (create)
**What changes:** Presentational component taking `ProofAttestation | undefined` and `ProofVerdictVeto | undefined`. Renders the identity line, per-agent rows with the three counts + prominent coverage ratio + hashes + notable verdicts + incomplete warning, then the nested veto. Neutral palette (see Gotchas). Renders when either prop is present.
**Pattern to follow:** `AssertionLedger.tsx` *structure* (id/says/status rows, show-more), with **diverged** color semantics.
**Why:** The attestation section carries a different truth claim than the ledger; same structure, different palette.

### website/app/docs/proof/[slug]/page.tsx (modify)
**What changes:** (a) After the Findings section and before the Integrity Seal, conditionally render `<ProvenanceTable>` (when `entry.provenance`) and `<SessionAttestation>` (when `entry.attestation || entry.verdictVeto`), each under a `HeadingWithAnchor` (`#provenance`, `#attestation`). (b) Make `tocItems` conditional: build the base 4, then splice `provenanceTocItem(entry)` and `attestationTocItem(entry)`, `.filter(Boolean)`. (c) In `buildProofMarkdown`, append `...provenanceMarkdownLines(entry)` and `...attestationMarkdownLines(entry)` between the existing Findings and Integrity sections.
**Pattern to follow:** The existing section wiring (lines 183–207), the hardcoded `tocItems` array (166–171), and `buildProofMarkdown` (55–74).
**Why:** This is the render wiring that closes the prose over-claim ("the proof page shows the same data with more detail").

**Out of scope — do NOT touch:** the network-fallback raw page (`page.tsx` lines 121–161). It renders from `ProofChainRawEntry` via a live fetch and does not use `ProofEntry`. Wiring new sections there is explicitly excluded.

### website/lib/__tests__/docs-data/provenance.test.ts (create)
**What changes:** Unit tests for `deriveProvenance` (with a stub `priceFn`), `provenanceTocItem`, `provenanceMarkdownLines`.

### website/lib/__tests__/docs-data/attestation.test.ts (create)
**What changes:** Unit tests for `summarizeAttestation`, `summarizeVeto` (both `applied` branches), `attestationTocItem`, `attestationMarkdownLines`.

## Acceptance Criteria

Copied from scope, expanded with implementation criteria:

- [ ] AC1: A full-data proof (`proof-benchmark-harness`) renders a Provenance section and a Session Attestation section below Findings and above the Integrity Seal, matching the CLI render (model, per-session turns/tools/tokens/cost, totals, churn, completeness; per-agent claims with coverage ratio and satisfied/violated/unverifiable counts).
- [ ] AC2: A pre-1.3.0 proof with neither `process` nor `compliance` renders identically to today — no Provenance section, no Attestation section, no extra TOC entries, no extra copy-page markdown.
- [ ] AC3: Provenance and Session Attestation are independently conditional — `cross-machine-provenance` (provenance, no compliance) renders Provenance and **not** Attestation.
- [ ] AC4: Provenance carries no verdict/pass-fail color semantics and sits subordinate to the verdict (after Findings, not adjacent to the PASS/FAIL badge). Its data model carries no status/result field.
- [ ] AC5: Session Attestation renders `unverifiable` as neutral (its own palette, distinct from `AssertionLedger`'s red `unsatisfied`), shows the coverage ratio prominently, and carries an explicit non-gating label. `violated` is the only alarm-colored state.
- [ ] AC6: The verdict-veto state renders conditionally — `applied:false` → a quiet single line; `applied:true` → a distinct serious treatment. Both branches wired from the schema; no fabricated data.
- [ ] AC7: Dollar cost is derived at build time from `packages/cli/src/data/pricing.ts` (single source), not duplicated in the website and not read from a stored field. Unpriced models render `n/a`, never `$0.00`.
- [ ] AC8: The TOC (`tocItems`) and the copy-as-markdown output (`buildProofMarkdown`) include Provenance/Attestation entries only when that data is present.
- [ ] AC9: New pure helpers have Vitest unit tests in `lib/__tests__/docs-data/`; total test count does not decrease.
- [ ] AC10: The page and `reading-a-proof.mdx` stay coherent — section names, order, and framing match (verified by reading; prose is already shipped and describes all three sections).
- [ ] New: `pnpm --filter website test` passes; test count ≥ current.
- [ ] New: `pnpm --filter website build` (which runs the prebuild extractor) succeeds and regenerates `data/docs/proof-entries.json` with the new fields on the 18 provenance / 4 compliance cohorts.
- [ ] New: lint passes (mind `react/no-unescaped-entities` — use `&apos;` in JSX text).

## Testing Strategy

- **Unit tests (the contract target):** `deriveProvenance` with a **stub** `priceFn` — assert per-session rows, cache summing (`cache_create + cache_read`), TOTAL cost summing (priced only), `unpriced` count, `priceTableVersion` sourced from the `CostResult`, model-collapse on/off, `countsAvailable:false` degradation, churn omitted when empty, completeness passthrough. `summarizeAttestation` — the three counts, coverage ratio, notable-verdict cap (3), `incompleteCount`. `summarizeVeto` — both `applied` branches. TOC/markdown helpers — present vs absent.
- **Fixtures:** Build small inline fixtures shaped like the real serialized entries (see the field shapes in the Build Brief). A stub `priceFn` returns `{cost_usd, priced, price_table_version}` deterministically so cost math is asserted without `anatrace-core`. Add one unpriced case (`priced:false`) and one counts-unavailable session (no `derived`).
- **Integration (build-time):** Run the prebuild extractor; confirm `proof-entries.json` gains the fields for the cohorts and that a pre-2026-06-08 entry has none. The existing `lib/__tests__/docs-data/data-integrity.test.ts` reads the generated JSON — extend it if it asserts the entry shape.
- **Edge cases:** absent `process`/`compliance`/`verdict_veto`; provenance-only proof; unpriced model; session missing `derived`; empty `module_churn`; `complete:false` attestation record.
- **Not unit-tested (craft-reviewed):** the JSX palette/positioning (AC4/AC5/AC6 visual dimension). The env is `node` with no React test renderer — the color and placement are verified by human review of the built page against the 5 cohorts. The **data** that drives them is unit-tested.

## Dependencies

None external. `computeCost`/`PRICES` already resolve from `packages/cli/node_modules/anatrace-core` at both build and test time (verified). No new npm dependency; do **not** add `anatrace-core` to `website/package.json`.

## Constraints

- Pre-1.3.0 proof output must be **byte-identical**. Conditional-spread every new field; conditional every TOC/markdown fragment.
- No price-table duplication in the website; single source is `packages/cli/src/data/pricing.ts`.
- Test count must not decrease (repo-wide CI gate).
- `import type` for type-only imports; `.js` extensions on relative imports within `lib/` and the extractor (ESM runtime requirement).
- Provenance and Attestation are **non-gating** — nothing in these sections may influence or restate the PASS/FAIL verdict, except the `applied:true` veto branch (which only *renders* an outcome decided upstream; it does not compute anything).

## Gotchas

- **Do not reuse `AssertionLedger`'s status palette for attestation.** Its `unsatisfied`/`fail` column is `--fail` (red, gating). Attestation's `unverifiable` is neutral abstention — use a muted ink (`--ink-45`). `satisfied` must be **restrained** (e.g. `--info`, not the bright `--pass` green) so a `1/49` satisfied count is not inflated into false confidence. `violated` is the **only** state that gets `--fail`. Palette vars live in `website/app/docs/docs.css`.
- **Provenance must not borrow verdict coloring or sit near the verdict badge.** Muted mono only; place it after Findings.
- **`tocItems` is a hardcoded 4-item array today** (page.tsx 166–171). A new hardcoded entry would give old proofs a TOC link to a section that does not exist — make it conditional.
- **`buildProofMarkdown` must stay conditional too** — an unconditional header would give old proofs' copy-page content an empty section.
- **Price-table version comes from `CostResult.price_table_version`, not the per-session stored stamp.** They can disagree.
- **`cache` column = `cache_create + cache_read`.** Codex sessions have `cache_create:0`; render the `cache_read` as-is.
- **The raw-fetch fallback page is out of scope** — it uses `ProofChainRawEntry`, not `ProofEntry`.
- **Model collapse rule:** show one `model` line only when *every* session has `derived` counts AND all share one model; otherwise put the model in each row's label. Copy this from `proof.ts` 447–464 — a subtle rule that is easy to get wrong.
- **Don't add a `console.error`/throw to the extractor's new branch on missing sub-fields** — degrade gracefully (a session without `derived` still renders a row; empty churn omits its line).

## Build Brief

### Rules That Apply
- Relative imports within `lib/` and the extractor use `.js` extensions (ESM runtime crashes otherwise). `import type` for types, separate from value imports.
- Named exports only (no default exports).
- Explicit return types on all exported functions; `@param`/`@returns` JSDoc on exported functions (eslint enforces the tags).
- Avoid `any` — the raw proof entry is dynamic; narrow with `unknown` + guards, or type the sub-objects (`process`, `compliance`, `verdict_veto`) locally in the extractor.
- In JSX text, escape apostrophes as `&apos;` (`react/no-unescaped-entities`).
- Cost/derivation logic is pure and injectable — the `anatrace-core` import lives only in `extract-docs-data.ts`.

### Pattern Extracts

**Injected price function (verified to resolve under tsx and vitest):**
```ts
// extract-docs-data.ts — bind once, pass into the pure helper
const pricing = await import(path.join(CLI_PKG, 'src', 'data', 'pricing.ts'));
const priceFn = (tokens: TokenCounts, model: string): CostResult =>
  pricing.computeCost(tokens, model, { priceTable: pricing.PRICES });
// computeCost({input:7363,output:25976,cache_create:56657,cache_read:1390876}, 'claude-opus-4-8', {priceTable:PRICES})
//   → { cost_usd: 1.735759, priced: true, price_table_version: '2026-06-14' }   ($1.74)
// unknown model → { cost_usd: 0, priced: false, price_table_version: '2026-06-14' }  (render 'n/a')
```

**Conditional-spread already in `extractProofEntries` (extract-docs-data.ts:204) — follow this exactly:**
```ts
      ...(entry.phases ? { phases: entry.phases as number } : {}),
```

**IntegritySeal row idiom to extend into a table (IntegritySeal.tsx:18–31):**
```tsx
{Object.entries(hashes).map(([key, value], i, arr) => (
  <div key={key} style={{
    display: "grid", gridTemplateColumns: "140px 1fr", gap: "14px",
    padding: "6px 0",
    borderBottom: i < arr.length - 1 ? "1px solid var(--hairline)" : undefined,
  }}>
    <span style={{ color: "var(--ink-60)" }}>{key}</span>
    <span style={{ color: "var(--ink)", overflowX: "auto", whiteSpace: "nowrap" }}>{value.substring(0, 20)}...</span>
  </div>
))}
```

**Empty-guard to mirror on both new components (PipelineGantt.tsx:99):**
```tsx
if (timing.totalMinutes === 0) { return ( /* muted "No timing data" */ ); }
```

**CLI provenance label + model-collapse logic to port into `deriveProvenance` (proof.ts:447–475):**
```ts
const allSameModel = p.sessions.length > 0
  && p.sessions.every((s) => s.derived != null)
  && p.sessions.every((s) => s.derived!.model === p.sessions[0]!.derived!.model);
const roleSeen: Record<string, number> = {};
for (const s of p.sessions) {
  const n = (roleSeen[s.role] = (roleSeen[s.role] ?? 0) + 1);
  let label = n > 1 ? `${s.role} ${n}` : s.role;      // rework index: "build 2"
  if (!allSameModel) label += ` · ${(s.derived?.model || s.model).replace(/^claude-/, '')}`;
  // ...
}
// sessions without s.derived → render "counts unavailable", kept in the dataset
```

**CLI attestation counting to port into `summarizeAttestation` (proof.ts:705–743):**
```ts
let satisfied = 0, violated = 0, unverifiable = 0;
for (const v of rec.verdicts) {
  if (v.status === 'satisfied') satisfied += 1;
  else if (v.status === 'violated') violated += 1;
  else unverifiable += 1;
}
// coverage line: `${rec.coverage.fully_checked}/${rec.coverage.total} checked · ${rec.coverage.unverifiable} unverifiable`
const notable = rec.verdicts.filter((v) => v.status !== 'satisfied').slice(0, 3);
```

**Serialized source shapes (from `.ana/proof_chain.json` — build fixtures like these):**
```jsonc
// entry.process
{ "outcome": {...}, "task_shape": {...},
  "module_churn": { "path/to/file.ts": { "added": 120, "deleted": 0 }, /* ... */ },
  "completeness": { "complete": true, "expected": {"plan":1,"build":1,"verify":1},
                    "present": {"plan":1,"build":1,"verify":1}, "gaps": [] },
  "sessions": [ { "role": "ana", "harness": "claude", "model": "claude-opus-4-8",
    "session_id": "…", "captured_at": "2026-06-18T22:27:41.954Z",
    "transcript_hash": "sha256:…",
    "derived": { "tokens": {"input":7363,"output":25976,"cache_create":56657,"cache_read":1390876},
      "price_table_version": "2026-06-14", "derive_version": "3", "duration_ms": 1476240,
      "turns": 51, "tool_calls": 21, "commands_run": 14, "files_touched": 9, "model": "claude-opus-4-8" } } ] }
// entry.compliance[0]
{ "role": "plan", "harness": "claude", "session_id": "…", "captured_at": "…",
  "anatrace_core_version": "0.4.0", "framework": "anatomia",
  "mandate_hash": "sha256:…", "transcript_hash": "sha256:…",
  "coverage": { "total": 49, "fully_checked": 1, "unverifiable": 48 },
  "complete": false,
  "verdicts": [ { "claim_id": "…", "says": "…", "status": "unverifiable", "reason": "codex-blind", "source": "deterministic" } ] }
// entry.verdict_veto
{ "applied": false, "reason": "verify did not read build_report.md" }
```

### Proof Context

- **page.tsx** — `[code] ship-log-proof-links-C2`: GitHub outage degrades valid new slugs to 404 via `fetchProofChainEntry` → `notFound()`. That's the fallback path (out of scope); do not disturb it. Build concern: the fallback page omits `RightRail` — also out of scope. No active finding blocks this work.
- **extract-docs-data.ts** — `[code] fix-prebuild-source-mutation-C6`: median computation is duplicated between the extractor `main()` and `lib/docs-data/proofs.ts`. Reinforces the anti-duplication ethos — do **not** add a second price-table or a second cost formula; the injected-`priceFn` design keeps one source. Build concern history: `stripJsx` duplicated (lib + inline). Keep new logic in `lib/docs-data/`, imported by the extractor — do not inline a copy.
- **types.ts** — no active proof findings.

**Co-change partners (blast-radius awareness — check these when you touch the file):**
- `page.tsx` ↔ `extract-docs-data.ts`, `lib/docs-data/proofs.ts`, `lib/docs-data/index.ts`; imports `AssertionLedger`, `IntegritySeal`, `HeadingWithAnchor`, `Breadcrumb`, `RightRail`, `PipelineGantt`, `FindingsList`.
- `extract-docs-data.ts` ↔ `lib/docs-data/index.ts`, `lib/docs-data/proofs.ts`, `app/docs/[...slug]/page.tsx`; imports `docsStatValues`, `stripJsx`.
- `types.ts` ↔ `lib/docs-data/index.ts`, `extract-docs-data.ts`, `page.tsx`. **Check whether `lib/docs-data/index.ts` needs to re-export the new helpers** — the page can import them directly from `provenance.ts`/`attestation.ts`, so a barrel export may be unnecessary; match whatever the existing loaders do.

### Checkpoint Commands

Surface is `website`. Use the website surface commands from ana.json.
- After the helpers + tests: `(cd 'website' && pnpm vitest run lib/__tests__/docs-data/provenance.test.ts lib/__tests__/docs-data/attestation.test.ts)` — Expected: new tests pass.
- After the extractor change: `(cd 'website' && pnpm run build)` — Expected: prebuild extractor succeeds; `data/docs/proof-entries.json` has the new fields on the cohorts.
- After all changes: `(cd 'website' && pnpm vitest run)` — Expected: all website tests pass, count ≥ baseline.
- Lint: `(cd 'website' && pnpm run lint)` — Expected: clean (watch `react/no-unescaped-entities`).

### Build Baseline
Run the website test command and record exact counts before building.
- Command: `(cd 'website' && pnpm vitest run)`
- Current test files: 11 (`lib/__tests__/**`)
- Current tests: ~88 (grep estimate; capture the exact `vitest run` number as the baseline).
- After build: expected baseline + new provenance/attestation helper tests, across 2 new test files.
- Regression focus: `lib/__tests__/docs-data/data-integrity.test.ts` and `proofs.test.ts` (they read the generated `proof-entries.json`); `page.tsx` render path for old proofs (byte-identical requirement).
