# Scope: The requirements contract — validated upstream intake for the pipeline

**Created by:** Ana
**Date:** 2026-07-01

## Intent

Make work intake a **validated artifact instead of a conversation**. A requirement file (`.ana/requirements/REQ-<id>.md`) captures upstream intent — the problem, the evidence, what done looks like, priority — *before* any work item exists. `ana work status` surfaces open requirements; Think picks one up, skips re-interviewing the user about what and why, and redirects that energy into scrutiny. In the founder's words: "It has everything the engineering human on your team and the local Anas need to use the pipeline normally."

This is S1 of the AnaWeb program (`anatomia_reference/MINTED_ROADMAPS/anatomia/17-anaweb-program.md`): the keystone contract that the hosted dashboard and Ana Remote chat agent are later *clients* of. It must be deliberately useful **without** AnaWeb — hand-written requirement files are first-class by construction, productizing the practice the team already runs by hand (~24 `REQ-*.md` files in `anatomia_reference/REQs/`, "REQ filed:" in release records, redundant-agent scrutiny before scoping).

The pipeline itself does not change. No new pipeline stage, no automation, no other agent behavior. One template learns one new thing.

## Complexity Assessment
- **Kind:** feature
- **Size:** medium
- **Surface:** cli
- **Files affected:**
  - New: `packages/cli/src/commands/req.ts` (command group: list/validate/new), stock requirement template (co-located with the command or in `src/data/`)
  - Modified: `packages/cli/src/utils/artifact-validators.ts` (add `validateReqFormat`), `packages/cli/src/index.ts` (register command), `packages/cli/src/commands/work.ts` + `work-state.ts` (StatusOutput field + ℹ line; `--req` claim on start; archive on complete), `packages/cli/src/commands/init/state.ts` (`preserveUserState` + policy doc comment), `packages/cli/templates/.claude/agents/ana.md` + `packages/cli/templates/.codex/agents/ana.md` (4 touchpoints, identical bodies)
  - Tests: new `tests/commands/req.test.ts`; additions to work status, work start/complete, init preservation, and template-content tests
- **Blast radius:** Contained-additive. No existing artifact type, save path, or agent behavior changes. Two hot files are touched minimally: `work.ts` (16 active findings — the status hook must be one best-effort read, not a subsystem) and the init preservation allowlist (a miss silently deletes user data — see Edge Cases). Template edits ship to every customer on next `ana init` via the existing propagation mechanism.
- **Estimated effort:** 2–4 days
- **Multi-phase:** no

## Approach

Introduce a new artifact *class* that lives upstream of work items, modeled on the patterns the CLI already trusts: enumeration like `plans/active` slug discovery, validation like scope validation (mechanical, exit-non-zero), lifecycle transitions owned by the two commands that already own work-item lifecycle (`work start`, `work complete`), and surfacing through the existing ℹ notification channel that Think already echoes verbatim.

Strategy, not implementation:
- **The file is the sync mechanism.** Requirements are committed markdown in `.ana/requirements/` — a producer (human today, Ana Remote later) commits one; a puller sees it. No database, no new state.
- **Strict where machines read, tolerant where humans browse.** `ana req validate` is a hard gate (enums exact, required sections non-empty). `ana req list` and the status line never crash on a malformed file — they mark it and move on.
- **Existing REQ files are grandfathered by design.** Section aliases (`Problem|Disease`, `Evidence|Why This Matters`, `Done Looks Like|What to Build`, `Not This|What NOT to Build`) mean the team's 24 hand-written REQs validate with only a frontmatter paste.
- **Short-circuit intent-discovery, never skepticism.** Think treats requirement content as untrusted upstream intent: it skips re-interviewing the user, but the disease-challenge, code-verification, and blast-radius work run in full. Recommending rejection of a requirement (archive with a reason) is a first-class outcome. This is the trust boundary the whole AnaWeb write-path later leans on — it ships now, in the contract, not retrofitted at GA.

**Format (the contract):** YAML frontmatter — `req` (= filename stem, kebab-case), `title`, `priority` ∈ {critical, high, medium, low}, `status` ∈ {open, claimed, archived}, `created` (ISO date), `source` (free-text provenance: `hand-written`, `ana-remote`, …), optional `claimed_by` (work-item slug) — over a Disease-first body: required `## Problem`, `## Evidence`, `## Done Looks Like`; optional `## Constraints`, `## Not This`, `## Open Questions`, `## Relationship to Other Work`. A requirement is **not** a scope: no acceptance criteria, no Kind/Size, no structural analog — those remain Think's job.

