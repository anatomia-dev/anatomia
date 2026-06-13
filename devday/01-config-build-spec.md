# Build Spec — Ultimate Configurability

**Status:** READY (design → adversarial-verified → corrections folded in → spot-checked by Ana)
**Verdict:** build-with-corrections · 35 claims confirmed · 0 showstoppers
**Source:** config-supremacy-design (wz0kdxsy7) + adversarial-verify (wxcdekbdz), corrections applied below.

---

## Thesis
`ana.json` becomes the single source of truth that today's hardcoded constants are the **default value of**. One resolver (`src/manifest.ts`) sits between the constants and every consumer, so **"absent = today" is the identity function**, provable by a byte-equality test. Net diff is mostly red.

## Verified premises (independently confirmed by Ana via grep — NOT taken on the planner's word)
1. **The re-init skills-wipe bug is REAL.** `CLAUDE_AGENT_CONFIG_KEYS = ['model','tools']` (`constants.ts:205`) — no `skills`. Stock templates ship `skills: [git-workflow]` frontmatter (`ana-build`/`ana-plan`/`ana-verify`). So a user-edited skills line reverts to stock on re-init. We fix it by *projecting* skills from `ana.json`, not preserving frontmatter.
2. **Re-init safety is REAL.** Schema `.passthrough()` (anaJsonSchema.ts) + `preserveUserState` spreads `...parsed.data` (`state.ts:750`) with only 6 mechanical overrides. The four new optional/no-default keys (`agents`, `skills`, `capabilities`, `platformDefaults`) survive re-init untouched, mirroring `testEvidenceGate`/`processCapture`.

## Architecture
- **Resolver spine** (`src/manifest.ts`): `resolveSkillManifest(anaJson, engineResult)`, `resolveAgentRoster(anaJson)`, `resolveAgentSkills(anaJson, name)`. Each returns today's constant verbatim when its key is absent. Constants literally become `resolveX({})`.
- **Agent↔skill projection**: skills authored in `ana.json.agents.<name>.skills`, projected into Claude frontmatter AND Codex `.agent.toml` + a marker-bounded `## Skills` block on every init. `skills` is NOT added to `CLAUDE_AGENT_CONFIG_KEYS` (that would re-preserve stale frontmatter and reintroduce the bug).
- **Platform registry** (`src/platforms/registry.ts`): claude+codex literals collapse to one descriptor table → a third platform (Cursor) is a data row.
- **Managed-block surfaces**: the latest Claude Code surface (commands/outputStyle/MCP/hooks) folds in via ONE `mergeManagedBlock` mechanism + an opt-in `capabilities` object.

---

## Build waves (CORRECTED — the flat `parallelSafe` boolean was misleading)

`assets.ts` is the contention magnet (slices 2, 4, 6 all edit it). Only one of those may occupy a wave.

```
WAVE 0  (land + merge first; everything imports it)
  Slice 1 — Schema fields + manifest resolver

WAVE 1  (branch from merged Slice 1; truly disjoint — verified zero shared files)
  Slice 3 — Platform registry      ∥      Slice 4 — Managed-block surfaces

WAVE 2+ (serialize — all touch assets.ts)
  Slice 2 — Per-agent skill projection
  Slice 5 — Config-driven custom skills   (depends on Slice 2)
  Slice 6 — Config-driven agent roster    (depends on Slice 3; runs last, alone)
```

---

## Slices

