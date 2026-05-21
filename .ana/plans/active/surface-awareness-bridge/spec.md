# Spec: Surface Awareness Bridge

**Created by:** AnaPlan
**Date:** 2026-05-20
**Scope:** .ana/plans/active/surface-awareness-bridge/scope.md

## Approach

Seven independent additions that make surface awareness visible beyond the pipeline. The backfill is the foundation — it populates existing proof chain entries with derived surface fields so that every query and display feature works on real data from day one.

**Core refactor:** Extract the 15-line surface derivation block at `work.ts:1004-1027` into a named helper function in the same file. The helper takes `modulesTouched: string[]` and an ana.json surfaces record, returns `string | undefined`. Both the existing new-entry derivation and the new backfill loop call this helper. This is a mechanical extraction — no logic change.

**Backfill pattern:** Follow the existing lesson→closed migration at `work.ts:1090-1098`. The backfill iterates `chain.entries` inside `writeProofChain`, checks `!entry.surface && entry.modules_touched?.length > 0`, and calls the extracted helper. The condition stops matching after the first run fills in all derivable surfaces (self-completing). Cross-surface entries (multiple matching surfaces) stay `undefined` — this is correct per AC16.

**Surface validation helper:** A small function in `proof.ts` (not exported — only used by health and audit in the same file). Reads ana.json from `projectRoot`, checks for `surfaces` key, validates the requested surface name. Returns `{ valid: boolean; available: string[]; configured: boolean }`. Both health and audit call this before computation, producing identical error messages for invalid surfaces or unconfigured surfaces.

**`--surface` filter semantics:** Filters at the ENTRY level, not individual findings. An entry with `surface: "cli"` includes or excludes all its findings as a unit. For health: filter `chain.entries` before passing to `computeHealthReport`. For audit: filter `activeFindings` post-collection (same pattern as `--severity` at line 1886-1894 and `--entry` at line 1898-1901), but the filter checks `f.entry_surface` rather than a finding-level field — which means the audit finding collection loop must capture `entry.surface` alongside `entry.slug` and `entry.feature`.

## Output Mockups

### `ana proof health --surface cli`

Same output as `ana proof health` but computed on entries where `surface === "cli"` only. The health display itself is unchanged — filtering happens before computation.

### `ana proof audit --surface cli`

Same output as `ana proof audit` but filtered to findings from entries where `surface === "cli"`.

### `--surface foo` (invalid)

```
Error: Unknown surface "foo". Available surfaces: cli, website
```
Exit code 1.

### `--surface cli` (no surfaces configured)

```
Surfaces are not configured. Add surfaces to ana.json with `ana init`.
```
Exit code 1.

### Dashboard "By Surface" section

```
## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| cli | 87 | 12 | 2026-05-17 |
| website | 19 | 3 | 2026-05-15 |
| Unscoped | 25 | 8 | 2026-05-10 |
```

Only rendered when at least one entry has a non-undefined `surface` field. Placed after the summary line and before Hot Modules.

### Scaffold Architecture section (monorepo)

```
**Detected:** pnpm · 2 packages (anatomia-cli, anatomia-website)
**Detected surfaces:** cli (packages/cli, TypeScript), website (website, Next.js)
**Detected:** 3 directories mapped: .github/, packages/, tests/
```

Single-package projects: no surface line at all.

### Doctor surface output

```
  ✓ Surfaces — 2 configured
```

Or with warnings:
```
  ○ Surfaces — 2 configured (website has no test command)
```

Drift detection:
```
  ○ Surfaces — scan detected 3 surfaces, ana.json has 2. Run `ana init` to sync
```

Legacy field warning:
```
  ⚠ Legacy fields: buildPackage, testPackage — remove with `ana config delete`
```

## File Changes

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** Extract surface derivation helper from inline block (lines 1004-1027). Add backfill migration loop in the existing migration section (after line 1098). The backfill reads ana.json surfaces once (reusing the already-loaded data from the new-entry derivation path where possible) and iterates existing entries.
**Pattern to follow:** Lesson→closed migration at `work.ts:1090-1098` for the backfill loop structure.
**Why:** The backfill populates surface fields on existing entries. Without it, every query and display feature operates on empty data.

