# Scope: Retire Capture-Gate Self-Arming — Drive the Gate from a Committed Config Flag

**Created by:** Ana
**Date:** 2026-06-05

## Intent

Remove the capture gate's self-arming rollout mechanism — the invisible, gitignored, per-working-copy `.ana/state/capture.json` that flips a project from warn-mode to fail-closed only after it seals its first valid capture — and replace its enablement signal with a **visible, committed `ana.json` flag**. The gate, the seal, and the capture engine (the moat) are preserved exactly; only the *decision of when enforcement is on* changes from hidden runtime state to a `git`-tracked config fact.

This is a retractment of machinery shipped days ago in `captured-test-evidence` (Phase 2, now on `main`, **not yet on npm** — current published version is 1.2.2). The window to remove it cleanly is now, while no install base has armed in the field. Once a customer's working copy arms, `.ana/state/capture.json` becomes load-bearing field state and removal becomes a migration. This is premature robustness — insurance on an empty house — and it is itself the real maintenance burden: invisible state, a CI footgun, and a mechanism that cannot be described in one sentence without sounding overbuilt.

The user's framing: *"Enforcement is on by default; turn it off in config if your project doesn't use it"* wins the room. *"It arms itself after the first sealed capture via a per-working-copy state file"* loses it. Same guarantee, one is explainable.

Folded in (user-confirmed): a status readout of the gate's on/off state, the two adjacent contract reconciliations, and a documentation/changelog cleanup pass that also corrects stale prose left by two recent proofs.

## Complexity Assessment

- **Kind:** feature
- **Size:** large
- **Surface:** cross-surface

*(Kind rationale: net behavior of the gate is preserved, but enablement moves to a new user-facing config flag and the sealed contract is re-expressed — a substantive, contracted change, not a no-behavior chore. Surface: primary `cli`; secondary `website` docs + repo-root governance files.)*
- **Files affected:**
  - **Delete:** `packages/cli/src/utils/capture-state.ts`, `packages/cli/tests/utils/capture-state.test.ts`
  - **Modify (code):** `packages/cli/src/commands/artifact.ts`, `packages/cli/src/utils/capture-marker.ts`, `packages/cli/src/commands/init/anaJsonSchema.ts`, `packages/cli/src/commands/init/state.ts`, `packages/cli/src/commands/work.ts` (status readout)
  - **Modify (tests):** `packages/cli/tests/utils/capture-marker.test.ts`, `packages/cli/tests/commands/artifact.test.ts`, plus new coverage for the config flag + carve-out
  - **Contract:** `.ana/plans/completed/captured-test-evidence/contract.yaml` re-expression (A030–A036) — **Plan owns the exact surgery and re-seal**
  - **Docs (customer):** `website/content/docs/guides/configurability.mdx` (ana.json reference + new flag), possibly `website/content/docs/concepts/pipeline.mdx` or `verifying-changes.mdx` (net-new gate description)
  - **Docs (dogfood/governance):** `.ana/context/project-context.md` (stale re-init prose), `CHANGELOG.md` (remove premature entry + fix footer link)
  - **Dogfood config:** root `ana.json` (write the flag)
- **Blast radius:** `artifact.ts` is a hot, load-bearing module (touched in 7 pipeline cycles; it is the save path for every artifact). The cut is surgical — `isArmed`/`armCapture` are imported in exactly one place (artifact.ts:26) — but the gate orchestration sits in the same function that runs on every build-report save. The seal, the inliner (`inlineReportCaptures`), and the verify-report account live adjacent and **must not be touched**. Verify reads each contract assertion independently, so the contract re-seal is the mechanical guarantee the gate's behavior survives the arming's removal.
- **Estimated effort:** 1–2 focused days. The code cut is small; the contract surgery and the breadth (config + carve-out + dogfood + docs + changelog) carry the weight.
- **Multi-phase:** no

*(One coherent retractment; the REQ is explicit it should land as a single cut. Plan MAY sequence internally — e.g. code + contract re-seal first, docs/changelog second — but it is one scope, not multiple specs.)*

