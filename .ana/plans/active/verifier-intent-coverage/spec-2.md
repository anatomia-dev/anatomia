# Spec: Verifier Intent Coverage — Phase 2 (Surfacing + activation)

**Created by:** AnaPlan
**Date:** 2026-06-16
**Scope:** .ana/plans/active/verifier-intent-coverage/scope.md

## Approach

Phase 1 built the dormant mechanism: the `ac:` / `coverage_waivers` types, the `extractScopeACs` extractor, and the `evaluateCoverageGate` pre-seal gate wired into both save sites. Every existing contract is `version 1.0`, so the gate no-ops everywhere. **This phase makes the mechanism visible and turns it on.**

Three moves:

1. **Proof honesty (AC7, AC12, AC4-count).** Thread per-AC coverage and the PARTIAL count through the proof summary → entry → card → PR surfaces, so a PASS distinguishes mechanically-pinned ACs from judgment-verified ones, and a PARTIAL-inside-PASS is not silently swallowed. The PARTIAL count already exists — `parseACResults` computes `partialCount` (proofSummary.ts:219) and throws it away. This is mostly threading, plus a small coverage computation that reuses Phase 1's extractor + join.

2. **The planner-native preview (AC11).** A new read-only `ana plan coverage {slug}` command in a new `plan` command group. It joins the scope's ACs (via `extractScopeACs`) to the contract's `ac:` links and `coverage_waivers`, and prints a per-AC coverage map. It never gates and never exits non-zero — it is the plan-time mirror of the gate, used while writing the contract.

3. **Activation + the prompt fixes (AC8, AC9, AC10, and gate activation).** Teach `ana-plan.md` to emit `version: "1.1"` contracts with `ac:` links and `coverage_waivers` — **this is what flips the gate from dormant to live** for users on the new template. Fix the authority contradiction in both prompts (scoped two-gate), reframe the verifier's prediction second-pass, and give the verifier the coverage map.

### Design decisions carried from Phase 1 (already built, reuse — do not rebuild)

