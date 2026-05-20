# Scope: Surface Awareness Schema and Pipeline Integration

**Created by:** Ana
**Date:** 2026-05-20

## Intent

Make surface awareness real end-to-end. The scan already detects surfaces (shipped, validated against 12 repos). This scope makes the system USE that intelligence: ana.json stores per-surface commands, the pipeline targets the right surface, and the proof chain records which surface each run verified. A developer scoping website work gets website test commands. A developer scoping CLI work gets CLI test commands. Cross-surface work falls back to root commands.

This is the permanent schema commitment. Once shipped, the `surfaces` section in ana.json exists forever.

## Complexity Assessment
- **Kind:** milestone
- **Size:** medium-large — ~250 lines new code, ~90 lines removed, ~100 lines test rewrite, ~15 lines template changes
- **Surface:** cross-surface
- **Files affected:**
  - `packages/cli/src/commands/init/anaJsonSchema.ts` — Zod schema addition
  - `packages/cli/src/commands/init/state.ts` — `createAnaJson` surface generation, `preserveUserState` surface merge
  - `packages/cli/src/commands/config.ts` — KNOWN_FIELDS, surface guard, `config delete`, `displayAll`
  - `packages/cli/src/commands/artifact.ts` — Surface field validation
  - `packages/cli/src/types/proof.ts` — `surface?: string` field
  - `packages/cli/src/commands/work.ts` — `writeProofChain` surface derivation
  - `packages/cli/src/commands/proof.ts` — `formatHumanReadable`, `formatListTable` surface display
  - `packages/cli/templates/.claude/agents/ana.md` — startup awareness + scope template Surface field
  - `packages/cli/templates/.claude/agents/ana-plan.md` — startup awareness + checkpoint command resolution
  - `packages/cli/templates/.claude/agents/ana-verify.md` — independence fix (spec over build report)
  - `packages/cli/templates/.claude/agents/ana-setup.md` — surface command display in Step 2
  - `website/content/docs/start.mdx` — retire `buildPackage`/`testPackage` references
  - `website/content/docs/guides/troubleshooting.mdx` — retire `buildPackage`/`testPackage` references
  - `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts` — repurpose for surface commands
  - `packages/cli/tests/commands/init/makeTestCommand.test.ts` — update testPackage assertions
- **Blast radius:** Every pipeline run on a monorepo. The template changes affect all four agents' behavior. The schema change affects every `ana init` and every `ana config` invocation. The proof chain change affects every `ana work complete` and every `ana proof` display.
- **Estimated effort:** 2 pipeline cycles (medium-large code scope + comprehensive test surface)
- **Multi-phase:** no

## Approach

Bridge the gap between scan intelligence and pipeline consumption. The scan already knows surfaces — teach ana.json to store per-surface commands, teach the pipeline to use them, and teach the proof chain to record them. Retire `buildPackage`/`testPackage` (zero customers, surfaces replace them completely). Fix the Verify independence violation while we're in the templates.

The surface awareness propagates through documents, not through code. AnaThink writes the Surface field in the scope. Plan reads it and resolves to the right surface commands. Build and Verify execute the spec's commands. The worktree build stays root-level (Turborepo handles it). The proof chain derives the surface mechanically from `modules_touched` file paths — verified over trusted.

## Acceptance Criteria

- AC1: `ana init` on a monorepo populates `ana.json` with a `surfaces` section containing per-surface `path`, `language`, `framework`, and `commands` (build, test, lint, dev) derived from scan data
- AC2: `ana init` on a single-package repo produces no `surfaces` section — behavior identical to today
- AC3: Re-init preserves user-tuned surface commands while refreshing mechanical fields (path, language, framework) from the scan
- AC4: Re-init adds newly detected surfaces with default commands and keeps removed surfaces with a logged warning
- AC5: Surface merge matches by `path`, not by key name — a renamed surface key preserves its tuned commands
- AC6: `buildPackage` and `testPackage` generation is removed from `createAnaJson`. The keys no longer appear in freshly generated ana.json files.
- AC7: `ana config set surfaces.cli.commands.test "..."` works (setByPath already handles this). `ana config set surfaces.cli.path "..."` is rejected as machine-managed.
- AC8: `ana config delete surfaces.old-service` removes the entry. `ana config delete surfaces.cli.path` is rejected as machine-managed.
- AC9: `ana config show` displays surfaces with three-level nesting (surface → scalar fields + commands → command values)
- AC10: The AnaThink scope template includes a Surface field in Complexity Assessment, validated by `ana artifact save scope`
- AC11: AnaPlan resolves checkpoint commands from `surfaces.{name}.commands.test` when the scope declares a Surface. Falls back to `commands.test` when no surfaces section exists or for cross-surface scopes.
- AC12: AnaVerify reads checkpoint commands from the spec's Build Brief, not the build report — fixing the independence violation
- AC13: `ProofChainEntry` has a `surface?: string` field, derived mechanically from `modules_touched` path matching against `ana.json` surfaces at `writeProofChain` time
- AC14: `ana proof {slug}` and `ana proof list` display the surface field when present
- AC15: Init display shows per-surface commands after root commands (truncated at 3 surfaces with "+N more" for 4+)
- AC16: `start.mdx` and `troubleshooting.mdx` reference surfaces instead of `buildPackage`/`testPackage`
- AC17: Existing tests updated: `monorepoCommandScoping.test.ts` repurposed for surface command generation, `makeTestCommand.test.ts` testPackage assertions updated

