# Scope: Platform-Aware CLI

**Created by:** Ana
**Date:** 2026-05-30

## Intent

The Anatomia CLI hardcodes Claude Code as the only platform in 20 source files (~140 references). Three commands (`ana agents`, `ana setup check`, `ana proof promote/strengthen`) read agent and skill files from hardcoded `.claude/` paths — they are functionally broken on any non-CC platform. The pipeline state machine (`ana work status`) outputs `claude --agent ana-build` strings that are serialized into the `--json` output contract. There is no `ana run` command — the universal invocation surface that makes platform choice invisible to the developer.

This scope makes the CLI platform-agnostic internally. It introduces a `platforms` config field, a `platform.ts` helper module, replaces all hardcoded `.claude/` path references with config-driven calls, migrates all display strings from `claude --agent` to `ana run`, ships `ana run` as a CC passthrough, and adds `platformFlags` configuration so runtime flags like `--dangerously-skip-permissions` are set once and applied automatically.

This is Scope 1 of a two-scope expansion. Everything here is foundation that Scope 2 (Codex Support) builds on: the `platforms` field, `getAgentsDir()`/`getSkillsDir()` helpers, `agentCommand()` returning `ana run` syntax, `ana run` accepting `--platform`, static `KNOWN_ROOTS` expansion, and `platformFlags` configuration.

No Codex delivery files, no template changes, no docs/README changes, no version bump. Internal work on a feature branch, dogfooded before anything ships publicly.

## Complexity Assessment
- **Kind:** feature
- **Size:** large — 20 source files modified/created, ~140 references changed, 14 test files updated, two specs
- **Surface:** cli
- **Files affected:** `anaJsonSchema.ts`, `state.ts`, `config.ts`, `platform.ts` (new), `agents.ts`, `check.ts`, `proof.ts`, `commit.ts`, `proportionalSampler.ts`, `symbol-index.ts`, `work.ts`, `doctor.ts`, `setup.ts`, `pr.ts`, `work-proof.ts`, `init/skills.ts`, `init/index.ts`, `artifact.ts`, `run.ts` (new), `index.ts`
- **Blast radius:** Two new files, 18 modified source files, 14 test files. The `--json` output contract for `ana work status` changes (`nextAction` strings). Scan exclusion patterns widen. Scaffold detection gains dual-pattern matching.
- **Estimated effort:** 2 pipeline runs (Spec A + Spec B)
- **Multi-phase:** yes — two specs with a natural seam between pure refactor and behavior change

## Approach

Split into two specs along the refactor/feature boundary.

**Spec A (pure refactor, zero behavior change):** Add `platforms` and `platformFlags` fields to ana.json schema. Create the `platform.ts` helper module with path resolution and flag retrieval functions. Replace all hardcoded `.claude/` path references in 6 command files with helper calls. Add static scan/index exclusion patterns for future platform directories. Update scaffold detection for dual-pattern matching. Every call site returns the same value as before for Claude Code — behavior is identical.

**Spec B (feature work, behavior change):** Migrate all `claude --agent` display strings to `agentCommand()` calls across 10 files. Change `--json` output contract directly (no parallel field). Rename `getClaudePid()` to `getAgentPid()`. Ship `ana run` command with CC passthrough, advisory pipeline state checking, and configurable platform flags. Register in the PIPELINE command group. Update all 14 test files.

The seam is clean: Spec A changes what functions return paths and where paths come from, but no user-visible output changes. Spec B changes what the user sees and adds a new command.

## Acceptance Criteria

