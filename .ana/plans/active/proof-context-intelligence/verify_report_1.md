# Verify Report: Proof-Context "why" — `shaped_by` + `ana proof <slug> --why` + adoption (Phase 1)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-18
**Spec:** .ana/plans/active/proof-context-intelligence/spec-1.md
**Branch:** feature/proof-context-intelligence

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../proof-context-intelligence/contract.yaml
  Seal: INTACT (hash sha256:10c99c610fde35bfec8bb5edb2c1c60f3436cad702f3a8e52ea33e8ce44e43e0)
```

Seal **INTACT** — contract unmodified since AnaPlan sealed it.

**Evidence run (independent, sealed):**
- Tests: **4003 passed, 0 failed, 2 skipped** (baseline 3893 → +110 new cases). `ana test --stage verify` marker:
  `<!-- ana:capture stage=verify slug=proof-context-intelligence counts=4003p/0f/2s verdict=pass sha256=c228272c62b7f187a268be561bed5bbf16791197e0ccf310bdef4172186428fc -->`
- Build: **clean** (`pnpm run build` — 2 tasks successful).
- Lint: **0 errors**, 3 pre-existing warnings — all in files this build did NOT touch (`website/components/hero/Hero.tsx`, `packages/cli/src/utils/git-operations.ts`). No new warnings.

**Scope note:** This is **Phase 1 of 3**. The sealed contract carries all 34 assertions; this phase implements AC1, AC6, AC9, AC11, AC12 (partial), AC14 (partial), and contributes to AC7/AC8. Phase-1 assertion set: **A001–A008, A022, A024, A025, A030, A031, A032, A034**. Assertions A009–A021, A023, A026–A029, A033 belong to Phases 2–3 (co-change + import graph) and are explicitly out of scope here — verified the build did NOT touch their files.

> **`@ana` tag collision caveat:** `proof.test.ts` (5800+ lines) and `agent-proof-context.test.ts` reuse assertion IDs A001–A035 across *many* prior sealed contracts. A bare grep for `@ana A001` is meaningless. I identified this phase's tests by diffing the test files against `main` and reading only the blocks this build added, which are explicitly labelled "Phase 1 of proof-context-intelligence" and use THIS contract's IDs.

## Contract Compliance

Phase-1 assertions (evidence is from the build's newly-added tests, confirmed by reading each test and by live CLI runs):

| ID   | Says                                                          | Status       | Evidence |
|------|--------------------------------------------------------------|--------------|----------|
| A001 | Proof context tells which verified work items shaped a file  | ✅ SATISFIED | `proofSummary.test.ts:1841,1873` — asserts `shaped_by` defined, rows carry values, ordered most-recent-first |
| A002 | Each shaping item carries slug, kind, date, intent           | ✅ SATISFIED | `proofSummary.test.ts:1841` — asserts `row.slug/kind/completed_at/scope_summary` exact values |
| A003 | Output shows a "Shaped by" section                           | ✅ SATISFIED | `proof.test.ts:628` — `stdout.toContain('Shaped by:')`, slug, kind, intent; live-confirmed on `work.ts` |
| A004 | >3 shapers → drill-down hint names `--why`                   | ✅ SATISFIED | `proof.test.ts:643` — `toContain('--why')` + `'2 more'`; footer absent at exactly 3 (`proof.test.ts` 3-shaper case) |
| A005 | `--why` shows the work item's intent                         | ✅ SATISFIED | `proof.test.ts:743` — `toContain('Scope')` + `WHY_SCOPE_INTENT`; live-confirmed |
| A006 | `--why` hides Provenance/cost noise                          | ✅ SATISFIED | `proof.test.ts:766` — `not.toContain('Provenance')`, no `$`, no 64-hex sha256; live-confirmed full card omitted |
| A007 | `--why` hides timing breakdowns                              | ✅ SATISFIED | `proof.test.ts:766` `not.toContain('Timing')`; guarded by `proof.test.ts:780` asserting full card DOES show Timing |
| A008 | Long intent truncated, not dumped, in Shaped by              | ✅ SATISFIED | `proof.test.ts:693` — 200-char summary + sentinel; `not.toContain('SENTINEL_PAST_CAP')` |
| A022 | No proof history → "Shaped by" absent, not faked             | ✅ SATISFIED | `proof.test.ts:706` unrelated file `not.toContain('Shaped by')`; `proofSummary.test.ts:2797` shaped_by undefined |
| A024 | Existing `touch_count` still present                         | ✅ SATISFIED | `proofSummary.test.ts:2823` — `touch_count === 1` alongside shaped_by |
| A025 | Existing `findings` list unchanged                           | ✅ SATISFIED | `proofSummary.test.ts:2823` — `findings.length === 1` alongside shaped_by |
| A030 | ana.md tells scoper to run `ana proof context`               | ✅ SATISFIED | `agent-proof-context.test.ts:138` — `toContain('ana proof context')` + `'not optional'`; template diff confirms |
| A031 | ana-verify.md drops "context, not a checklist" hedge         | ✅ SATISFIED | `agent-proof-context.test.ts:145` — `not.toContain('context, not a checklist')`; diff confirms phrase removed |
| A032 | ana-verify.md reaffirms independent findings                 | ✅ SATISFIED | `agent-proof-context.test.ts:151` — `toContain('independent')`; diff adds "form your findings **independently**" |
| A034 | Codex ana-verify mirror carries independence framing         | ✅ SATISFIED | `agent-proof-context.test.ts:157` — codex template `toContain('independent')`; diff confirms lockstep mirror |

**Out-of-scope (Phases 2–3), not assessed this phase:** A009–A021, A023, A026–A029, A033. The build correctly did not implement them; their files (graph build/read, init state, proof-history analyzer) are untouched.

## Independent Findings

**Predictions vs. reality.** Before reading source I predicted the builder would likely (1) leave the repo-root dogfood agent copies out of sync with templates, (2) miss truncating the `--why` scope text, (3) write `not_contains` tests that pass trivially, (4) over-grow `proofSummary.ts`, (5) let the `--why` hint ship before `--why` itself (the spec's cascade trap).

- **(1) Not found — and the inverse is the interesting bit.** Existing tests (`agent-proof-context.test.ts:67-76, 121-129`) enforce byte-for-byte parity between `templates/.{claude,codex}/agents/*` and the repo-root `.{claude,codex}/agents/*`. The build synced both, so the repo-root edits that initially looked like scope creep are in fact *mandated* by the existing dogfood-parity suite. Correct call by the builder. (See upstream finding — the contract's `file_changes` should have listed them.)
- **(2) Correctly scoped, not a miss.** `--why` shows scope_summary raw/untruncated by design (it's the detail view); truncation applies only to the Shaped-by footer in `formatContextResult`, capped at 140 via `truncateSummary`. Matches spec intent.
- **(3) Confirmed for A006 only (minor).** A007 is well-guarded by a positive-control test asserting the full card *does* render Timing. A006 (Provenance) lacks that paired guard — see Findings. Live verification closed the gap this round.
- **(4) Confirmed, low-impact.** `proofSummary.ts` +32, `proof.ts` +113. Additive and well-contained, but continues the growth trend recorded in prior proof-chain findings.
- **(5) Not found — the trap was avoided.** `--why` render (`proof.ts:582 formatWhy`) and the footer hint (`proof.ts:3274`) ship in the same diff. `formatWhy` is wired at both detail render points (`:1127`, `:1194`) and used 3× total — not dead code.

**Over-building / YAGNI:** None. One new exported symbol (`formatWhy`), used. No unused params, no speculative abstractions, no Phase 2/3 anticipation. `getProofContext` adds the shaped_by collection inside the existing per-entry loop (near-free, as the spec intended) and gates the field with `...(shapedBy.length > 0 ? {...} : {})` so the JSON shape for old callers is unchanged (AC8).

**Code quality:** `formatWhy` is built as an omission renderer (renders only allowed fields) rather than a stripper — so a future field added to the full card cannot leak into `--why`, exactly as the spec's gotcha demanded. Optional reads (`entry.slug ?? ''`, `scope_summary ?? ''`, `modules_touched ?? []`) guard legacy entries throughout, and a dedicated test exercises a legacy entry lacking scope_summary/kind without crashing.

## AC Walkthrough

- **AC1** — Shaped by section listing verified items (slug, kind, completed_at, truncated scope_summary), top-3 cap, `--why` footer when more exist: ✅ **PASS** — live run on `packages/cli/src/commands/work.ts` rendered 3 shapers in recency order with "26 more — drill a specific one with `ana proof <slug> --why`".
- **AC6** — `ana proof <slug> --why` signal only (scope, exceptional assertions w/ reasons, open findings, modules) and omits cost/tokens/hashes/timing/provenance/attestation: ✅ **PASS** — live run on `remove-plan-phase-checkbox --why` showed exactly those four sections incl. deviated assertion A010 + reason; full card (no flag) showed Timing/Provenance/`$13.33`/sha256 that `--why` dropped.
- **AC9** — scope_summary truncated via `truncateSummary`, raw never embellished: ✅ **PASS** — `proof.ts:3271` truncates at 140 raw chars; sentinel test confirms past-cap text is dropped.
- **AC11** — ana.md runs `ana proof context` as a non-optional step, sequenced after file ID, framed as orientation: ✅ **PASS** — template diff makes it "**not optional**" for scopes touching existing code, sequenced "Once you've identified the files…".
- **AC12 (partial)** — ana-verify.md drops the hedge and states shaped-by is orientation only, findings independent: ✅ **PASS** — hedge removed; "orientation only … never a verdict … form your findings **independently**" added.
- **AC14 (partial)** — `.codex` mirrors carry this phase's template edits: ✅ **PASS** — codex ana.md / ana-verify.md / ana-plan.md mirror the claude edits; dogfood-parity tests enforce it.
- **AC8 (contributes)** — `shaped_by` optional, old-caller JSON shape unaffected: ✅ **PASS** — field conditionally spread only when non-empty; A024/A025 confirm touch_count + findings intact.
- **AC7 (contributes)** — no chain → Shaped by absent, getProofContext returns cleanly: ✅ **PASS** — A022 + no-chain test confirm `shaped_by` undefined and no crash.

## Blockers

None. Searched specifically for: contract assertions not backed by a real test (every Phase-1 assertion has a value-asserting test, confirmed by reading the added blocks, not by tag-grep); `not_contains` sentinels that pass on broken code (A007 is positively guarded; A006 verified live; A008 uses a real overflow sentinel); regressions (4003 pass / 0 fail, baseline 3893 fully retained); Phase 2/3 bleed (none — only Phase-1 files changed); JSON-shape break for old callers (shaped_by gated optional); dead code (formatWhy wired at 2 sites). Nothing rises to blocker level.

## Findings

- **Upstream — Contract `file_changes` omits dogfood agent copies:** the contract lists only `packages/cli/templates/.{claude,codex}/agents/*`, but existing tests (`agent-proof-context.test.ts:67-76,121-129`) require the repo-root `.{claude,codex}/agents/*` to match byte-for-byte. The build correctly synced them, but the contract under-specified its true change surface. Future seals touching templates should list the dogfood copies too. Severity: observation.
- **Test — A006 lacks A007's positive-control guard:** `packages/cli/tests/commands/proof.test.ts:766` asserts `--why` does not contain "Provenance", but unlike A007 (Timing, guarded at `:780` by a full-card test) there's no paired assertion that the full card *does* render "Provenance". If that label were renamed, A006 would pass silently. Live-verified correct this round. Severity: debt.
- **Code — `--why` silently ignored in list mode:** `packages/cli/src/commands/proof.ts:3137` registers `--why` on the root command; with no slug and no `--last` it falls through to the list view and the flag is a no-op. Harmless but accepts input it ignores. Severity: observation.
- **Code — module growth trend persists:** `proofSummary.ts` +32 / `proof.ts` +113 continue past the comfort threshold flagged by prior findings (`decompose-proof-summary-C1`, `audit-matrix-orientation-C7`). Well-contained and additive here, noted for trajectory. Severity: observation.

## Deployer Handoff

This is Phase 1 of a 3-phase plan — **do not create a PR or merge yet.** After this PASS, the pipeline proceeds to `ana run build` for Phase 2 (import-graph write pipeline). The PR is created only after all three phases verify.

What ships in this phase: `shaped_by` on `ana proof context`, the signal-only `ana proof <slug> --why` drill-down, and adoption/framing edits to the Ana/Plan/Verify agent templates (+ codex mirrors + dogfood copies). It reads only the existing proof chain — no new artifacts, no migration, inert dependencies. Safe to dogfood immediately on this repo (the live runs in this report used the real proof chain).

## Verdict
**Shippable:** YES

All 15 Phase-1 assertions SATISFIED with value-asserting tests I read individually (not tag-grepped); all 8 in-scope acceptance criteria PASS, two confirmed by live CLI runs against the real proof chain; 4003 tests pass with the full 3893 baseline retained and zero regressions; build clean; lint clean for touched files. Findings are observations/debt for the next engineer, none blocking. I'd stake my name on this Phase-1 increment shipping.