### `packages/cli/src/commands/proof.ts` (modify)
**What changes:** Add `--surface <name>` option to both health and audit subcommands. Add surface validation helper function. For health: filter `chain.entries` before `computeHealthReport` call. For audit: capture `entry.surface` in the finding collection loop, filter `activeFindings` by entry surface post-collection. The `--matrix` path in audit also needs surface filtering — filter `chain.entries` before the matrix computation loop.
**Pattern to follow:** `--severity` filter at `proof.ts:1886-1894` for audit post-collection filtering. `--json` option registration at `proof.ts:2133` for Commander option syntax.
**Why:** Users need to query proof health and findings for a specific surface in monorepo projects.

### `packages/cli/src/utils/proofSummary.ts` (modify)
**What changes:** Add `surface?: string` to the `DashboardEntry` interface (line 458-463). Add "By Surface" section generation in `generateDashboard` (after summary line, before Hot Modules). The section groups entries by surface field (undefined → "Unscoped"), counts runs, active findings, and latest `completed_at` per surface. Conditionally rendered: only when at least one entry has a defined `surface`.
**Pattern to follow:** Hot Modules section at `proofSummary.ts:486-515` for the table generation pattern.
**Why:** The dashboard should show surface distribution for projects with surface awareness.

### `packages/cli/src/utils/scaffold-generators.ts` (modify)
**What changes:** Add a "Detected surfaces" line in the Architecture section after the monorepo packages line (after line 117). Lists surface names with paths and frameworks from `EngineResult.surfaces`. Only emitted when `result.surfaces` exists and has entries — single-package projects produce no surface mention.
**Pattern to follow:** The monorepo packages line at `scaffold-generators.ts:110-117` for the detection line format.
**Why:** New `ana init` users with monorepo projects should see their surfaces in the Architecture section scaffold.

### `packages/cli/src/commands/doctor.ts` (modify)
**What changes:** Add `SurfacesDimension` interface and `assessSurfaces` function. Three checks: (1) surface count + test command presence per surface, (2) scan-vs-ana.json surface count drift, (3) legacy `buildPackage`/`testPackage` key detection. Add to `DoctorDimensions` interface. Add display line in `formatTerminalOutput` after the proof chain line. Add to `runDoctor` orchestration.
**Pattern to follow:** `assessProofChain` at `doctor.ts:297-346` for the dimension function shape. Proof chain display line at `doctor.ts:518-532` for the terminal format.
**Why:** Doctor should surface configuration issues related to surfaces — missing test commands, drift, legacy fields.

### `packages/cli/templates/.claude/agents/ana-learn.md` (modify)
**What changes:** Add `surfaces` to the startup field list at line 35 (step 3, "Read `.ana/ana.json`"). Add surface-aware triage guidance (when triaging findings, note which surface they belong to — surface-specific patterns are stronger promotion candidates). Add `--surface` flag to `ana proof health` and `ana proof audit` command reference lines in the reference section (lines 493-494).
**Pattern to follow:** Existing command reference format at `ana-learn.md:493-507`.
**Why:** Learn agent should be aware of surfaces for better triage and can use `--surface` to focus sessions.

### `packages/cli/tests/commands/work.test.ts` (modify)
**What changes:** Add tests for the surface derivation helper function and the backfill migration. Test cases: entry without surface but with matching modules_touched gets surface derived; cross-surface entry stays undefined; entry without modules_touched is not modified; entry that already has a surface is not modified (idempotent).
**Pattern to follow:** Existing proof chain test structure at `work.test.ts:1640+`.
**Why:** The backfill is the most impactful change — it mutates existing entries. Tests verify correct derivation and idempotence.

### `packages/cli/tests/commands/proof.test.ts` (modify)
**What changes:** Add tests for `--surface` filtering on health and audit. Test cases: valid surface filters entries correctly; invalid surface produces error; unconfigured surfaces (no surfaces key) produces message.
**Pattern to follow:** Existing health test structure at `proof.test.ts:2037+`.
**Why:** Surface filtering changes query output — tests verify correct filtering behavior.

### `packages/cli/tests/utils/proofSummary.test.ts` (modify)
**What changes:** Add tests for the dashboard "By Surface" section. Test cases: section appears when entries have surface fields; section absent when no entries have surface; null surfaces grouped as "Unscoped"; run count and active count per surface are correct.
**Pattern to follow:** Existing `generateDashboard` tests at `proofSummary.test.ts:1731+`.
**Why:** Dashboard section rendering has conditional logic that must be tested.

