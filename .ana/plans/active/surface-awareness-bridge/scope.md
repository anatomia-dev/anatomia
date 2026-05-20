# Scope: Surface Awareness Bridge

**Created by:** Ana
**Date:** 2026-05-20

## Intent

Make surface awareness visible and queryable beyond the pipeline. Stages 1 and 2 shipped surface detection (scan) and pipeline integration (ana.json schema, scope/plan/build/verify surface flow, proof chain surface field). But the rest of the system — proof chain queries, the quality dashboard, scaffold generators, diagnostics, and the Learn agent — doesn't expose surface knowledge yet. The system can USE surfaces but can't SHOW or QUERY them outside the pipeline flow.

The backfill is the enabling move. 106 of 131 existing proof chain entries can have their surface derived from existing `modules_touched` data. Without it, every query and display feature operates on empty data. With it, `ana proof health --surface cli` works against 87 real entries on day one.

## Complexity Assessment
- **Kind:** feature
- **Size:** medium — ~181 lines of code + tests across 7 items
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/work.ts` — extract surface derivation helper, add backfill migration loop
  - `packages/cli/src/commands/proof.ts` — add `--surface` option to health and audit subcommands
  - `packages/cli/src/utils/proofSummary.ts` — add `surface?: string` to `DashboardEntry` interface, add optional surface filter to `computeHealthReport` and audit filtering, add "By Surface" section to `generateDashboard`
  - `packages/cli/src/utils/scaffold-generators.ts` — add surface listing to Architecture section
  - `packages/cli/src/commands/doctor.ts` — add surface health check, drift detection, legacy field warning
  - `packages/cli/templates/.claude/agents/ana-learn.md` — add `surfaces` to startup, triage guidance, reference section
- **Blast radius:** `writeProofChain` runs on every `work complete` — the backfill migration touches all existing entries on first run. Proof health/audit output changes for any project with surfaces. Dashboard format changes. Doctor gains a new dimension. scaffold-generators affects every future `ana init`.
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** no

## Approach

Seven independent items unified by one theme: make existing surface intelligence visible. The backfill is the foundation — it populates surface fields on existing proof chain entries using the same derivation logic that already runs for new entries. With populated data, the query and display changes are immediately useful rather than operating on empty tables.

Extract the surface derivation logic from its current inline location in `writeProofChain` into a reusable helper. Use the helper for both new-entry derivation (replacing the existing inline code) and the backfill migration (new code). The migration is self-completing: the condition `!entry.surface && entry.modules_touched?.length > 0` stops matching after the first run fills in all derivable surfaces.

For proof health/audit filtering, add a `--surface` option that filters entries before computation. Validate the surface name against ana.json surfaces. For the dashboard, add a conditional "By Surface" section that only renders when at least one entry has a surface field.

Doctor gains three small checks: surface test command presence, scan-to-ana.json surface drift detection, and legacy `buildPackage`/`testPackage` remnant warning.

## Acceptance Criteria

- AC1: `ana proof health --surface cli` filters to entries where `surface === 'cli'` and shows trajectory, hot modules, and stats for only that surface
- AC2: `ana proof audit --surface cli` filters active findings to entries where `surface === 'cli'`
- AC3: `--surface foo` where `foo` is not in ana.json surfaces prints a warning with available surface names and exits non-zero
- AC4: `--surface` with no ana.json surfaces section (single-package repo) prints a message that surfaces are not configured
- AC5: PROOF_CHAIN.md includes a "By Surface" section showing per-surface run count, active finding count, and latest run date — only when at least one entry has a surface field
- AC6: Entries with `surface: null` are grouped as "Unscoped" in the dashboard By Surface section
- AC7: `generateProjectContextScaffold` includes detected surface names with paths and frameworks in the Architecture section for monorepo projects
- AC8: Single-package projects produce no surface mention in the scaffold
- AC9: `ana doctor` reports surface health: count of configured surfaces and warns when any surface has no test command
- AC10: `ana doctor` detects scan-to-ana.json surface drift: warns when scan.json surfaces count differs from ana.json surfaces count with "Run `ana init` to sync"
- AC11: `ana doctor` warns when `buildPackage` or `testPackage` keys exist in ana.json with "Legacy fields — remove with `ana config delete`"
- AC12: Learn template notes `surfaces` in startup field list and includes surface-aware triage guidance
- AC13: Learn template reference section includes `--surface` flag on `ana proof health` and `ana proof audit` commands
- AC14: On `work complete`, existing proof chain entries without `surface` but with non-empty `modules_touched` get their surface derived using the same path-matching logic as new entries
- AC15: The backfill is self-completing — after the first run, the migration condition no longer matches any entries
- AC16: Cross-surface entries (modules_touched spans multiple surfaces) remain without a surface field (null) — the derivation only sets surface when exactly one surface matches
- AC17: Entries without `modules_touched` are not modified by the backfill

## Edge Cases & Risks

- **Backfill on large proof chains:** 131 entries × surface derivation is trivial compute. No performance concern. But the JSON write is larger since every derivable entry gains a `surface` field. The file grows by ~1KB. Negligible.
- **Projects where surface paths changed:** Derivation uses current ana.json surfaces. Old file paths that don't match current surface paths stay null. This is correct — null means "unknown," not "wrong."
- **Cross-surface entries:** 13 of our entries touch both packages/cli and website. These correctly stay null (ambiguous surface). The dashboard shows them as "Unscoped."
- **Concurrent writeProofChain calls:** The existing write pattern (read-modify-write without locking) already has this limitation. The backfill doesn't make it worse — it's idempotent.
- **Single-package repos:** No surfaces in ana.json means: no `--surface` option useful (AC4 handles with clear message), no dashboard section (conditional suppresses), no scaffold mention (AC8), no doctor surface check (skip gracefully).
- **Dashboard "Unscoped" count:** After backfill, our chain shows ~25 unscoped (11 no-modules + 13 cross-surface + 1 no-match). This is honest, not misleading.
- **Legacy field warning false positive:** A user who intentionally keeps `buildPackage` for custom tooling would see the warning. The warning says "legacy" and suggests deletion — it's advice, not enforcement. Doctor is diagnostic, not prescriptive.

## Rejected Approaches

- **Separate `ana proof backfill-surfaces` command:** Scaffolding that runs once and serves zero customers. The embedded migration in `writeProofChain` is automatic, requires no user action, and self-completes. No permanent CLI surface for a one-time operation.
- **Adding `surfaces` to Ana/Plan startup instructions:** The downstream instructions (scope template's Surface field, Plan's Checkpoint Commands section) already reference surfaces explicitly. Opus reads the full ana.json regardless of what the startup instruction says to "note." Adding "and `surfaces`" to two startup instructions is instruction bloat for behavior that already works.
- **AGENTS.md surface commands section:** Cross-tool consumers (Cursor, Copilot) don't have conditional execution ("if modifying files in website/, run these commands"). Per-surface commands in AGENTS.md are specialized knowledge without the execution context. Deferred.
- **Always-show dashboard By Surface section:** Would show "Unscoped: 131 runs" before backfill runs on any project. The conditional (only render when ≥1 entry has surface) ensures the section appears naturally, never broken-looking.
- **General unknown-key detection in doctor:** `config set` already warns on unknown keys at write time. Doctor checking for arbitrary unknown keys is a different concern (config hygiene) unrelated to surface awareness. Scoped to only `buildPackage`/`testPackage` — the known legacy remnants from stage 2.

## Open Questions

None — all resolved during investigation.

## Exploration Findings

### Patterns Discovered
- `work.ts:1090-1098` — existing migration pattern in `writeProofChain` (lesson→closed backfill). The surface backfill follows this same pattern: iterate existing entries, apply conditional transformation, idempotent.
- `work.ts:1004-1027` — inline surface derivation for new entries. 15 lines of path-matching logic. Extraction target for the helper function.
- `proof.ts:2131-2175` — health subcommand registration. No existing `--surface` option. Commander `.option('--surface <name>')` is the addition point.
- `proof.ts:1584-1640` — audit subcommand registration. Same pattern as health for adding `--surface`.
- `proofSummary.ts:479-575` — `generateDashboard`. The "By Surface" section inserts after the summary line and before Hot Modules. Entry grouping by `surface` field with null→"Unscoped".
- `proofSummary.ts:649-935` — `computeHealthReport`. The surface filter is a pre-filter on `chain.entries` before computation — filter entries, then compute on the filtered set. No changes to computation logic itself.
- `scaffold-generators.ts:110-118` — monorepo Architecture section. The surface line goes after the packages line and before the directory structure line.
- `doctor.ts:582-611` — `runDoctor`. The surface assessment is a new parallel dimension alongside the existing 5.
- `doctor.ts:466-541` — `formatTerminalOutput`. Surface health follows the proof chain line in the display.

### Constraints Discovered
- [TYPE-VERIFIED] ProofChainEntry.surface is `string | undefined` (proof.ts:67) — nullable, no schema change needed
- [OBSERVED] `computeHealthReport` takes `chain: { entries: Array<...> }` — the surface filter applies before this call, not inside it. The function is pure and doesn't need modification for filtering.
- [OBSERVED] `generateDashboard` receives `entries: DashboardEntry[]` — the By Surface section reads `surface` from entries directly. DashboardEntry would need the `surface` field added to its interface.
- [OBSERVED] Single-package repos have no `surfaces` key in ana.json — all surface-aware code must handle this gracefully
- [OBSERVED] `formatHealthDisplay` at proof.ts:412 is the terminal formatter for health output — needs no change if filtering happens before `computeHealthReport`

### Test Infrastructure
- `packages/cli/tests/commands/work.test.ts` — extensive `writeProofChain` tests. The backfill tests follow the existing pattern of creating chain entries with/without `modules_touched` and verifying the written output.
- `packages/cli/tests/commands/proof.test.ts` — proof subcommand tests. Health and audit tests exist. Surface filter tests add entries with surface fields and verify filtered output.
- `packages/cli/tests/utils/proofSummary.test.ts` — unit tests for `computeHealthReport`, `generateDashboard`. Dashboard surface section tests verify conditional rendering and grouping.
- `packages/cli/tests/commands/doctor.test.ts` — doctor dimension tests. Surface dimension tests create ana.json with/without surfaces and verify output.
- `packages/cli/tests/utils/scaffold-generators.test.ts` — scaffold generator tests. Surface line tests verify monorepo vs single-package output.

## For AnaPlan

### Structural Analog
`work.ts:1090-1098` (lesson→closed migration) — same shape as the surface backfill: iterate existing entries in writeProofChain, apply conditional transformation based on entry state, idempotent. This is the migration pattern to follow.

### Relevant Code Paths
- `packages/cli/src/commands/work.ts:916-1176` — `writeProofChain` function. Contains the new entry surface derivation (1004-1027), the existing migration loop (1088-1143), and the chain write (1148-1150).
- `packages/cli/src/commands/proof.ts:2131-2175` — health subcommand. Add `--surface` option here.
- `packages/cli/src/commands/proof.ts:1584-1640` — audit subcommand. Add `--surface` option here.
- `packages/cli/src/utils/proofSummary.ts:479-575` — `generateDashboard`. Add By Surface section.
- `packages/cli/src/utils/proofSummary.ts:649-935` — `computeHealthReport`. Surface filter is pre-computation.
- `packages/cli/src/utils/scaffold-generators.ts:109-118` — Architecture section of project-context scaffold.
- `packages/cli/src/commands/doctor.ts:582-611` — `runDoctor` orchestrator.
- `packages/cli/src/commands/doctor.ts:297-346` — `assessProofChain` (structural pattern for new assessment function).
- `packages/cli/templates/.claude/agents/ana-learn.md:35` — startup instruction field list.
- `packages/cli/templates/.claude/agents/ana-learn.md:492-519` — reference section with proof commands.

### Patterns to Follow
- Migration pattern: `work.ts:1090-1098` for the backfill loop structure
- Commander option: `proof.ts:1588` (`.option('--severity <values>')`) for `--surface` option syntax
- Dashboard section: `proofSummary.ts:500-515` (Hot Modules) for the By Surface section structure
- Doctor dimension: `doctor.ts:297-346` (`assessProofChain`) for the surface assessment function shape
- Doctor display: `doctor.ts:518-532` (proof chain line) for the surface health display format
- Scaffold line: `scaffold-generators.ts:112-117` (monorepo packages line) for the surface listing format

### Known Gotchas
- `computeHealthReport` is a pure function that takes a chain object. Don't modify it to accept a surface filter — filter the entries before calling it. This preserves the function's purity and avoids a change that ripples to all callers.
- `DashboardEntry` interface at `proofSummary.ts:458-463` doesn't include `surface`. It needs the field added for the By Surface section to read it.
- The health subcommand reads the chain and passes it to `computeHealthReport` directly. The surface filter inserts between the chain read and the computation call.
- Doctor's `runDoctor` uses `Promise.all` for parallel dimension assessment. The surface assessment can read ana.json synchronously (it's already read by other assessors) — keep it simple.
- The proof chain JSON write at `work.ts:1150` writes the entire chain. The backfill mutations are in-place on `chain.entries` — they're included in the write automatically.

### Resolved During Scoping
- **DashboardEntry type:** Extend the interface with `surface?: string`. The entries passed to `generateDashboard` already carry the field (they come from `ProofChainEntry` which has `surface?: string` after stage 2) — the type just needs to declare what's already there. One-line type change, not a logic change.
- **`--surface` validation:** Validate against ana.json surfaces. Read ana.json, check `surfaces` key exists and contains the named surface. If not found, print available surface names and exit non-zero. This prevents typos and gives actionable error messages. On single-package repos (no surfaces key), print "Surfaces are not configured" (AC4).
