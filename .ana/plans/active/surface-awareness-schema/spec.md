# Spec: Surface Awareness Schema and Pipeline Integration

**Created by:** AnaPlan
**Date:** 2026-05-20
**Scope:** .ana/plans/active/surface-awareness-schema/scope.md

## Approach

Make `ana.json` surface-aware so the pipeline targets the right surface. Three layers: schema + generation (Zod schema, `createAnaJson` surface generation, `preserveUserState` surface merge), pipeline integration (config guards, proof chain surface field, template awareness), and cleanup (retire `buildPackage`/`testPackage` generation, update docs).

The scan already detects surfaces via `engineResult.surfaces` (shipped, validated against 12 repos). This scope makes the system consume that intelligence: `ana.json` stores per-surface commands keyed by derived surface name, the pipeline resolves to the right surface's commands when a scope declares a Surface, and the proof chain records which surface each run verified.

**Key design decisions:**

1. **Surface schema** — `surfaces` as `z.record(surfaceSchema).optional().default({}).catch({})` in anaJsonSchema.ts. Each surface object has `path`, `language`, `framework`, and `commands` (build/test/lint/dev). Per-field `.catch()` for fail-soft parsing, matching existing patterns.

2. **Surface command generation reuses `buildDirectTestCommand()`** — For each surface, read its package.json scripts from disk (same as existing primaryPackage block), build scoped commands with `(cd '${surface.path}' && ...)`. The `EnrichedPackage.scripts` array has script NAMES only — actual command generation reads `package.json`.

3. **`mergeSurfaces()` as isolated pure function** — Match by `path`, not key name. Refreshes mechanical fields (path, language, framework) from new scan. Preserves user-tuned `commands`. New surfaces get defaults. Removed surfaces stay with a logged warning. Tested independently of `preserveUserState`.

4. **`config delete` as new subcommand** — `ana config delete surfaces.old-service` removes the key. `ana config delete surfaces.cli.path` rejected as machine-managed. Simple `deleteByPath` helper.

5. **Surface machine-managed guard** — After the existing flat `MACHINE_MANAGED_FIELDS` check, a second check examines path segments for `surfaces.*.path`, `surfaces.*.language`, `surfaces.*.framework`. `surfaces.*.commands.*` remains user-owned.

6. **Proof chain `surface` derivation** — At `writeProofChain` time, read `ana.json` surfaces, prefix-match `modules_touched` file paths against surface paths. Exactly one match → that surface. Zero or multiple → `null`. Mechanical derivation, verified over trusted.

7. **Verify independence fix** — Template-only change. ana-verify.md reads checkpoint commands from the spec's Build Brief, not the build report. This prevents the "grade your own homework" pattern for test command selection.

8. **Retire `buildPackage`/`testPackage` generation** — Remove from `createAnaJson`. Existing values in user ana.json files survive via `preserveUserState` (never silently delete user state). The `COMMAND_FIELDS` validation list in config.ts is updated to remove these keys.

**Open question from scope resolved:** Init display truncation threshold → 3 surfaces. Init display is more constrained vertically than the scan terminal. "+N more" for 4+ surfaces.

## Output Mockups

### ana.json with surfaces (monorepo)

```json
{
  "anaVersion": "1.2.0",
  "name": "my-monorepo",
  "language": "TypeScript",
  "framework": null,
  "packageManager": "pnpm",
  "commands": {
    "build": "pnpm run build",
    "test": "pnpm run test -- --run",
    "lint": "pnpm run lint",
    "dev": "pnpm run dev"
  },
  "surfaces": {
    "cli": {
      "path": "packages/cli",
      "language": "TypeScript",
      "framework": null,
      "commands": {
        "build": "(cd 'packages/cli' && pnpm run build)",
        "test": "(cd 'packages/cli' && pnpm vitest run)",
        "lint": "(cd 'packages/cli' && pnpm run lint)",
        "dev": null
      }
    },
    "web": {
      "path": "apps/web",
      "language": "TypeScript",
      "framework": "Next.js",
      "commands": {
        "build": "(cd 'apps/web' && pnpm run build)",
        "test": null,
        "lint": "(cd 'apps/web' && pnpm run lint)",
        "dev": null
      }
    }
  },
  "coAuthor": "Ana <build@anatomia.dev>",
  "artifactBranch": "main",
  "branchPrefix": "feature/",
  "lastScanAt": "2026-05-20T00:00:00.000Z",
  "custom": {}
}
```

