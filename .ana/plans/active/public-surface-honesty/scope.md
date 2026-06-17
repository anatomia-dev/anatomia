# Scope: Public-surface honesty touch-ups

**Created by:** Ana
**Date:** 2026-06-16

## Intent

Three honesty touch-ups on Anatomia's public surface — two corrections and one
documentation gap. A product whose entire pitch is *"verified over trusted"*
cannot ship a surface that overclaims. Each fix removes a statement the code
doesn't honor; none touch legitimate marketing.

This is deliberately tiny: exactly 3 files, surgical edits, voice-matched. It is
NOT a fraud audit. The illustrative ProofCard ("Add Stripe Webhooks") and the
representative hero chain stats stay untouched — they are legitimate marketing.

1. **Factual error** — a flat-wrong CI matrix claim.
2. **One nuance** — a single chip that frames Verify's verdict as machine-computed
   when it is the verifier agent's independent assessment.
3. **Docs gap** — `contract.mdx` predates the verifier-intent-coverage feature and
   never documents it.

## Complexity Assessment

- **Kind:** chore
- **Size:** small
- **Surface:** cross-surface
- **Files affected:**
  - `.ana/context/project-context.md` (dogfood context — affects only us)
  - `website/lib/copy.ts` (product website copy)
  - `website/content/docs/concepts/contract.mdx` (product docs)
- **Blast radius:** Minimal. No test asserts any of the edited copy strings
  (grepped `website` — zero matches outside `lib/copy.ts`). `project-context.md`
  is dogfood context, not shipped product. `contract.mdx` is additive (one new
  section). The website must still build clean.
- **Estimated effort:** ~30–45 min build, fast verify.
- **Multi-phase:** no

## Approach

Three independent, surgical edits. Re-derive every line against live source before
editing — the line numbers below were verified during scoping but the builder must
re-confirm.

**Fix 1 — CI matrix (firm).** Correct the false "3 OS × 2 Node" claim to the real
matrix. `test.yml` runs Ubuntu only, Node 22 & 24, with lint + typecheck + coverage
gates (coverage thresholds are real and enforced by vitest inside the CI test run).

**Fix 2 — verdict nuance (one token).** The verify-role chip labels Verify's role
"mechanical," which implies the PASS/FAIL is a machine re-execution. It is the
agent's independent assessment. Change the one word; keep the "isolated"
independence claim. Do NOT sweep other "mechanical" language — the section title
and manifesto lines refer to genuine process rigor and auditability and stay.

**Fix 3 — coverage docs (additive).** Add one tight, voice-matched section to
`contract.mdx` documenting the verifier-intent-coverage feature, re-derived from
shipped code. Document `ac:` linking, `coverage_waivers`, the pre-seal coverage
gate, the `ana plan coverage` preview, and — plainly — the honesty bound: coverage
is structural (a link exists), not proof the test exercises the AC. That stays
Verify's judgment.

## Acceptance Criteria

- AC1: In `.ana/context/project-context.md`, the "3 OS × 2 Node versions" claim is
  replaced with the real CI matrix — Ubuntu, Node 22 and 24, with lint + typecheck
  + coverage gates. No remaining claim the workflow doesn't honor.
- AC2: In `website/lib/copy.ts`, the `ana-verify` chip role currently reading
  `"isolated · mechanical"` is changed to `"isolated · fault-finds"`. No other copy
  line is modified — specifically the `"Mechanical, not vibes."` title, the
  `"You don't have to trust the model…"` manifesto line, and `"No LLM grades its own
  code."` are left exactly as-is.
- AC3: `website/content/docs/concepts/contract.mdx` gains one new section
  documenting verifier-intent-coverage, accurate to shipped code: `ac:` on an
  assertion, `coverage_waivers` (kind `judgment`|`retired`, `reason` required), the
  pre-seal coverage gate (blocks sealing when a scope AC has neither a covering
  assertion nor a waiver; active only for contract version ≥ 1.1, legacy 1.0
  no-ops), and `ana plan coverage <slug>` as a read-only plan-time preview.
- AC4: The new docs section states the honesty bound explicitly — coverage proves a
  structural link exists, not that the test exercises the AC; that remains Verify's
  judgment.
- AC5: `website` builds clean (`pnpm --filter anatomia-website check`). No
  out-of-scope file or line is touched.

## Edge Cases & Risks

- **Over-editing Fix 2.** The single biggest risk. The disease is ONE nuance, not a
  sweep. `:396` ("Mechanical, not vibes.") and `:531` ("You don't have to trust the
  model…") were considered and deliberately kept — both are true (process rigor and
  auditability respectively, not verdict-is-machine claims). Touching them is a
  scope violation.
- **Voice drift in Fix 3.** `contract.mdx` has an established voice. The new section
  must match it — terse, declarative, no marketing. "Every character earns its
  place." Don't pad to look thorough.
- **Coverage-gate accuracy.** The gate's activation is subtler than "1.1+": it
  requires version ≥ 1.1 AND a non-ambiguous scope AND ≥1 high-confidence AC. Document
  the version bound clearly; don't overstate it as unconditional.
- **Reference docs auto-regenerate** — do not hand-edit them.
- **Line numbers may have drifted** since scoping (scan is 9 days old, active repo).
  Re-derive before editing.

