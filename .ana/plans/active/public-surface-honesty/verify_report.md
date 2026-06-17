# Verify Report: Public-surface honesty touch-ups

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-17
**Spec:** .ana/plans/active/public-surface-honesty/spec.md
**Branch:** feature/public-surface-honesty

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../public-surface-honesty/contract.yaml
  Seal: INTACT (hash sha256:b7e14c7148b07f019583ea3fc7660bb409bf152cd1802aa981fd017eec5fedd0)
```

Seal status: **INTACT** — the contract was not modified after sealing.

Independent verify test pass (sealed):
`<!-- ana:capture stage=verify slug=public-surface-honesty counts=3865p/0f/2s verdict=pass sha256=dea10effd3edcc7fc5e86d797b3ab8167092c2da8c19e7c91280a039f7bd7cc1 -->`

- **Repo-wide tests:** 3865 passed, 0 failed, 2 skipped (verdict: pass) — no regression.
- **Website suite (focused gate):** 88 passed / 11 files (84 → 88, +4 guard assertions).
- **Build / AC5 gate** (`pnpm --filter anatomia-website check` = lint + typecheck + build): **exit 0** — clean (2 pre-existing lint warnings, 0 errors).
- **Lint:** 0 errors, 2 warnings (pre-existing, not in changed files).

## Contract Compliance

| ID   | Says | Status | Evidence |
|------|------|--------|----------|
| A001 | Verify chip describes Verify as fault-finding, not verdict-computing | ✅ SATISFIED | Test `copy.test.ts:4-10` finds chip `name==='ana-verify'`, asserts `chip?.role` `toBe('isolated · fault-finds')` (equals). Source `copy.ts:390` confirms `role: "isolated · fault-finds"`. Matcher equals ↔ `toBe` aligned. |
| A002 | "Mechanical, not vibes." title left unchanged | ✅ SATISFIED | Test `copy.test.ts:13-17` asserts `copy.bento.diff.title` `toBe('Mechanical, not vibes.')` (equals). Source line unchanged in diff. |
| A003 | "No LLM grades its own code." line left unchanged | ✅ SATISFIED | Test `copy.test.ts:20-24` asserts `copy.bento.diff.body` `toContain('No LLM grades its own code.')` (contains). Source line unchanged in diff. |
| A004 | Manifesto "you read the chain" line left unchanged | ✅ SATISFIED | Test `copy.test.ts:27-33` asserts `copy.manifesto.pull` contains `'You don'` (matches contract value) AND `'have to trust the model. You read the chain.'` — stronger than the contract's `contains "You don"`. Unicode apostrophe correctly avoided. Source line unchanged in diff. |

All four assertions tagged `// @ana A00N`, all matchers align with the contract (equals→`toBe`, contains→`toContain`), all pass independently.

## Independent Findings

**The diff is genuinely surgical.** `git diff main...HEAD` touches exactly four source/content files (`project-context.md`, `copy.ts`, `copy.test.ts`, `contract.mdx`) plus expected Build plan-artifacts. In `copy.ts`, **only** the single chip `role` string changed — the three protected lines (`diff.title`, `diff.body`, `manifesto.pull`) are byte-for-byte intact. The #1 documented risk (over-editing Fix 2) did not materialize, and the guard test mechanizes it.

**Over-building check:** none. `copy.test.ts` gained exactly four `describe` blocks (no extras); `contract.mdx` gained exactly one section. No unused exports, no dead code, no gold-plating.