### Init display with surfaces

```
  Branch:   main
  Test:     pnpm run test -- --run
  Build:    pnpm run build

  Surfaces:
    cli      (cd 'packages/cli' && pnpm vitest run)
    web      ⚠ no test command
    worker   (cd 'packages/worker' && pnpm vitest run)
    +2 more. Run `ana config show` for all.
```

### ana config show (surfaces section)

```
surfaces:
  cli:
    path       packages/cli
    language   TypeScript
    framework  null
    commands:
      build  (cd 'packages/cli' && pnpm run build)
      test   (cd 'packages/cli' && pnpm vitest run)
      lint   (cd 'packages/cli' && pnpm run lint)
      dev    null
  web:
    path       apps/web
    language   TypeScript
    framework  Next.js
    commands:
      build  (cd 'apps/web' && pnpm run build)
      test   null
      lint   (cd 'apps/web' && pnpm run lint)
      dev    null
```

### config delete

```
$ ana config delete surfaces.old-service
Deleted surfaces.old-service

$ ana config delete surfaces.cli.path
'surfaces.cli.path' is machine-managed (refreshed by 'ana init'). Use that command instead.
```

### ana proof (surface field in header)

```
  Result: PASS
  Surface: cli

  Contract
```

### ana proof list (surface column)

```
  Slug                    Result   Assertions   Surface    Date
  surface-awareness       PASS     12/12        cli        2026-05-20
  previous-feature        PASS     8/8                     2026-05-19
```

## File Changes

### `packages/cli/src/commands/init/anaJsonSchema.ts` (modify)
**What changes:** Add `surfaces` field to the Zod schema — `z.record(z.string(), surfaceObjectSchema).optional().default({}).catch({})`. The surface object schema has `path` (string), `language` (string|null), `framework` (string|null), and `commands` (record of string→string|null). Each field has `.catch()` for fail-soft parsing.
**Pattern to follow:** Existing fields in the same file — the `.optional().default().catch()` chain.
**Why:** Without the schema, surfaces in ana.json would bypass Zod validation. Re-init would lose surface data or crash on malformed surface entries.

### `packages/cli/src/commands/init/state.ts` (modify)
**What changes:** Four changes: (1) Replace the `buildPackage`/`testPackage` generation block (lines 454-525) with surface command generation that iterates `engineResult.surfaces`. (2) Remove `buildPackage`/`testPackage` from the `commands` object assembly. (3) Add `mergeSurfaces()` pure function called from `preserveUserState`. (4) Add surface display to `displaySuccessMessage` after root commands.
**Pattern to follow:** The existing `buildPackage`/`testPackage` block at lines 454-510 for reading package.json scripts and building scoped commands. The existing `preserveUserState` merge at lines 624-671 for command sanitization. The existing services display at lines 826-835 for truncation pattern.
**Why:** This is where ana.json is generated and where re-init merging happens. Without these changes, surfaces exist in scan.json but are never written to ana.json.

### `packages/cli/src/commands/config.ts` (modify)
**What changes:** Five changes: (1) Add `surfaces` to `KNOWN_FIELDS`. (2) Add surface-specific machine-managed guard for `surfaces.*.path`, `surfaces.*.language`, `surfaces.*.framework`. (3) Update `COMMAND_FIELDS` to replace `buildPackage`/`testPackage` with `surfaces.*.commands.*` pattern. (4) Add surfaces-specific branch in `displayAll` for three-level nesting. (5) Add `delete` subcommand with `deleteByPath` helper.
**Pattern to follow:** Existing `setCommand` registration at lines 290-345 for the delete subcommand. Existing machine-managed guard at lines 298-315 for the surface guard.
**Why:** Without config support, users can't view surfaces properly, can't guard machine-managed surface fields, and can't remove stale surfaces.

### `packages/cli/src/commands/artifact.ts` (modify)
**What changes:** Add optional Surface field validation to `validateScopeFormat`. After the Multi-phase check (line 607), extract `**Surface:**` value. If present, validate it against known surface keys from ana.json (or allow "cross-surface"). If not present, no error — single-package repos have no surfaces. Read ana.json from project root for validation.
**Pattern to follow:** The Kind/Size/Multi-phase validation pattern at lines 580-607 — regex extraction + whitelist check.
**Why:** Without validation, agents can write arbitrary Surface values that don't match ana.json surfaces, leading to wrong checkpoint commands downstream.