### `packages/cli/tests/commands/doctor.test.ts` (modify)
**What changes:** Add tests for the surfaces dimension. Test cases: surfaces with test commands pass; surface without test command warns; scan-vs-ana.json drift warns; legacy fields warn; no surfaces configured skips gracefully.
**Pattern to follow:** Existing dimension test structure using `createMinimalProject` helper at `doctor.test.ts:24+`.
**Why:** Doctor dimensions need test coverage for each check variant.

### `packages/cli/tests/utils/scaffold-generators.test.ts` (create)
**What changes:** New test file for `generateProjectContextScaffold` surface line. Test cases: monorepo with surfaces includes "Detected surfaces" line; single-package project has no surface mention.
**Pattern to follow:** Existing proofSummary.test.ts structure for import and test patterns.
**Why:** No existing scaffold-generators test file. The surface line addition needs coverage.

## Acceptance Criteria

- [ ] AC1: `ana proof health --surface cli` filters to entries where `surface === 'cli'` and shows trajectory, hot modules, and stats for only that surface
- [ ] AC2: `ana proof audit --surface cli` filters active findings to entries where `surface === 'cli'`
- [ ] AC3: `--surface foo` where `foo` is not in ana.json surfaces prints a warning with available surface names and exits non-zero
- [ ] AC4: `--surface` with no ana.json surfaces section (single-package repo) prints a message that surfaces are not configured
- [ ] AC5: PROOF_CHAIN.md includes a "By Surface" section showing per-surface run count, active finding count, and latest run date — only when at least one entry has a surface field
- [ ] AC6: Entries with `surface: null` are grouped as "Unscoped" in the dashboard By Surface section
- [ ] AC7: `generateProjectContextScaffold` includes detected surface names with paths and frameworks in the Architecture section for monorepo projects
- [ ] AC8: Single-package projects produce no surface mention in the scaffold
- [ ] AC9: `ana doctor` reports surface health: count of configured surfaces and warns when any surface has no test command
- [ ] AC10: `ana doctor` detects scan-to-ana.json surface drift: warns when scan.json surfaces count differs from ana.json surfaces count with "Run `ana init` to sync"
- [ ] AC11: `ana doctor` warns when `buildPackage` or `testPackage` keys exist in ana.json with "Legacy fields — remove with `ana config delete`"
- [ ] AC12: Learn template notes `surfaces` in startup field list and includes surface-aware triage guidance
- [ ] AC13: Learn template reference section includes `--surface` flag on `ana proof health` and `ana proof audit` commands
- [ ] AC14: On `work complete`, existing proof chain entries without `surface` but with non-empty `modules_touched` get their surface derived using the same path-matching logic as new entries
- [ ] AC15: The backfill is self-completing — after the first run, the migration condition no longer matches any entries
- [ ] AC16: Cross-surface entries (modules_touched spans multiple surfaces) remain without a surface field (null) — the derivation only sets surface when exactly one surface matches
- [ ] AC17: Entries without `modules_touched` are not modified by the backfill
- [ ] AC18: Tests pass with `pnpm run test -- --run`
- [ ] AC19: No build errors with `pnpm run build`
- [ ] AC20: Lint passes with `(cd packages/cli && pnpm run lint)`

## Testing Strategy

- **Unit tests (proofSummary.test.ts):** Dashboard "By Surface" section rendering — conditional appearance, grouping, counts, "Unscoped" label. Follow the existing `generateDashboard` test pattern at line 1731.
- **Unit tests (scaffold-generators.test.ts):** New test file. Surface line in scaffold output for monorepo projects, absence for single-package. Import `generateProjectContextScaffold` and pass mock `EngineResult` objects with and without `surfaces`.
- **Integration tests (work.test.ts):** Backfill migration — create entries with `modules_touched` but no `surface`, run `writeProofChain`, verify surface fields populated. Test cross-surface, no-modules, and already-has-surface cases.
- **Integration tests (proof.test.ts):** `--surface` filtering on health and audit. Create chain with entries across surfaces, verify filtered output. Test invalid surface error message.
- **Integration tests (doctor.test.ts):** Surface dimension — create ana.json with surfaces, verify pass/warn states for test commands, drift, and legacy fields.
- **Edge cases:** Cross-surface entries stay undefined. Empty `modules_touched` array treated same as missing. Legacy fields check is case-sensitive on key names. Single-package repo (no surfaces key) handled gracefully across all touch points.

## Dependencies

- Surface awareness schema (stage 2) must be shipped — it is (`surface-awareness-schema` completed).
- `ProofChainEntry.surface` must exist as `string | undefined` in `types/proof.ts` — verified at proof.ts:67.