## Rejected Approaches

- **Correcting the hero chain stats / wiring them to live data** — rejected. They
  are legitimate representative marketing; "correcting" them is out of scope by
  founder decision.
- **Touching `:396` / `:531`** — rejected. True claims about process and
  auditability, not the verdict-is-mechanical disease.
- **Documenting the attestation / anatrace veto** — rejected. Intentionally
  undocumented; the veto emits unverifiable signal and documenting it would
  overclaim — the exact failure mode this scope exists to remove.
- **A banned-phrase sweep across docs/README/dashboard** — rejected. This is a
  3-file surgical change, not an audit.

## Open Questions

None. All three fixes were re-derived against live source during scoping; word
choices and edit targets are founder-confirmed.

## Exploration Findings

### Patterns Discovered

- `website/lib/copy.ts:387-390` — agent chips are `{ n, name, role }` objects; role
  is a terse ` · `-separated label. Existing role copy for ana-verify elsewhere:
  `:122` (`anno: "fault-finds independently"`) and `:344` (`sub: "fault-finds
  independently"`). The chosen `"fault-finds"` matches established copy.
- `website/lib/copy.ts:215` — the proof-section lede already frames the verdict
  correctly: *"the verifier found independently … verified and honestly assessed."*
  No change needed; this is the correct framing the chip should align to.

### Constraints Discovered

- [TYPE-VERIFIED] `ContractAssertion.ac?: string | string[]` (`packages/cli/src/types/contract.ts:27`) — optional AC link; legacy contracts omit it.
- [TYPE-VERIFIED] `CoverageWaiver { ac: string; kind: 'judgment' | 'retired'; reason: string }` (`contract.ts:42-49`); `ContractSchema.coverage_waivers?: CoverageWaiver[]` (`contract.ts:73`). `reason` required for both kinds.
- [TYPE-VERIFIED] `COVERAGE_GATE_MIN_VERSION = '1.1'` (`packages/cli/src/commands/artifact-validators.ts:45`); legacy 1.0 is a silent no-op (`:655-663`); version compare is numeric major.minor, not lexical (`isVersionAtLeast`, `:478`).
- [OBSERVED] Gate activation requires version ≥ 1.1 AND a non-ambiguous scope AND ≥1 high-confidence AC (`artifact-validators.ts:453, :610-618`). Document the version bound; mention the conditions accurately, don't overstate.
- [OBSERVED] `.github/workflows/test.yml:18` `runs-on: ubuntu-latest`; `:23` `matrix.node-version: [22, 24]`; lint `:59`, typecheck:tests `:54`, vitest run `:63`; coverage upload Node-22-only `:65-71`. Coverage thresholds enforced in `packages/cli/vitest.config.ts:26` during the CI test run.

### Test Infrastructure

- No website test asserts the edited copy strings (grepped `website` for
  `isolated · mechanical`, `Mechanical, not vibes`, `trust the model`, `mechanical`
  in test dirs — zero matches outside `lib/copy.ts`). Editing copy needs no test
  update. The website `check` script (`pnpm --filter anatomia-website check` =
  lint + typecheck + build) is the relevant gate.

## For AnaPlan

### Structural Analog

For Fix 3 (the docs section), the structural analog is an existing concept section
within `website/content/docs/concepts/contract.mdx` itself — match its heading
depth, prose density, and any code-fence conventions already in the file. Read the
file end-to-end before writing; mirror its established shape rather than importing a
section style from another page.

### Relevant Code Paths

- `.ana/context/project-context.md:134` — the CI matrix line (Fix 1).
- `website/lib/copy.ts:390` — the ana-verify chip (Fix 2). Leave `:385, :396, :397,
  :215, :531` untouched.
- `website/content/docs/concepts/contract.mdx` — add one section (Fix 3). Confirmed
  zero existing mention of `coverage`/`waiver`/`ac`/`acceptance`.
- Truth sources for Fix 3: `packages/cli/src/types/contract.ts` (shapes),
  `packages/cli/src/commands/artifact-validators.ts` (gate behavior),
  `packages/cli/src/commands/plan.ts` (the `ana plan coverage` preview).
- Truth source for Fix 1: `.github/workflows/test.yml`, `packages/cli/vitest.config.ts`.

### Patterns to Follow

- Fix 2 word choice is fixed: `"isolated · fault-finds"` (founder-confirmed).
- Fix 1 phrasing target: "CI runs on Ubuntu across Node 22 and 24, with lint,
  typecheck, and coverage gates." Adjust only for accuracy if re-derivation differs.

### Known Gotchas

- Do NOT touch the Stripe ProofCard, hero stats, `:396`, `:531`, "No LLM grades its
  own code", other `.mdx` "mechanical" language, README, dashboard text, or any
  attestation/anatrace docs.
- Do NOT hand-edit auto-generated reference docs.
- The coverage gate is NOT unconditionally active at 1.1 — re-read the activation
  conditions before documenting them.

### Things to Investigate

- None requiring design judgment. The only build-time task is faithful
  re-derivation of the line numbers above (active repo; they may have drifted) and
  matching `contract.mdx`'s voice for the new section.