### `packages/cli/src/types/proof.ts` (modify)
**What changes:** Add `surface?: string` field to the `ProofChainEntry` interface, after `kind`.
**Pattern to follow:** The existing `kind?` field pattern — optional, typed.
**Why:** Without the field, proof chain entries can't record which surface was verified.

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** After `modules_touched` is read (line 953), add surface derivation. Read `ana.json`, get `surfaces` record. For each surface, check if any `modules_touched` paths start with the surface's `path` prefix. If exactly one surface matches, set `surface` on the entry. If zero or multiple, leave as undefined.
**Pattern to follow:** The existing `modules_touched` read pattern at lines 940-953 for filesystem access patterns. The existing `kind` field population for optional proof chain fields.
**Why:** Without derivation, the proof chain can't record which surface a pipeline run verified. The derivation is mechanical (file path matching) — verified over trusted.

### `packages/cli/src/commands/proof.ts` (modify)
**What changes:** Two changes: (1) In `formatHumanReadable`, add a "Surface: {name}" line after "Result: {result}" (around line 262). Only show when surface is present. (2) In `formatListTable`, add a "Surface" column between "Assertions" and "Date" (around line 593).
**Pattern to follow:** The existing Result line display at line 261 for `formatHumanReadable`. The existing column layout at lines 593-616 for `formatListTable`.
**Why:** Without display, surface information is captured but invisible to the user.

### `packages/cli/templates/.claude/agents/ana.md` (modify)
**What changes:** Add `- **Surface:** {surface name from ana.json surfaces, or "cross-surface" for work spanning multiple surfaces}` to the Complexity Assessment template (after the Size field, around line 191). Add a one-line note: surfaces are listed in ana.json.
**Pattern to follow:** The existing Kind/Size/Multi-phase field format at lines 189-194.
**Why:** Without the Surface field in the scope template, agents can't declare which surface work targets. Plan can't resolve surface-specific commands.

### `packages/cli/templates/.claude/agents/ana-plan.md` (modify)
**What changes:** Update the Checkpoint Commands section. Replace the `testPackage` reference with surface-aware resolution: "Read the scope's Surface field. If it names a surface, look up `surfaces.{name}.commands.test` from ana.json. If no Surface field or 'cross-surface', use `commands.test`."
**Pattern to follow:** The existing Checkpoint Commands section text.
**Why:** Without this, Plan continues generating checkpoint commands from the old `testPackage` field which is being retired.

### `packages/cli/templates/.claude/agents/ana-verify.md` (modify)
**What changes:** Change the checkpoint command source. Currently (line 177): "Read the build report's Verification Commands section for the focused test command Build used." Change to: "Read the spec's Build Brief Checkpoint Commands section for the focused test command Plan specified." This is the independence fix — Verify should not read Build's report for any input.
**Pattern to follow:** The existing independence principle stated at line 30: "You never read the build report."
**Why:** Reading test commands from the build report violates Verify's independence guarantee. The spec is Plan's output; Verify reading it maintains the "two independent accounts" principle.

### `packages/cli/templates/.claude/agents/ana-setup.md` (modify)
**What changes:** Add surface commands display in Step 2's config confirmation. After "Primary package" (around line 146), add a surfaces block that shows each surface's test command. Follow the pattern of the existing monorepo conditional.
**Pattern to follow:** The existing monorepo conditional at lines 143-146.
**Why:** Without this, Setup shows root commands but not per-surface commands, so users can't verify surface-specific test commands during setup.

### `website/content/docs/start.mdx` (modify)
**What changes:** Replace the callout text (line 44) that references `buildPackage` and `testPackage` with surfaces-aware text: "For monorepos, `surfaces` contains per-surface commands. Override with `ana config set surfaces.cli.commands.test 'your-command'`."
**Pattern to follow:** The existing callout format.
**Why:** Docs referencing retired keys confuse new users.

### `website/content/docs/guides/troubleshooting.mdx` (modify)
**What changes:** Replace `testPackage`/`buildPackage` references (lines 47, 75, 77) with `surfaces.{name}.commands.test` and `surfaces.{name}.commands.build` equivalents.
**Pattern to follow:** The existing TroubleCard format.
**Why:** Same as start.mdx — docs must reference current features, not retired ones.