- AC1: `ana.json` contains `platforms: ["claude"]` after fresh init and after re-init of existing projects
- AC2: `ana.json` accepts `platformFlags` field (e.g., `{"claude": ["--dangerously-skip-permissions"]}`) preserved across re-init
- AC3: `ana agents` resolves agent directory from `ana.json` platforms, not hardcoded path. Behavior identical to today on CC.
- AC4: `ana setup check` discovers skills from platform-appropriate directory. Behavior identical to today on CC.
- AC5: `ana proof promote --skill coding-standards` resolves skill path from platform config. Behavior identical to today on CC.
- AC6: `ana init commit` uses static `KNOWN_ROOTS` including `.codex/` and `.agents/` (forward-compatible). Behavior identical to today on CC (extra roots match zero files).
- AC7: `ana work status` shows `ana run build` (not `claude --agent ana-build`) in human output
- AC8: `ana work status --json` `nextAction` field contains `ana run build` (not `claude --agent ana-build`). Direct replacement, no parallel field.
- AC9: `check.ts` scaffold detection matches both `claude --agent ana-setup` and `ana run setup` patterns
- AC10: `ana run build` launches `claude --agent ana-build` with `platformFlags.claude` appended, and the developer sees the same TUI experience
- AC11: `ana run` (no argument) launches `claude --agent ana` (Think agent)
- AC12: `ana run build` with no work item at build stage shows advisory warning, does not block
- AC13: `ana run build -- --extra-flag` appends `--extra-flag` after config flags
- AC14: `ana scan` excludes `.codex/` and `.agents/` directories from sampling
- AC15: All existing tests pass. Test count does not decrease.

## Edge Cases & Risks

**Edge cases:**
1. No `ana.json` exists (running `ana agents` before `ana init`): platform helpers fall back to `["claude"]` defaults. Current behavior preserved.
2. `ana.json` has empty `platforms` array: defaults to `["claude"]` via schema `.catch()`.
3. `ana.json` has unknown platform (e.g., `"copilot"`): no error. Forward-compatible.
4. User runs `ana run build` but `claude` is not in PATH: clear error message with install link.
5. User runs `ana run` in a directory with no `.ana/`: error "No Anatomia project found. Run `ana init` first."
6. Re-init with old CLI then new CLI: old `ana.json` has no `platforms` field. Schema `.default(['claude'])` handles it.
7. `platformFlags` has flags for a platform not in `platforms`: harmless, ignored.
8. `platformFlags` contains invalid tool flags: passed through verbatim, underlying tool errors with its own message.
9. Empty `platformFlags` array for a platform: no extra flags, equivalent to not setting it.

**Risks:**
- **JSON contract change (MEDIUM).** `nextAction` in `--json` output changes from `claude --agent ana-build` to `ana run build`. Direct replacement. No evidence of external JSON consumers. No published schema stability guarantee. A field called `nextAction` containing the wrong action is worse than a breaking change. Mention in release notes.
- **Scaffold detection atomicity (LOW but critical).** `init/skills.ts` line 167 WRITES the scaffold text that `check.ts` line 1201 DETECTS. If `skills.ts` changes to write `ana run setup` but `check.ts` hasn't updated `isScaffoldTemplateLine`, new installations get skills that falsely pass scaffold detection. These must change in the same spec (Spec A).
- **Test surface area (LOW).** 14 test files with ~183 `.claude` references and ~19 `claude --agent` references need updating alongside source changes. Mechanical but high surface area.
- **`check.ts` line 1262 `claudePath` variable.** Used to check if `.claude` directory exists. Must use platform-appropriate directory check via `getAgentsDir()` parent directory. Call out explicitly in spec.

## Rejected Approaches

**Semantic flag abstraction (`ana run --skip-permissions` mapping to per-platform flags).** Premature at N=2. We'd need to map between CC and Codex permission models, and they're fundamentally different (CC has permission prompts, Codex has sandboxes). Raw pass-through of platform-specific flags is honest and sufficient. Revisit when N=3 reveals the right abstraction.

**Per-agent `platformFlags` overrides in Scope 1.** Real use case (Build with full autonomy, Verify with prompts), but not needed yet. The schema uses `z.array(z.string())` per platform, extensible to the `branchPrefix` union pattern (`string[] | { default: string[], [agent]: string[] }`) when someone needs it.

**Local-only config file for user-specific flags (`.ana/local.json`, gitignored).** Legitimate concern about `--dangerously-skip-permissions` being committed. But `platformFlags` is a team decision about how pipeline agents run. A developer who disagrees can invoke `claude --agent` directly. Local config is a bigger design change, deferred until a user asks for it.

**Platform abstraction framework (`Platform { init(), run(), commitRoots() }`).** Premature at N=2. Three helper functions in `platform.ts` serve the same purpose without the framework overhead. Refactor to a module system when N=3 arrives.

**Parallel `agentCommand` field in JSON output for backward compatibility.** A field called `nextAction` containing the wrong action (CC-specific command shown to non-CC users) is worse than a breaking change. No evidence of external JSON consumers. The parallel field is scaffolding that gets removed later.

