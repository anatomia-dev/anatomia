# Scope: Fix Polyglot Detection for Tauri+TS and Ruby+JS Projects

**Created by:** Ana
**Date:** 2026-05-19

## Intent

The polyglot language detector has two gaps that produce trust-killing misclassifications on real customer repos:

1. **Cap (19k stars, YC-profile Tauri+TS monorepo) detects as Rust instead of TypeScript.** Cap has 1185 TypeScript files (the web app, API, shared packages) and 529 Rust files (the Tauri desktop component). The Tier 3 Rust check fires because Cargo.toml has `[workspace]` — it never considers that pnpm-workspace.yaml also exists, or that the Cargo workspace is specifically a Tauri desktop app rather than the product core. A Cap engineer seeing "Language: Rust" as the first line of scan output closes the tab.

2. **Maybe Finance (Ruby on Rails, 794 .rb files) detects as Node.js.** Maybe has a `Gemfile` and `Gemfile.lock` — it's definitively a Ruby project. But it also has a `package.json` with a biome devDependency for code formatting. The package.json branch returns Node without ever checking for Gemfile, because Ruby isn't in the competing manifest checks.

Both issues were discovered during V2-Alpha pre-launch testing across 20 real open-source repos. Cap is exactly our sniper customer — YC-profile, modern TS stack, pnpm/Turborepo monorepo.

## Complexity Assessment

- **Kind:** fix
- **Size:** medium — 1 source file changed (~60 lines added), 1 test file updated (~80 lines added), each fix independently testable
- **Files affected:**
  - `packages/cli/src/engine/detectors/projectType.ts` — add `hasTauriWorkspaceDep` helper, add Tauri check to Tier 3/4 Rust paths, add `hasGemfile` to competing manifests, add Ruby Tier 3/4 checks
  - `packages/cli/tests/engine/detectors/polyglot.test.ts` — new test cases for Tauri discriminator, Ruby detection, priority ordering
- **Blast radius:** Detection output changes for Tauri+TS monorepos and Ruby+JS projects. All existing correct classifications are preserved — the changes add new conditions within the existing Tier 3/4 checks and a new competing manifest, without altering the fast paths (Tier 1, Tier 2) or any downstream consumers.
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** no

## Approach

Two independent fixes in the same file, shipping together because they're the same disease class (non-Node project with secondary package.json misclassified as Node/Rust).

**Fix 1: Tauri discriminator for Rust+TS monorepos.** When the Tier 3 Rust check fires (hasLockfile + hasCargo + hasRustWorkspace), add a secondary check: if `pnpm-workspace.yaml` also exists AND Cargo.toml has `tauri` as a workspace dependency, return Node 0.85 instead of Rust 0.90. The reasoning: `tauri` in `[workspace.dependencies]` means the Rust workspace is a desktop app component, not the product core. A pnpm workspace means the TS side is substantial enough to warrant monorepo management. Together, they signal "TS monorepo with Tauri desktop component." This reads architectural intent rather than counting files — more reliable because file count fails here (tabby and Cap both have 2-2.5x more TS files than Rust, but tabby's TS is an interface layer while Cap's TS is the product).

**Fix 2: Ruby in competing manifests.** Add `hasGemfile` to the competing manifest checks alongside `hasPyproject`, `hasCargo`, `hasGoMod`. Gate the Tier 1 fast path on `!hasGemfile`. Add Ruby Tier 3 and Tier 4 checks. No content check needed — `Gemfile` at root always means Ruby project (unlike pyproject.toml which can be tooling-only for ruff/black). Tier ordering within Tier 3: Python → Rust → Ruby → Go.

## Acceptance Criteria