### `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts` (modify)
**What changes:** Repurpose for surface command generation. Replace `buildPackage`/`testPackage` assertions with `surfaces` assertions. The test structure stays the same (create engine result with monorepo config, call `createAnaJson`, assert output), but assertions check `surfaces.{name}.commands.*` instead of `commands.buildPackage`/`commands.testPackage`. Update the `preserveUserState` tests to verify surface merge behavior.
**Pattern to follow:** The existing test structure in the same file.
**Why:** The tests currently validate the feature being removed. Repurposing is more efficient than deleting + creating new.

### `packages/cli/tests/commands/init/makeTestCommand.test.ts` (modify)
**What changes:** Update the 3 tests at lines 143-204 that assert `testPackage` values. These now assert the equivalent surface test commands. The `buildDirectTestCommand` function itself is unchanged — the tests just need to check the output appears in the right location (surface commands instead of top-level `testPackage`).
**Pattern to follow:** The existing test patterns in the same file.
**Why:** Tests asserting retired keys would fail after the `createAnaJson` changes.

## Acceptance Criteria

- [ ] AC1: `ana init` on a monorepo populates `ana.json` with a `surfaces` section containing per-surface `path`, `language`, `framework`, and `commands` (build, test, lint, dev) derived from scan data
- [ ] AC2: `ana init` on a single-package repo produces no `surfaces` section — behavior identical to today
- [ ] AC3: Re-init preserves user-tuned surface commands while refreshing mechanical fields (path, language, framework) from the scan
- [ ] AC4: Re-init adds newly detected surfaces with default commands and keeps removed surfaces with a logged warning
- [ ] AC5: Surface merge matches by `path`, not by key name — a renamed surface key preserves its tuned commands
- [ ] AC6: `buildPackage` and `testPackage` generation is removed from `createAnaJson`. The keys no longer appear in freshly generated ana.json files.
- [ ] AC7: `ana config set surfaces.cli.commands.test "..."` works. `ana config set surfaces.cli.path "..."` is rejected as machine-managed.
- [ ] AC8: `ana config delete surfaces.old-service` removes the entry. `ana config delete surfaces.cli.path` is rejected as machine-managed.
- [ ] AC9: `ana config show` displays surfaces with three-level nesting (surface → scalar fields + commands → command values)
- [ ] AC10: The AnaThink scope template includes a Surface field in Complexity Assessment, validated by `ana artifact save scope`
- [ ] AC11: AnaPlan resolves checkpoint commands from `surfaces.{name}.commands.test` when the scope declares a Surface. Falls back to `commands.test` when no surfaces section exists or for cross-surface scopes.
- [ ] AC12: AnaVerify reads checkpoint commands from the spec's Build Brief, not the build report — fixing the independence violation
- [ ] AC13: `ProofChainEntry` has a `surface?: string` field, derived mechanically from `modules_touched` path matching against `ana.json` surfaces at `writeProofChain` time
- [ ] AC14: `ana proof {slug}` and `ana proof list` display the surface field when present
- [ ] AC15: Init display shows per-surface commands after root commands (truncated at 3 surfaces with "+N more" for 4+)
- [ ] AC16: `start.mdx` and `troubleshooting.mdx` reference surfaces instead of `buildPackage`/`testPackage`
- [ ] AC17: Existing tests updated: `monorepoCommandScoping.test.ts` repurposed for surface command generation, `makeTestCommand.test.ts` testPackage assertions updated
- [ ] Tests pass with `pnpm run test -- --run`
- [ ] No build errors with `pnpm run build`
- [ ] Lint passes with `(cd packages/cli && pnpm run lint)`

## Testing Strategy

- **Unit tests (monorepoCommandScoping.test.ts repurposed):**
  - Surface generation for monorepo with multiple surfaces (2-3 surfaces, different frameworks)
  - Surface generation produces scoped commands from package.json scripts
  - No surfaces for single-package repo
  - Missing/malformed package.json fallback (null commands)
  - Surface with no test script → null test command
  - `buildPackage`/`testPackage` keys absent from freshly generated ana.json
  - `mergeSurfaces()` preserves user-tuned commands
  - `mergeSurfaces()` refreshes mechanical fields from scan
  - `mergeSurfaces()` adds newly detected surfaces
  - `mergeSurfaces()` keeps removed surfaces (not silently deleted)
  - `mergeSurfaces()` matches by path not key name
  - Blank-string sanitization for surface commands

