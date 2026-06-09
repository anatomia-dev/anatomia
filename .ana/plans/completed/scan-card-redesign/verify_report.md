# Verify Report: Scan card redesign — shared render vocabulary + gated "How your team writes" section

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-09
**Spec:** .ana/plans/active/scan-card-redesign/spec.md
**Branch:** feature/scan-card-redesign

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../scan-card-redesign/contract.yaml
  Seal: INTACT (hash sha256:60ef1fe6e01b60109e05b4f3ee5444ddefc6a2dc4659d9a892493c83bf5100ab)
```

Seal status: **INTACT** — the contract has not been modified since AnaPlan sealed it.

Independent sealed test re-run (`ana test --stage verify`):
```
<!-- ana:capture stage=verify slug=scan-card-redesign counts=3687p/0f/2s verdict=pass sha256=c51e63cde7690429d2dd4b0af2247c9c5e3c755b46a05a8a2b90c998ee9a1778 -->
```

- **Tests:** 3687 passed, 0 failed, 2 skipped (verdict: pass).
- **Build:** `pnpm run build` — success (esbuild/tsup, 41ms; dist/index.js emitted).
- **Lint:** `pnpm run lint` — 0 errors. One pre-existing warning in `packages/cli/src/utils/git-operations.ts:198` (unused eslint-disable) — **not in this diff**, not a regression. Website has 2 pre-existing warnings, also untouched.

## Contract Compliance

| ID   | Says | Status | Evidence |
|------|------|--------|----------|
| A001 | Scan card uses the same rounded header as proof | ✅ SATISFIED | `scan-card-golden.test.ts:156` `expect(card).toContain('╭')`; live render shows `╭…╮`. scan.ts:153 `corners: 'rounded'`. |
| A002 | Old hand-rolled square box is gone | ✅ SATISFIED | `scan-card-golden.test.ts:157` `not.toContain('┌')`; local `BOX` const removed from scan.ts (grep confirms absent). |
| A003 | Each section introduced by an inset rule | ✅ SATISFIED | `scan-card-golden.test.ts:158` `toContain('── Stack')`; live render shows `── Stack ──…`. scan.ts:164 `sectionRule('Stack')`. |
| A004 | Name line is exactly 71 columns | ✅ SATISFIED | `scan-card-golden.test.ts:233` asserts every `│` line `.length === 71`; long-name test (`:238`) confirms truncation holds 71. Measured snapshot lines = 71. |
| A005 | Summary line is exactly 71 columns | ✅ SATISFIED | Same loop `scan-card-golden.test.ts:233` covers the summary line; subprocess test `scan.test.ts:1200` asserts summaryLine.length === 71. |
| A006 | "How your team writes" section appears on deep scan | ✅ SATISFIED | `scan-card-golden.test.ts:159` + `scan.test.ts:1372` `toContain('── How your team writes')`; live render shows it. |
| A007 | Card reports naming style (camelCase) | ✅ SATISFIED | `scan-card-golden.test.ts:160` `toContain('camelCase functions')`; scan.ts:281 addNaming(functions). |
| A008 | Card reports indentation style (spaces) | ✅ SATISFIED | `scan-card-golden.test.ts:162` `toContain('spaces, 2-wide')`; scan.ts:289–293. |
| A009 | Card reports error handling (exceptions) | ✅ SATISFIED | `scan-card-golden.test.ts:163` `toContain('exceptions')`; `getPatternDisplayName('exceptions')` falls through map → returns lowercase 'exceptions'. Live render confirms. |
| A010 | Card reports validation library (Zod) | ✅ SATISFIED | `scan-card-golden.test.ts:164` `toContain('Zod')`; scan.ts:305 `getPatternDisplayName(valLib)` maps `zod → Zod` (displayNames.ts:39). Live render shows `Validation Zod`. |
| A011 | Low-confidence/mixed signals hidden — card never bluffs | ✅ SATISFIED | `scan-card-golden.test.ts:208` + `scan.test.ts:1385` `not.toContain('mixed')`. Stronger real-gate proof: `not.toContain('PascalCase classes')` (golden:167, scan.test.ts:1386) — class naming 0.55 omitted. See Findings re: the literal matcher being a weak proxy. |
| A012 | On a fast scan the section vanishes cleanly | ✅ SATISFIED | `scan-card-golden.test.ts:174` surface-tier `not.toContain('How your team writes')`; snapshot shows no empty header. scan.ts:308 gate (`conventionRows.length > 0`). |
| A013 | Card legible with color stripped, no ANSI layout | ✅ SATISFIED | `scan-card-golden.test.ts:213–218` asserts `/\x1b\[/` false across 4 fixtures. Live `FORCE_COLOR=0` render is clean. |
| A014 | `--json` output unchanged | ✅ SATISFIED | `scan.test.ts:408` `toContain('"conventions"')` on `--quick --json`; render.ts and engine untouched (presentation-only). |
| A015 | First-time users still get `ana init` next step | ✅ SATISFIED | `scan-card-golden.test.ts:193` funnel fixture `toContain('ana init')`; scan.ts:404–410 funnel CTA unchanged. |
| A016 | Existing projects get `.ana/scan.json` pointer | ✅ SATISFIED | `scan-card-golden.test.ts:165` `toContain('.ana/scan.json')`; live render shows `Full data: .ana/scan.json`. scan.ts:399–401. |
| A017 | Monorepo overflow shows tidy `+N more` | ✅ SATISFIED | `scan-card-golden.test.ts:181` `toContain('(+2 more)')`; scan.ts:230–235. |
| A018 | Subfolder scan guides to project root | ✅ SATISFIED | `scan-card-golden.test.ts:192` `toContain('project root')`; scan.ts:254–257 ancestor-walk fallback preserved. |
| A019 | Full card layout pinned by golden | ✅ SATISFIED | `scan-card-golden.test.ts:155/173/180/195/201` `toMatchSnapshot()` across 5 fixtures; `.snap` reviewed for alignment + gate split. |

All 19 assertions **SATISFIED**.

## Independent Findings

**Predictions (made before reading source) and how they resolved:**

1. *Predicted: the multi-byte `·`/`→` glyphs would break width accounting and shear the box.* **Not found** — `headerBox` width logic is correct; measured every box line = 71 chars across golden + live render. The visual "short box" in raw terminal echo is a font artifact (box-drawing `─` rendering marginally wider than a space at equal char count), not a layout bug. A004/A005 prove it mechanically.
2. *Predicted: `errPattern.confidence` would crash on the MultiPattern union (the spec's own gotcha).* **Not found** — both `PatternConfidence` and `MultiPattern` carry a top-level `confidence` field (patterns.ts:51, 97); only `.library` differs, and that is correctly routed through `getPatternLibrary`. Builder handled the gotcha correctly.
3. *Predicted: the gate's "mixed" omission would be untested or tautological.* **Partially confirmed** — the literal `not_contains('mixed')` matcher is weak (see Findings), but the builder ALSO added a real mixed-sub-category omission test (scan.test.ts:1380, golden:167) that genuinely exercises the gate. Net: well-covered.
4. *Predicted: validation would render raw lowercase `zod` and miss A010.* **Surprised** — the builder spotted this and added validation entries to `displayNames.ts` (a file NOT in the contract's file_changes) to map `zod → Zod`. Necessary and correct, but an undocumented scope expansion (see Findings).
5. *Predicted: a stale `@ana` tag or assertion-tag mismatch.* **Confirmed** — scan.test.ts carries pre-existing `@ana A001–A011` tags from a prior scan cycle that now collide with this contract's IDs (see Findings).

**Production-risk predictions:** *"What breaks in production the spec didn't address?"* — The card's correctness depends entirely on the engine's confidence scores being honest. The gate is a pure pass-through of `confidence >= 0.7`; if the engine ever inflates a `mixed` signal's confidence above 0.7 while leaving `mixed === true`, naming is still protected (it requires `mixed === false`), but indentation/error/validation have no `mixed` guard — they trust confidence alone. Not a defect in this change (those detectors don't expose `mixed`), but a latent coupling worth knowing.

**Over-building / YAGNI:** `displayNames.ts` adds 8 validation libraries; only `zod` is reachable on any current scan. Low-risk (the map already pre-lists many unused languages/frameworks — consistent convention), noted in Findings.

**Code quality:** `formatHumanReadable` stays pure (string in/out), early-return gating per row keeps the main path flat (coding-standards compliant), `.js` import extensions present, `import type` separated. The Findings/footer block (scan.ts:367–421) is behaviorally unchanged as the spec promised — `scan-finding-details.test.ts` is untouched and green.

## AC Walkthrough

- **AC1** ✅ PASS — render primitives adopted; local `BOX` constant removed (grep: absent). scan.ts:160/164/222/310 use `headerBox`/`sectionRule`/`keyValueRows`.
- **AC2** ✅ PASS — visually consistent with proof: rounded box, `── Label ──` rules, 71 cols. Right-subtitle renders flush (`cli│`) — verified the proof card does the same (`…14:32│`), so the shared primitive is consistent. Spec mockup's trailing space was idealized.
- **AC3** ✅ PASS — section surfaces naming, indentation, error, validation (live render + golden + direct-render tests).
- **AC4** ✅ PASS — single 0.7 gate; naming additionally requires `mixed === false`; section omitted when no row clears (surface-tier snapshot has no empty header).
- **AC5** ✅ PASS — no ANSI when color stripped (A013 test across 4 fixtures; live `FORCE_COLOR=0` clean).
- **AC6** ✅ PASS — `--json` still emits `"conventions"`; engine/schema/render.ts untouched.
- **AC7** ✅ PASS — funnel CTA (`ana init`) and non-funnel (`.ana/scan.json`) both preserved.
- **AC8** ✅ PASS — surface-tier, monorepo overflow (`+N more`), no-stack ancestor walk, and long-name truncation all pinned by golden fixtures and hold at 71 cols.
- **AC9** ✅ PASS — full suite 3687 passed / 0 failed. Net-new tests added (new golden file ~7 tests + "How your team writes (direct render)" describe block) and 3 assertions updated in place; count strictly increased. `scan-finding-details.test.ts` unchanged and green.
- **AC10** ✅ PASS — 5 golden snapshots incl. the gate fixture pinning the mixed/low-confidence omission.
- **AC11** ✅ PASS — 0.7 gate calibrated against the real repo: live scan shows {camelCase, SCREAMING_SNAKE_CASE, spaces-2, exceptions, Zod} and omits {file naming mixed, class naming 0.55, import style mixed 0.69} — exactly the spec's shown-vs-omitted split.
- **AC12** ✅ PASS — `render.ts` and `render.test.ts` not in diff; no render primitive inlined into scan.ts.
- **AC13** ✅ PASS — `pnpm run build` succeeds; `pnpm run lint` 0 errors (only pre-existing, out-of-diff warnings).

## Blockers

None. Searched specifically for: contract assertions with no genuine covering test (all 19 have a correctly-tagged passing test — verified by reading each tagged test, not by trusting the tag); union-access crash on `patterns.errorHandling`/`validation` (safe — `confidence` exists on both union members); box-width shear from multi-byte glyphs (measured 71 across snapshot + live render); a broken confidence gate leaking low-confidence guesses (live repo render confirms the exact shown-vs-omitted split); unchanged-behavior regression in the Findings/footer path (`scan-finding-details.test.ts` untouched, green). Nothing qualifies as a blocker.

## Findings

- **Test — Stale `@ana` tags collide with this contract's IDs:** `packages/cli/tests/commands/scan.test.ts:1027` (and `:1000, :1098, :1114, :1128, :1157, :1180, :1203, :1284`) carry `@ana A001`–`A011` tags from a *prior* scan cycle that test surfaces/overflow/box-alignment/contributors — unrelated to this contract's same-numbered assertions (e.g. `A006` is tagged on a contributor-display test but means "How your team writes" here). The builder added correct new tags (golden file + the direct-render describe block at `:1342`) and a correct `A014` tag, but did not reconcile the pre-existing collisions. Every assertion still has at least one genuinely-correct covering test, so coverage is real — but the duplicate tags pollute `ana proof` coverage mapping. Next cycle should renumber or strip the stale tags. (Pre-existing, not introduced by this build.)
- **Upstream — Contract A011's `not_contains "mixed"` is a weak literal matcher:** the only fields whose value could be the string `"mixed"` (`conventions.imports.style`, `codePatterns.nullStyle.preference`) are never rendered by the "How your team writes" section regardless of whether the gate works — so A011 would pass even against a broken gate. The real guarantee comes from the builder's own `not.toContain('PascalCase classes')` / mixed-sub-category-omission tests (golden:167, scan.test.ts:1380). The gate is well-tested; the *contract assertion* is just a soft proxy. Worth tightening when this contract is next authored.
- **Upstream — Contract file_changes omitted `displayNames.ts`:** `packages/cli/src/utils/displayNames.ts:38` was modified to map `zod → Zod`, which A010 strictly requires (`getPatternLibrary` returns lowercase `zod`; without the map entry the card shows `zod` and A010's `contains "Zod"` fails). The change is correct and necessary, but the contract's `file_changes` block listed only scan.ts + two test files. The planner under-declared the blast radius; the builder's expansion was justified.
- **Code — Speculative validation display names (YAGNI):** `packages/cli/src/utils/displayNames.ts:39` adds 8 entries (`zod, joi, yup, valibot, superstruct, ajv, pydantic, marshmallow`); only `zod` is reachable by any current scan path. Low risk — the map already pre-lists many unused languages/frameworks as forward coverage, so this is consistent convention, not new debt. Recorded, no action needed.

## Deployer Handoff

- This is a **presentation-only** change to `ana scan`'s human card. `--json`, the engine, the schema, and `render.ts` are untouched — zero machine-consumer impact.
- Verified live on the anatomia repo: the new "How your team writes" section correctly surfaces real conventions and omits the low-confidence/mixed guesses. The credibility gate works as designed.
- **Cosmetic note:** in some terminal fonts the rounded header box may *appear* slightly narrower than the section rules because box-drawing `─` can render marginally wider than a space at equal character count. This is a font artifact — every box line is mechanically exactly 71 columns (proven by A004/A005 and direct measurement). No action needed.
- One pre-existing lint warning (`git-operations.ts:198`, unused eslint-disable) is unrelated to this PR and left as-is.
- Follow-up for a future cycle (non-blocking): strip the stale `@ana A001–A011` tags in `scan.test.ts` so proof-chain coverage maps cleanly.

## Verdict

**Shippable:** YES

All 19 contract assertions are satisfied by tests I read individually (not rubber-stamped from tags), all 13 acceptance criteria pass, the full suite is green (3687/0/2), build and lint are clean, and the feature does what it promises on the real repository — the confidence gate shows the honest signals and hides the bluffs. The findings are hygiene and upstream-clarity items for the next engineer, not defects in the shipped behavior. I would stake my name on this shipping.