- AC1: A repo with `package.json` + `pnpm-lock.yaml` + `pnpm-workspace.yaml` + `Cargo.toml` with `[workspace]` and `tauri` in `[workspace.dependencies]` detects as `type: 'node'` with confidence 0.85
- AC2: A repo with `package.json` + `pnpm-lock.yaml` + `pnpm-workspace.yaml` + `Cargo.toml` with `[workspace]` but NO `tauri` in workspace dependencies detects as `type: 'rust'` with confidence 0.90 (tabby case — unchanged)
- AC3: A repo with `package.json` + `pnpm-lock.yaml` + `Cargo.toml` with `[workspace]` and `tauri` in deps but NO `pnpm-workspace.yaml` detects as `type: 'rust'` with confidence 0.90 (pure Tauri desktop app — Rust is correct)
- AC4: A repo with `package.json` + `workspaces` field + `Cargo.toml` with `[workspace]` and `tauri` detects as `type: 'node'` with confidence 0.90 (Tier 2 guard fires first — unchanged)
- AC5: A repo with `package.json` + `package-lock.json` + `Gemfile` detects as `type: 'ruby'` with confidence 0.90
- AC6: A repo with `package.json` (no lockfile) + `Gemfile` detects as `type: 'ruby'` with confidence 0.85
- AC7: A repo with `package.json` + `pnpm-lock.yaml` + NO competing manifests still detects as `type: 'node'` with confidence 0.95 (Tier 1 fast path — unchanged)
- AC8: All existing polyglot tests pass without modification
- AC9: A priority ordering test exists: when both `pyproject.toml` (with deps) and `Cargo.toml` (with [workspace]) coexist alongside `package.json` + lockfile, Python wins (code-position ordering is tested, not implicit)
- AC10: The Tauri discriminator also applies to Tier 4 (no lockfile case): `package.json` (no lockfile) + `pnpm-workspace.yaml` + `Cargo.toml` with `[workspace]` + `tauri` dep → Node 0.80
- AC11: Malformed `[workspace.dependencies]` section in Cargo.toml falls through safely to Rust (conservative default)
- AC12: Cargo.toml with `[workspace.dependencies.tauri]` sub-table format (instead of inline `tauri = { ... }`) is correctly detected as having tauri dependency

## Edge Cases & Risks

- **Tauri dep in Cargo.toml members vs dependencies.** Cap has `"apps/desktop/src-tauri"` as a workspace MEMBER (in the `[workspace]` members array) AND `tauri = { version = "2.5.0" }` as a workspace DEPENDENCY (in `[workspace.dependencies]`). The `hasTauriWorkspaceDep` check must be scoped to `[workspace.dependencies]`, NOT the whole file. A member path containing "tauri" is a directory path, not a framework dependency.
- **Pure Tauri desktop app.** A single Tauri app (not a monorepo) has `package.json` + `Cargo.toml` with tauri dep, but NO `pnpm-workspace.yaml`. The Tauri discriminator requires pnpm-workspace.yaml — without it, the check doesn't fire, and the project correctly stays Rust. A pure Tauri desktop app IS a Rust project.
- **Tauri app where Rust IS genuinely primary.** A Rust-heavy Tauri app in a pnpm workspace would be classified as Node by this heuristic. This is a known limitation. If the project has pnpm-workspace.yaml, the TS side is substantial enough to warrant workspace management — closer to Cap's pattern than to a thin-UI desktop app. No evidence of this false positive in real repos today.
- **Ruby project without Gemfile at root.** Some Ruby projects use only `Gemfile.lock` or a subdirectory Gemfile. The check only looks at root. These edge cases fall through to Node. Acceptable — the common Rails pattern has Gemfile at root.
- **Node project with a Gemfile for non-Ruby purposes.** Gemfile is Ruby-specific (unlike pyproject.toml which can be tooling-only). No non-Ruby project has a Gemfile at root. Safe to treat as definitive.
- **Priority ordering: Ruby vs Go.** When both `Gemfile` and `go.mod` exist alongside `package.json`, Ruby wins by code position. This order (Python → Rust → Ruby → Go) is deliberate — Ruby+JS (Rails with frontend tooling) is more common than Go+JS in the package.json branch.

## Rejected Approaches