## Approach

Excise the arming machinery and re-point the gate's single enablement input from hidden state to committed config, preserving the gate/seal/capture behavior exactly. This is "the elegant solution is the one that removes" applied literally: net-negative LOC, and we delete the code that *causes* the problem (invisible state) rather than adding code to manage it.

The cut line is precise and already mapped against current `main`:

- **Delete the arming signal.** `capture-state.ts` (`isArmed`, `armCapture`, the `.ana/state/capture.json` read/write) is a clean standalone util imported only by `artifact.ts`. It goes in full, with its test file.
- **Delete the arming plumbing in `artifact.ts`.** The `isArmed`/`armCapture` import, the `wasArmed` read in `applyCaptureGate`, the `armAfterValidBuildReport` function and both its call sites, the one-time "capture gate armed" message, and the `wasArmed` field on `CaptureGateOutcome`.
- **Re-point the gate input.** `evaluateCaptureGate` keeps its exact shape and block logic — only its boolean input is renamed from `armed` (derived from state) to `enabled` (derived from config). `applyCaptureGate` derives `enabled` from the config flag + the carve-out instead of from `isArmed`.
- **Add one committed flag.** A single top-level `ana.json` field, written `on` by `ana init`. **Absent = off** — this is the entire future-migration mechanism for free: a pre-flag project upgrading reads off and is never bricked; a fresh init reads on. Keep it to *one well-defaulted flag*, not a config section. Resist proliferating knobs.
- **Carve out the no-test-command case.** Enforcement requires both the flag on **and** a resolvable test command. A project with nothing to run never sees the gate — which makes the founder's edge cases (Go repo, no-test app) just work without anyone learning the word "arming."
- **Re-express the contract.** A030–A036 are written in terms of arming and must be re-stated in config terms so the gate's behavior stays seal-protected after the arming is gone. Plan owns the delete/re-express/add split and the re-seal.
- **Migrate the dogfood and clean the prose.** Write the flag into our own `ana.json`, confirm the dogfood still blocks a no-evidence build-report save (the live regression check), and correct the documentation that two recent proofs left inaccurate.

The autonomy thesis the gate eventually unlocks ("run it unattended and trust the result") is **untouched** — we remove the rollout scaffolding around the guarantee, not the guarantee.

## Acceptance Criteria

- **AC1:** `packages/cli/src/utils/capture-state.ts` and its test file are deleted, and no source or test file references `isArmed`, `armCapture`, `.ana/state/capture.json`, `wasArmed`, or `armedAt`.
- **AC2:** The capture gate's block behavior is unchanged from current `main`: it blocks a build-report save **only** when enforcement is enabled **and** a preservation validator fails (missing / tampered / truncated capture). Counts and verdict never block (fail-open preserved).
- **AC3:** Gate enablement is driven by a committed `ana.json` flag. The flag present-and-`on` enables enforcement; the flag `off` or **absent** yields warn-mode (never blocks).
- **AC4:** `ana init` writes the flag `on` into a newly initialized project's `ana.json`, unconditionally (not gated on test-command detection).
- **AC5:** On re-init, an explicit user-set flag value (`on` or `off`) is preserved; an absent flag is written `on`. *(Confirms the flag joins the re-init preservation contract correctly — see Open Questions for the founder decision on auto-enabling existing projects.)*
- **AC6:** With the flag on, a project that has **no resolvable test command** (top-level `commands.test` and no surface test command) is in warn-mode — the gate never blocks it.
- **AC7:** With the flag on and a resolvable test command present, a build-report save with no valid captured evidence is blocked with a clear message that names the one-line fix (`ana test`) and mentions how to disable the gate.
- **AC8:** Verify-report saves and non-build-report saves are never gated, regardless of flag state (Verify independence preserved).
- **AC9:** Contract assertions A030–A036 are re-expressed in config-enablement terms and the contract is re-sealed; every retained assertion is backed by a passing, targeted test.
- **AC10:** The dogfood (`anatomia` repo) has the flag written `on` in its `ana.json`, no `.ana/state/capture.json` is created by any code path, and a no-evidence build-report save in the dogfood is blocked after the change.
- **AC11:** `ana work status` (or the agreed status surface) reports the capture gate's on/off state in human-readable output.
- **AC12:** AnaDocs documents the capture gate as on-by-default-for-new-projects config: the `ana.json` reference in `configurability.mdx` includes the flag, and a net-new description of the gate's behavior exists (no stale "arming"/"warn→arm" language is introduced, since none currently exists to reverse).
- **AC13:** `.ana/context/project-context.md` no longer claims agent definitions/CLAUDE.md are "kept as-is" / "skipped if they exist" on re-init (lines ~86 and ~123), reflecting the shipped template-propagation behavior.
- **AC14:** The premature `### Changed` "Re-init now propagates agent template updates" entry under `## [Unreleased]` is removed from `CHANGELOG.md` (the empty `[Unreleased]` header is retained); the footer compare link is corrected to `v1.2.2...HEAD`; and **no new changelog entry is added for this work**. The changelog reflects only what is published to npm.
- **AC15:** `pnpm run build`, the full `packages/cli` test suite, lint, and typecheck all pass; total test count does not decrease relative to `main` net of the deliberately-removed arming tests (Plan documents the expected delta).

