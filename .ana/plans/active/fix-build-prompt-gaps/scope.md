# Scope: Fix three agent prompt gaps discovered during Scope 5 docs build

**Created by:** Ana
**Date:** 2026-05-13

## Intent

Three agent prompt issues in ana-build.md (and ana-verify.md for one) cause real pipeline failures:

1. **Bug 1:** Multi-phase builds write `build_data.yaml` instead of `build_data_{N}.yaml` because the template never mentions numbered naming for the data companion. The CLI rejects the save (`artifact.ts:1154` — `process.exit(1)` when companion file not found).
2. **Bug 2:** The baseline STOP rule is binary — "If baseline tests fail: STOP." No escape hatch for pre-existing environmental failures. Build either deadlocks or breaks protocol by rationalizing. Verify already handles this correctly (lines 484-485).
3. **Improvement 1:** When no unit tests exist, agents have no primary-path guidance for contract coverage. The tagging system assumes tests. Without guidance, Build might create empty test files just to hold `@ana` tags.

All changes are text edits to agent prompt templates. These templates are the product — they ship to every user on `ana init` and are read by agents on every pipeline run worldwide.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — text changes only, no code
- **Files affected:**
  - `packages/cli/templates/.claude/agents/ana-build.md` (template — ships to users)
  - `.claude/agents/ana-build.md` (dogfood — used by this project)
  - `packages/cli/templates/.claude/agents/ana-verify.md` (template — Improvement 1 only)
  - `.claude/agents/ana-verify.md` (dogfood — Improvement 1 only)
- **Blast radius:** Every pipeline run reads these prompts. Changes affect agent behavior for all users. No code changes, no schema changes, no test changes. Dogfood copies are immediate. Template copies reach new `ana init` installations only (existing agent files are skipped on re-init per `assets.ts:264`).
- **Estimated effort:** 30 minutes
- **Multi-phase:** no

## Approach

Fix three gaps in agent prompt templates, keeping edits minimal and mirroring existing patterns already established in the verify agent.

Bug 1: Add numbered data companion naming to two locations in ana-build.md — the `build_data.yaml` introduction (line 376) and the multi-phase steps (after line 425). Use the same wording pattern Verify already uses at line 72.

Bug 2: Replace the binary STOP rule (line 111) with a nuanced rule that distinguishes pre-existing failures in unrelated modules from failures in spec-touched modules. The boundary is mechanically checkable — the spec lists file changes, so "in modules the spec touches" is not a judgment call. Mirror Verify's existing edge case at lines 484-485.

Improvement 1: Add inline notes (2-3 lines each) to Build's tagging section and Verify's assertion-checking section. NOT full subsections — the existing fallback paths already handle the mechanics. The new content is a guardrail ("do not create empty test files to hold tags") and a pointer to the existing fallback behavior. Every character earns its place.

All changes applied to both template and dogfood copies identically.

## Acceptance Criteria
- AC1: Bug 1 — ana-build.md multi-phase section includes `build_data_{N}.yaml` naming alongside `build_report_{N}.md`, and the `build_data.yaml` introduction notes the numbered variant for multi-phase.
- AC2: Bug 2 — ana-build.md baseline test section replaces the binary STOP with a nuanced rule: STOP if failures are in spec-touched modules, proceed-with-documentation if failures are in unrelated modules.
- AC3: Improvement 1 — ana-build.md tagging section includes an inline note for the no-test scenario with the "do not create empty test files" guardrail.
- AC4: Improvement 1 — ana-verify.md assertion-checking section includes an inline note for the no-test scenario pointing to source inspection and build output evidence.
- AC5: All changes are identical in template and dogfood copies (4 files total).

## Edge Cases & Risks
- **Rationalization risk (Bug 2):** Adding judgment latitude to Build is inherently risky — the binary STOP exists because agents rationalize. Mitigated by: (a) the boundary is mechanically checkable ("modules the spec touches" vs. not), (b) Verify catches rationalized-away regressions in the next pipeline stage, (c) the current failure mode (deadlock/protocol violation) is worse than constrained judgment.
- **Cognitive load (Improvement 1):** Every agent reads these prompts on every run. Full subsections for a 5% scenario would tax every read. Inline notes keep the cost proportional to the benefit.
- **Distribution gap:** Template fixes only reach new installations. Existing users with agent files already installed won't get these fixes until they manually update. This is a known architectural constraint of `ana init` (confirmed `assets.ts:264`), not something to solve here.

