# Scope: Template Propagation — Lock-Stock Overwrite of Machine-Owned Templates on Re-init

**Created by:** Ana
**Date:** 2026-06-05

## Intent

**The disease, in one sentence:** machine-owned template content (agent definitions, CLAUDE.md) can never reach existing customers, because re-init conservatively skips every file that already exists — it cannot tell an untouched stock template from a user-customized one, so it preserves all of them and refreshes none.

Today CLI code and templates propagate on two different channels. CLI code (gates, commands) ships on `npm update`. Templates ship only on a *fresh* `ana init` — re-init skips them (`copyAgentFiles` skip-if-exists at `assets.ts:264-268`; `copyCodexAgentFiles` `.md` `:617` + `.agent.toml` `:626`; `copyClaudeMd` `:289-292`). So for the entire installed base, templates effectively never propagate. Project-context's own merge-not-overwrite section states this defect plainly: "template improvements don't reach existing users."

This is the hard prerequisite the **captured-test-evidence** scope depends on: that scope places a "run tests via `ana test`" instruction in the agent templates and *relies on those templates propagating*. Without this fix, that instruction reaches no existing customer and the capture gate stays permanently warn-mode for the install base.

**The fix (decided with the founder):** re-init **overwrites** the agent templates and CLAUDE.md from the CLI's stock version, every time, unconditionally. The agent templates are git-tracked (confirmed) — overwrite is not destruction; a customer's prior version is one `git checkout` away. With a docs update, overwrite beats refresh-if-unmodified: it is simpler (no preserve fork, no provenance driving behavior) and it eliminates the stale-template-vs-new-CLI breakage class entirely — **templates always match the running CLI**, so a forked template can never silently drift out of compatibility. A best-effort warning points an editing customer at git when their file differed from stock.

This is the general fix for the propagation class, not a one-off for one instruction: it is how all machine-owned template content should reach the install base.

## Complexity Assessment

