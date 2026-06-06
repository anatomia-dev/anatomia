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
  - `packages/cli/src/commands/init/assets.ts` — `copyAgentFiles` (`:258`) and `copyCodexAgentFiles` (`:612`): remove skip-if-exists for the agent **`.md` bodies only**; overwrite always; atomic per-file write; targeted shipped-hash edit-detection → per-file warning. **`copyCodexAgentFiles` must keep preserving the `.agent.toml` sidecars** (user config — see edge 5). `copyClaudeMd` (`:285`): overwrite always + atomic write, but **generic** (not per-file) warning — its interpolation defeats hash-comparison (edge 6).
  - `packages/cli/src/commands/init/` — the targeted warn-on-edited check for the agent `.md` files uses a **stateless, baked-in stock-hash set shipped with the CLI** (no per-project state, nothing added to the preserve set). See Open Questions.
  - `packages/cli/src/commands/init/index.ts` — thread overwrite warnings into init output (the existing `warnings` channel → `displaySuccessMessage`, `state.ts:1052-1063`).
  - `packages/cli/src/utils/update-check.ts` — §3.2 sharpen the existing `projectMismatch` nudge copy (`:215-219`, rendered at `work.ts:301`) so a stale-version customer is reliably told to run `ana init`. *(No version-currency signal — see Rejected; the capture feature chose marker-sealed arming, so nothing would consume it.)*
  - `website/content/docs/guides/configurability.mdx` — `:141-145` (the agent-edits-persist promise being reversed) + the preserve list (`~:209-229`).
  - `CHANGELOG.md` — record the behavior reversal.
  - `tests/` (CLI) — re-init overwrite (`.md` bodies), `.agent.toml` **preservation**, atomic write, warn-on-edited (targeted + generic), **full preserve-contract regression guard**, nudge copy.
- **Blast radius:** **High — re-init is run by every customer, and this changes a long-standing preserve behavior.** Mitigated by surgical scoping: only the agent files + CLAUDE.md become overwrite-always; *every other* preserved item (context/, plans, proof chain, learn/, skills Rules/Gotchas/Examples, ana.json user fields) must remain untouched, asserted by a regression test. Git is the recovery path for overwritten edits; the warning + docs make that explicit.
- **Estimated effort:** 1.5–2.5 days. The overwrite + atomic-write + warn is small; the bulk is the preserve-contract regression test and the docs/changelog reversal done carefully.
- **Multi-phase:** no

## Approach

**Lock-stock overwrite, always.** Re-init writes the CLI's stock agent templates and CLAUDE.md straight over whatever is in the live tree, unconditionally — removing the skip-if-exists guard for exactly these files. Because the files are git-tracked, overwrite is recoverable, not destructive; and because they always come from the running CLI's stock, a forked template can never drift out of CLI compatibility unseen. This *removes the cause* (the conservative skip) rather than adding machinery to manage around it.

Whole-file overwrite makes section-ownership **fully moot**: there are no machine/human sub-sections, no `replaceDetectedSection`, no collision with the example `## Intent`/`## Approach` headings embedded in the agent prose. The skills mechanism is dropped entirely from this design — only its *philosophy* (machine-owned content refreshes) survives, applied at whole-file granularity.

**Overwrite the `.md` bodies; preserve the `.agent.toml`.** Codex `.agent.toml` sidecars carry user-tunable configuration (model, `sandbox_mode`, reasoning effort) — that's user config, not machine-owned operating instructions, and the capture feature doesn't need it refreshed (the `ana test` instruction lives in the `.md`). Lock-stock overwriting it would reset a customer's model/sandbox tuning on every re-init. So the `.toml` is **preserved**, treated like ana.json user fields. If investigation shows the `.toml` also carries machine-owned fields that must track the CLI, it becomes a *selective-refresh* (mechanical fields refresh, user settings preserved) like ana.json — never a blunt overwrite.

**Each harness tree writes its own stock.** The `.claude` and `.codex` trees are **not** byte-identical — `ana-learn.md` genuinely diverges by 15 lines (Claude `skills:` frontmatter vs Codex "skills baked at `ana init`"); the other five differ only by frontmatter. Overwrite reads each file from *its own* tree's stock template and writes it to *that* tree. The two are never assumed identical and one body is never written to both.