## Edge Cases & Risks

- **Scope drift into load-bearing code.** The single greatest risk. The cut is *arming only*. Do NOT touch: the gate's block logic (`applyCaptureGate`, `evaluateCaptureGate`'s validator loop, the `process.exit(1)`-before-seal path), the seal/integrity validators (`validateCapturePresent`, `validateCaptureInlined`, `validateCaptureNotTruncated`), the inliner (`inlineReportCaptures`), the verify-report sealed account, `capture-runner.ts`, `commands/test.ts`, the trinary verdict, or the 8-stack no-false-green corpus. If Plan or Build finds itself editing any of these, stop — that is the failure mode this scope exists to prevent.
- **Carve-out keying (the real trap).** `ana test` resolves a command from top-level `commands.test` OR per-surface `commands[s].test`/`test_json` (test.ts:90–91). A surface-only monorepo config has no top-level `commands.test` but is fully capture-capable. If the carve-out keys on top-level `commands.test` alone, it wrongly drops a surface-only project to warn-mode. The carve-out must check whether **any** resolvable test command exists.
- **The one residual behavior difference (must be accepted explicitly).** Self-arming would not block a brand-new project whose very first build genuinely ran no `ana test`. With `config:on` + the carve-out, a project *with* a test command that didn't run it **is** blocked on build #1. This is the intended "you must actually run the command" behavior — confirm acceptable and ensure the block message makes the fix obvious.
- **Re-init flag handling.** Getting AC5 wrong in either direction is a real footgun: writing `on` over a user's explicit `off` re-enables a gate they turned off; never writing `on` when absent means existing adopters never get enforcement on re-init. The flag must join `preserveUserState` deliberately, not by accident of `.passthrough()`.
- **Test-count floor.** CI enforces that test count must not decrease and runs across 3 OS × 2 Node. The arming tests are deliberately removed; Plan must account for the delta and the new config/carve-out tests so the suite is net-honest, not net-smaller-by-accident.
- **Changelog content loss.** Removing the `[Unreleased]` entry is correct (it documents unshipped behavior), but the template-propagation behavior change IS genuinely notable and must reappear in the **next** release's changelog at version-bump time. It is not lost — it is recorded in the proof chain and completed plans, and the release process composes the changelog from there. Flagged so it is re-included at the next bump, not now.
- **`.passthrough()` masking.** `AnaJsonSchema` uses `.passthrough()`, so an unknown `captureGate` key would survive silently even without a schema entry. Add the field to the schema explicitly (typed enum) so it is validated and discoverable, not merely tolerated.

