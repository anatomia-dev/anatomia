# Scope: Web proof page — Provenance & Session Attestation

**Created by:** Ana
**Date:** 2026-06-30

## Intent

The web proof page (`website/app/docs/proof/[slug]/page.tsx`) is the product's signature public artifact — the data nobody else can produce. It renders Hero → Timeline → Assertion Ledger → Findings → Integrity Seal, but renders **none** of the process/behavioral data the 1.3.0 proof schema started producing: Provenance, Session Attestation, or the verdict-veto state. The CLI (`ana proof <slug>`) renders all of it, and the shipped prose (`website/content/docs/guides/reading-a-proof.mdx`) describes all of it — including the literal claim that "the proof page on the docs site shows the same data with more detail." That sentence is currently an over-claim. The web page must catch up to the prose and the CLI.

This is design-forward work. The honesty semantics of each section *are* the design — not a layout exercise with two blocks bolted on.

## Complexity Assessment

- **Kind:** feature
- **Size:** medium
- **Surface:** website
- **Files affected:**
  - `website/scripts/extract-docs-data.ts` — `extractProofEntries()` gains three conditional extraction branches
  - `website/lib/docs-data/types.ts` — `ProofEntry` gains three optional fields
  - `website/app/docs/proof/[slug]/page.tsx` — conditional sections, conditional TOC, `buildProofMarkdown()`
  - `website/components/docs/proof/` — 2–3 new components
  - `website/content/docs/guides/reading-a-proof.mdx` — coherence check (likely no change needed)
- **Blast radius:** Contained by graceful degradation. New fields are **optional** on `ProofEntry`; absent data → section, TOC entry, and markdown line all omit themselves. The ~192 pre-1.3.0 proof pages must be byte-identical output. The network-fallback raw page (`page.tsx:121–161`) is out of scope — it renders a minimal summary from a live fetch and does not use `ProofEntry`.
- **Estimated effort:** ~1 build session if single-phase; clean two-phase seam exists (see Multi-phase).
- **Multi-phase:** yes

## Approach

Extend the web proof page's **data contract end-to-end** — extract → type → render — to cover the three 1.3.0 schema branches (`process`, `compliance`, `verdict_veto`), as three **independently conditional** sections that leave old proof pages visually unchanged.

The strategy is dictated by three distinct truth claims, and the visual language must encode each:

1. **Provenance** (from `entry.process`) — who did the work and at what cost, per session: model, turns, tool calls, tokens, derived cost, churn, completeness. **Display-only; must never read as gating.** So it renders *subordinate* to the verdict — placed low (after Findings, matching CLI and prose order), muted and tabular, carrying **no pass/fail color semantics**, nowhere near the verdict badge. The structural template is `IntegritySeal` (bordered card, mono, key/value rows, non-gating, sits low), extended to a per-session table with a totals row. Cost is **derived at build time from `packages/cli/src/data/pricing.ts`** — the single price-table source the CLI already uses — not stored in the proof chain and not duplicated in the website.

2. **Session Attestation** (from `entry.compliance`) — per-agent behavioral verdicts from `anatrace-core`: `satisfied` / `violated` / `unverifiable`, plus a coverage ratio and per-agent grouping. **Mostly `unverifiable` by design, non-gating.** The honesty bar: `unverifiable` must render as **neutral abstention, not error/warning**; the coverage ratio (e.g. 1/49 checked) is shown prominently; the small `satisfied` count must not be inflated into false confidence. The structural template is `AssertionLedger`, with a deliberate **divergence**: AssertionLedger's `unsatisfied` state is red/gating/FAIL — reusing that palette for attestation's `unverifiable` would be an honesty bug. The three attestation states need their own palette where *neutral is the default*, alarm is reserved for `violated`.

3. **Verdict veto** (from `entry.verdict_veto`) — the single gating exception: a process violation (e.g. Verify reading the forbidden build report) that overrides the run. Rendered conditionally alongside/within attestation. When `applied: false` (every proof in the chain today) → one quiet line. When `applied: true` → the serious, visually distinct treatment, wired directly from the schema. No synthetic fixture, no "unexercised" labeling — it fires when it fires.

## Acceptance Criteria