- **Unit tests (makeTestCommand.test.ts updated):**
  - Existing `buildDirectTestCommand` tests stay as-is (function unchanged)
  - `testPackage` assertions → equivalent surface command assertions

- **Unit tests (config):**
  - `config delete` removes a key
  - `config delete` rejects machine-managed surface fields
  - Surface machine-managed guard blocks `surfaces.cli.path`
  - Surface command set passes through (`surfaces.cli.commands.test`)
  - `displayAll` renders surfaces with three-level nesting

- **Edge cases:**
  - Zero surfaces (monorepo with no qualifying packages) → `surfaces: {}`
  - One surface → single entry
  - 5+ surfaces → init display truncates at 3
  - Cross-surface proof chain entry (files span multiple surfaces) → `surface: null`
  - Surface with framework, surface without → mixed display
  - Non-Node language surfaces (guard prevents JS command generation)

## Dependencies

- `engineResult.surfaces` array populated by the existing surface detector (shipped, no changes needed)
- `buildDirectTestCommand()` function (existing, no changes needed)

## Constraints

- Never silently delete user state. Removed surfaces stay with a warning. Existing `buildPackage`/`testPackage` in user ana.json survive via `preserveUserState`.
- Surface schema is a permanent commitment. Once shipped, the `surfaces` section exists in ana.json forever. Make the schema right — additions are easy, renames/removals are breaking.
- Test count must not decrease. Currently 2660 tests in 116 files.
- Template changes affect all customers on next `ana init`.

## Gotchas

- **`EnrichedPackage.scripts` has script NAMES only** — e.g., `['build', 'test', 'lint']`, not the actual command strings. Surface command generation must read the surface's `package.json` from disk to get the actual scripts, same pattern as state.ts:487-489.
- **`preserveUserState` command merge has blank-string sanitization** (state.ts:641-645) and JS-command cleanup for non-Node projects (state.ts:662-670). `mergeSurfaces()` needs the same sanitization for each surface's commands.
- **The `COMMAND_FIELDS` list at config.ts:328 is a flat array of string literals.** Surface command fields use a pattern match (`surfaces.*.commands.*`), not list membership. The empty-string rejection needs both: the flat list for root commands, a regex/pattern check for surface commands.
- **`displayAll` currently handles one level of object nesting** (config.ts:198-213). Surfaces require three levels (surfaces → surface → commands). A surfaces-specific branch avoids breaking existing one-level display for `commands`, `custom`, etc.
- **Scope Surface field validation reads ana.json** to get valid surface keys. If ana.json doesn't exist (pre-init), validation should skip the Surface check gracefully.
- **The `config delete` subcommand shares the machine-managed guard with `config set`** — extract the guard logic into a shared helper or inline it in both.
- **`modules_touched` paths are relative to project root** (e.g., `packages/cli/src/foo.ts`). Surface path matching uses `startsWith` — surface path `packages/cli` matches `packages/cli/src/foo.ts`. But surface path `packages/cli-utils` also starts with `packages/cli` as a string. Use `path + '/'` prefix matching to avoid false positives.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Explicit return types on all exported functions. Internal helpers can use inference.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Engine files have zero CLI dependencies — but all changes here are in `src/commands/` and `src/types/`, not engine.
- Use `| null` for fields checked and found empty. Use `?:` for optional fields that may not have been checked.
- Prefer early returns over nested conditionals.
- Use `fs.mkdtemp` for temp directories in tests. Clean up in `finally` blocks with `fs.rm({ recursive: true, force: true, maxRetries: 3, retryDelay: 200 })`.

### Pattern Extracts

**Existing scoped command generation (state.ts:454-468):**
```typescript
  // Scoped test command for monorepo primary package.
  let testPackageCmd: string | null = null;
  if (testCmd && result.monorepo.isMonorepo && result.monorepo.primaryPackage) {
    const pkg = result.monorepo.primaryPackage;
    const pm = result.commands.packageManager || 'pnpm';

    // Map detected testing framework to direct runner invocation
    const directCmd = buildDirectTestCommand(result.stack.testing, pm);
    if (directCmd) {
      testPackageCmd = `(cd '${pkg.path}' && ${directCmd})`;
    } else {
      // Unknown framework — cd with root-derived command as fallback
      testPackageCmd = `(cd '${pkg.path}' && ${testCmd})`;
    }
  }
```