**Warn on overwrite-of-edited — targeted for agent files, generic for CLAUDE.md.** Agent `.md` bodies are static and hash-comparable, so init emits a targeted line: *"ana-build.md had local edits — overwritten with the vX stock template; recover your prior version from git if needed."* Detection uses a **stateless baked-in stock-hash set** shipped with the CLI (no per-project state, nothing added to the preserve set); it drives the *warning*, not the action, so a missed detection is harmless (the customer still has git). **CLAUDE.md is different:** it's written with project-name/stack interpolated, so it never matches the raw stock template — a stock-hash check would report "you edited it" on *every* re-init, training customers to ignore the warning (including the real agent-file ones). So CLAUDE.md gets the **generic** *"templates refreshed — recover customizations from git"* line instead, where per-file detection isn't cheap.

**Atomic per-file writes.** The overwrite happens post-swap, outside the atomic `.ana/` rename, directly into the live `.claude`/`.codex`/root tree (same structural position as today's skill refresh, `index.ts:161-168`). Each file write must be atomic (temp-then-rename) so a crash mid-refresh never leaves a half-written or truncated template.

**Nudge — verify and sharpen, don't rebuild.** The version-staleness nudge already exists (`update-check.ts`: `isNewerVersion`, `getProjectAnaVersion`, `projectMismatch`; rendered at `work.ts:301`). §3.2 is verify-and-sharpen: make the stale-version customer reliably told to run `ana init`, with copy that conveys templates get refreshed. *(No version-currency signal is built — the capture feature chose marker-sealed arming, so nothing would consume one; building it now would be a dead export.)*

## Acceptance Criteria

- **AC1:** Re-init overwrites all six agent `.md` **bodies** from each harness tree's own stock template, unconditionally, every time — the skip-if-exists guard is removed for these files. Both `.claude` and `.codex` trees are refreshed. Each file is written from ITS OWN tree's stock (the `ana-learn.md` per-harness divergence is preserved; one body is never cross-written to both trees). **Codex `.agent.toml` sidecars are NOT overwritten — they are preserved (user config: model, `sandbox_mode`, reasoning effort), treated like ana.json user fields.** If investigation finds the `.toml` carries machine-owned fields that must track the CLI, those fields selective-refresh (ana.json-style) while user settings are preserved — never a blunt overwrite.
- **AC2:** CLAUDE.md is overwritten from stock on re-init, re-applying project-name and stack interpolation from the current scan. AGENTS.md is explicitly **not** in scope (it remains skip-if-exists) — tracked as a follow-up (see Open Questions / Rejected).
- **AC3:** Every overwrite is an atomic per-file write (temp-then-rename); a crash mid-refresh never leaves a half-written or truncated template in the live tree.
- **AC4:** Warn-on-edited is split by file type. For the agent `.md` bodies (static, hash-comparable): when an overwritten body differs from the last-shipped stock, init emits a **targeted per-file** warning naming the file, the stock version, and git recovery, using a **stateless baked-in stock-hash set** shipped with the CLI (no per-project state). For **CLAUDE.md** (interpolated, so never matches raw stock — a hash check would false-positive every re-init): init emits the **generic** "templates refreshed — recover customizations from git" line instead. The chosen scheme must NOT false-positive on CLAUDE.md. Warnings never block init.
- **AC5:** The overwrite is surgically scoped — **no other preserved content regresses.** `context/`, `plans/active/`, `plans/completed/`, `proof_chain.json` + `PROOF_CHAIN.md`, `learn/`, `skills/` (Rules/Gotchas/Examples), and ana.json user fields all still survive re-init unchanged. A regression test asserts the full preserve contract holds.
- **AC6:** Fresh install is unchanged — nothing is overwritten and no warning fires (no prior files exist). Claude-only projects (no `.codex` tree) refresh only the trees that are present.
- **AC7 (§3.2):** The existing `update-check.ts` version-mismatch nudge reliably tells a stale-version customer to run `ana init`, with copy that conveys re-init refreshes templates. The existing path (work status; doctor) is verified to fire; only the message is sharpened — the mechanism is not rebuilt.
- **AC8 (docs):** `configurability.mdx` no longer promises agent-file edits persist across re-init; it documents that re-init overwrites the agent `.md` bodies and CLAUDE.md (warning on edited files, recover via git), while noting the Codex `.agent.toml` config is preserved. The preserve list is corrected. CHANGELOG records the behavior reversal.

## Edge Cases & Risks

1. **Reversing a documented promise — the central product risk.** `configurability.mdx:141-145` currently tells customers their agent-file edits persist across re-init. This scope reverses that. The docs update is **in-scope and mandatory** (AC9), the warning points to git, and the files are git-tracked — but a customer who relied on the documented promise will be surprised. This is a deliberate product-direction change, not an oversight; flag it loudly in the changelog.
2. **Blast radius on the preserve contract.** The riskiest part is touching re-init's preserve behavior. The overwrite must be surgical — agent files + CLAUDE.md only. AC5's regression test (assert every other preserved item survives) is load-bearing, not padding.
3. **Crash mid-refresh.** Overwrites run post-swap in the live tree, outside the atomic `.ana/` rename. Atomic per-file writes (AC3) keep an interrupted refresh from leaving a corrupt template.
4. **Per-harness divergence.** `ana-learn.md` differs by 15 real lines between trees; never write one body to both. Each tree's stock is its own source (AC1).
5. **Codex `.agent.toml` is user config — preserve it, do NOT overwrite.** The `.toml` carries model, `sandbox_mode`, and reasoning-effort tuning. Blunt overwrite would reset a customer's tuning on every re-init — a regression. It is preserved like ana.json user fields (AC1). Investigate whether any `.toml` field is machine-owned and must track the CLI; if so, selective-refresh those fields ana.json-style while preserving user settings.
6. **CLAUDE.md re-interpolation breaks per-file edit-detection.** CLAUDE.md is written with project-name/stack interpolated, so it never equals the raw stock template — a stock-hash check would report "you edited it" on *every* re-init, training customers to ignore the warning (including the real agent-file ones). Resolution (AC4): targeted per-file warning for the agent `.md` files (static, hash-comparable); generic "recover from git" warning for CLAUDE.md. The provenance scheme must not false-positive on CLAUDE.md.
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
| **Build the capture gate / arming logic here** | Out of bounds — that's the captured-test-evidence scope's. This scope's only obligation to capture is overwriting the templates so the instruction propagates. |
| **Expose a version-currency signal (the old §3.3 / AC8)** | Cut. It was specced to feed version-keyed arming, which the capture feature rejected in favor of marker-sealed arming (AnaPlan confirmed, option 2a). With marker-seen arming nothing consumes a currency signal — it would be a dead export. Don't build the helper until a concrete consumer exists. |
| **Bundle AGENTS.md into this scope** | AGENTS.md is *generated*, not copied — its refresh is re-generation and its edit-detection differs. Deferred as an explicitly-tracked follow-up to keep blast radius tight and this scope on the capture critical path. Build the overwrite-and-warn scaffolding general enough (shared atomic write + shipped-hash warn; copy-vs-regen the only difference) that adding AGENTS.md later is cheap. |
| **Rebuild the staleness nudge** | Already exists in `update-check.ts` (`isNewerVersion`, `getProjectAnaVersion`, `projectMismatch`, rendered at `work.ts:301`). §3.2 is verify-and-sharpen only. Don't rebuild. |

## Open Questions

For AnaPlan (design judgment, not founder decisions):

- **Shipped-hash provenance for the agent-file warning.** The scope's recommended scheme is a **stateless baked-in stock-hash set** shipped with the CLI (the set of known prior stock hashes per agent file) — no per-project state, nothing added to the preserve set, and it can't false-positive on CLAUDE.md because CLAUDE.md isn't in the set. Confirm this is the cheapest correct option vs. a stored per-project hash; warn-only ⇒ best-effort, so if even the baked-in set isn't worth it, fall back to the generic warning for everything (AC4).
- **Codex `.agent.toml` — preserve vs selective-refresh.** Investigate whether any `.toml` field is machine-owned and must track the CLI. If all fields are user config → preserve wholesale (skip-if-exists stays for `.toml`). If some are machine-owned → selective-refresh those, preserve the rest (ana.json-style). Either way, never blunt-overwrite user model/sandbox settings.
- **Warning copy + plumbing.** Exact wording (targeted vs generic) and whether it threads through the existing `warnings` array (`displaySuccessMessage`) or prints inline at overwrite time.

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
- Vitest; fixtures under `tests/`. **Test count must not decrease** (CI 3 OS × 2 Node). Add: re-init overwrite of `.md` bodies (both trees, own-stock), **`.agent.toml` preservation** across re-init, atomic write, warn-on-edited (targeted for agent files, generic for CLAUDE.md; with and without a matching stock-hash), the **full preserve-contract regression guard** (AC5 — the load-bearing one), and the sharpened nudge copy. Pre-commit runs `tsc --noEmit` (build uses SWC) — thread types fully.

## For AnaPlan

### Structural Analog
- `scaffoldAndSeedSkills` (`skills.ts:118`) — same structural position (post-swap, live tree, per-file, write-back) and the closest existing shape. The overwrite is a *simpler* sibling: no read-existing/preserve fork. Mirror its placement in `index.ts:161-168`; the functions to actually change are `copyAgentFiles`/`copyCodexAgentFiles`/`copyClaudeMd` in `assets.ts`.

### Functional Analog
- The skills Detected-refresh is the functional kin (refresh machine content on re-init) — but read it to see what to **drop**: its section-merge (`replaceDetectedSection:432`) is explicitly NOT the model here.

### Relevant Code Paths
- `assets.ts:258` (`copyAgentFiles`, `.md` overwrite) · `:612` (`copyCodexAgentFiles` — `.md` overwrite, `.toml` **preserve**) · `:285` (`copyClaudeMd`, overwrite + generic warn) · `:130` (`copyAndVerifyFile` — hash/atomic basis) · `index.ts:161-168` (post-swap call sites) · `state.ts:1052-1063` (warnings → `displaySuccessMessage`) · `update-check.ts:215-219` + `work.ts:301` (nudge to sharpen) · `preflight.ts:115-118` (`upgrade` vs `reinit`) · `website/content/docs/guides/configurability.mdx:141-145,209-229` (docs reversal).

### Patterns to Follow
- Atomic write: extend the `copyAndVerifyFile` hash-verify pattern to temp-then-rename for the overwrite.
- Warnings: flow through the existing preflight `warnings` array → `displaySuccessMessage`, consistent with current init output.
- Refresh each tree from its own stock; never cross-write bodies.

### Known Gotchas
- **Templates vs dogfood:** edit `templates/.claude/agents/*` and `templates/.codex/agents/*` (the product) — NOT the root `.claude`/`.codex` (our dogfood).
- Overwrites are post-swap, in the live tree, outside the atomic `.ana/` rename — per-file atomicity is the guard.
- **Overwrite `.md` bodies only; the Codex `.agent.toml` is user config — preserve it.** Don't let a "refresh the whole `.codex/agents/` dir" instinct clobber model/sandbox tuning.
- **CLAUDE.md is interpolated** — don't apply the agent-file stock-hash check to it (false-positives every re-init); use the generic warning.
- AGENTS.md is generated, not copied — explicitly out of this scope; keep the scaffolding general so it's cheap to add later.
- Pre-commit `tsc --noEmit` vs SWC build — type errors fail only the hook; thread the warn/signal types everywhere.
- Test count must not decrease.

### Things to Investigate
- Baked-in stock-hash set vs stored per-project hash for the agent-file warning — confirm the cheapest correct option (the set must not include CLAUDE.md, so it can't false-positive on interpolation).
- Whether `copyAndVerifyFile`'s existing hashing can double as the stock-hash source / atomic-write basis.
- **Codex `.agent.toml`: preserve wholesale vs selective-refresh** — does any field need to track the CLI? Default to preserve; never blunt-overwrite user model/sandbox settings.
- Confirm CLAUDE.md re-interpolation on overwrite is acceptable (refreshes the stack line; prose edits go to git).

## Dependency Relationship

**captured-test-evidence** assumes this scope lands first or in tandem; this is on its critical path. Once this ships, every customer who re-inits gets the `ana test` instruction — modified template or not — because overwrite is unconditional. That **eliminates the "customizer stuck without the instruction" edge** that refresh-if-unmodified would have left open.

**Interlock with the capture scope (not built here):** the one remaining brick-proofing window is a customer who updated the CLI but has not yet re-init'd. The capture feature uses **marker-sealed arming** (AnaPlan confirmed, option 2a) — the most conservative signal for that window — so this scope exposes **no** version-currency signal (it would be a dead export). This scope's **only** obligation to the capture feature is: make re-init overwrite the agent `.md` bodies so the `ana test` instruction propagates. It builds no gate and no arming signal.