**`ana agent` or bare verbs instead of `ana run`.** `ana agent` is a noun, not a verb. Bare verbs collide with existing `ana setup` and `ana verify` commands. `ana run` is locked.

## Open Questions

1. **`ana run` slug resolution.** For CC passthrough in Scope 1, this is a non-issue — `claude --agent ana-build` discovers the slug internally via `ana work start`. Becomes relevant in Scope 2 where `ana run` may need to resolve the worktree path and pass `cwd` to `spawnSync`. Deferred.

2. **Proof chain path data.** `proof.ts` line 1293 writes `promoted_to = skillRelPath` where `skillRelPath` is built from `.claude/skills/`. Existing proof chain entries store `.claude/skills/` paths as persistent data in `proof_chain.json`. These won't update when skill paths change in Scope 2. Not blocking for Scope 1 (paths don't change), but Plan should note it for Scope 2.

## Exploration Findings

### Patterns Discovered
- `anaJsonSchema.ts`: every field uses `.optional().default().catch()` for fail-soft parsing (lines 57-79)
- `branchPrefix` (line 66-73): union type pattern (`string | Record`) for "simple value or per-kind override" — the template for future `platformFlags` per-agent extension
- `preserveUserState` (state.ts:720-731): `...parsed.data` spread preserves all schema-defined fields, explicit overrides only for mechanical fields (anaVersion, lastScanAt, name, language, framework, packageManager). New schema fields survive re-init automatically.
- `config.ts`: `KNOWN_FIELDS` (line 44) and `MACHINE_MANAGED_FIELDS` (line 30) are separate sets. User-settable fields go in `KNOWN_FIELDS` only.
- `getClaudePid` (work.ts:1548-1566): walks process tree via `ps -o ppid=`, never checks process names. Already platform-agnostic in logic, only CC-specific in name and docstring.

### Constraints Discovered
- [TYPE-VERIFIED] Schema fail-soft (anaJsonSchema.ts:55-81) — every field catches independently, one bad field doesn't nuke the config
- [TYPE-VERIFIED] preserveUserState spread (state.ts:724) — new fields survive re-init without additional merge code
- [TYPE-VERIFIED] KNOWN_ROOTS is a const array (commit.ts:60-63) — static values, no config read at commit time
- [OBSERVED] scaffold text flow — skills.ts:167 writes text, check.ts:1201 detects it. Bidirectional dependency. Must change atomically.
- [OBSERVED] `check.ts` line 1262 — `claudePath` variable checks if `.claude` directory exists. Needs platform-aware equivalent.
- [OBSERVED] `state.ts` line 961 — `.claude/skills/` display string in init success output. 5 total display sites in state.ts (not 6; line 976 is `CLAUDE.md` filename).

### Test Infrastructure
- 14 test files contain ~183 `.claude` references and ~19 `claude --agent` references
- Test count must not decrease (CI constraint across 3 OS × 2 Node versions)
- Tests are collocated with source in `tests/` directory, mirror source file structure

## For AnaPlan

### Structural Analog
`branchPrefix` in `anaJsonSchema.ts` — same pattern of a config field that accepts a simple value now but extends to a union type later. The schema definition, `createAnaJson` write path, `preserveUserState` preservation, `config.ts` registration, and consumer read path are all the same shape that `platforms` and `platformFlags` need.