## Rejected Approaches

- **Keep arming, just make `capture.json` committed/visible.** Rejected. This treats the symptom (invisibility) while keeping the disease (a per-working-copy enablement mechanism answering a question — staged rollout — that has no force with no install base). Config-flag enablement removes the mechanism entirely.
- **Gate `init`'s flag-write on test-command detection (OQ2 alternative).** Rejected as the default. It would make "no flag" mean two different things (never-adopted vs had-no-test-command) and silently leave a project un-enforcing after it later adds tests. The flag means "this team wants the gate"; the carve-out handles "is there something to run" at gate time. Keep the two decoupled so the flag's meaning is one sentence.
- **Add a full capture/gate config section with multiple knobs.** Rejected. One well-defaulted flag. The manual-disarm path is the rare case, surfaced in the block message and troubleshooting, not the happy path.
- **Reverse customer-facing docs (REQ Item 7 as literally written).** Re-scoped, not rejected: investigation showed AnaDocs contains **no** capture-gate prose to reverse. The docs work is net-new description + a config-reference entry, which is simpler and cleaner than a reversal.
- **Defer the changelog/dogfood-prose cleanup to separate work.** Rejected per user direction: the documentation should come out clean in one go. Both are small and adjacent. (Plan may still split if either balloons — see Open Questions.)

## Open Questions

*(Founder/design decisions for Plan; leans provided. Factual lookups already resolved in Exploration Findings.)*

- **OQ1 — Flag name/shape/location.** Lean: top-level `captureGate: "on" | "off"`, `absent = off`. Confirm the exact key name. (Considered: nested under a `capture`/`gate` object — rejected for the one-flag principle.)
- **OQ2 — Re-init auto-enable for existing projects (AC5).** Lean: preserve an explicit `on`/`off`; write `on` when absent, so re-init is the visible adoption moment. The embedded founder decision: is it acceptable for an existing project's re-init to *turn the gate on* when it had no flag? If not, the absent-on-re-init case should stay absent (off) and only fresh init writes `on`. **This is the one genuine product decision in the scope.**
- **OQ3 — Status surface placement (AC11).** There is no `ana doctor` / standalone `ana status` command today; the pipeline status lives in `ana work status` (work.ts, `printHumanReadable` ~line 320). Lean: add a one-line gate readout there. Confirm that is the right home vs. a new surface.
- **OQ4 — Contract surgery split (A030–A036).** Lean (from the REQ, for Plan to finalize): **delete** A031 (check-then-arm) and A034 (`isArmed` undefined-safe) — no analog once arming is gone; **re-express** A030 (enabled + no evidence → blocked), A032 (disabled/absent → warn), A033 (enabled + abstain → not blocked), A035 (verify never gated), A036 (non-build-report never gated); **add** flag-on-enforces, flag-absent-warns, no-test-command-warns-even-with-flag-on, manual-disarm-respected. This is the sealed core — Plan gets it exact.
- **OQ5 — "Last updated" line on AnaDocs.** The user referenced a last-updated line that should be bumped. Investigation found no manually-maintained date on MDX pages — the only date surface is `website/app/sitemap.ts` (automatic, git-derived). Plan/user to confirm whether a specific rendered date exists (e.g. on a reference or proof page) that needs touching; otherwise this is a no-op.
- **OQ6 — Verify-account assertion cost (Item 6, second half).** Folding it in is confirmed. If binding the verify-report sealed account to a new A-id requires more than a straightforward assertion (e.g. a new test fixture), Plan may split *that one item* out and keep the AC14-strike fold. The AC14-strike is non-negotiable in this scope.

## Exploration Findings

