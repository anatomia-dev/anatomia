# Spec: Public-surface honesty touch-ups

**Created by:** AnaPlan
**Date:** 2026-06-16
**Scope:** .ana/plans/active/public-surface-honesty/scope.md

## Approach

Three independent, surgical edits removing statements the code doesn't honor,
plus one mechanical guard test. Each fix was re-derived against live source during
planning — line numbers below are confirmed current, but re-confirm by content
(not line number) before editing; this is an active repo.

- **Fix 1 (CI matrix):** correct a flat-wrong claim in our dogfood context file.
- **Fix 2 (verdict nuance):** change one word in website copy, then **lock it and
  the three protected lines with a guard test** in the existing `copy.test.ts`.
  This is the highest-risk edit (the disease is over-editing), so it is the one
  fix we mechanize rather than trust.
- **Fix 3 (coverage docs):** add one voice-matched section to `contract.mdx`,
  re-derived from shipped code.

This is NOT a fraud audit. The illustrative Stripe ProofCard, the hero chain
stats, and all "mechanical"/process-rigor language other than the single chip word
are legitimate and stay untouched. Touching them is a scope violation.

**Why a guard test (the one real design decision):** copy/docs/context have no
runtime behavior to assert, so most ACs are human judgment and carry stated
`coverage_waivers`. But `website/lib/__tests__/copy.test.ts` already exists with
exactly the tagged structural-assertion pattern we need, so Fix 2 — the
over-edit-prone fix — becomes mechanical proof instead of trusted intention. The
guard asserts both the change (chip role) and the invariants (three protected
lines intact). That is "verified over trusted" applied to the exact line the scope
flags as the #1 risk.

## Output Mockups

**Fix 1 — `.ana/context/project-context.md` (the corrected bullet):**

```
- **Test count must not decrease.** CI runs on Ubuntu across Node 22 and 24,
  with lint, typecheck, and coverage gates. Coverage thresholds enforced in
  vitest.config.ts.
```

**Fix 2 — the chip, before / after (`copy.bento.agents.chips`):**

```
before:  { n: "VERIFY", name: "ana-verify", role: "isolated · mechanical" }
after:   { n: "VERIFY", name: "ana-verify", role: "isolated · fault-finds" }
```