## Rejected Approaches
- **Full "When No Unit Tests Exist" subsections (Improvement 1):** The BUGS.md proposal adds ~10 lines per agent. Both agents already handle the no-test case through existing fallback paths (Build line 143: "verify each contract assertion is testable"; Verify line 220: "check the build report for coverage claims and verify by source inspection"). The genuinely new content is the "don't create empty test files" guardrail — that earns 2 lines, not 10. Rejected because every character earns its place.
- **Leaving Bug 2 as-is with documentation:** Could document "if you hit pre-existing failures, tell the developer and wait." But this doesn't solve the deadlock — it just moves it from agent deadlock to pipeline deadlock. The nuanced rule lets Build proceed safely for the common case (environmental failures in unrelated packages).

## Open Questions
None. All three changes have clear locations, clear content, and clear precedent in existing agent text.

## Exploration Findings

### Patterns Discovered
- `packages/cli/templates/.claude/agents/ana-verify.md:72` — Verify already documents the data companion naming convention: "the data companion mirrors the report name — replace `report` with `data` and `.md` with `.yaml`." Build should mirror this wording.
- `packages/cli/templates/.claude/agents/ana-verify.md:484-485` — Verify's pre-existing failures edge case: "If tests fail that were also failing in the baseline (before the builder's changes): these are NOT regressions. Note them separately." Build should have the equivalent.

### Constraints Discovered
- [TYPE-VERIFIED] CLI companion validation (`artifact.ts:1154`) — `process.exit(1)` when companion file not found. Build MUST write the correctly-named file or the save fails.
- [TYPE-VERIFIED] CLI auto-rename fallback (`artifact.ts:1005-1029`) — renames unnumbered report+companion to numbered. Only triggers when the REPORT is unnumbered. Does NOT help when Build correctly numbers the report but writes an unnumbered data companion.
- [TYPE-VERIFIED] Init skip-existing (`assets.ts:264`) — agent files are not overwritten on re-init. Template fixes only reach new installations.

### Test Infrastructure
- No tests for agent prompt content. These are markdown templates — verification is behavioral (does the agent follow the instructions correctly in a pipeline run).

## For AnaPlan

### Structural Analog
`packages/cli/templates/.claude/agents/ana-verify.md` lines 64-73 — the re-verification section that already documents data companion naming and numbered variants. This is the closest structural match for Bug 1's wording.

### Relevant Code Paths
- `packages/cli/templates/.claude/agents/ana-build.md:376` — `build_data.yaml` introduction (Bug 1, location 1)
- `packages/cli/templates/.claude/agents/ana-build.md:419-426` — multi-phase handling section (Bug 1, location 2)
- `packages/cli/templates/.claude/agents/ana-build.md:111-113` — baseline test failure rule (Bug 2)
- `packages/cli/templates/.claude/agents/ana-build.md:143-165` — contract tagging section (Improvement 1)
- `packages/cli/templates/.claude/agents/ana-verify.md:200-220` — assertion verification section (Improvement 1)
- `packages/cli/src/commands/artifact.ts:886-892` — `deriveCompanionFileName` (CLI source of truth for naming)
- `packages/cli/src/commands/artifact.ts:1154-1173` — companion not-found rejection (confirms Bug 1 severity)

### Patterns to Follow
- Verify's data companion naming wording at line 72 — mirror for Bug 1
- Verify's pre-existing failures edge case at lines 484-485 — mirror for Bug 2
- Both agents' existing style: direct, imperative, no preamble

### Known Gotchas
- The four files must stay identical (template = dogfood). The diff should be run post-edit to confirm.
- Line numbers in this scope reference the current template content. If another change lands before this builds, line numbers shift.

### Things to Investigate
- None. All locations, content, and wording patterns are identified.