**Fix 3 accuracy (read against shipped code):** verified against truth sources, not trusted:
- `ac?: string | string[]` — `contract.ts:27` ✓ (docs: `ac: "AC1"` or `["AC1","AC2"]`)
- `CoverageWaiver { ac; kind: 'judgment'|'retired'; reason }`, reason required for both — `contract.ts:42-49` ✓
- `COVERAGE_GATE_MIN_VERSION = '1.1'`, legacy 1.0 silent no-op — `artifact-validators.ts:45, :453` ✓
- `ana plan coverage` is a read-only plan-time preview ✓ (the command's own output says "This is a preview. The seal gate runs at `ana artifact save`.")
- Docs deliberately say "on a scope whose criteria it can parse" rather than enumerating the `>=1 recovered AC` internal — exactly as the spec instructed, to avoid overstating the gate. Accurate and appropriately terse.

**Predictions resolved:** (1) *Confirmed* — Fix 1 corrects the false "3 OS × 2 Node" matrix but the replacement text adds "coverage gates," which CI does **not** honor (see AC1 below + Findings). (2) *Not found* — Fix 3 docs are accurate and non-overstating. (3) *Handled* — the unicode right-single-quote (`’`) edge case was avoided by substring assertion. Surprise sweep (byte-compare of protected lines, matcher-vs-contract alignment, out-of-scope edits) surfaced no new defects beyond the AC1 coverage-gate wording.

## AC Walkthrough

- **AC1** — CI matrix correction in `project-context.md`: ⚠️ **PARTIAL**. The stated disease — the false "3 OS × 2 Node versions" claim — is correctly fixed: now "Ubuntu" only (matches `test.yml:18,75 runs-on: ubuntu-latest`) across "Node 22 and 24" (matches `test.yml:23 matrix: [22, 24]`). Lint gate (`test.yml:59`) and typecheck gate (`:50-54`) are real and honored. **However**, the replacement text claims "coverage gates," and CI does **not** honor a coverage gate: `test.yml:63` runs `pnpm vitest run` with no `--coverage`, and `vitest.config.ts` defines `thresholds` but never sets `coverage.enabled: true`, so the thresholds are dormant in CI (the codecov upload step is `fail_ci_if_error: false` and no coverage file is even generated). The fix removes one not-honored claim and introduces a smaller one. The exact phrase was prescribed verbatim by scope + spec (founder-confirmed), so this is an upstream wording issue, not a Build error — see Findings. AC1 is judgment-only/waived per the coverage map; the core correction lands, hence PARTIAL not FAIL.
- **AC2** — chip role changed, no other copy line modified: ✅ **PASS**. Verified by A001–A004 (all SATISFIED) and full diff review — only the one chip string changed; `"Mechanical, not vibes."`, the manifesto line, and `"No LLM grades its own code."` are intact.
- **AC3** — `contract.mdx` gains one accurate verifier-intent-coverage section: ✅ **PASS**. Content verified against `contract.ts`, `artifact-validators.ts`, and the `ana plan coverage` preview (see Independent Findings). Additive only; no existing line changed.
- **AC4** — honesty bound stated explicitly: ✅ **PASS**. Docs: "Coverage is a structural guarantee: a link exists. It does not prove the linked test actually exercises the AC — that remains a judgment for Verify." Matches AC4 verbatim in intent.
- **AC5** — website builds clean, no out-of-scope edits: ✅ **PASS**. `pnpm --filter anatomia-website check` exit 0 (lint 0 errors + typecheck + build). `git diff --name-only` confirms only the four target files (plus Build's own plan artifacts) changed.
- **New: four guard assertions (A001–A004) tagged and pass**: ✅ **PASS**.
- **New: website suite passes, 88 tests / 11 files, no regression**: ✅ **PASS** (84 → 88).

## Blockers

None. Searched specifically for: protected-line tampering (diff is byte-clean on all three), over-editing of Fix 2 (only the one chip string changed), test matchers that don't match the contract (all four align), tests that pass on broken code (A004 asserts the real substring, not a tautology), out-of-scope file edits (only four files touched), and regressions (3865 repo-wide tests pass, 0 fail). The one imperfection (AC1 "coverage gates" wording) is in a dogfood-only context file, is prescribed verbatim by the upstream spec, and is waived as judgment-only — it does not prevent shipping, but it is flagged below for the merger.

## Findings

- **Upstream — Fix 1 introduces a new not-honored claim ("coverage gates"):** `.ana/context/project-context.md:134` — the corrected line reads "CI runs on Ubuntu across Node 22 and 24, with lint, typecheck, and coverage gates." CI honors lint and typecheck, but **not** coverage: `test.yml:63` runs `pnpm vitest run` without `--coverage`, and `vitest.config.ts` sets `thresholds` but never `coverage.enabled: true`, so thresholds never fire in CI. For a product whose pitch is "verified over trusted," correcting one overclaim while adding another in the same line is worth fixing. The phrase was prescribed verbatim by scope (line 172) and spec (line 41), so the fix belongs upstream (re-scope/re-plan the wording — e.g. "with lint and typecheck gates; coverage thresholds are configured in vitest.config.ts but only run locally"), not in Build. Build faithfully implemented the spec.
- **Upstream — Contract A004 value is a weak substring:** the contract pins `copy.manifesto.pull` `contains "You don"` — which would also match "You donate…". The guard test wisely over-delivers (it additionally asserts `'have to trust the model. You read the chain.'`), so the *test* is strong, but the contract's own pinned `value` is low-bar. Future contracts should pin a more distinctive substring.
- **Code — Pre-existing lint warnings (not this build):** `website` lint reports 2 warnings (`formatAge` unused; `latest` unused) in pre-existing components (`hero`/`nav`/`footer`/`proof-feed`), 0 errors. None of the four changed files contain these symbols — recorded so they aren't misattributed to this change.
- **Code — Two prior-cycle concerns still present on `copy.ts` (out of scope here):** proof context flags the manifesto outbound link → `/#pipeline` (no longer exists) and proofFeed copy referencing clickable rows that are no longer clickable. This build does not touch either; still present, correctly out of scope for a surgical honesty edit.
- **Code — Fix 3 gate-activation summary is deliberately terse:** `contract.mdx` summarizes the gate as active "on a scope whose criteria it can parse," folding in the underlying `>=1 recovered AC` condition rather than enumerating it. This is per explicit spec instruction not to overstate the gate. Accurate, not a defect — noted for completeness.

## Deployer Handoff

This is a clean, surgical 4-file change and is shippable. One thing to decide before/at merge: the Fix 1 line in `.ana/context/project-context.md` now claims CI has "coverage gates," which CI does not actually run (no `--coverage`; thresholds dormant). It's a dogfood-only context file (never shipped to customers, never on the website), so it does not block the website or any customer surface — but given this feature's entire purpose is public-surface *honesty*, you may want to tighten that phrase (drop "and coverage gates," or note thresholds run only locally). That edit is upstream wording, not a Build defect. Everything else — the chip nuance (Fix 2), the protected lines, and the new docs section (Fix 3) — is accurate and verified.

## Verdict

**Shippable:** YES

All four contract assertions SATISFIED; AC2/AC3/AC4/AC5 PASS; AC1 PARTIAL (core correction lands; residual "coverage gates" wording is upstream and in a dogfood-only file). Repo-wide suite green (3865/0/2), website gate clean (exit 0, 88 tests). Fix 3 docs verified accurate against shipped code, not trusted. I would stake my name on this shipping — with the one honesty-wording note in the handoff surfaced to the merger.