**File count majority as tiebreaker.** Investigated on real repos. Cap has 1185 TS vs 529 Rust (2.24:1 TS dominant). tabby has 726 TS vs 272 Rust (2.67:1 TS dominant). Both have TS dominant by similar ratios, but Cap should be Node and tabby should be Rust. File count gives the same (wrong for tabby) answer for both. The discriminator is architectural intent (Tauri = desktop component), not statistical proxy (file count).

**pnpm-workspace.yaml as workspace guard (Tier 2).** Adding pnpm-workspace.yaml to the Tier 2 workspaces guard would make it return Node before the Rust check runs. This fixes Cap but regresses tabby — tabby also has pnpm-workspace.yaml and should stay Rust. The guard can't be unconditional.

**Dependency weight analysis.** Cap's primary TS app has 129 deps; tabby's admin UI has 118 deps. Both are substantial. Dependency count doesn't discriminate.

**Lines of code instead of file count.** More expensive to compute and still a statistical proxy. The architectural question (is Rust the core or a component?) is answered more directly by the Tauri dependency than by any counting heuristic.

**Polyglot output type.** Adding a `'polyglot'` or `'typescript+rust'` ProjectType would require changes to 32 downstream comparison sites. Convention detection, pattern inference, structure analysis, framework detection, and dep reading all use `=== 'node'` / `=== 'rust'` string comparisons. A polyglot type would fall through every conditional and get zero analysis. The right long-term direction but an architectural scope, not a detection fix.

## Open Questions

None — the Tauri discriminator, Ruby addition, tier ordering, and blast radius were all resolved during investigation.

## Exploration Findings

### Patterns Discovered

- `projectType.ts` line 159-169: Tier 3 Rust check reads Cargo.toml content already — the `hasTauriWorkspaceDep` check adds no new I/O, just a regex on the same content string
- `projectType.ts` line 34-39: `hasRustWorkspace` is the structural analog for `hasTauriWorkspaceDep` — same pattern (section-scoped regex on TOML content)
- `projectType.ts` line 48-98: `hasPythonProjectDeps` demonstrates the section-scoping pattern — find section header, slice to next section, check within slice. `hasTauriWorkspaceDep` should follow this exact approach for `[workspace.dependencies]`
- `projectType.ts` line 141: Tier 1 fast path condition — `hasLockfile && !hasPyproject && !hasCargo && !hasGoMod` — must add `&& !hasGemfile`
- Cap's Cargo.toml has `"apps/desktop/src-tauri"` in members AND `tauri = { version = "2.5.0" }` in workspace.dependencies — the regex MUST be scoped to `[workspace.dependencies]`, not the whole file
- Cap uses pnpm-workspace.yaml (not package.json workspaces) — common for pnpm monorepos that aren't npm/Yarn
- tabby also has pnpm-workspace.yaml but NO tauri dependency — the Tauri check correctly preserves tabby as Rust

### Constraints Discovered

- [OBSERVED] Cap: 1185 TS files, 529 Rust files (2.24:1). pnpm-workspace.yaml present. Cargo.toml has `[workspace]` + `tauri` in workspace.dependencies
- [OBSERVED] tabby: 726 TS files, 272 Rust files (2.67:1). pnpm-workspace.yaml present. Cargo.toml has `[workspace]` + axum/hyper (web server, NOT tauri)
- [OBSERVED] Spacedrive: package.json HAS `workspaces` field → already caught by Tier 2 guard. Tauri discriminator not needed
- [OBSERVED] Maybe Finance: 794 .rb files, Gemfile + Gemfile.lock, package.json with only biome devDep, package-lock.json present
- [OBSERVED] File count cannot discriminate Cap from tabby — both are TS-dominant by similar ratios. Architectural intent (tauri dep) is the reliable signal
- [TYPE-VERIFIED] `hasTauriWorkspaceDep` needs section scoping: Cap's Cargo.toml has "src-tauri" in member paths AND `tauri = ...` in workspace.dependencies — whole-file regex would match on member path string

### Test Infrastructure