## Constraints

- `computeHealthReport` stays pure — no surface parameter. Filtering happens before the call.
- `DashboardEntry` interface change is additive (optional field) — no breaking change.
- Doctor is read-only — no file writes, no git operations.
- Backfill must be idempotent — running it multiple times produces the same result.
- All surface-aware code must handle the no-surfaces case (single-package repos).

## Gotchas

- **Audit `--matrix` path:** The matrix computation at `proof.ts:1645-1825` is a separate code path from the regular audit. `--surface` must filter entries in BOTH paths — the matrix loop iterates `chain.entries` directly, not the `activeFindings` array. Filter `chain.entries` before the matrix loop, or create a filtered view.
- **Audit finding collection must capture `entry.surface`:** The `activeFindings` array (proof.ts:1828-1883) collects findings with `entry_slug` and `entry_feature`. Add `entry_surface` to the collected object so the post-collection filter can check it. Don't re-read the chain to find the surface — capture it during collection.
- **`DashboardEntry` already receives data from `ProofChainEntry`:** The entries passed to `generateDashboard` already carry `surface` from the chain — the `DashboardEntry` interface just needs to declare the field. The call site in the dashboard generation code (`work.ts` `writeProofChain`) already passes chain entries that have `surface`. No mapping change needed.
- **Doctor `runDoctor` uses `Promise.all` for async dimensions but `assessProofChain` is sync.** The new `assessSurfaces` should be sync too — it reads ana.json and scan.json, both small files. Add it alongside `assessProofChain` after the `Promise.all` block.
- **`EngineResult.surfaces` type:** The surfaces field on EngineResult is an array of objects with `name`, `path`, `packageName`, `language`, `framework`, `testing`, `sourceFiles`. The scaffold generator receives the full `EngineResult` — check `result.surfaces?.length > 0` for the conditional.
- **Backfill needs ana.json surfaces data:** The backfill loop runs inside `writeProofChain` which already reads ana.json for the new-entry derivation (lines 1006-1009). Restructure so the ana.json read happens once, before both the new-entry derivation and the backfill loop. Pass the surfaces record to the extracted helper.
- **`generateDashboard` receives `DashboardEntry[]` not full `ProofChainEntry[]`.** The `completed_at` field exists on `DashboardEntry`. The "By Surface" section needs `completed_at` for the "Latest" column — this is already available. But `modules_touched` is NOT on `DashboardEntry` — the surface field on the entry is the only data source. This is fine because the backfill populates `surface` on entries before the dashboard is generated.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer early returns over nested conditionals.
- Explicit return types on all exported functions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Engine files have zero CLI dependencies — scaffold-generators.ts is in utils, not engine. CLI imports are fine there (though it currently has none — keep it that way, it only uses EngineResult types).
- Always use `--run` with pnpm test to avoid watch mode hang.

### Pattern Extracts

**Migration pattern (work.ts:1088-1098):**
```typescript
  for (const chainEntry of allEntries) {
    for (const finding of chainEntry.findings || []) {
      // Backfill migration: convert legacy lesson findings to closed
      if ((finding.status as string) === 'lesson') {
        finding.status = 'closed';
        if (!finding.closed_reason) {
          finding.closed_reason = 'upstream';
          finding.closed_by = 'mechanical';
          finding.closed_at = chainEntry.completed_at || new Date().toISOString();
        }
      }
```

**Commander option pattern (proof.ts:1587-1588):**
```typescript
    .option('--severity <values>', 'Filter by severity (comma-separated: risk,debt,observation,unclassified)')
    .option('--entry <slug>', 'Filter to findings from a specific pipeline run')
```

**Audit post-collection filter pattern (proof.ts:1886-1901):**
```typescript
      // Apply --severity filter (post-collection, before grouping)
      if (options.severity) {
        const allowedSeverities = new Set(options.severity.split(',').map(s => s.trim()));
        const matchesSeverity = (sev: string): boolean => {
          if (allowedSeverities.has(sev)) return true;
          if (sev === '—' && allowedSeverities.has('unclassified')) return true;
          return false;
        };
        activeFindings = activeFindings.filter(f => matchesSeverity(f.severity));
      }

      // Apply --entry filter (post-collection, before grouping)
      if (options.entry) {
        const entrySlug = options.entry;
        activeFindings = activeFindings.filter(f => f.entry_slug === entrySlug);
      }
```