## Edge Cases & Risks

**No surfaces detected (monorepo, no qualifying packages).** ana.json has `surfaces: {}`. Pipeline works exactly as today — root commands, no surface field in proof chain. No behavioral change.

**One surface detected.** Slightly more config than the old `testPackage` convention, but consistent. The user learns one system, not two.

**Surface command generation fails (no recognized testing framework, no test script).** `commands.test` is null. Init writes `commands.test: null`. Setup flags it with a warning. User configures manually. Same pattern as null root commands today.

**User adds a surface manually.** `ana config set surfaces.platform.path "apps/platform"` then `ana config set surfaces.platform.commands.test "..."`. Works because `setByPath` creates intermediates. Survives re-init because `preserveUserState` matches by path.

**Re-init after deleting a package.** Old surface has no matching new surface. Policy: keep with warning ("Surface 'old-service' no longer detected. Keeping — remove with `ana config delete surfaces.old-service`"). Never silently delete user state.

**Surface with null test command (testing framework at root, not per-package).** Common — Midday's dashboard, website, and worker all had `testing: []`. `buildDirectTestCommand([])` returns null. Pipeline falls back to root `commands.test`. Setup flags the null.

**Mixed-language surfaces.** Cal.com's `apps/api` is JavaScript in a TypeScript monorepo. Per-surface `language` handles this correctly.

**Cross-surface proof chain entry.** `modules_touched` files span multiple surfaces → `surface: null`. Correct behavior — cross-surface work is root/unscoped.

**Init display with 5+ surfaces (Midday has 5).** Truncate at 3 with "+N more. Run `ana config show` for all."

**The `preserveUserState` merge is the highest-risk change.** Nested merge with add/remove/preserve/rename semantics. Mitigated by isolating it as a separate `mergeSurfaces()` function with dedicated tests covering all combinatorics.

**Template wording determines pipeline correctness.** If Plan's rewritten checkpoint paragraph generates wrong commands, the error propagates through Build and Verify. Mitigated by keeping the instruction simple: "look up surface test command → use it. No surfaces? → use root."

## Rejected Approaches

**`--surface` flag on `ana work start`.** Adds CLI surface, metadata file, validation code, and two code paths for marginal benefit. The scope-based approach (AnaThink writes Surface in the scope, Plan reads it) handles 100% of cases through existing document flow. The flag becomes relevant later for `ana proof health --surface cli`. Ship it when there's evidence the scope-based approach isn't sufficient.

**Surface-specific worktree build commands.** Root build via Turborepo builds all packages — wasteful for single-surface scopes but never wrong. Surface-specific builds risk missing cross-package dependencies. Root for V1. Optimize later when telemetry shows worktree build time is a bottleneck.

**Keep `buildPackage`/`testPackage` alongside surfaces.** Two sources of truth. Confusing for customers. Zero backward compatibility pressure (no customers). Surfaces replace them completely. "The elegant solution is the one that removes."

**Auto-generate `dev` commands per surface.** Nothing in the pipeline consumes `dev`. Framework-specific dev commands vary widely (tsup --watch, next dev --turbopack, hono dev). High complexity, zero consumers. Schema includes `dev` for forward compatibility. Init leaves it null. Users `config set` when ready.

**Derive proof chain surface from the scope's Surface field.** Would require parsing scope.md markdown at `writeProofChain` time. Unnecessary — `modules_touched` derivation is mechanical and follows "verified over trusted." Null for ambiguous cases is the correct answer.

## Open Questions

- What is the exact threshold for init display truncation — the REQ says 3, scan terminal truncates at 4. Plan should verify which feels right in context and pick one.

## Exploration Findings

### Patterns Discovered

- `state.ts:486-510`: Existing monorepo command scoping reads `package.json` from disk for primary package scripts. Surface command generation follows the same pattern, iterating over detected surfaces. The `EnrichedPackage` type (engineResult.ts:73-81) carries `scripts: string[]` (script names only, not values) — useful for quick "has build script?" checks, but actual command generation reads `package.json`.
- `config.ts:298-315`: Machine-managed guard uses `topLevelKey` against a flat map. Surface-specific guard must be a separate check after this one, examining path segments to distinguish mechanical fields (path, language, framework) from user-owned fields (commands.*).
- `artifact.ts:536-608`: Scope validation uses regex matching for Kind, Size, Multi-phase fields. Surface validation follows the same pattern — regex extract, validate against ana.json surfaces keys or "cross-surface".
- `work.ts:940-953`: `modules_touched` is read from `.saves.json` at `writeProofChain` time. The data is always available for completed work items (captured at build-report save time).

### Constraints Discovered