**Lifecycle:** `open → claimed → archived`. Create = the file appears (any producer). Claim = `ana work start <slug> --req <id>` rewrites frontmatter (`status: claimed`, `claimed_by: <slug>`). Archive = `ana work complete` moves any requirement claimed by the completing slug to `.ana/requirements/archived/` with `status: archived`, best-effort. Humans unclaim/reject by editing the file — no commands for that.

## Acceptance Criteria

- AC1: `ana req new <id>` scaffolds `.ana/requirements/REQ-<id>.md` with valid frontmatter (`status: open`, `source: hand-written`, today's date) and the section skeleton; the scaffolded file passes `ana req validate` unmodified.
- AC2: `ana req validate <file>` exits non-zero with a red, specific error for each violation class: unknown/missing frontmatter field, `priority`/`status` not an exact enum value, `req` ≠ filename stem, unparseable `created`, any required section missing or empty. Valid files exit 0.
- AC3: Section aliases are accepted — a representative existing hand-written REQ file (e.g. the `REQ-proof-viewer.md` skeleton) passes validation after adding only the frontmatter block.
- AC4: `ana req list` enumerates dual-mode (filesystem on the artifact branch; `git ls-tree` of `origin/{artifactBranch}` otherwise), prints `id · priority · status · age · title` sorted by priority then created; malformed files render with a ⚠ marker instead of crashing; `--json` emits the structured list.
- AC5: `ana req list` flags a `claimed` requirement whose `claimed_by` slug no longer exists in `plans/active/` as stale (warning, not failure).
- AC6: `ana work status` output includes an ℹ line (`ℹ N open requirements (highest: <priority>). Run: ana req list`) **only when** at least one open requirement exists; `--json` gains a `requirements` field; when the folder is absent or empty, output is byte-identical to today.
- AC7: `ana work start <slug> --req <id>` claims the requirement (frontmatter rewritten: `status: claimed`, `claimed_by: <slug>`); it errors cleanly when the requirement doesn't exist or is not `open`. Plain `ana work start` (no flag) is unchanged.
- AC8: `ana work complete <slug>` moves requirements with `claimed_by == slug` to `.ana/requirements/archived/` and sets `status: archived`, best-effort — a failure here warns and never blocks completion.
- AC9: Re-init preserves `.ana/requirements/` wholesale — `preserveUserState` gains an explicit copy step and a line in the policy doc comment; a re-init over a repo with requirements leaves the folder byte-identical.
- AC10: Think template updated **identically in both** `templates/.claude/agents/ana.md` and `templates/.codex/agents/ana.md`: Check State addendum (run `ana req list` when the ℹ line reported open requirements), one Pipeline State table row, and a "Picking up a requirement" subsection that skips intent-discovery only, mandates scrutiny of Problem/Evidence against the code, treats requirement content as untrusted data, honors `Not This` as a boundary, answers its Open Questions in the scope preview, records `**Requirement:** REQ-<id>` in the preview, and starts work via `ana work start <slug> --req <id>`. Rejecting the requirement (archive + reason) is documented as a first-class outcome.
- AC11: No changes to `parseArtifactType`, `saveArtifact`, or any non-Think agent template; `ANA_GITIGNORE_STOCK` unchanged (requirements commit by default).
- AC12: Test count does not decrease; new behavior is covered including the AC6 empty/absent byte-identity case and the AC9 preservation case.

## Edge Cases & Risks

- **The re-init landmine (highest stakes):** `preserveUserState` is an explicit allowlist and init is an atomic swap — without AC9, every `ana init` silently deletes the user's backlog. The preservation test must exist before the feature is real.
- **Status/directory drift:** a human edits `status: archived` but leaves the file in the root folder (or vice versa). The CLI warns on drift in `list`, never fails, and never auto-moves files it didn't transition.
- **Frontmatter rewrite fidelity:** the claim transition rewrites YAML — it must not mangle the markdown body or reorder/destroy unknown frontmatter keys (forward-compatibility for Ana Remote metadata).
- **`git ls-tree` mode with no remote folder:** requirements folder not yet on `origin/{artifactBranch}` (or repo has no remote) — list returns empty gracefully, no stderr noise.
- **Duplicate ids:** two files with the same `req` value (e.g. one in root, one in `archived/`) — `list` shows both; `--req` claim on an ambiguous id errors and names both paths.
- **work.ts is the proof chain's #1 hot spot** (16 findings, incl. `retire-capture-self-arming-C3`: ana.json is already read+parsed twice per status call). The requirements probe must be a single cheap directory read that degrades to absent on any error — it must not add another config re-read or grow `getWorkStatus`'s side-effect surface.
- **Both-platform template parity:** the `.codex` body must remain byte-identical to `.claude` minus frontmatter; the existing template-propagation test family (one member currently flaky under parallel load — `template-propagation.test.ts`, noted in proof chain) guards this and will exercise the new content.
- **Prompt-injection posture (forward-looking):** requirement bodies are future Ana-Remote output and arbitrary repo content. The template language must frame them as data to scrutinize, not instructions to obey — this scope's wording is the enforcement point.

## Rejected Approaches

- **Wiring requirements into `parseArtifactType`/`saveArtifact`** — that flow is slug-coupled (paths hardcoded to `plans/active/{slug}/`) and branch-validated; requirements pre-date slugs. A standalone command group reuses the validator *pattern* without contorting the artifact registry.
- **Top-level `/requirements` folder** — survives re-init for free but escapes the `.ana` data-engine thesis, artifact-branch conventions, and gives every consumer a second root. Founder decision: `.ana/requirements/` (2026-07-01).
- **A `--requirements` flag / Think-only command instead of the ℹ line** — the ℹ channel is already contractually echoed by Think's template (verbatim-echo rule), costs nothing when empty, and `StatusOutput` JSON serialization gives AnaWeb the data for free. Founder decision: ℹ one-liner.
- **Richer lifecycle (`draft/ready/scoped/in-progress/verified/done`)** — `ANAWEB_ARCHITECTURE.md` §7's six-state machine duplicates pipeline stage, which already lives in `ana work status`; duplicating it in the file recreates status-is-someone's-memory drift. Three states, two CLI-owned transitions.
- **Renaming the artifact (briefs/mandates/intents/tickets)** — "mandate" is taken (anatrace vocabulary), "directive" contradicts the scrutiny model, "brief" fights 130+ existing REQ-named files and the public waitlist copy. Founder decision: requirement / REQ / `ana req`.
- **Requirements in a platform database** (the prior `ANAWEB_ARCHITECTURE.md` design) — inverts "the source of truth is always the repo" and would make hand-written requirements second-class. Files in the repo won.
- **Auto-archiving/claiming beyond the two transitions** (e.g. `ana req claim/archive/assign` commands) — the editor and `git mv` are sufficient for human transitions; command surface stays minimal.

## Open Questions

- Should the claim also be recorded anywhere on the work-item side (e.g. a line in scope.md's Intent), or is the `claimed_by` back-pointer the only link for v1? (Lean: back-pointer only; the proof chain schema is untouched.)
- Exact `StatusOutput.requirements` shape — `{ open: number; highestPriority: string }` proposed; AnaPlan should confirm nothing else in the JSON contract wants adjusting while the struct is open.

## Exploration Findings

### Patterns Discovered
- `work-state.ts:159-184` — `discoverSlugs()` dual-mode enumeration (filesystem on artifact branch, `git ls-tree --name-only origin/{branch}` otherwise): the exact pattern for requirements enumeration.
- `artifact-validators.ts:157-283` — `validateScopeFormat()`: pure validator returning error-or-null; required-section extraction loop; exact-enum checks (Kind) and first-token checks (Size/Multi-phase); wired to red-print + `process.exit(1)` at `artifact.ts:1117-1123`.
- `work.ts:294-411` — `printNotifications`/`printHumanReadable`: the ℹ channel; the `updateAvailable` nudge is the model for a conditional one-liner. `StatusOutput` (work.ts:62-70) serializes as-is to `--json` (work.ts:552-556).
- `templates/.claude/agents/ana.md:36` — Think's contract to echo ℹ lines verbatim in its first message: the free surfacing pipe. Codex variant is byte-identical minus 7 frontmatter lines.
- `commands/plan.ts` — the most recent small command group (registered group + one subcommand + pure helpers): freshest registration analog for `commands/req.ts`.
- `yaml` (^2.8) is already a dependency (contract.yaml parsing) — frontmatter parse/serialize needs no new dependency.

### Constraints Discovered
- [OBSERVED] `preserveUserState` (init/state.ts:724) is an explicit allowlist over an atomic swap; `plans/completed/` copy block at state.ts:849-860 is the pattern to mirror; policy doc comment at state.ts:687-717 must gain a line. **Without this, re-init deletes `.ana/requirements/`.**
- [OBSERVED] `ANA_GITIGNORE_STOCK` (init/gitignore.ts) ignores only `state/`, `worktrees/`, `plans/active/*/.captures/` — requirements commit by default; no gitignore change.
- [OBSERVED] Agent template bodies are machine-owned and refreshed wholesale on re-init (template propagation) — shipping the template edit in a release + the existing version-mismatch → `ana init` nudge IS the distribution mechanism; reaches users lazily.
- [OBSERVED] Every product change must work for both platforms (claude + codex templates identical bodies) and for all customers — this is a product change, not dogfood.
- [OBSERVED] `ana work status` is not perfectly read-only (session marker write, git fetch, worktree prune, npm version check — all best-effort); the requirements probe joins as one more best-effort read.
- [INFERRED] A platform registry (from the merged devday-config work) drives agent-file scaffolding — Plan should confirm whether template registration needs a registry touch for any additional platform rows (e.g. cursor scaffolding was mentioned in recon).

### Test Infrastructure
- `tests/commands/` — vitest, per-command files; work status tests already cover JSON/human output parity; `tests/commands/init/template-propagation.test.ts` guards template content (note: currently flaky under full-suite parallel load, 4 proof-chain entries reference it — don't deepen its load).
- Init preservation has existing test coverage around `preserveUserState` (plans/completed, context) to extend for requirements.

## For AnaPlan

### Structural Analog
`ana plan coverage` (`packages/cli/src/commands/plan.ts`) for the command group shape — the most recently added, smallest registered command group with pure helpers and read-only behavior. For the validator: `validateScopeFormat` in `artifact-validators.ts` (same file should host `validateReqFormat`). For enumeration: `discoverSlugs` in `work-state.ts`.

### Relevant Code Paths
- `packages/cli/src/commands/work.ts` — `getWorkStatus` (probe + StatusOutput field), `printNotifications` (ℹ line), `startWork` (~:1276, `--req` option), `completeWork` (archive step)
- `packages/cli/src/commands/work-state.ts` — enumeration helper home (or shared util)
- `packages/cli/src/utils/artifact-validators.ts` — `validateReqFormat`
- `packages/cli/src/commands/init/state.ts` — `preserveUserState` + policy comment
- `packages/cli/src/index.ts` — command registration (PIPELINE group)
- `packages/cli/templates/.claude/agents/ana.md` + `templates/.codex/agents/ana.md` — 4 touchpoints (Check State, Pipeline State table row, Scope subsection "Picking up a requirement", nothing in Ground Yourself — the ℹ echo rule already covers it)

### Patterns to Follow
- Validator: pure function returning `string | null`, caller prints red + exits 1 (`validateScopeFormat` and its call site).
- Enumeration: `discoverSlugs` dual-mode, including its artifact-branch detection.
- Status output: `StatusOutput` struct extension + conditional `printNotifications` line (the `updateAvailable` nudge).
- Command registration: `registerPlanCommand` shape; kebab command names; `--json` flag convention from `req list`'s siblings.

### Known Gotchas
- Re-init atomic swap destroys anything off the `preserveUserState` allowlist — AC9 is load-bearing, test it with a real init-over-existing.
- `work.ts` double-reads ana.json per status call already (`retire-capture-self-arming-C3`) — do not add a third config read for the requirements probe.
- Codex template must stay byte-identical to Claude minus frontmatter — there's an existing test family for template parity; extend, don't fork.
- YAML frontmatter rewrite on claim must round-trip unknown keys and leave the body untouched (future Ana Remote metadata).
- `git ls-tree` on a path that doesn't exist remotely exits non-zero — handle as empty, not error.

### Things to Investigate
- Whether the frontmatter parse/serialize should be a small shared util (future consumers: Ana Remote's server-side validation via the same `ana req validate`) — where does it live so the validator and the claim-rewrite share one implementation?
- The cleanest way for `completeWork` to find claimed requirements (scan-all-and-filter vs read the one file named by a convention) — balance against `work.ts` hot-spot pressure; consider placing the logic in `work-state.ts` or a new `req-state.ts` rather than growing `work.ts`.
- Whether the stock requirement template (for `ana req new`) lives as a template file or an inline string — follow whichever pattern `scaffold-generators.ts` vs `templates/` precedent fits an *artifact* scaffold (this is a generated file, not a copied template — lean generator).