**Fix 3 — the new `contract.mdx` section (shape and content target; match the
file's terse declarative voice, do not pad):**

```
## Acceptance-criteria coverage

A contract must account for every acceptance criterion in the scope. An
assertion claims an AC with an `ac:` field (`ac: "AC1"` or `ac: ["AC1","AC2"]`).
An AC that no assertion can mechanically pin is excused with a `coverage_waivers`
entry — `{ ac, kind, reason }`, where `kind` is `judgment` (untestable by nature)
or `retired` (deliberately dropped), and `reason` is required for both.

  coverage_waivers:
    - ac: AC4
      kind: judgment
      reason: "Error-message helpfulness is a human judgment, not mechanically testable."

At `ana artifact save`, the pre-seal coverage gate blocks the seal when a scope
AC has neither a covering assertion nor a waiver. It activates only for contract
version 1.1 or higher, on a scope whose acceptance criteria it can parse, with at
least one recovered AC; legacy 1.0 contracts and unparseable scopes no-op (warn
only, never block). `ana plan coverage <slug>` is the read-only, plan-time
preview of the same join — run it while writing the contract.

Coverage is a structural guarantee: a link exists. It does not prove the linked
test actually exercises the AC — that remains Verify's judgment.
```

> The heading text, exact prose, and code-fence style are the builder's to match
> against `contract.mdx`'s established voice. The mockup fixes the *content that
> must be present and accurate*, not the wording.

## File Changes

### `.ana/context/project-context.md` (modify)
**What changes:** Replace the "CI runs across 3 OS × 2 Node versions" claim
(currently the `Test count must not decrease` bullet) with the real matrix:
Ubuntu only, Node 22 and 24, with lint + typecheck + coverage gates. Keep the
"test count must not decrease" framing and the vitest.config.ts coverage-threshold
mention — only the false matrix claim is wrong.
**Pattern to follow:** match the surrounding bullet voice in this file's CI section.
**Why:** the claim is flat wrong — `test.yml` runs `ubuntu-latest` only. A product
whose pitch is "verified over trusted" cannot ship a context file that overclaims.

### `website/lib/copy.ts` (modify)
**What changes:** In `copy.bento.agents.chips`, the `ana-verify` chip `role`
changes from `"isolated · mechanical"` to `"isolated · fault-finds"`. Exactly one
string. Nothing else in this file changes.
**Pattern to follow:** "fault-finds" is the established ana-verify verb elsewhere in
this file (`anno`/`sub` fields). The word choice is founder-confirmed — do not
substitute a synonym.
**Why:** "mechanical" frames the PASS/FAIL as a machine re-execution; it is the
verifier agent's independent assessment. The section lede already frames it
correctly ("the verifier found independently … honestly assessed") — the chip
should align to that.
**DO NOT TOUCH (scope violations):** `copy.bento.diff.title`
(`"Mechanical, not vibes."`), `copy.bento.diff.body`
(`"… No LLM grades its own code."`), `copy.manifesto.pull`
(`"You don't have to trust the model. You read the chain."`). These are true claims
about process rigor and auditability, deliberately kept.

### `website/content/docs/concepts/contract.mdx` (modify)
**What changes:** Add ONE new section documenting verifier-intent-coverage (see
Output Mockup for required content). Additive only — no existing line changes.
**Pattern to follow:** the structural analog is this file itself. Read it
end-to-end; match its heading depth (`##`), terse declarative prose, table/code-
fence conventions, and the existing `<Callout>`/`<NextCards>` shapes. Place the new
section where it reads naturally relative to "How assertions become tests" and
"Writing good assertions" — coverage is the same family of ideas.
**Why:** the file predates the verifier-intent-coverage feature and never documents
it. Shipped behavior the docs don't mention is the inverse failure of overclaiming —
still a public-surface honesty gap.
**Accuracy is non-negotiable (re-derive from these truth sources):**
- `ac?: string | string[]` — `packages/cli/src/types/contract.ts`
- `CoverageWaiver { ac; kind: 'judgment'|'retired'; reason }`, `reason` required for
  both kinds — same file.
- Gate activation: version ≥ 1.1 **AND** a parseable/non-ambiguous scope **AND**
  ≥1 recovered AC; blocks iff ≥1 AC is uncovered; legacy 1.0 and unparseable scopes
  no-op (warn only) — `packages/cli/src/commands/artifact-validators.ts`
  (`evaluateCoverageGate`, `COVERAGE_GATE_MIN_VERSION = '1.1'`).
- `ana plan coverage <slug>` is a read-only plan-time preview — `plan.ts`.
- Do NOT overstate the gate as "unconditionally active at 1.1." State the version
  bound plainly; the other conditions (parseable scope, ≥1 AC) can be summarized as
  "on a scope whose criteria it can parse" without enumerating internals.

### `website/lib/__tests__/copy.test.ts` (modify)
**What changes:** Add tagged guard `describe` blocks for the Fix 2 contract
assertions (A001–A004). Follow the EXACT pattern already in this file: `import
{ copy }`, a `// @ana A0NN` tag above each `describe`, `describe` text matching the
contract `block` field, plain `expect` assertions.
**Pattern to follow:** the existing A031–A035 blocks in this same file.
**Why:** mechanizes the #1 documented risk (over-editing Fix 2). The build fails if
the chip word is wrong OR if any protected line is altered — proof, not intention.
**Assertions to write (resolve targets against the `copy` object):**
- A001 — `copy.bento.agents.chips`, the entry with `name === 'ana-verify'`, its
  `role` equals `"isolated · fault-finds"`.
- A002 — `copy.bento.diff.title` equals `"Mechanical, not vibes."` (protected).
- A003 — `copy.bento.diff.body` contains `"No LLM grades its own code."` (protected).
- A004 — `copy.manifesto.pull` contains `"You don't have to trust the model."`
  (protected). Note the apostrophe is a unicode right-single-quote (`’`) in the
  source string — match it (assert on a substring that avoids the quote, or use the
  `’` form), don't introduce an ASCII `'`.

## Acceptance Criteria

Copied from scope, expanded with build-specific criteria:

- [ ] AC1: In `.ana/context/project-context.md`, the "3 OS × 2 Node versions" claim
  is replaced with the real CI matrix — Ubuntu, Node 22 and 24, with lint +
  typecheck + coverage gates. No remaining claim the workflow doesn't honor.
- [ ] AC2: In `website/lib/copy.ts`, the `ana-verify` chip role currently reading
  `"isolated · mechanical"` is changed to `"isolated · fault-finds"`. No other copy
  line is modified — specifically `"Mechanical, not vibes."`, the `"You don't have
  to trust the model…"` manifesto line, and `"No LLM grades its own code."` are left
  exactly as-is.
- [ ] AC3: `contract.mdx` gains one new section documenting verifier-intent-
  coverage, accurate to shipped code: `ac:` on an assertion, `coverage_waivers`
  (kind `judgment`|`retired`, `reason` required), the pre-seal coverage gate (blocks
  when a scope AC has neither a covering assertion nor a waiver; active only for
  contract version ≥ 1.1, legacy 1.0 no-ops), and `ana plan coverage <slug>` as a
  read-only plan-time preview.
- [ ] AC4: The new docs section states the honesty bound explicitly — coverage
  proves a structural link exists, not that the test exercises the AC; that remains
  Verify's judgment.
- [ ] AC5: `website` builds clean (`pnpm --filter anatomia-website check`). No
  out-of-scope file or line is touched.
- [ ] New: the four guard assertions (A001–A004) are tagged `// @ana A0NN` and pass.
- [ ] New: website test suite passes (88 tests / 11 files expected) with no
  regression.

## Testing Strategy

- **Guard tests (the only new tests):** four tagged `describe` blocks in the
  existing `copy.test.ts` — one for the chip change, three for the protected lines.
  Structural assertions on the imported `copy` object, mirroring A031–A035.
- **No other test changes:** Fix 1 (context file) and Fix 3 (docs prose) are not
  mechanically asserted — their accuracy is human/Verify judgment and is recorded as
  `coverage_waivers` in the contract. Do not invent file-grep tests for them.
- **Edge case to honor:** the unicode apostrophe in the manifesto pull quote — the
  guard assertion must not fail on a quote-character mismatch.
- **Build gate:** `pnpm --filter anatomia-website check` (lint + typecheck + build)
  is the real gate for AC5.

## Dependencies

None. All truth sources already exist in the repo.

## Constraints

- **Surgical only.** Exactly four files change. No edit outside the targets named
  above. The protected lines are scope violations if touched.
- **Voice match.** Fix 3 must match `contract.mdx`'s established terse voice. No
  marketing, no padding. "Every character earns its place."
- **Accuracy over completeness.** Better to document the gate's version bound plainly
  than to overstate its activation conditions — overstating is the exact disease this
  scope removes.
- **No hand-editing auto-generated reference docs.**
- **JSX/MDX apostrophes:** in any prose with contractions inside JSX, follow the
  project rule (`&apos;`); inside fenced code blocks, plain text is fine.

## Gotchas

- **Over-editing Fix 2 is the #1 risk.** The disease is ONE nuance, not a sweep.
  `copy.bento.diff.title` ("Mechanical, not vibes."), `copy.bento.diff.body` ("No LLM
  grades its own code."), and `copy.manifesto.pull` ("You don't have to trust the
  model…") were considered and deliberately kept. The guard test exists to catch
  exactly this — but don't rely on it as license to be careless.
- **Do NOT sweep "mechanical."** Only the chip `role` word changes. The section
  title and manifesto language refer to genuine process rigor and stay.
- **Do NOT touch** the Stripe ProofCard, hero chain stats, README, dashboard text,
  or any attestation/anatrace docs. The veto is intentionally undocumented —
  documenting it would overclaim.
- **Unicode apostrophe** (`’`) in the manifesto pull quote — match it in the
  guard assertion (prefer asserting a substring that avoids the apostrophe).
- **Line numbers may have drifted** — match by content, not line number.
- **`contract.mdx` has zero existing mention** of coverage/waiver/ac/acceptance —
  the section is purely additive; confirm before inserting.

## Build Brief

### Rules That Apply
- **Match by content, not line number** — active repo, numbers drift.
- **`copy.test.ts` pattern is fixed:** `import { copy } from '@/lib/copy'`, one
  `// @ana A0NN` tag per `describe`, `describe` text == contract `block` field,
  plain `expect`. Mirror A031–A035 exactly.
- **Unicode-safe string matching** for the manifesto pull quote (`’`).
- **MDX voice:** terse, declarative, no marketing. Match `contract.mdx`.
- **JSX apostrophes** → `&apos;` (not raw `'`) per `react/no-unescaped-entities`.
- **Fix 2 word is founder-confirmed:** `"isolated · fault-finds"` — exact, no synonym.

### Pattern Extracts

Existing guard-test pattern to mirror — `website/lib/__tests__/copy.test.ts:1-21`:

```ts
import { describe, it, expect } from 'vitest';
import { copy } from '@/lib/copy';

// @ana A031
describe('copy has 20 top-level sections', () => {
  it('has all 20 expected sections', () => {
    const actualKeys = Object.keys(copy);
    expect(actualKeys).toHaveLength(20);
    // ...toHaveProperty checks
  });
});
```

The chip to assert — `website/lib/copy.ts:382-392` (`copy.bento.agents.chips`):

```ts
agents: {
  num: "04", label: "Agents",
  title: "Walled off by design.",
  chips: [
    { n: "THINK", name: "ana", role: "reads · asks · scopes" },
    { n: "PLAN", name: "ana-plan", role: "specs · contracts" },
    { n: "BUILD", name: "ana-build", role: "implements · tests" },
    { n: "VERIFY", name: "ana-verify", role: "isolated · mechanical" },  // → "isolated · fault-finds"
  ],
},
```

The protected lines — `website/lib/copy.ts:394-397` and `:524-531`:

```ts
diff: {
  num: "05", label: "Verify",
  title: "Mechanical, not vibes.",                                 // PROTECTED
  body: "Verify asserts the spec against source. No LLM grades its own code.",  // PROTECTED
  // ...
},
// ...
manifesto: {
  // ...
  pull:
    "You don’t have to trust the model. You read the chain.",  // PROTECTED (note ’)
}
```

The existing `contract.mdx` voice to match — `:67-73`:

```md
## How assertions become tests

Plan writes assertion A001. Build writes a test tagged `// @ana A001` whose
describe/it text matches the assertion's `block` field. Verify checks that each
assertion ID has a matching test tag and that the test passes independently.
```

### Proof Context
No active proof findings ran against these four files during planning. If
`ana proof context` surfaces findings for `website/lib/copy.ts` or `contract.mdx`
at build time, prioritize any whose `related_assertions` overlap A001–A004.

### Checkpoint Commands
Surface is cross-surface; the only testable surface here is the website.
- After editing `copy.ts` + `copy.test.ts`: `(cd website && pnpm vitest run)` —
  Expected: 88 tests pass / 11 files (84 → 88).
- After all changes (build gate / AC5):
  `pnpm --filter anatomia-website check` — Expected: lint + typecheck + build clean.
- Repo-wide baseline (final): `pnpm run test -- --run` — Expected: no regression.

### Build Baseline
- Website tests before: **84 tests in 11 files** (`(cd website && pnpm vitest run)`).
- After build: expected **88 tests in 11 files** (+4 guard assertions, same file —
  `copy.test.ts` is modified, not created).
- Command used: `(cd 'website' && pnpm vitest run)`.
- Regression focus: `copy.test.ts` (the file being extended) — confirm the existing
  A031–A035 blocks still pass alongside the new A001–A004.