**Dashboard section pattern (proofSummary.ts:500-515):**
```typescript
  md += '## Hot Modules\n\n';
  const hotModules = Array.from(fileEntryMap.entries())
    .filter(([, entrySet]) => entrySet.size >= 2)
    .map(([file, entrySet]) => ({ file, active: fileActiveCount.get(file) || 0, entries: entrySet.size }))
    .sort((a, b) => b.active - a.active)
    .slice(0, 5);

  if (hotModules.length > 0) {
    md += '| File | Active | Entries |\n';
    md += '|------|--------|--------|\n';
    for (const mod of hotModules) {
      md += `| ${mod.file} | ${mod.active} | ${mod.entries} |\n`;
    }
  } else {
    md += '*No hot modules yet.*\n';
  }
```

**Doctor dimension pattern (doctor.ts:297-346):**
```typescript
function assessProofChain(projectRoot: string): ProofChainDimension {
  const proofChainPath = path.join(projectRoot, '.ana', 'proof_chain.json');

  if (!fs.existsSync(proofChainPath)) {
    return {
      status: 'warn',
      runs: 0,
      active_findings: 0,
      risk_findings: 0,
      trend: 'insufficient_data',
    };
  }
  // ...
  return {
    status: report.runs > 0 ? 'pass' : 'warn',
    runs: report.runs,
    active_findings: activeFindings,
    risk_findings: riskFindings,
    trend: report.trajectory.trend,
  };
}
```

**Doctor display pattern (doctor.ts:518-532):**
```typescript
  // Proof chain
  if (d.proof_chain.runs === 0) {
    lines.push(`  ${chalk.yellow('○')} Proof chain — no pipeline runs yet`);
  } else {
    const findingsPart = d.proof_chain.active_findings > 0
      ? `, ${d.proof_chain.active_findings} active findings`
      : '';
    // ...
    lines.push(`  ${chalk.green('✓')} Proof chain — ${d.proof_chain.runs} runs${findingsPart}${riskPart}${trendPart}`);
  }
```

**Scaffold monorepo line (scaffold-generators.ts:110-117):**
```typescript
  if (result.monorepo.isMonorepo) {
    const tool = result.monorepo.tool || 'monorepo';
    s += `**Detected:** ${tool} · ${result.monorepo.packages.length} packages`;
    if (result.monorepo.packages.length > 0) {
      const pkgNames = result.monorepo.packages.slice(0, 5).map(p => p.name).join(', ');
      s += ` (${pkgNames})`;
    }
    s += '\n';
  }
```

### Proof Context

**proof.ts:** Duplicated zero-entry JSON payload in audit matrix path. SEVERITY_ORDER map duplicated. Both are pre-existing — don't fix in this scope, but don't make them worse.

**proofSummary.ts:** File is ~1550 lines, past comfort threshold. The "By Surface" section addition is small (~30 lines). Don't add new exported functions beyond what's needed.

**work.ts:** High churn file (35 commits in 14 days). The surface derivation extraction is a clean refactor. The backfill is a small addition to the existing migration section.

**doctor.ts:** Clean structure. New dimension follows established patterns.

No active proof findings for scaffold-generators.ts or ana-learn.md.

### Checkpoint Commands

- After `work.ts` changes: `(cd packages/cli && pnpm vitest run tests/commands/work.test.ts --run)` — Expected: existing tests pass + new backfill tests pass
- After `proof.ts` changes: `(cd packages/cli && pnpm vitest run tests/commands/proof.test.ts --run)` — Expected: existing tests pass + new surface filter tests pass
- After `proofSummary.ts` changes: `(cd packages/cli && pnpm vitest run tests/utils/proofSummary.test.ts --run)` — Expected: existing tests pass + new dashboard section tests pass
- After `doctor.ts` changes: `(cd packages/cli && pnpm vitest run tests/commands/doctor.test.ts --run)` — Expected: existing tests pass + new surface dimension tests pass
- After all changes: `pnpm run test -- --run` — Expected: all tests pass
- Lint: `(cd packages/cli && pnpm run lint)`

### Build Baseline
- Current tests: 2689 passed, 2 skipped (2691 total)
- Current test files: 119
- Command used: `pnpm run test -- --run`
- After build: expected ~2720+ tests in 120 files (new scaffold-generators.test.ts + additions to 4 existing test files)
- Regression focus: `work.test.ts` (backfill may interact with existing migration tests), `proofSummary.test.ts` (dashboard output format changes), `doctor.test.ts` (DoctorResults shape change)