- AC1: On a proof with full data (`proof-benchmark-harness`), the page renders a Provenance section and a Session Attestation section, below Findings and above/around the Integrity Seal, matching the information the CLI `ana proof` render shows (model, per-session turns/tools/tokens/cost, totals, churn, completeness; per-agent claims with coverage ratio and satisfied/violated/unverifiable counts).
- AC2: On any pre-1.3.0 proof with neither `process` nor `compliance` (e.g. any pre-2026-06-08 proof), the rendered page output is **identical to today** — no Provenance section, no Attestation section, no extra TOC entries, no extra markdown in the copy-page content.
- AC3: Provenance and Session Attestation are **independently conditional**. On a provenance-but-no-attestation proof (`cross-machine-provenance`), the Provenance section renders and the Session Attestation section does **not**.
- AC4: Provenance carries **no verdict/pass-fail color semantics** and is positioned subordinate to the verdict — it must not be visually adjacent to, or styled like, the PASS/FAIL badge.
- AC5: Session Attestation renders `unverifiable` as a **neutral** state (its own palette, distinct from AssertionLedger's red `unsatisfied`), shows the coverage ratio prominently, and carries an explicit non-gating label. `violated` is the only alarm-colored state.
- AC6: The verdict-veto state renders conditionally: `applied: false` → a quiet single line; `applied: true` → a distinct serious treatment. Both branches are wired from the schema; no fabricated data.
- AC7: Dollar cost is derived at build time from `packages/cli/src/data/pricing.ts` (single source), not duplicated in the website and not read from a stored field.
- AC8: The TOC (`tocItems`) and the copy-as-markdown output (`buildProofMarkdown`) include Provenance/Attestation entries **only when** that data is present.
- AC9: New pure helpers (cost derivation, attestation coverage summarization, any provenance shaping) have Vitest unit tests; total test count does not decrease.
- AC10: The page and `reading-a-proof.mdx` remain coherent — section names, order, and framing (display-only / abstains-when-unverifiable / veto-as-exception) match between the two.

## Edge Cases & Risks

- **The 5 verification cohorts** (verify against all before done): `proof-benchmark-harness` (richest — 4-session provenance + 3-transcript attestation); `attestation-emit-and-guard` / `public-surface-honesty` / `proof-context-intelligence` (full data); `cross-machine-provenance` (provenance-only, proves independence); any pre-2026-06-08 proof (the bare case, must be visually unchanged).
- **Honesty regression via palette reuse.** The most likely craft failure is reusing `AssertionLedger`'s status colors for attestation, turning honest `unverifiable` abstention into what reads as failure. Guard explicitly.
- **Provenance reading as gating.** If Provenance lands too high on the page or borrows verdict coloring, it implies cost affects PASS/FAIL. It must not.
- **Cost derivation coupling.** Deriving from `pricing.ts` is a build-time cross-package read — consistent with the extractor already reading CLI data at build time, but Plan must confirm the import path/shape and that `price_table_version` per session is handled (sessions carry the table version they were priced against).
- **Veto applied state is unexercised in real data.** All 4 current vetos are `applied: false`. The `applied: true` branch is wired from schema and will not be exercised by any current cohort — its correctness is asserted at the component/unit level, not against a real proof page.
- **Partial provenance.** Some of the 18 provenance proofs may have incomplete session sets (`completeness.gaps`) or missing derived fields on older captures — the Provenance component must degrade gracefully within a section that *is* rendering (missing cost/tokens on a session shouldn't crash the table).
- **TOC drift.** The current `tocItems` is a hardcoded 4-item array. If new sections are added without making TOC conditional, old proofs get TOC entries pointing at sections that don't exist.

## Rejected Approaches

- **Duplicate the price table in the website.** Rejected — adds code to manage a problem instead of removing it; the copy will drift from the CLI's `pricing.ts`. (Ryan confirmed: derive from `pricing.ts`.)
- **Tokens-only, omit dollar cost.** Considered as the zero-coupling option; rejected because it breaks coherence with the CLI and prose, and the coupling is build-time (already an established pattern), not runtime. (Ryan confirmed: derive cost.)
- **Synthetic fixture / "unexercised" labeling for the applied veto.** Rejected per Ryan — wire the branch, no fake data, no explanatory scaffolding; it triggers eventually.
- **One `hasProcessData` flag gating both sections.** Rejected — the 14 provenance-but-no-attestation proofs prove the two sections are independently conditional.

## Open Questions

- None blocking. Plan to confirm the exact import path/shape for `pricing.ts` cost derivation across the package boundary and whether cost is derived once at extraction (baked into `ProofEntry`) or at render — recommend **at extraction**, so `ProofEntry` stays the single serialized contract and the price-table version travels with the data.

## Exploration Findings

### Patterns Discovered
- `website/app/docs/proof/[slug]/page.tsx:166-171` — `tocItems` is a hardcoded array; must become conditional as sections are added.
- `website/app/docs/proof/[slug]/page.tsx:55-74` — `buildProofMarkdown()` assembles the copy-page content section-by-section; new sections append here, conditionally.
- `website/app/docs/proof/[slug]/page.tsx:121-161` — network-fallback raw page; out of scope, uses `ProofChainRawEntry`, not `ProofEntry`.
- `website/scripts/extract-docs-data.ts:129-217` — `extractProofEntries()` maps a fixed field set from each raw entry; three new conditional branches go here (`entry.process`, `entry.compliance`, `entry.verdict_veto`).
- CLI render is the information source of truth: `ana proof proof-benchmark-harness` shows the exact Provenance table (per-session turns/tools/in/out/cache/cost + TOTAL + churn + completeness) and Session Attestation (per-agent claims, coverage ratio, satisfied/violated/unverifiable, mandate/transcript hashes, non-gating note, veto line).

### Constraints Discovered
- [TYPE-VERIFIED] `ProofEntry` (`website/lib/docs-data/types.ts:31-57`) — new fields must be **optional** (`provenance?`, `attestation?`, `verdictVeto?`); optionality *is* the graceful-degradation contract.
- [OBSERVED] Data cohorts across 210 proofs: 18 have `process.sessions`; 4 have `compliance`; 4 have `verdict_veto` (same slugs as compliance); 14 have provenance-but-no-attestation; ~192 have neither.
- [OBSERVED] All 4 `verdict_veto` entries are `applied: false`. No applied veto exists in the chain.
- [OBSERVED] `violated` attestation verdicts DO exist in the chain (≥1 violated, 30 satisfied) — all three attestation states have real data except the applied-veto.
- [OBSERVED] Dollar cost is NOT stored; derived from tokens × `packages/cli/src/data/pricing.ts`. Sessions carry `derived.price_table_version` (e.g. `2026-06-14`).
- [INFERRED] Provenance session data shape: `entry.process.sessions[].{role, harness, model, cli_version, transcript_hash, derived:{tokens:{input,output,cache_create,cache_read}, duration_ms, turns, tool_calls, files_touched, model, price_table_version}}`; plus `entry.process.{module_churn, completeness, outcome, task_shape}`.
- [INFERRED] Attestation shape: `entry.compliance[]` = array of per-agent records `{role, anatrace_core_version, framework, mandate_hash, transcript_hash, coverage:{total, fully_checked, unverifiable}, complete, verdicts:[{claim_id, says, status, reason, source}]}`.

### Test Infrastructure
- Website uses Vitest (`website` surface). `PipelineGantt`'s `buildGanttBars` is an exported pure function with tests — same pattern for new pure helpers (cost derivation, coverage summarization).

## For AnaPlan

### Structural Analog
- **Provenance → `website/components/docs/proof/IntegritySeal.tsx`.** Closest structural match: a bordered, mono, non-gating card that renders a set of rows from structured data, sits low on the page, and makes no verdict claim. Provenance is "IntegritySeal as a per-session table with a totals row." Read it first.
- **Session Attestation → `website/components/docs/proof/AssertionLedger.tsx`.** Closest structural match: a list of id/says/status rows with a satisfied/unsatisfied summary. Adapt the *structure*, diverge the *color semantics* (see Known Gotchas).

### Functional Analog
- **Provenance → `website/components/docs/proof/PipelineGantt.tsx`** — same domain (per-session pipeline metrics: timing) different shape (bars vs table). Useful for tone/placement, and its `totalMinutes === 0` early-return is the graceful-degradation pattern to mirror.

### Relevant Code Paths
- `website/app/docs/proof/[slug]/page.tsx` — section wiring, TOC, markdown, render order.
- `website/scripts/extract-docs-data.ts` (`extractProofEntries`, ~line 129) — extraction branches.
- `website/lib/docs-data/types.ts` (`ProofEntry`, ~line 31) — optional field additions.
- `packages/cli/src/data/pricing.ts` — the single price-table source for cost derivation.
- `packages/cli/src/commands/proof.ts` + `packages/cli/src/utils/render.ts` + `forensics.ts` — the CLI's own Provenance/Attestation render, for information parity (what to show, how it's computed).
- `website/content/docs/guides/reading-a-proof.mdx` — the prose to stay coherent with (§ Provenance, § Session attestation).

### Patterns to Follow
- Mirror `PipelineGantt`'s early-return-on-empty for each new section (`components/docs/proof/PipelineGantt.tsx:99`).
- Extract pure, testable helpers for cost derivation and coverage summarization (like `buildGanttBars`).
- Keep `ProofEntry` the single serialized contract — derive cost at extraction so the price-table version travels with the data.

### Known Gotchas
- **Do not reuse `AssertionLedger`'s status palette for attestation.** Its `unsatisfied` = red/gating. Attestation's `unverifiable` is neutral abstention. Same structure, different color meaning — conflating them is an honesty bug (AC5).
- **Provenance must not borrow verdict coloring or sit near the verdict badge** (AC4).
- **Make `tocItems` conditional** — a hardcoded new entry breaks old proofs (AC2/AC8).
- **`buildProofMarkdown` must stay conditional** too, or old proofs' copy-page content gains empty headers.
- **The raw-fetch fallback page is out of scope** — don't wire new sections there; it uses `ProofChainRawEntry`, not `ProofEntry`.

### Things to Investigate
- Confirm the `pricing.ts` import path/shape and how to select the price table by each session's `price_table_version` (design judgment: fall back to latest if a version is missing?).
- Decide the render placement of the veto relative to attestation — nested inside the Attestation section vs a distinct sibling block (both defensible; the veto is conceptually part of "attestation turning load-bearing," which argues for nesting, but its gating weight argues for prominence).
- Confirm whether Provenance and Attestation are two separate build phases (recommended seam: Phase 1 Provenance / Phase 2 Attestation+Veto) or one — Plan owns the decomposition call.