- **Kind:** fix
- **Size:** medium
- **Surface:** cross-surface
- **Surface note:** substantive engineering is entirely `packages/cli`; one docs-content file in `website/` is also edited (`configurability.mdx`)
- **Files affected:**
  - `packages/cli/src/commands/init/assets.ts` — `copyAgentFiles` (`:258`), `copyCodexAgentFiles` (`:612`), `copyClaudeMd` (`:285`): remove the skip-if-exists guard; overwrite always; atomic per-file write; best-effort shipped-hash edit-detection → targeted warning.
  - `packages/cli/src/commands/init/` — shipped-hash provenance for the warn-on-edited signal (storage location is Plan's call; warn-only ⇒ best-effort; see Open Questions). New small helper or extension of the existing hash-verify path (`copyAndVerifyFile`, `assets.ts:130`).
  - `packages/cli/src/commands/init/index.ts` — thread overwrite warnings into init output (the existing `warnings` channel → `displaySuccessMessage`, `state.ts:1052-1063`).
  - `packages/cli/src/utils/update-check.ts` — §3.2 sharpen the existing `projectMismatch` nudge copy (`:215-219`, rendered at `work.ts:301`); §3.3 export a clean, undefined-safe version-currency signal built on `getProjectAnaVersion` (`:157`) + `isNewerVersion` (`:44-60`).
  - `website/content/docs/guides/configurability.mdx` — `:141-145` (the agent-edits-persist promise being reversed) + the preserve list (`~:209-229`).
  - `CHANGELOG.md` — record the behavior reversal.
  - `tests/` (CLI) — re-init overwrite, atomic write, warn-on-edited, **full preserve-contract regression guard**, currency-signal helper.
- **Blast radius:** **High — re-init is run by every customer, and this changes a long-standing preserve behavior.** Mitigated by surgical scoping: only the agent files + CLAUDE.md become overwrite-always; *every other* preserved item (context/, plans, proof chain, learn/, skills Rules/Gotchas/Examples, ana.json user fields) must remain untouched, asserted by a regression test. Git is the recovery path for overwritten edits; the warning + docs make that explicit.
- **Estimated effort:** 1.5–2.5 days. The overwrite + atomic-write + warn is small; the bulk is the preserve-contract regression test and the docs/changelog reversal done carefully.
- **Multi-phase:** no

## Approach

**Lock-stock overwrite, always.** Re-init writes the CLI's stock agent templates and CLAUDE.md straight over whatever is in the live tree, unconditionally — removing the skip-if-exists guard for exactly these files. Because the files are git-tracked, overwrite is recoverable, not destructive; and because they always come from the running CLI's stock, a forked template can never drift out of CLI compatibility unseen. This *removes the cause* (the conservative skip) rather than adding machinery to manage around it.

Whole-file overwrite makes section-ownership **fully moot**: there are no machine/human sub-sections, no `replaceDetectedSection`, no collision with the example `## Intent`/`## Approach` headings embedded in the agent prose. The skills mechanism is dropped entirely from this design — only its *philosophy* (machine-owned content refreshes) survives, applied at whole-file granularity.

**Each harness tree writes its own stock.** The `.claude` and `.codex` trees are **not** byte-identical — `ana-learn.md` genuinely diverges by 15 lines (Claude `skills:` frontmatter vs Codex "skills baked at `ana init`"); the other five differ only by frontmatter. Overwrite reads each file from *its own* tree's stock template and writes it to *that* tree. The two are never assumed identical and one body is never written to both.

**Warn on overwrite-of-edited (best-effort).** When an overwritten file differed from what we last shipped, init emits a targeted line: *"ana-build.md had local edits — overwritten with the vX stock template; recover your prior version from git if needed."* A cheap stored shipped-hash detects the edit; it drives the *warning*, not the action, so a missed detection is harmless (the customer still has git). If clean provenance storage isn't cheap, the fallback is a single generic *"templates refreshed — recover customizations from git"* line on every re-init. Prefer the targeted form if cheap.

**Atomic per-file writes.** The overwrite happens post-swap, outside the atomic `.ana/` rename, directly into the live `.claude`/`.codex`/root tree (same structural position as today's skill refresh, `index.ts:161-168`). Each file write must be atomic (temp-then-rename) so a crash mid-refresh never leaves a half-written or truncated template.

**Nudge + currency signal — reuse, don't rebuild.** The version-staleness nudge already exists (`update-check.ts`: `isNewerVersion`, `getProjectAnaVersion`, `projectMismatch`; rendered at `work.ts:301`). §3.2 is verify-and-sharpen: make the stale-version customer reliably told to run `ana init`, with copy that conveys templates get refreshed. §3.3 exposes a clean undefined-safe "is this project on/after version X" helper on those same utilities for the capture gate to consume — **no gate is built here**.

## Acceptance Criteria

- **AC1:** Re-init overwrites all six agent `.md` files from each harness tree's own stock template, unconditionally, every time — the skip-if-exists guard is removed for these files. Both `.claude` and `.codex` trees are refreshed; Codex `.agent.toml` sidecars are overwritten too. Each file is written from ITS OWN tree's stock (the `ana-learn.md` per-harness divergence is preserved; one body is never cross-written to both trees).
- **AC2:** CLAUDE.md is overwritten from stock on re-init, re-applying project-name and stack interpolation from the current scan. AGENTS.md is explicitly **not** in scope (it remains skip-if-exists) — tracked as a follow-up (see Open Questions / Rejected).
- **AC3:** Every overwrite is an atomic per-file write (temp-then-rename); a crash mid-refresh never leaves a half-written or truncated template in the live tree.
- **AC4:** When an overwritten file differs from the last-shipped stock, init emits a targeted per-file warning naming the file, the stock version, and git recovery. Detection is best-effort via a cheap stored shipped-hash; with no baseline available, init falls back to a single generic "templates refreshed — recover customizations from git" line. The warning never blocks init.
- **AC5:** The overwrite is surgically scoped — **no other preserved content regresses.** `context/`, `plans/active/`, `plans/completed/`, `proof_chain.json` + `PROOF_CHAIN.md`, `learn/`, `skills/` (Rules/Gotchas/Examples), and ana.json user fields all still survive re-init unchanged. A regression test asserts the full preserve contract holds.
- **AC6:** Fresh install is unchanged — nothing is overwritten and no warning fires (no prior files exist). Claude-only projects (no `.codex` tree) refresh only the trees that are present.
- **AC7 (§3.2):** The existing `update-check.ts` version-mismatch nudge reliably tells a stale-version customer to run `ana init`, with copy that conveys re-init refreshes templates. The existing path (work status; doctor) is verified to fire; only the message is sharpened — the mechanism is not rebuilt.
- **AC8 (§3.3):** A clean, undefined-safe version-currency signal is exposed (built on `getProjectAnaVersion` + `isNewerVersion`) answering "is this project on/after version X" for the capture gate to consume. It is undefined-safe for missing / `0.0.0` / unparseable `anaVersion`. **No gate is built in this scope.**
- **AC9 (docs):** `configurability.mdx` no longer promises agent-file edits persist across re-init; it documents that re-init overwrites the agent templates and CLAUDE.md (warning on edited files, recover via git), and the preserve list is corrected. CHANGELOG records the behavior reversal.

## Edge Cases & Risks

1. **Reversing a documented promise — the central product risk.** `configurability.mdx:141-145` currently tells customers their agent-file edits persist across re-init. This scope reverses that. The docs update is **in-scope and mandatory** (AC9), the warning points to git, and the files are git-tracked — but a customer who relied on the documented promise will be surprised. This is a deliberate product-direction change, not an oversight; flag it loudly in the changelog.
2. **Blast radius on the preserve contract.** The riskiest part is touching re-init's preserve behavior. The overwrite must be surgical — agent files + CLAUDE.md only. AC5's regression test (assert every other preserved item survives) is load-bearing, not padding.
3. **Crash mid-refresh.** Overwrites run post-swap in the live tree, outside the atomic `.ana/` rename. Atomic per-file writes (AC3) keep an interrupted refresh from leaving a corrupt template.
4. **Per-harness divergence.** `ana-learn.md` differs by 15 real lines between trees; never write one body to both. Each tree's stock is its own source (AC1).
5. **Codex `.agent.toml` carries tunable config** (model, `sandbox_mode`, reasoning effort). Overwrite replaces it with stock too — consistent with the decision (git-recoverable, warned). Confirm this is intended for the `.toml` sidecars, not just the `.md` bodies.
6. **CLAUDE.md re-interpolation.** Overwriting CLAUDE.md re-applies project-name/stack from the current scan — desirable (refreshes the stack line), but it means a customer's prose edits are replaced (git-recoverable, warned).
7. **No baseline on first re-init after this ships.** The very first re-init after the feature lands has no stored shipped-hash, so per-file edit detection can't fire — fall back to the generic warning (AC4). Warn-only ⇒ safe.
8. **Version downgrade / pinned CLI (`anaVersion` > installed CLI).** Overwrite writes the *installed* CLI's stock (possibly older). This is correct and is in fact the virtue of the approach: templates always match the running CLI. The existing nudge informs; nothing hard-breaks.
9. **Fresh install / partial install.** Fresh install writes stock with nothing to overwrite and no warning (AC6). A partial install (`.claude` present, `.ana` missing) follows the same overwrite path — still safe (git-recoverable).
10. **Dogfood vs product.** The fix lives in `templates/` + the init/copy logic in `src/` — it ships to all customers. Do **not** confuse it with the team's own root `.claude`/`.codex` dogfood. Edits go to `templates/.claude/agents/*` and `templates/.codex/agents/*`, not the root dogfood files.

## Rejected Approaches

| Proposal | Why not |
|----------|---------|
| **Refresh-if-unmodified (provenance drives behavior)** | The direction validation was initially heading; reversed deliberately. Heavier (preserve fork + provenance gating behavior) and it *keeps* the stale-template-vs-CLI drift class: a forked template can silently fall out of compatibility. Overwrite removes the cause — templates always match the CLI. Provenance survives only as a best-effort *warning* signal, not a behavior gate. |
| **Skills section-ownership mechanism** (`replaceDetectedSection`, machine/human sub-sections) | Doesn't apply: agent files are monolithic operating-instruction prose with no machine sub-section, and the example `## Intent`/`## Approach` headings embedded in the body would collide with section markers. Whole-file overwrite makes sub-section ownership entirely moot. |
| **Status quo (skip-if-exists)** | This *is* the defect — it freezes the install base on whatever templates shipped at their first `ana init`. |
| **Cross-write one body to both harness trees** | False economy — `ana-learn.md` genuinely diverges per harness (Claude `skills:` frontmatter vs Codex "baked at `ana init`"). Each tree writes its own stock. |
| **Build the capture gate / arming logic here** | Out of bounds — that's the captured-test-evidence scope's. Expose the version-currency signal (§3.3); stop there. |
| **Bundle AGENTS.md into this scope** | AGENTS.md is *generated*, not copied — its refresh is re-generation and its edit-detection differs. Deferred as an explicitly-tracked follow-up to keep blast radius tight and this scope on the capture critical path. Build the overwrite-and-warn scaffolding general enough (shared atomic write + shipped-hash warn; copy-vs-regen the only difference) that adding AGENTS.md later is cheap. |
| **Rebuild the staleness nudge / currency signal** | Already exists in `update-check.ts` (`isNewerVersion`, `getProjectAnaVersion`, `projectMismatch`, rendered at `work.ts:301`). §3.2 is verify-and-sharpen; §3.3 is a thin undefined-safe helper on top. Don't rebuild. |

## Open Questions

For AnaPlan (design judgment, not founder decisions):

- **Shipped-hash provenance storage.** Where the last-shipped hash lives so it (a) survives re-init and (b) is crash-safe. Candidates: a preserved path inside the atomic `.ana/` tree (must be added to the preserve set), an `ana.json` field, or shipping a historical stock-hash set with the CLI (no per-project state). Warn-only ⇒ best-effort is acceptable; if no clean cheap option exists, ship the generic warning (AC4 fallback) and skip per-file detection.
- **Warning copy + plumbing.** Exact wording and whether it threads through the existing `warnings` array (`displaySuccessMessage`) or prints inline at overwrite time.
- **Currency-signal shape.** Whether §3.3 is a new exported helper in `update-check.ts` (e.g. `isProjectOnOrAfter(version)`) or a thin wrapper, and the exact name/signature the capture scope imports.

## Exploration Findings

### Patterns Discovered
- `assets.ts:258-273` `copyAgentFiles` — loops `AGENT_FILES`, skips on `fileExists(destPath)` (`:264-268`). The skip to remove. Fresh and re-init both call it (`createClaudeConfiguration:200` fresh / `:241` merge).
- `assets.ts:612-630` `copyCodexAgentFiles` — skips `.md` (`:617`) and `.agent.toml` (`:626`). Same change, per tree.
- `assets.ts:285-311` `copyClaudeMd` — early-returns if exists (`:289-292`); does project-name + stack interpolation. Overwrite re-interpolates.
- `assets.ts:130-155` `copyAndVerifyFile` — SHA-256 hash-verified copy already used for agent files. The hash plumbing here can likely double as the shipped-hash source and the basis for temp-then-rename atomic write.
- `skills.ts:118` `scaffoldAndSeedSkills` — the structural analog: runs **post-swap on the live tree**, processes per-file, writes back. The overwrite mirrors its position and per-file shape, minus the read-existing/preserve fork.
- `index.ts:131-138` atomic `.ana/` swap; `:161` skills refresh, `:165` `createClaudeConfiguration(cwd)`, `:168` `createCodexConfiguration(cwd)` — all post-swap, against the **live tree** (cwd), not the temp dir.

### Constraints Discovered
- [TYPE-VERIFIED] Re-init skips existing agent files / CLAUDE.md — `copyAgentFiles` (`assets.ts:264-268`), `copyCodexAgentFiles` (`:617`,`:626`), `copyClaudeMd` (`:289-292`). `generateAgentsMd` (`:325`) and the primary-package AGENTS.md (`:707`) also skip-if-exists.
- [TYPE-VERIFIED] Harness trees are **separate** template sources. Bodies are identical-modulo-frontmatter for 5 of 6 agents, but `ana-learn.md` diverges by 15 real lines. Codex `.md` has no frontmatter (uses `.agent.toml` sidecar). Refresh each from its own tree. *(Corrects the handoff's "byte-identical" claim and the capture scope's "[TYPE-VERIFIED] bodies byte-identical" — the latter holds only for the 4 files that scope touches.)*
- [TYPE-VERIFIED] Agent templates are monolithic operating-instruction prose with no machine/human sub-section; embedded `## Intent`/`## Approach` headings are example scope content. Section-ownership cannot apply.
- [TYPE-VERIFIED] Agent-file customization is a **documented, supported** workflow — `configurability.mdx:141-145` ("the six agent files… are yours to edit… edits persist across re-init"); preserve list `~:209-229` lists agent files + CLAUDE.md/AGENTS.md. This promise is what the scope reverses.
- [TYPE-VERIFIED] `preserveUserState` (`state.ts:696-873`) preserves context/, ana.json (6 mechanical fields refresh), setup-progress (conditional), proof chain, plans/completed + active, learn/, skills/. It does **not** touch agent files or CLAUDE.md — those are written post-swap by assets.ts. Nothing here may regress (AC5).
- [TYPE-VERIFIED] Version-staleness nudge already exists — `update-check.ts` `isNewerVersion` (`:44-60`), `getProjectAnaVersion` (`:157`), `projectMismatch` (`:215-219`); `work.ts:301` renders "ℹ Project initialized with vX (current CLI: vY). Run: ana init". `doctor.ts:132-150` also reports it.
- [TYPE-VERIFIED] Init atomicity — temp build (`index.ts:99-101`) → atomic swap (`:131-138`) → stale-`.ana.old-*` recovery (`preflight.ts:61-82`) + rollback (`index.ts:204-226`). Agent/skill writes happen **after** the swap, against the live tree — so per-file write-atomicity is the relevant guard, not the `.ana` swap.
- [TYPE-VERIFIED] `InitState` already distinguishes `'upgrade'` (anaVersion ≠ cliVersion) vs `'reinit'` (`preflight.ts:115-118`) — a hook the overwrite/warn can use.

### Test Infrastructure
- Vitest; fixtures under `tests/`. **Test count must not decrease** (CI 3 OS × 2 Node). Add: re-init overwrite (both trees, own-stock), atomic write, warn-on-edited (with and without baseline), the **full preserve-contract regression guard** (AC5 — the load-bearing one), and the currency-signal helper. Pre-commit runs `tsc --noEmit` (build uses SWC) — thread types fully.

## For AnaPlan

### Structural Analog
- `scaffoldAndSeedSkills` (`skills.ts:118`) — same structural position (post-swap, live tree, per-file, write-back) and the closest existing shape. The overwrite is a *simpler* sibling: no read-existing/preserve fork. Mirror its placement in `index.ts:161-168`; the functions to actually change are `copyAgentFiles`/`copyCodexAgentFiles`/`copyClaudeMd` in `assets.ts`.

### Functional Analog
- The skills Detected-refresh is the functional kin (refresh machine content on re-init) — but read it to see what to **drop**: its section-merge (`replaceDetectedSection:432`) is explicitly NOT the model here.

### Relevant Code Paths
- `assets.ts:258` (`copyAgentFiles`) · `:612` (`copyCodexAgentFiles`) · `:285` (`copyClaudeMd`) · `:130` (`copyAndVerifyFile` — hash/atomic basis) · `index.ts:161-168` (post-swap call sites) · `state.ts:1052-1063` (warnings → `displaySuccessMessage`) · `update-check.ts:44-60,157,215-219` (nudge + currency signal) · `work.ts:301` (nudge render) · `preflight.ts:115-118` (`upgrade` vs `reinit`) · `website/content/docs/guides/configurability.mdx:141-145,209-229` (docs reversal).

### Patterns to Follow
- Atomic write: extend the `copyAndVerifyFile` hash-verify pattern to temp-then-rename for the overwrite.
- Warnings: flow through the existing preflight `warnings` array → `displaySuccessMessage`, consistent with current init output.
- Refresh each tree from its own stock; never cross-write bodies.

### Known Gotchas
- **Templates vs dogfood:** edit `templates/.claude/agents/*` and `templates/.codex/agents/*` (the product) — NOT the root `.claude`/`.codex` (our dogfood).
- Overwrites are post-swap, in the live tree, outside the atomic `.ana/` rename — per-file atomicity is the guard.
- AGENTS.md is generated, not copied — explicitly out of this scope; keep the scaffolding general so it's cheap to add later.
- Pre-commit `tsc --noEmit` vs SWC build — type errors fail only the hook; thread the warn/signal types everywhere.
- Test count must not decrease.

### Things to Investigate
- Shipped-hash provenance location (survive re-init + crash-safe) vs the generic-warning fallback — pick deliberately; warn-only ⇒ best-effort is fine.
- Whether `copyAndVerifyFile`'s existing hashing can double as the shipped-hash source.
- Confirm `.agent.toml` sidecars are meant to be overwritten too (they carry model/sandbox config).
- Confirm CLAUDE.md re-interpolation on overwrite is acceptable behavior.
- The exact `update-check.ts` currency-signal name/signature the capture scope will import.

## Dependency Relationship

**captured-test-evidence** assumes this scope lands first or in tandem; this is on its critical path. Once this ships, every customer who re-inits gets the `ana test` instruction — modified template or not — because overwrite is unconditional. That **eliminates the "customizer stuck without the instruction" edge** that refresh-if-unmodified would have left open.

**Interlock to carry back to the capture scope (not built here):** the one remaining brick-proofing window is a customer who updated the CLI but has not yet re-init'd. Marker-seen arming stays the most conservative signal for that window — fold this into the capture scope's arming decision. This scope's only obligations to that feature are: make re-init overwrite the templates (so the instruction propagates) and expose the version-currency signal (§3.3). It builds no gate.