- `tests/engine/detectors/polyglot.test.ts` — 485 lines, tests all existing polyglot scenarios. Pattern: create temp dir, write manifest files with specific content, call `detectProjectType(dir)`, assert type/confidence/indicators. Same pattern for new tests.
- Verify report from `rust-go-polyglot-detection` flagged: implicit priority ordering is untested (Python > Rust > Go from code position). New tests should include a priority ordering test.

## For AnaPlan

### Structural Analog

`hasPythonProjectDeps(content: string): boolean` at `projectType.ts:48-98` — the section-scoping pattern. Finds `[project]` section header, slices to next section, checks within that slice. `hasTauriWorkspaceDep` follows the same approach: find `[workspace.dependencies]` section header, slice to next section, check for `tauri` key within that slice.

### Relevant Code Paths

- `packages/cli/src/engine/detectors/projectType.ts:34-39` — `hasRustWorkspace` (direct sibling for `hasTauriWorkspaceDep`)
- `packages/cli/src/engine/detectors/projectType.ts:48-98` — `hasPythonProjectDeps` (section-scoping pattern to follow)
- `packages/cli/src/engine/detectors/projectType.ts:137-144` — competing manifest checks + Tier 1 fast path (add `hasGemfile`)
- `packages/cli/src/engine/detectors/projectType.ts:159-169` — Tier 3 Rust check (add Tauri discriminator)
- `packages/cli/src/engine/detectors/projectType.ts:197-208` — Tier 4 Rust check (add Tauri discriminator)
- `packages/cli/src/engine/detectors/projectType.ts:251-254` — existing Ruby detection in no-package.json branch (reference for Ruby behavior)
- `packages/cli/tests/engine/detectors/polyglot.test.ts:285-301` — existing Rust workspace test (structural analog for Tauri test)

### Patterns to Follow

- `hasPythonProjectDeps`: section-scoped regex on TOML content. Find header → slice to next section → check within slice. `hasTauriWorkspaceDep` follows this exactly for `[workspace.dependencies]`.
- Tier 3/4 structure: Python checks at tiers 3/4, then Rust, then Go. Ruby inserts between Rust and Go: Python → Rust → Ruby → Go.
- Error handling: all content reads wrapped in try/catch, fall through to Node on failure (conservative default).
- Test pattern: write manifest files to temp dir, call `detectProjectType`, assert result. Same as all existing polyglot tests.

### Known Gotchas

- The `hasTauriWorkspaceDep` function must detect BOTH TOML formats for workspace dependencies:
  1. **Inline format** (Cap's pattern): `tauri = { version = "2.5.0" }` inside a `[workspace.dependencies]` section. Detect with section-scoping: find `^\[workspace\.dependencies\]\s*$` header, slice to next section, check for `^tauri\s*=` within that slice.
  2. **Sub-table format** (valid TOML alternative, seen in tabby for other deps like uuid): `[workspace.dependencies.tauri]` as a standalone section header with `version = "2.5.0"` on the next line. Detect with `^\[workspace\.dependencies\.tauri\]` anywhere in the file — this is unambiguous (it's a TOML section header, not a string in a members array).
  Either match means tauri is a workspace dependency. Without checking both, the function would miss projects using the sub-table format. Without section scoping for the inline format, the regex would match `"apps/desktop/src-tauri"` in the members array.
- The Tauri check is INSIDE the existing `hasRustWorkspace` conditional — it's a refinement of the Rust path, not a separate tier. The flow: `hasRustWorkspace(content)` returns true → check `hasTauriWorkspaceDep(content)` + `hasPnpmWorkspace` → if both, return Node instead of Rust.
- `pnpm-workspace.yaml` existence check adds one `exists()` call. Only fires when package.json + lockfile + Cargo.toml all exist — rare path. Negligible performance impact.
- The Ruby `hasGemfile` check doesn't need a content reader — Gemfile existence is sufficient. But it DOES need to be added to the Tier 1 fast path condition (`!hasGemfile`), otherwise a Ruby project with a lockfile and no other competing manifest would hit Tier 1 and return Node 0.95.

### Things to Investigate

None — all design-judgment questions resolved during investigation.
