# Scope: Configurability Improvements

**Created by:** Ana
**Date:** 2026-05-11

## Intent

The configurability story is incomplete. Users can't safely store custom config (re-init silently strips unknown keys), the verify agent's skill loading is inconsistent with every other pipeline agent, and there's no CLI command for reading or writing ana.json. These three changes give Anatomia a real configurability surface — user data is preserved, the agent system is internally consistent, and configuration has a proper CLI interface. This also unblocks the docs site configurability guide, which currently has to describe "edit JSON by hand."

## Complexity Assessment
- **Kind:** feature
- **Size:** medium — three changes across two phases, 8+ files, 15+ tests
- **Files affected:**
  - `packages/cli/src/commands/init/anaJsonSchema.ts` (schema change)
  - `packages/cli/tests/commands/init/anaJsonSchema.test.ts` (rewrite 3 tests, add 2)
  - `packages/cli/templates/.claude/agents/ana-verify.md` (frontmatter + body)
  - `.claude/agents/ana-verify.md` (dogfood sync)
  - `packages/cli/src/commands/config.ts` (new file)
  - `packages/cli/src/index.ts` (register command)
  - `packages/cli/tests/commands/config.test.ts` (new file, 12+ tests)
- **Blast radius:** Low. Change 1 affects all code that consumes `AnaJson` type (4 files: `anaJsonSchema.ts`, `state.ts`, `init/index.ts`, `check.ts`) — all verified to access only known fields, no property enumeration. Change 2 is template-only. Change 3 is additive (new command, no existing behavior changes).
- **Estimated effort:** ~2 hours across both phases
- **Multi-phase:** yes

## Approach

**Phase 1 (Changes 1+2):** Remove the data-loss footgun and fix the agent consistency gap. Replace `.strip()` with `.passthrough()` on the ana.json schema so unknown top-level keys survive re-init. Add `skills:` frontmatter to the verify agent template and update its body text to reflect auto-loading. These are independent changes bundled because they're both small and share the "configurability consistency" motivation.

**Phase 2 (Change 3):** Build the CLI surface. A new `ana config [get|set]` command that reads and writes ana.json fields, with a machine-field blocklist to prevent users from corrupting scan-managed state, dot notation for nested access, and a `--json` flag for scriptability.

Phase 1 must ship before Phase 2. Without passthrough, `config set` on unknown keys gets silently deleted on next `ana init`.

## Acceptance Criteria

- AC1: Unknown top-level keys in ana.json survive `ana init` re-init (e.g., `"branchPrefix": "dev/"` and `"myTeamSetting": true` both persist)
- AC2: `.catch()` defaults still fire for invalid known fields with passthrough active (e.g., `setupPhase: "guided"` still defaults to `undefined`)
- AC3: `ana-verify` agent template declares `skills: [testing-standards, coding-standards]` in frontmatter
- AC4: Verify template body text reflects that skills are auto-loaded, not manually invoked
- AC5: Dogfood verify agent (`.claude/agents/ana-verify.md`) is byte-identical to template
- AC6: `ana agents` dashboard shows 2 skills for verify
- AC7: `ana config` with no args displays all ana.json fields
- AC8: `ana config get <field>` returns the field value
- AC9: `ana config get custom.<field>` traverses into nested custom fields
- AC10: `ana config set <field> <value>` writes to ana.json, preserving all other fields
- AC11: `ana config set` rejects machine-managed fields (`anaVersion`, `name`, `language`, `framework`, `packageManager`, `setupPhase`, `lastScanAt`) with an error naming the managing command
- AC12: `ana config set` parses values correctly — numbers, booleans, null via JSON.parse, strings as fallback
- AC13: `ana config set custom.<path>` creates intermediate objects
- AC14: `ana config --json` and `ana config get <key> --json` output valid JSON
- AC15: `ana config` with no ana.json fails with "Run `ana init` first"
- AC16: No existing tests break. Test count increases.

## Edge Cases & Risks

- **Fossil accumulation:** Old installs carry `scanStaleDays`, `setupMode`, `setupCompletedAt` from earlier versions. With passthrough these persist forever. Accepted tradeoff — cosmetic clutter beats silent data loss. Users can delete manually.
- **Field name collision:** A user adds `"proof": "my-value"`. A future release adds `proof` to the schema. The user's value would be parsed through the new field's validator. Mitigation: `custom` namespace is documented as collision-safe. Same tradeoff as `package.json`.
- **Type widening:** `.passthrough()` changes `AnaJson` from `{ known fields }` to `{ known fields } & { [k: string]: unknown }`. All 4 consumers verified to access only known fields — no `Object.keys()`, no property enumeration. Safe.
- **Config set concurrent writes:** Two processes doing read-modify-write on ana.json simultaneously — last writer wins. Pre-existing issue (scan.ts and setup.ts have the same pattern). Don't solve here.
- **Verify context window:** Adding 2 skills via frontmatter increases startup context. Plan already loads the same 2 skills at comparable template size (~32K chars). No concern.

## Rejected Approaches