### Relevant Code Paths
- `packages/cli/src/commands/init/anaJsonSchema.ts` — full schema, 83 lines. Add `platforms` and `platformFlags` fields.
- `packages/cli/src/commands/init/state.ts:415-430` — `createAnaJson()`, where fresh ana.json is built. Add `platforms: ['claude']` and `platformFlags: {}`.
- `packages/cli/src/commands/init/state.ts:720-731` — `preserveUserState()`, merge logic. Both new fields survive via `...parsed.data` spread.
- `packages/cli/src/commands/init/state.ts:955-976` — init success display. Line 961 has `.claude/skills/` string. Line 976 is `CLAUDE.md` (filename, not a change target).
- `packages/cli/src/commands/init/state.ts:1053-1060` — post-init next steps. Four `claude --agent` strings.
- `packages/cli/src/commands/config.ts:30-58` — `MACHINE_MANAGED_FIELDS` and `KNOWN_FIELDS`. Add `platforms` and `platformFlags` to `KNOWN_FIELDS` only.
- `packages/cli/src/commands/agents.ts:88-89,322-323` — four hardcoded `.claude/agents` and `.claude/skills` paths.
- `packages/cli/src/commands/check.ts:796,812,952,1262` — three `.claude/skills` path constructions + one `claudePath` directory existence check.
- `packages/cli/src/commands/check.ts:1187-1205` — `isScaffoldTemplateLine()`, scaffold detection. Line 1201 matches `claude --agent ana-setup` only.
- `packages/cli/src/commands/proof.ts:1158,1227-1228,1554,1622-1623` — five `.claude/skills/` path references in `promote` and `strengthen`.
- `packages/cli/src/commands/init/commit.ts:47-63` — `EXCLUDED_PREFIXES` and `KNOWN_ROOTS` arrays.
- `packages/cli/src/commands/init/commit.ts:68-69` — `KNOWN_ROOT_FILES` includes `CLAUDE.md`.
- `packages/cli/src/engine/sampling/proportionalSampler.ts:36` — `'**/.claude/**'` scan exclusion.
- `packages/cli/src/commands/symbol-index.ts:339` — `'.claude/**'` index exclusion.
- `packages/cli/src/commands/work.ts:78-144` — `getNextAction()`, 12 `claude --agent` return statements.
- `packages/cli/src/commands/work.ts:266,365,1080,1311` — four more `claude --agent` display strings.
- `packages/cli/src/commands/work.ts:1548-1566` — `getClaudePid()`, platform-agnostic logic with CC-specific name.
- `packages/cli/src/commands/doctor.ts:576,580,656,660` — four `claude --agent` display strings.
- `packages/cli/src/commands/setup.ts:43,133,142` — three `claude --agent` display strings.
- `packages/cli/src/commands/pr.ts:258,290` — two `claude --agent` display strings.
- `packages/cli/src/commands/work-proof.ts:30` — one `claude --agent` display string.
- `packages/cli/src/commands/init/skills.ts:167` — scaffold text that check.ts detects. Must change atomically with check.ts dual-pattern.
- `packages/cli/src/commands/artifact.ts:891` — template path reference in error message.
- `packages/cli/src/commands/init/index.ts:138` — `.claude/` string in gitignore warning.
- `packages/cli/src/index.ts:61-65` — PIPELINE command group registration. `run` goes between `work` and `artifact`.

### Patterns to Follow
- `anaJsonSchema.ts` — `.optional().default().catch()` for every new field
- `branchPrefix` union type pattern — for future `platformFlags` per-agent extension
- `findProjectRoot()` pattern — every command file uses this to get `root`, pass it to helpers
- `commit.ts` static arrays — `KNOWN_ROOTS` and `EXCLUDED_PREFIXES` are const arrays, not computed
- `registerWorkCommand` in `index.ts` — command registration pattern for `registerRunCommand`

### Known Gotchas
- `isScaffoldTemplateLine` and `init/skills.ts` scaffold text are a bidirectional dependency. If one changes without the other, `hasRealContent` reports wrong results. Put both changes in the same spec.
- `proof.ts` globSync patterns (line 1158) use relative paths — the helper must return paths compatible with globSync's `cwd` option.
- `check.ts` line 1262 `claudePath` checks directory existence, not file existence. The platform-aware replacement must check the equivalent platform directory.
- The `--json` output contract change in `getNextAction()` is consumed at line 409 via `JSON.stringify(output)`. The `nextAction` field is a string or string array — the type doesn't change, only the content.
- `getClaudePid` is exported from `work.ts` and called from within the same file. Rename must update the export name.

### Things to Investigate
- **Spec A/B boundary for `init/skills.ts:167` and `check.ts:1201`.** The scaffold text is written by skills.ts (a display string change → Spec B?) but detected by check.ts (scaffold detection → Spec A?). These must be in the same spec. Which spec owns them? Suggest Spec A — scaffold detection is path infrastructure, and the atomicity constraint means both sides must land together.
- **`platformFlags` schema validation.** Should the schema validate that flag strings start with `--`? Or accept anything? Lean: accept anything — we don't know every flag format for every platform. The tool validates its own flags.
- **`ana run` command registration order.** Requirements say "between `work` and `artifact`" in the PIPELINE group. Confirm this is the right position for `--help` display ergonomics.