### Patterns Discovered
- **`evaluateCaptureGate`** (`capture-marker.ts:461–471`): runs only the three preservation validators; returns `blocked: true` solely when `opts.armed && messages.length > 0`. Counts/verdict are never weighed. **This is the load-bearing safety claim and it HOLDS against current `main`** — the only thing the gate ever blocks is "no valid capture present" = the agent never ran `ana test`. Renaming `armed → enabled` is a mechanical input swap; the block logic does not change.
- **`applyCaptureGate`** (`artifact.ts:793–817`): inlines captures, reads `wasArmed = isArmed(projectRoot)` (:796), evaluates the gate (:797), exits before seal on block (:799–806, message already improved to mention `ana test`), returns `{ valid, wasArmed }`. The `enabled` derivation replaces the `wasArmed` read here.
- **`armAfterValidBuildReport`** (`artifact.ts:827–833`): arms after a valid save; both call sites at :1188 and :1618. Deleted entirely.
- **Gate call sites:** build-report branch at artifact.ts:1027/1438 → `applyCaptureGate` at :1039/1448; `buildReportOutcome` threaded to `armAfterValidBuildReport` at :1188/:1618. Verify-report branch (:990/:1409) calls only `inlineReportCaptures` — confirming AC8 structurally.
- **`ana.json` field write:** `createAnaJson` (`state.ts:417`, return object ~:560–571) is where the flag is written for fresh init. `AnaJsonSchema` (`anaJsonSchema.ts`, top-level object ~:66) is where the typed field is declared; schema uses `.passthrough()`.
- **Re-init preservation:** `preserveUserState` (`state.ts:696`) governs what survives; user `ana.json` fields are preserved. The flag must be added here deliberately (AC5).
- **Test-command resolution:** `commands/test.ts:90–91` — surface `commands.test_json` (else `.test`) when `--surface`, otherwise top-level `commands.test`. This is the resolver the carve-out must mirror (the surface-only trap).

### Constraints Discovered
- [TYPE-VERIFIED] `isArmed`/`armCapture` imported only in `artifact.ts:26` (grep across `packages/cli/src` returns only `capture-state.ts` + `artifact.ts`). The excision is genuinely isolated.
- [OBSERVED] **The dogfood is NOT currently armed.** No `.ana/state/capture.json` exists; `.ana/state/` is gitignored (`.ana/.gitignore: state/`) and was never committed (`git log --all -- .ana/state/capture.json` is empty). The REQ's "orphaned tracked file to delete" premise does **not** hold — there is nothing tracked to clean. Item 5 reduces to: write the flag `on` and confirm enforcement.
- [OBSERVED] **No capture-gate documentation exists in AnaDocs.** Grep across `website/content/docs` for arming/warn-mode/gate/`ana test`/`capture.json` finds nothing relevant ("the gate" in troubleshooting/verifying-changes = the verification/assertion gate). Docs work is net-new, not reversal.
- [OBSERVED] **CHANGELOG violation is precisely one entry.** `## [Unreleased]` existed empty at the 1.2.2 release (normal scaffolding). Commit `2468ee1f` (template-propagation) added a `### Changed` entry under it documenting unshipped behavior. captured-test-evidence added nothing to the changelog. Footer link `[Unreleased]: ...compare/v1.2.1...HEAD` is stale (latest release is v1.2.2). npm published = local package.json = 1.2.2.
- [OBSERVED] **Dogfood `project-context.md` is stale on re-init behavior.** Lines ~86 and ~123 claim merge-not-overwrite / "template improvements don't reach existing users" — contradicted by the shipped template-propagation change (and already corrected in customer-facing `configurability.mdx:143`).
- [OBSERVED] **No manual "last updated" date on docs pages** — only `sitemap.ts` (automatic). The user's referenced last-updated line needs a concrete pointer (OQ5).