- **Namespacing all user fields under `custom` only:** Would prevent fossil accumulation and collision risk entirely, but top-level keys are the natural API surface. Forcing `custom.branchPrefix` instead of `branchPrefix` is unnecessarily restrictive. The `package.json` model (known keys documented, unknown keys allowed) is the right precedent.
- **Removing step 7 from verify entirely:** Skills loaded via frontmatter are implicit — the agent wouldn't know what's available. Rewriting step 7 to say "these are auto-loaded" gives the agent awareness without redundant invocation.
- **Separate scopes for each change:** They share one motivation (configurability) and have a dependency chain. One scope keeps the narrative coherent and the ordering explicit.
- **Adding a `config delete` subcommand:** Premature. `config get/set` covers the core use case. Delete can be scoped later if users need it.

## Open Questions

- Should `config set` on a non-`custom` unknown key warn about potential future collision, or write silently? Recommendation: warn. `"Warning: 'myField' is not a known ana.json field. Use 'custom.myField' to avoid future collisions."` But AnaPlan should decide.
- Exact placement in `--help` groups: INTELLIGENCE (next to `agents`) vs. a new CONFIGURATION group. Leaning INTELLIGENCE but AnaPlan should decide based on the help text flow.
- Depth limit for dot notation traversal — `custom.deeply.nested` should create intermediates, but should `commands.all.build` also work? `commands` is a user-writable record. AnaPlan should define the traversal rules.

## Exploration Findings

### Patterns Discovered
- `anaJsonSchema.ts:31-49`: Zod schema with per-field `.catch()` + `.default()` — fail-soft pattern where one bad field doesn't nuke the config
- `state.ts:493-501`: Merge uses `{ ...parsed.data, anaVersion, lastScanAt }` — spread carries all parsed keys including unknowns with passthrough
- `agents.ts:43-60`: `getAgentInfoList()` reads `fm.skills` from frontmatter — adding skills to verify frontmatter automatically surfaces in dashboard
- `index.ts:37-53`: Three command groups (GETTING STARTED, PIPELINE, INTELLIGENCE) registered via `commandsGroup()`

### Constraints Discovered
- [TYPE-VERIFIED] No property enumeration on AnaJson (`src/`) — grep confirms zero `Object.keys(anaJson)` or `Object.entries(anaJson)` matches
- [TYPE-VERIFIED] Init preserves existing agents (`assets.ts:264`) — dogfood copy must be updated manually, not via re-init
- [TYPE-VERIFIED] Dogfood sync enforced by test (`agent-proof-context.test.ts:67`) — template and `.claude/agents/` must be byte-identical
- [OBSERVED] `check.ts:checkConsistency()` accesses only `language`, `artifactBranch`, `commands` — safe with widened type
- [OBSERVED] `state.ts:preserveUserState()` uses `AnaJsonSchema.safeParse()` then spreads — passthrough data flows through merge unchanged

### Test Infrastructure
- `anaJsonSchema.test.ts`: 12 tests organized by happy path / drift / custom / defaults / catch isolation / enum values. Three tests assert stripping (lines 56, 71, 95) — these flip to assert preservation.
- `agent-proof-context.test.ts`: Dogfood sync test iterates `AGENT_FILES` and asserts byte-identical match between template and `.claude/agents/`.
- `agents.test.ts`: Tests `getAgentInfoList()` with fixture agent files. No test currently asserts skill count for verify specifically — new assertion may be needed.

## For AnaPlan

### Structural Analog
`packages/cli/src/commands/agents.ts` — closest match for Change 3. Reads files, parses structured data, validates inputs, writes back. Same UX patterns (subcommands, `--json` flag, helpful errors) but JSON instead of YAML frontmatter. For Change 1, the schema itself is the analog — the `.catch()` pattern already demonstrates the fail-soft design.

### Relevant Code Paths
- `packages/cli/src/commands/init/anaJsonSchema.ts` — the schema, line 49 is the change point
- `packages/cli/src/commands/init/state.ts:466-542` — `preserveUserState()`, the merge path that must carry unknown keys
- `packages/cli/src/commands/check.ts:725-734` — `readAnaJson()`, consumer that parses through schema
- `packages/cli/src/commands/agents.ts` — structural analog for config command
- `packages/cli/templates/.claude/agents/ana-verify.md` — template to add frontmatter
- `.claude/agents/ana-verify.md` — dogfood copy to sync
- `packages/cli/src/index.ts:37-53` — command registration with groups

### Patterns to Follow
- `anaJsonSchema.ts` per-field `.catch()` pattern for fail-soft validation
- `agents.ts` subcommand structure for `config get/set`
- `state.ts` read-modify-write pattern for JSON updates (consider atomic write via tmp+rename)
- `index.ts` `commandsGroup()` for help display grouping

### Known Gotchas
- The schema file's doc comment (lines 1-27) describes `.strip()` as intentional design. Must update the comment to reflect passthrough — otherwise the next developer reads "strips orphaned fields" and thinks passthrough is a bug.
- The `custom` field's `.default({}).catch({})` must still work with passthrough — verify that passthrough doesn't interfere with nested field defaults.
- `branchPrefix` already has `.default('feature/')` — it's a known schema field, not an unknown key. Config set must allow writing it (it's not machine-managed). Include it in test cases.

### Things to Investigate
- Whether `config set` should use atomic write (write to `.tmp`, rename) or match the existing `writeFile` pattern used by `scan.ts` and `setup.ts`. If the existing pattern doesn't use atomic writes, consistency may matter more than correctness here.
- The `--json` output envelope: raw value (`"feature/"`) or wrapped (`{"branchPrefix":"feature/"}`). Check what `ana agents --json` does for precedent if it exists. If no precedent, raw value for `get`, full object for bare `config`.