- [TYPE-VERIFIED] AnaJsonSchema uses `.passthrough()` at root level (anaJsonSchema.ts:62) — unknown top-level keys survive parsing. Surface schema follows the same pattern with `.passthrough()` per surface object for future extensibility.
- [TYPE-VERIFIED] `setByPath` creates intermediate objects automatically (config.ts:131-134) — `ana config set surfaces.website.commands.test "..."` works without modification.
- [OBSERVED] `displayAll` handles one level of nesting (config.ts:198-213). Surfaces require three levels. Surfaces-specific branch is simpler than recursion for this single known case.
- [OBSERVED] The existing `preserveUserState` merge is flat — six mechanical fields refreshed by explicit assignment (state.ts:628-634), commands merged as a flat record (state.ts:638-671). Surface merge adds nested structure — the `mergeSurfaces()` isolation is warranted.

### Test Infrastructure

- `monorepoCommandScoping.test.ts`: Tests `createAnaJson` output for monorepo scenarios. Currently validates `buildPackage`/`testPackage`. Repurpose for surface command generation — same test structure, different assertions.
- `makeTestCommand.test.ts`: Tests `testPackage` generation with pnpm/yarn/npm + various testing frameworks. Lines 143-200 contain 3 tests that assert `testPackage` — these need rewriting to assert surface commands.

## For AnaPlan

### Structural Analog

`state.ts:455-524` — the existing `buildPackage`/`testPackage` generation block. This is the code being replaced. The surface command generation follows the same pattern (read package.json scripts, build scoped commands) but iterates over `engineResult.surfaces` instead of just `primaryPackage`. The merge analog is `state.ts:638-671` — the flat command merge — but the surface merge is more complex (nested, with add/remove semantics).

### Relevant Code Paths

- `packages/cli/src/commands/init/anaJsonSchema.ts` — Zod schema, entire file (64 lines). Add `surfaces` field.
- `packages/cli/src/commands/init/state.ts:414-556` — `createAnaJson`. Lines 455-524 are the `buildPackage`/`testPackage` block being replaced with surface generation.
- `packages/cli/src/commands/init/state.ts:595-743` — `preserveUserState`. Lines 624-671 are the ana.json merge. Surface merge extends this.
- `packages/cli/src/commands/config.ts` — entire file (351 lines). KNOWN_FIELDS at line 44, MACHINE_MANAGED at line 30, guard at line 298, COMMAND_FIELDS at line 328, `displayAll` at line 185.
- `packages/cli/src/commands/artifact.ts:536-608` — `validateScopeFormat`. Add Surface field validation after Multi-phase check.
- `packages/cli/src/types/proof.ts:47-106` — `ProofChainEntry`. Add `surface?: string` field.
- `packages/cli/src/commands/work.ts:916-1015` — `writeProofChain`. Add surface derivation from `modules_touched` after line 953.
- `packages/cli/src/commands/proof.ts:234` — `formatHumanReadable`. Add surface line in the header area.
- `packages/cli/src/commands/proof.ts:585` — `formatListTable`. Add surface column.
- `packages/cli/src/engine/detectors/surfaces.ts` — existing shipped detector. `enrichPackages()` returns `scripts: string[]` per package — useful for command generation.
- `packages/cli/src/utils/worktree.ts:447` — `runBuildCommand`. Reads `commands.build`. Unchanged.

### Patterns to Follow

- Zod fail-soft pattern: per-field `.catch()` + `.default()`. See existing fields in `anaJsonSchema.ts`. Every surface field gets the same treatment.
- Command scoping pattern: `(cd '${surface.path}' && ${command})`. See `state.ts:463` for existing examples.
- Scope validation pattern: regex extraction + whitelist check. See `artifact.ts:581-607` for Kind/Size/Multi-phase.
- `mergeSurfaces()` as isolated pure function — testable independently of `preserveUserState`.

### Known Gotchas

- `EnrichedPackage.scripts` contains script NAMES only (e.g., `['build', 'test', 'lint']`), not the script VALUES. Command generation must read the actual `package.json` from disk (same pattern as state.ts:487-489).
- The existing `preserveUserState` command merge has a blank-string sanitization loop (state.ts:641-645) and a JS-command cleanup for non-Node projects (state.ts:662-670). Surface command merge needs the same sanitization.
- Init display location: the "Branch: / Test: / Build:" display is in `init/index.ts`. Plan should trace the exact function and line where surface display goes.
- The `COMMAND_FIELDS` list at config.ts:328 is a flat array of string literals. Surface command fields use a pattern match (`surfaces.*.commands.*`), not list membership. Two mechanisms, not one.

### Things to Investigate

- The init display code path — find the exact function in `init/index.ts` that prints root commands, and determine where surface display integrates.
- Whether `displayAll` should use a surfaces-specific branch or a shallow recursive approach — read the current display code and decide based on what produces the cleanest output format.
- The exact regex for Surface field validation in `artifact.ts` — should it allow omission (single-package repos) while requiring the field for monorepo scopes? Or always allow omission with the agent expected to include it when surfaces exist?