### Test Infrastructure
- `capture-state.test.ts` (`tests/utils/`) — deleted in full.
- `capture-marker.test.ts` — arming cases at :215/:229 (`armed:false`), :262/:274/:286 (`armed:true`). Re-express in `enabled` terms; the `armed:true` + abstain → not-blocked case (:274) is A033 and must survive.
- `artifact.test.ts` — the "capture gate — self-arming flip (Phase 2)" describe block (:371) with `armProject()`/`isProjectArmed()` helpers writing `capture.json` directly (:386–404), and cases A031 (:408), A030 (:423), A032 (:432), A035 (:442), A036 (:452). The helpers and A031/A034-style cases are deleted; A030/A032/A035/A036 are re-expressed to drive enablement from config instead of a written `capture.json`.
- New coverage needed: flag on/off/absent enablement, the no-test-command carve-out (including surface-only), re-init flag preservation, and the dogfood block (AC10).

## For AnaPlan

### Structural Analog
**`packages/cli/src/commands/init/anaJsonSchema.ts` + `state.ts` (`createAnaJson` / `preserveUserState`)** for the config flag — the existing user-owned fields (`mergeStrategy` as a `z.enum`, `artifactBranch`, `branchPrefix`) are the exact structural pattern for adding `captureGate` as a typed, init-written, re-init-preserved enum field. Follow `mergeStrategy` end-to-end: schema enum → written in `createAnaJson` → preserved in `preserveUserState`.

### Relevant Code Paths
- `packages/cli/src/utils/capture-state.ts` — delete in full.
- `packages/cli/src/utils/capture-marker.ts:461–471` — `evaluateCaptureGate`, rename input `armed → enabled`, block logic untouched.
- `packages/cli/src/commands/artifact.ts:25–26, 745–833, 989, 1027–1039, 1188, 1397, 1438–1448, 1618` — remove arming plumbing, derive `enabled` from config + carve-out.
- `packages/cli/src/commands/init/anaJsonSchema.ts` (~:66 top-level object) — declare the typed flag.
- `packages/cli/src/commands/init/state.ts:417` (`createAnaJson`, return ~:560), `:696` (`preserveUserState`) — write + preserve.
- `packages/cli/src/commands/test.ts:90–91` — the resolver the carve-out mirrors.
- `packages/cli/src/commands/work.ts:320` (`printHumanReadable`) — status readout.
- `.ana/plans/completed/captured-test-evidence/contract.yaml:201–251` (A030–A036) — re-express + re-seal.
- `website/content/docs/guides/configurability.mdx:7–39, 61–78` — ana.json reference + new flag.
- `.ana/context/project-context.md:86, 123` — stale re-init prose.
- `CHANGELOG.md:8–12` (remove entry), footer compare link.

### Patterns to Follow
- Config flag: mirror `mergeStrategy` (anaJsonSchema.ts enum + state.ts write/preserve) — not a hand-rolled record key.
- Undefined-safe config read: `absent = off` must be the default at the read site, the same fail-safe posture the deleted `isArmed` had (missing → warn-mode, never throw).
- Gate input swap: keep `evaluateCaptureGate`'s signature shape identical; only the field name and its derivation change.

### Known Gotchas
- The carve-out must check **any** resolvable test command (top-level OR surface), not just `commands.test` — surface-only configs are the trap.
- `.passthrough()` on `AnaJsonSchema` will silently tolerate an undeclared flag — declare it explicitly so it is validated and visible.
- Do not write `on` over a user's explicit `off` on re-init (AC5).
- Do not add a CHANGELOG entry for this work; the changelog changes only at version bump (AC14).
- The dogfood block is the live regression test for the whole scope (AC10) — treat a failing dogfood block as a release blocker, not a flaky test.

### Things to Investigate
- OQ2: the re-init auto-enable founder decision (the one genuine product call).
- OQ4: finalize the A030–A036 delete/re-express/add split and re-seal.
- OQ5: confirm whether any AnaDocs page renders a manual last-updated date, or whether that is a no-op.
- OQ6: cost of binding the verify-report sealed account to a new assertion; split only if it balloons.
- Whether `evaluateCaptureGate`'s renamed `enabled` input warrants also renaming `CaptureGateResult`/related doc comments for "stranger can extend it" clarity (the JSDoc currently narrates Phase 1/Phase 2 arming — update the prose so the file reads correctly post-arming).