- Types: `ContractAssertion.ac?: string | string[]`; `ContractSchema.coverage_waivers?: CoverageWaiver[]` where `CoverageWaiver = { ac: string; kind: 'judgment' | 'retired'; reason: string }`. (`coverage_waivers` consciously supersedes the scope's literal `judgment_only: string[]` — see Phase 1.)
- `extractScopeACs(scopeContent): { ids, ambiguous }` and `evaluateCoverageGate({ scopeContent, contract }): CoverageGateResult` exist in `artifact-validators.ts`. **Reuse them** for both the proof coverage computation and the `ana plan coverage` command — do not duplicate the join logic.
- Activation signal is `version >= "1.1"`. The template bump in this phase is what activates the gate in the field.

### Activation rollout (why this is safe)

Bumping the template to `version: "1.1"` means every *new-template* Plan must link its ACs or the Phase 1 gate blocks the seal. That is the intended activation, and it is safe: the block is plan-time, pre-seal, before any build exists, and instantly recoverable. Users on old prompts keep emitting `1.0` contracts → gate stays inert for them until they re-init (merge-not-overwrite propagation). The prompt edits go to **`templates/.claude/agents/*.md`** (the product, all customers) — NOT the root `.claude/agents/*.md` dogfood (see Gotchas).

## Output Mockups

**`ana plan coverage my-feature`** (read-only, exit 0 always):
```
Coverage map for `my-feature`  (contract version 1.1 — gate active)

  AC1  ✓ covered        A001, A002
  AC2  ✓ covered        A003
  AC3  ✓ covered        A004  (weak matcher only — exists)
  AC4  ⚖ judgment-only   "error message is helpful — human-verified"
  AC5  ⊘ retired         "superseded by AC9 after scope correction"
  AC6  ✗ UNCOVERED       no assertion links AC6 and no coverage_waivers entry

  6 acceptance criteria · 3 pinned · 1 judgment-only · 1 retired · 1 uncovered
  1 AC covered by weak matcher only (info)

  ⓘ This is a preview. The seal gate runs at `ana artifact save`. UNCOVERED ACs will block the seal.
```

For a legacy `version 1.0` contract (gate inactive):
```
Coverage map for `old-feature`  (contract version 1.0 — gate inactive, legacy)

  (no `ac:` links found — this contract predates coverage linking)
  6 acceptance criteria · 0 pinned · 6 unlinked

  ⓘ Legacy contract: the coverage gate does not apply. Re-plan on the current template to enable it.
```

**Proof card** (`ana proof my-feature`) — the existing `── Contract ──` section gains a coverage line; a PARTIAL-inside-PASS is surfaced:
```
── Contract ──────────────────────────  6/6 ✓
  6 satisfied · 0 unsatisfied · 0 deviated
  AC coverage: 4 pinned · 1 judgment-only · 1 retired
  ⚠ 2 acceptance criteria shipped PARTIAL
```

## File Changes

All paths under `packages/cli/` unless noted. Verified current state via Read this session.

### src/utils/proofSummary.ts (modify)
**What changes:**
- `parseACResults` (`:200-226`) already computes `partialCount` (`:219`) but returns only `{ total, met }`. Return `partial` as well: `{ total, met, partial }`.
- Extend the `ProofSummary.acceptance_criteria` type (`:43-46`) and its default (`:873-876`) to add `partial: number` and a `coverage` object: `{ pinned: number; judgment: number; retired: number; uncovered: number; weak_only: number }`.
- In `generateProofSummary`, after the contract is loaded (`:925-946`) and the scope is available, compute `coverage` by reusing `extractScopeACs` + the same join `evaluateCoverageGate` uses (extract the join into a small shared helper in `artifact-validators.ts` if cleaner, so the gate, the command, and this all share one implementation). Read `scope.md` from `slugDir`. Undefined-safe: old entries / missing scope → `coverage` all-zero, `partial` 0.
**Pattern to follow:** the existing `acceptance_criteria` threading and the `commit_hygiene` optional-array pattern (`:914-917`) for undefined-safety.
**Why:** AC7 (honest PASS) and AC12 (PARTIAL surfaced) require the data to exist in the summary before any surface can show it.

### src/types/proof.ts (modify)
**What changes:** `ProofChainEntry.acceptance_criteria` is typed as `ProofSummary['acceptance_criteria']` (`:240`) — the new `partial`/`coverage` fields flow automatically; no change needed there. **Fix the stale cross-cutting comment at `:199`**: it says construction is in `writeProofChain()` (commands/work.ts); it is actually in `commands/work-proof.ts` (`acceptance_criteria` threaded at `:372`). Update the comment to reflect reality.
**Pattern to follow:** the existing cross-cutting comment block (`:196-201`).
**Why:** scope flagged the stale comment (`proof.ts:19` in the REQ — now `:199` after drift). "Finished means a stranger can extend it" — the recipe comment must point at the real file.

### src/commands/work-proof.ts (modify)
**What changes:** Entry construction threads `acceptance_criteria: proof.acceptance_criteria` (`:372`) — since the new fields ride that object, this likely needs no change. Verify the whole `acceptance_criteria` object is passed through (it is) and that nothing strips the new fields.
**Pattern to follow:** the existing pass-through at `:372`.
**Why:** confirm the new fields reach the persisted entry.

### src/commands/proof.ts (modify)
**What changes:** In `formatHumanReadable` (`:280`), the `── Contract ──` section (`:338-360`) gains an AC-coverage line (`pinned · judgment-only · retired`) and, when `partial > 0`, a `⚠ N acceptance criteria shipped PARTIAL` line. Read from `entry.acceptance_criteria.coverage` / `.partial`, undefined-safe (old entries lack them → render nothing).
**Pattern to follow:** the existing `lines.push(...)` rollup construction in that section (`:349-360`).
**Why:** AC7 + AC12 — the human-facing honesty surface.

### src/commands/pr.ts (modify)
**What changes:** PR summary reads `acceptance_criteria.met/total` (`:105-106`). Add the PARTIAL count to the PR summary line when `partial > 0` (e.g. `ACs: 6/6 met (2 PARTIAL)`). Undefined-safe.
**Pattern to follow:** the existing `acMet`/`acTotal` usage (`:105-106`).
**Why:** AC12's "save-time / card 'N ACs shipped PARTIAL'" — the PR is the other place a human reads the AC outcome.

### src/commands/plan.ts (create)
**What changes:** New command group. `registerPlanCommand(program)` adds a `plan` command with a `coverage <slug>` subcommand. The handler resolves the slug's plan dir, reads `scope.md` + `contract.yaml`, runs `extractScopeACs` + the shared coverage join, and prints the per-AC map (Output Mockups). Read-only: never `process.exit(1)`, always exit 0 (informational). Guard missing slug/plan-dir/contract the same way `runPreCheck` does (`verify.ts:96-118`).
**Pattern to follow:** `src/commands/verify.ts` end-to-end — `registerVerifyCommand` + `runPreCheck` + `printContractResults` (`:36-145`). Same command-group skeleton, same slug-resolution + plan-dir guards, same never-exits-nonzero contract. The handler is richer (renders a coverage map) but the skeleton clones directly.
**Why:** AC11 — the preview must live at plan-time (`ana plan`, a new home), where the planner uses it while writing the contract, not at verify-time.

### src/index.ts (modify)
**What changes:** Import `registerPlanCommand` and call it in the `PIPELINE` group (`:64-70`), adjacent to `registerVerifyCommand`.
**Pattern to follow:** the registration calls at `:64-70` (`registerWorkCommand(program)` … `registerVerifyCommand(program)`).
**Why:** AC11 requires the new group registered in `index.ts`.

### templates/.claude/agents/ana-plan.md (modify)
**What changes:**
- The contract schema example at `:226` emits `version: "1.0"` → change to `version: "1.1"`. **This activates the gate for new-template users.**
- Add AC-coverage discipline to the contract section: every scope acceptance criterion must be served by ≥1 assertion's `ac:` field, OR excused by a `coverage_waivers` entry (`{ ac, kind: judgment|retired, reason }`, reason required). Show the `ac:` field on an assertion and a `coverage_waivers` block in the schema example.
- Point planners at `ana plan coverage {slug}` as the pre-seal preview (a Step-8-adjacent check).
- **Do NOT add a `material-gap-as-assertion` instruction** (cut from v1 per the scope's own flag — see Deferred Work).
**Pattern to follow:** the existing contract-schema and matcher-reference sections (`:226-300`).
**Why:** AC8 (the contract section teaches the link) + activation. Without the template emitting `1.1` + links, the gate never fires in the field.

### templates/.claude/agents/ana-verify.md (modify)
**What changes:**
- **Scoped two-gate (AC8):** the lines that call the contract "the authoritative specification" / "the contract wins" (`:88`, `:92`) must be reframed: the contract is authoritative for *how to mechanically read an assertion*; intent (scope ACs, via the AC Walkthrough) is authoritative for *whether the requirement is met at all*. Not literal "intent wins" — the seal must still mean something. State both gates explicitly.
- **Prediction reframe (AC9):** keep the Step 3 prediction step (it is the best anti-confirmation-bias mechanism — do NOT remove it). Reframe the Step 5 second pass (`:259` "Then ask: 'What did I NOT predict that might also be wrong?'") from a bare question into a *populated commitment* — the verifier writes the answer, not just poses the question. **No count or format requirement** is added.
- **Receive the coverage map (AC8/AC11):** add a note that the verifier reads the AC→assertion coverage map (`ana plan coverage {slug}`) as context for the AC Walkthrough.
**Pattern to follow:** the existing Step 3 / Step 5 prediction structure (`:182-205`, `:255-260`) and the Load-Verification-Documents section (`:88-92`).
**Why:** AC8, AC9. AC10 is preserved by *not* adding any re-seal or return-to-Plan path — verify by inspection that neither template introduces one.

### tests/commands/plan-coverage.test.ts (create)
**What changes:** Tests for `ana plan coverage` — covered/uncovered/judgment/retired rendering, weak-matcher info, exit 0 always (even with uncovered ACs), legacy `1.0` rendering, missing-contract guard.
**Pattern to follow:** `tests/commands/verify.test.ts` (temp git repo, `git init -b main`, fixture scope+contract).

### tests/utils/proofSummary.test.ts (modify)
**What changes:** Add cases: `parseACResults` returns `partial` for a fixture with N PARTIAL bullets; `generateProofSummary` populates `acceptance_criteria.coverage` + `.partial`; undefined-safety for an entry with no scope/contract.
**Pattern to follow:** the existing `proofSummary.test.ts` structure.

### tests/commands/template-coverage-prompts.test.ts (create)
**What changes:** Enforcement tests on the two template files (legitimate per testing-standards — template content is what's being enforced): `ana-plan.md` contains `version: "1.1"`, references `ac:` and `coverage_waivers`; `ana-verify.md` contains the scoped two-gate phrasing and the populated-commitment reframe, and does NOT introduce a return-to-Plan / re-seal instruction (AC10).
**Pattern to follow:** existing template-enforcement tests if any (grep `templates/.claude/agents` in `tests/`); otherwise read the file and assert on content.

## Acceptance Criteria

Copied from scope (the surfacing ACs), expanded with build criteria:

- [ ] **AC4 (count):** the judgment-only count appears in the proof summary and the card (distinct from retired).
- [ ] **AC7:** the proof summary records per-AC coverage and waiver kinds; a PASS distinguishes mechanically-pinned ACs from judgment-verified ones. Old entries without the data render cleanly (undefined-safe).
- [ ] **AC8:** both prompts reframed to the scoped two-gate — contract authoritative for assertion *reading*, intent authoritative for requirement *fulfillment*; the seal still means something.
- [ ] **AC9:** the prediction step remains; the Step-5 second pass is a populated commitment, not a bare question; no count/format requirement added.
- [ ] **AC10:** no template introduces contract modification, re-seal, or return-to-Plan; rejection stays Build↔Verify only (verified by inspection + enforcement test).
- [ ] **AC11:** `ana plan coverage {slug}` prints the AC→assertion coverage map (per-AC status, covering assertion ids, judgment/retired + weak-matcher info). Never gates, always exits 0. Registered in a new `plan` group in `index.ts`.
- [ ] **AC12:** a "N ACs shipped PARTIAL" count is surfaced (card + PR) for the PARTIAL-inside-PASS case.
- [ ] **Activation:** `ana-plan.md` emits `version: "1.1"` contracts with `ac:`/`coverage_waivers` — the Phase 1 gate now fires for new-template contracts.
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`; count does not decrease; no build/lint errors.

## Testing Strategy
- **Unit:** `parseACResults` partial count; `generateProofSummary` coverage population + undefined-safety; `ana plan coverage` rendering across all statuses + exit-0 invariant.
- **Integration:** `ana plan coverage` on a real temp plan dir (scope + `1.1` contract with mixed covered/uncovered/waived ACs).
- **Enforcement:** template-content assertions for the prompt edits (AC8/AC9/AC10).
- **Edge cases:** legacy `1.0` contract → command shows "gate inactive"; entry with no coverage data → card renders without the new lines; PARTIAL count of 0 → no PARTIAL line shown.

## Dependencies
- **Phase 1 (spec-1.md) must be merged first.** This phase reuses `extractScopeACs`, `evaluateCoverageGate`, and the `ac:` / `coverage_waivers` types. `plan.md` records the `Depends on: Phase 1` edge.

## Constraints
- **Every proof field is additive and undefined-safe.** Old `proof_chain.json` entries lack `partial`/`coverage` — every consumer must handle their absence (render nothing, treat as 0). This is the documented cross-cutting contract.
- **Prompt edits go to `templates/.claude/agents/`, not the root dogfood.** A change to the root `.claude/agents/*.md` affects only us; the product change is in `templates/`.
- **Both Claude and Codex:** the template edits ship to per-platform dirs. The instruction must read correctly for both agents — don't phrase anything Claude-specific.
- **`ana plan coverage` never exits non-zero** — it is informational, like `ana verify pre-check`.

## Gotchas
- **`material-gap-as-assertion` is CUT from v1** — do not add the prompt line (scope flagged it undefined: "do not ship until concrete and testable"). The definition is recorded in Deferred Work below as the seed if funded later.
- **The PARTIAL data is already parsed** — `parseACResults` computes `partialCount` at `proofSummary.ts:219` and discards it. AC12 is threading, not new parsing. Don't re-implement the PARTIAL regex.
- **Share the coverage join, don't fork it.** The proof coverage computation and `ana plan coverage` must call the *same* extractor+join as the Phase 1 gate. If the join isn't already a standalone export, extract it from `evaluateCoverageGate` into a shared helper so all three agree. Three implementations of one join would drift (design principle: move logic to one place).
- **Re-init overwrites agent bodies from stock.** Template improvements reach existing installs on re-init — which is the propagation mechanism for activation. Correct and intended.
- **Undefined-safe coverage in old entries** — `generateProofSummary` runs over `completed/` dirs that may have no scope or a `1.0` contract; the coverage computation must degrade to all-zero, never throw.

## Deferred Work
- **`material-gap-as-assertion` (cut from v1).** Concrete seed definition for a future funded REQ, recorded verbatim per the developer: *"a load-bearing behavior implied by intent but covered by no scope AC → Plan emits a normal assertion for it (no special machinery; it interacts with the gate as any assertion does)."* Ship only when the definition is concrete and testable.
- **Test-body / matcher-reconciliation (deferred by the scope, OQ1).** Coverage verifies a *link exists*, not that the tagged test *semantically* exercises the AC — a vacuous test body still passes the gate. That gap is named, not closed; it is the funded follow-up (the cross-language "Generalization Gate").

## Build Brief

### Rules That Apply
- **Local imports end in `.js`; `import type` for types.** Reuse `import { extractScopeACs, evaluateCoverageGate } from './artifact-validators.js'` and `import type { CoverageWaiver, ContractSchema } from '../types/contract.js'`.
- **Engine/command boundary:** the coverage join + summary computation return data; `proof.ts`/`plan.ts`/`pr.ts` do the chalk printing.
- **Explicit return types + `@param`/`@returns` JSDoc on exports** (pre-commit eslint).
- **Commander command group:** mirror `registerVerifyCommand` exactly; new group registered in `index.ts` PIPELINE group.
- **Tests:** exact matchers; temp repos `git init -b main`; template-content assertions are legitimate enforcement tests.
- **No default exports; named exports only.**

### Pattern Extracts

The command-group skeleton to clone (`verify.ts:132-145`):
```ts
export function registerVerifyCommand(program: Command): void {
  const verifyCommand = new Command('verify')
    .description('Verify contract assertions before code review');
  verifyCommand
    .command('pre-check')
    .description('Run contract seal verification')
    .argument('<slug>', 'Work item slug (e.g., add-status-command)')
    .action((slug: string) => { runPreCheck(slug); });
  program.addCommand(verifyCommand);
}
```

The slug/plan-dir/contract guards to mirror (`verify.ts:96-118`):
```ts
const planDir = path.join(verifyRoot, '.ana/plans/active', slug);
if (!fs.existsSync(planDir)) {
  console.error(chalk.red(`Error: No active work found for '${slug}'.`));
  console.error(chalk.gray('Run `ana work status` to see active work items.'));
  process.exit(1);
}
const contractPath = path.join(planDir, 'contract.yaml');
if (!fs.existsSync(contractPath)) {
  console.log(chalk.yellow('No contract found. Run the pipeline with AnaPlan to generate one.'));
  process.exit(0);
}
```

The proof-card Contract section to extend (`proof.ts:338-360`):
```ts
// ── Contract ──
const ct = entry.contract;
const clean = ct.unsatisfied === 0 && ct.deviated === 0;
let rollup = `${ct.satisfied}/${ct.total}`;
// ... existing rollup ...
lines.push(sectionRule('Contract', { rollup, width }));
lines.push(`  ${countedLead}${ct.satisfied} satisfied · ${ct.unsatisfied} unsatisfied · ${ct.deviated} deviated`);
// ← add: AC coverage line + PARTIAL line, both undefined-safe on entry.acceptance_criteria
```

The PARTIAL data already computed, just not returned (`proofSummary.ts:217-225`):
```ts
const passCount = (section.match(/^\s*-\s+.*\bPASS\b/gm) || []).length;
const failCount = (section.match(/^\s*-\s+.*\bFAIL\b/gm) || []).length;
const partialCount = (section.match(/^\s*-\s+.*\bPARTIAL\b/gm) || []).length;  // ← thread this out
const unverifiableCount = (section.match(/^\s*-\s+.*\bUNVERIFIABLE\b/gm) || []).length;
const total = passCount + failCount + partialCount + unverifiableCount;
const met = passCount;
return { total: total || 0, met };  // ← return partial too
```

### Proof Context
No active proof findings for affected files at plan time. At build time run `ana proof context packages/cli/src/utils/proofSummary.ts packages/cli/src/commands/proof.ts packages/cli/src/commands/plan.ts packages/cli/src/commands/pr.ts` and prioritize any `risk` overlapping the proof-summary cross-cutting recipe.

### Checkpoint Commands
- After `proofSummary.ts`: `(cd packages/cli && pnpm vitest run tests/utils/proofSummary.test.ts)` — Expected: green incl. new partial/coverage cases.
- After `plan.ts` + `index.ts`: `(cd packages/cli && pnpm vitest run tests/commands/plan-coverage.test.ts)` — Expected: green; exit-0 invariant holds.
- After template edits: `(cd packages/cli && pnpm vitest run tests/commands/template-coverage-prompts.test.ts)` — Expected: green.
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: baseline + new tests pass.
- Lint: `(cd packages/cli && pnpm run lint)`.

### Build Baseline
Run `(cd packages/cli && pnpm vitest run)` and record exact counts before writing code (this baseline includes Phase 1's new tests, since Phase 2 builds on the merged Phase 1).
- Current tests: {run the command, record exact}
- Current test files: {record exact}
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected baseline + new tests across 2 new + 1 modified test files.
- Regression focus: `tests/utils/proofSummary.test.ts`, `tests/commands/pr.ts` tests, any proof-card snapshot tests (the Contract section gains lines).