**Existing preserveUserState command merge (state.ts:638-671):**
```typescript
    const mergedCommands = merged.commands as Record<string, unknown> | undefined;
    if (mergedCommands) {
      const freshCommands = (newAnaConfig['commands'] ?? {}) as Record<string, unknown>;
      for (const key of ['test', 'build', 'lint', 'buildPackage', 'testPackage']) {
        if (mergedCommands[key] === '') {
          mergedCommands[key] = freshCommands[key] ?? null;
        }
      }

      // Propagate new command keys from fresh detection without overwriting
      for (const key of Object.keys(freshCommands)) {
        if (!(key in mergedCommands) && freshCommands[key] != null && freshCommands[key] !== '') {
          mergedCommands[key] = freshCommands[key];
        }
      }
```

**Existing displayAll one-level nesting (config.ts:198-213):**
```typescript
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // One-level indented display for objects
      console.log(`${key}:`);
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) {
        console.log('  (empty)');
      } else {
        const maxSubKeyLen = Math.max(...entries.map(([k]) => k.length));
        for (const [subKey, subValue] of entries) {
          console.log(`  ${subKey.padEnd(maxSubKeyLen)}  ${formatValue(subValue)}`);
        }
      }
    }
```

**Existing scope validation pattern (artifact.ts:580-607):**
```typescript
  const kindMatch = content.match(/\*\*Kind:\*\*\s*(.+)/);
  if (!kindMatch || !kindMatch[1]) {
    return "Missing 'Kind' field in Complexity Assessment. Add: **Kind:** feature / fix / chore / milestone";
  }
  const kindRaw = kindMatch[1].trim().toLowerCase();
  if (kindRaw !== 'feature' && kindRaw !== 'fix' && kindRaw !== 'chore' && kindRaw !== 'milestone') {
    return `Kind must be exactly one of: feature, fix, chore, milestone. Got: '${kindMatch[1].trim()}'`;
  }
```

**Existing init display truncation (state.ts:826-835):**
```typescript
      if (uniqueServices.length > 0) {
        const MAX_DISPLAY = 4;
        const names = uniqueServices.length > MAX_DISPLAY
          ? uniqueServices.slice(0, MAX_DISPLAY).map((s: { name: string }) => s.name).join(', ') + `, and ${uniqueServices.length - MAX_DISPLAY} more`
          : uniqueServices.map((s: { name: string }) => s.name).join(', ');
        console.log(`  ${chalk.bold('Services:')} ${names}`);
      }
```

### Proof Context

**state.ts:**
- `monorepo-build-scoping-C5` / `flip-monorepo-commands-C4`: pkg.path injected without sanitization. Known risk, pre-existing. Surface generation inherits the same pattern — not blocking but worth noting.
- `reinit-field-refresh-C2`: Merge override assumes newAnaConfig always contains all keys. Surface merge should handle missing keys defensively.

**config.ts:**
- `flip-monorepo-commands-C1`: No test for empty-string buildPackage/testPackage rejection. The new `config delete` and surface command validation should have dedicated tests.

No active proof findings for artifact.ts, proof.ts, or work.ts that affect this build.

### Checkpoint Commands

- After anaJsonSchema.ts + state.ts changes: `(cd packages/cli && pnpm vitest run tests/commands/init/monorepoCommandScoping.test.ts tests/commands/init/makeTestCommand.test.ts)` — Expected: surface assertions pass, no testPackage/buildPackage in output
- After config.ts changes: `(cd packages/cli && pnpm vitest run tests/commands/config.test.ts)` — Expected: existing + new config tests pass
- After all changes: `pnpm run test -- --run` — Expected: 2660+ tests pass, 116+ test files
- Lint: `(cd packages/cli && pnpm run lint)`

### Build Baseline
- Current tests: 2660 passed, 2 skipped
- Current test files: 116 passed
- Command used: `pnpm run test -- --run`
- After build: expected ~2690+ tests in ~116 files (repurposed tests change count, new config/proof tests add)
- Regression focus: `monorepoCommandScoping.test.ts`, `makeTestCommand.test.ts`, `config.test.ts`