### Slice 1 — Schema fields + manifest resolver  ·  Wave 0
- **Scope:** Add optional `agents`, `skills`, `capabilities`, `platformDefaults` to `AnaJsonSchema` (additive, optional, NO `.default`). Create `src/manifest.ts` (the three resolvers). Derive `config.ts` `KNOWN_FIELDS` from schema keys.
- **Files (owner):** `anaJsonSchema.ts`, `src/manifest.ts` (new), `skills.ts` (call-site swap), **`state.ts:1015` (call-site swap — CORRECTION #1)**, `config.ts`, `manifest.test.ts` (new). *Does NOT touch `constants.ts` — `computeSkillManifest` is imported as-is.*
- **CORRECTION #1 (verified by Ana — real):** `computeSkillManifest` has **three** callers, not one: `skills.ts:125` (scaffold), `state.ts:1015` (post-init count), `scan.ts:412` (preview). Swap `skills.ts:125` AND `state.ts:1015` to the resolver so a config-added skill is both scaffolded *and* counted. **Leave `scan.ts:412` on the raw constant** (runs pre-init, no guaranteed `ana.json`).
- **Test:** `resolveSkillManifest({}, r)` deep-equals `computeSkillManifest(r)` (byte-identity regression). `resolveAgentRoster({})` deep-equals built-in 6. `{skills:{observability:{always:true}}}` appends, deduped, core-wins. **Post-init count display matches scaffolded set when a custom skill is present** (the state.ts:1015 guard). Malformed config falls through to default.

### Slice 3 — Platform registry  ·  Wave 1 (∥ Slice 4)
- **Scope:** `src/platforms/registry.ts` seeded with claude+codex descriptors (byte-identical to today). Route `getAgentsDir` (`platform.ts:20`), `KNOWN_PLATFORMS` (`run.ts:58`), `resolveAgentDefPath` (`run.ts:96`), `detectPlatforms` (`state.ts:1146`), the gpt-5.5/danger-full-access fallbacks (`run.ts:281-282`) through it. Dedup `AGENT_FILES`/`CODEX_AGENT_FILES` from the descriptor.
- **Files (owner):** `platforms/registry.ts` (new), `platform.ts`, `run.ts`, `state.ts` (detectPlatforms), `constants.ts` (AGENT_FILES dedup), `registry.test.ts` (new).
- **Test:** dirs/defaults byte-identical to today; a registry-only `cursor` descriptor resolves its dir (proves third platform needs no branch); existing run/platform tests pass unchanged.

### Slice 4 — Managed-block surfaces  ·  Wave 1 (∥ Slice 3)
- **Scope:** Build `mergeManagedBlock(existing, managed, markerKey)` and wire `capabilities` (commands → `.claude/commands/<name>.md`; outputStyle → settings.json; mcpServers → `.mcp.json`) in `createClaudeConfiguration`. Absent `capabilities` = no new files.
- **Files (owner):** `assets.ts`, `assets.test.ts`. **CORRECTION #3:** does NOT edit `anaJsonSchema.ts` (Slice 1 owns the schema). One owner per file.
- **CORRECTION #5 (effort, not code):** `mergeManagedBlock` is **net-new code modeled on** the hooks-merge boundary discipline + `## Detected` injection — NOT a rename/extraction of `mergeHooksSettings` (which is hook-array dedup-by-command, a different mechanism). Keep the hooks merge intact; budget real implementation + test effort.
- **Builder note (CORRECTION #4, cosmetic):** the merge/prune logic spans `assets.ts:622–776` (incl. `pruneHookCommand` at ~763) — include the prune path, the design relies on it for command-file pruning.
- **Test:** `capabilities.commands.ship` → `.claude/commands/ship.md` with marker; re-init with entry removed → pruned; hand-authored `mine.md` (no marker) survives. `outputStyle` set → settings.json key added, siblings survive. Absent capabilities → settings.json byte-identical. Malformed → warn, not nuke.

### Slice 2 — Per-agent skill projection  ·  Wave 2 (after Slice 1; serialize vs 4/6 on assets.ts)
- **Scope:** In `copyAgentFiles`, after the config-key loop, project `resolveAgentSkills` into Claude frontmatter. In `copyCodexAgentFiles`, write flat `skills = [...]` to `.agent.toml` + a marker-bounded `## Skills` block. Add `ana agents skills <agent> <list>` / `--clear` (writes `ana.json`). Do NOT add `skills` to `CLAUDE_AGENT_CONFIG_KEYS`.
- **Files (owner):** `assets.ts` (copy fns), `agents.ts` (subcommand), `agent-config.ts` (Codex marker helper if needed), tests.
- **Test:** `agents.ana-build.skills=[git-workflow,api-patterns]` → re-init shows it AND a SECOND re-init preserves it (the previously-reverting case). Codex `.agent.toml` + single `## Skills` block. Absent `agents` → byte-identical to stock.

### Slice 5 — Config-driven custom skills  ·  after Slice 2
- **Scope:** Relax `scaffoldAndSeedSkills` so a user-authored `.ana/skills/<name>/SKILL.md` becomes a manifest member; stub a minimal SKILL.md when a manifest-named skill lacks both. Injector miss already no-ops.
- **Files (owner):** `skills.ts`, `manifest.ts` (custom-trigger), `skills.test.ts`.

### Slice 6 — Config-driven agent roster  ·  last, alone
- **Scope:** `copyAgentFiles`/`copyCodexAgentFiles` iterate `resolveAgentRoster`; `AGENT_MAP` derives from roster; `enabled:false` drops a built-in (never the Think core agent); config agent supplies `.ana/agent-templates/<name>.md`.
- **Files (owner):** `assets.ts`, `run.ts`, `manifest.ts`, tests.

---

## No-regression contract
- Every slice ships a **byte-equality test**: no-config output identical to today (frontmatter, `.agent.toml`, `settings.json={"hooks":{}}`+capture, file set).
- New schema fields optional, no `.default` → absent stays absent through re-init.
- A Python/Go install with no config gains zero new files.
- Malformed config degrades via per-field `.catch()` + the existing try/catch-and-warn — never a crash, never a clobber.
- Both platforms stay in lockstep (resolver returns format-agnostic names; Claude + Codex render from the same resolved list).

## Demo
5 lines of `ana.json` reshape both harnesses → `ana init` twice → `git diff` empty (re-init contract holds) → delete config, init again → byte-identical to stock (absent = today).
