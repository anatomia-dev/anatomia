# Spec: Commit hygiene checks at build-report save

**Created by:** AnaPlan
**Date:** 2026-05-14
**Scope:** .ana/plans/active/commit-hygiene-checks/scope.md

## Approach

Add a `runCommitHygieneChecks()` function in `artifact.ts` that runs at build-report save time, immediately after `captureModulesTouched()`. It reads `modules_touched` from `.saves.json` (zero additional git operations), runs four pattern-based checks against the file list and optionally file content, prints warnings to terminal, and writes structured findings to `.saves.json` under a `commit_hygiene` key.

The function follows the `captureModulesTouched()` shape exactly: standalone helper, catches errors internally, warns instead of throwing, reads/writes `.saves.json` with the read-modify-write pattern.

The `commit_hygiene` data flows through the proof chain via the four-location pattern documented in `proof.ts:16-21`:
1. `ProofChainEntry` type gets an optional `commit_hygiene` field
2. `ProofSummary` gets an optional `commit_hygiene` field, defaulted to `[]` in `generateProofSummary()`
3. `writeProofChain()` in `work.ts` reads `commit_hygiene` from `.saves.json` and writes it to the entry
4. `formatHumanReadable()` in `proof.ts` displays findings when present

The `commit_hygiene` data is NOT proof findings. It doesn't enter the finding lifecycle (staleness, promote, Learn triage). It's a simple array of structured warnings that persists to the proof chain record for audit purposes.

### Secret scanning scope decision

The scan engine's `SECRET_GLOB_IGNORE` excludes test files, config files (`.json`, `.yaml`), docs, lock files, and env files. For the hygiene check, the file set is already small (only the branch diff), and secrets in config files are exactly what we want to catch. The hygiene check applies only test-file exclusions — not the full `SECRET_GLOB_IGNORE` list. This is a deliberate, justified deviation from the scan engine's behavior.

### Lockfile desync logic

A mapping table pairs each lockfile pattern to its manifest pattern. For monorepo layouts, the match is permissive: any `package.json` anywhere in the diff satisfies `pnpm-lock.yaml`'s requirement, because monorepo lockfiles aggregate all workspaces.

## Output Mockups

### Terminal output during `ana artifact save build-report` (findings present)

```
⚠ Commit hygiene: lockfile pnpm-lock.yaml changed without package.json
⚠ Commit hygiene: possible secret in src/config/stripe.ts (Live secret key)
⚠ Commit hygiene: merge conflict marker in src/utils/parser.ts
⚠ Commit hygiene: environment file .env.local in branch diff
```

### Terminal output (no findings)

No output. Clean runs are silent.

### `.saves.json` structure

```json
{
  "modules_touched": ["src/foo.ts", "pnpm-lock.yaml"],
  "commit_hygiene": [
    {
      "check": "lockfile-desync",
      "file": "pnpm-lock.yaml",
      "severity": "warn",
      "message": "lockfile pnpm-lock.yaml changed without package.json"
    }
  ]
}
```

### `ana proof show` display (findings present)

```
  Commit Hygiene
  ────────
  ⚠ lockfile pnpm-lock.yaml changed without package.json
  ⚠ possible secret in src/config/stripe.ts (Live secret key)
```

## File Changes

### `packages/cli/src/commands/artifact.ts` (modify)
**What changes:** Add `runCommitHygieneChecks()` function and call it at both build-report save sites (single-save at ~line 1294 and batch-save at ~line 1586), immediately after `captureModulesTouched()`.
**Pattern to follow:** `captureModulesTouched()` at lines 150-181 — identical shape. Standalone helper, reads `.saves.json`, writes structured data back, catches errors internally with yellow warning.
**Why:** This is the checkpoint where Build's code is complete and committed. The hygiene check inspects the branch diff for universal footguns before handoff to Verify.

### `packages/cli/src/utils/proofSummary.ts` (modify)
**What changes:** Add optional `commit_hygiene` field to `ProofSummary` interface. In `generateProofSummary()`, extract `commit_hygiene` from `.saves.json` (same block that reads hashes, around line 1810-1833). Default to empty array.
**Pattern to follow:** The existing `.saves.json` reading block that extracts hashes and timing. The `commit_hygiene` key is read with the same `saves` object — no additional file I/O.
**Why:** `generateProofSummary()` is the bridge between `.saves.json` and the proof chain. Without this, hygiene findings die at save time.

### `packages/cli/src/types/proof.ts` (modify)
**What changes:** Add optional `commit_hygiene` field to `ProofChainEntry` interface. Simple array of `{ check: string; file: string; severity: string; message: string }`.
**Pattern to follow:** The existing optional fields like `worktree?`, `phases?`. Keep the field optional — old entries lack it, consumers must handle `undefined`.
**Why:** Location 1 of the four-location pattern documented at proof.ts:16-21.

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** In `writeProofChain()`, read `commit_hygiene` from `.saves.json` (alongside the existing `modules_touched` read at ~line 849-860) and write it to the proof chain entry.
**Pattern to follow:** The `modules_touched` extraction pattern — same `.saves.json`, same try-catch, same fallback to empty array.
**Why:** Location 3 of the four-location pattern. Without this, hygiene data doesn't persist to `proof_chain.json`.

### `packages/cli/src/commands/proof.ts` (modify)
**What changes:** In `formatHumanReadable()`, add a "Commit Hygiene" section after "Build Concerns" that displays hygiene findings when present. Same conditional pattern as the existing findings/concerns sections — only render if the array is non-empty.
**Pattern to follow:** The "Build Concerns" section at lines 344-370 — same structure, same truncation logic, same formatting.
**Why:** Location 4 of the four-location pattern. Without this, `ana proof show` doesn't display hygiene findings.

### `packages/cli/tests/commands/commit-hygiene.test.ts` (create)
**What changes:** New test file covering all four check types with positive and negative cases, the `.saves.json` read-write flow, and edge cases (empty modules_touched, monorepo lockfiles, test file exclusions for secrets).
**Pattern to follow:** `artifact.test.ts` — same temp directory setup with `fs.mkdtemp`, same `beforeEach`/`afterEach` pattern.
**Why:** Each check type needs positive (finding flagged) and negative (clean pass) coverage.

## Acceptance Criteria

- [ ] AC1: `runCommitHygieneChecks()` runs at `ana artifact save build-report` time, after `captureModulesTouched()`, gated by `typeInfo.baseType === 'build-report'`
- [ ] AC2: The check reuses the `modules_touched` list from `.saves.json` — no additional `git diff` call
- [ ] AC3: Lockfile desync detection: flags when a lockfile is in the diff but its dependency manifest is not
- [ ] AC4: Secret detection: scans diff files using the existing `SECRET_PATTERNS` array from `src/engine/findings/rules/secrets.ts`
- [ ] AC5: Merge conflict marker detection: scans diff files for `<<<<<<<`, `=======`, `>>>>>>>` patterns
- [ ] AC6: Environment file detection: flags `.env`, `.env.local`, `.env.production` etc. in the diff, excluding `.env.example` and `.env.test`
- [ ] AC7: Findings are printed as warnings during the save (yellow chalk, non-blocking)
- [ ] AC8: Findings are written to `.saves.json` under a `commit_hygiene` key with structured data (check, file, severity, message)
- [ ] AC9: `generateProofSummary()` reads `commit_hygiene` from `.saves.json` and includes findings in the proof summary
- [ ] AC10: The save always completes regardless of findings — warnings never block
- [ ] AC11: Scope, plan, contract, and verify-report saves do not trigger hygiene checks
- [ ] AC12: Existing tests pass, new tests cover each check type with positive and negative cases
- [ ] AC13: `ProofChainEntry` has optional `commit_hygiene` field
- [ ] AC14: `writeProofChain()` reads `commit_hygiene` from `.saves.json` and includes it in the proof chain entry
- [ ] AC15: `formatHumanReadable()` displays commit hygiene findings when present
- [ ] AC16: No build errors, no lint errors

## Testing Strategy

- **Unit tests:** Test `runCommitHygieneChecks()` directly. For each of the four check types:
  - Positive case: write a `.saves.json` with `modules_touched` containing the triggering file, create the file on disk with triggering content (for secrets/conflict markers), call the function, assert `.saves.json` contains the expected `commit_hygiene` finding.
  - Negative case: same setup but with clean content or excluded files, assert `commit_hygiene` is empty or absent.
- **Lockfile-specific tests:**
  - Lockfile without manifest → finding
  - Lockfile with manifest → no finding
  - Monorepo: root `pnpm-lock.yaml` + nested `packages/api/package.json` → no finding (any package.json satisfies)
- **Secret-specific tests:**
  - File with a known pattern (e.g., `sk_live_...`) → finding
  - Test file with same pattern → no finding (test exclusion applied)
  - File with no secrets → no finding
  - Regex `lastIndex` reset between files — two files with secrets both get flagged
- **Edge cases:**
  - Empty `modules_touched` → no findings, no errors
  - Missing `.saves.json` → graceful skip
  - `.env.example` and `.env.test` excluded from env file check
  - Conflict marker in a markdown file about conflict markers → accepted false positive (flagged)

## Dependencies

- `SECRET_PATTERNS` from `src/engine/findings/rules/secrets.ts` — imported directly. If patterns change, hygiene checks pick up updates automatically.
- `chalk` for terminal warnings — already available in artifact.ts.

## Constraints

- **No additional git operations.** The check reads `modules_touched` from `.saves.json` — the git diff was already computed by `captureModulesTouched()`.
- **Warnings only, never blocks.** The save always completes. Build can choose to fix and re-save, or proceed.
- **Engine boundary respected.** `SECRET_PATTERNS` is a data export from the engine. The hygiene check imports the array but runs its own scanning logic in the command layer — no chalk/ora in engine files.
- **Backward compatibility.** Old `.saves.json` files without `commit_hygiene` work fine. Old `proof_chain.json` entries without `commit_hygiene` work fine. All consumers handle `undefined`.

## Gotchas

- **Regex `lastIndex` reset.** `SECRET_PATTERNS` uses global regexes. Reset `pattern.regex.lastIndex = 0` before each file scan. The scan engine does this (`secrets.ts:135`) — the hygiene check must do the same. Without this, the second file in a scan silently skips matches.
- **`SECRET_GLOB_IGNORE` is NOT used verbatim.** The hygiene check applies only test-file exclusions (patterns containing `test`, `spec`, `fixture`, `mock`, `__tests__`, etc.). Config file exclusions (`.json`, `.yaml`, `.toml`) are deliberately omitted — secrets in config files committed by Build are exactly what this check catches.
- **Monorepo lockfile satisfaction.** `pnpm-lock.yaml` at the root is satisfied by ANY `**/package.json` in the diff — not just `package.json` at the same directory level. The check uses `endsWith()` matching on the manifest filename, not path-prefix matching.
- **Both save sites.** `artifact.ts` has two code paths that save build-reports: `saveArtifact()` (single-save, ~line 1292) and `saveAllArtifacts()` (batch-save, ~line 1584). The hygiene check call must appear in both, after `captureModulesTouched()`.
- **`SavesData` type union.** The `SavesData` interface has an index signature allowing `SaveEntry | PreCheckData | undefined`. The `commit_hygiene` array is a third shape. Follow the `pre-check` precedent — use a type assertion when writing, and add `CommitHygieneFinding[]` to the union.
- **File reads use `projectRoot`.** When reading file content for secret/conflict-marker scanning, join paths with `projectRoot` (which points to the worktree root during build). The `modules_touched` list contains relative paths.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer named exports. No default exports.
- Prefer early returns over nested conditionals.
- Error handling: commands surface errors with `chalk.yellow` warnings. Engine files have zero CLI dependencies.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Always use `--run` with `pnpm vitest` to avoid watch mode hang.

### Pattern Extracts

**Structural analog — `captureModulesTouched()` (artifact.ts:150-181):**
```typescript
function captureModulesTouched(projectRoot: string, slugDir: string): void {
  try {
    const artBranch = readArtifactBranch(projectRoot);
    let mergeBase: string;
    try {
      const mbResult = runGit(['merge-base', artBranch, 'HEAD'], { cwd: projectRoot });
      if (mbResult.exitCode !== 0) return;
      mergeBase = mbResult.stdout;
    } catch {
      return;
    }
    const diffResult = runGit(['diff', mergeBase, '--name-only', '--', '.', ':(exclude).ana'], { cwd: projectRoot });
    const diffOutput = diffResult.stdout;
    const modulesList = diffOutput ? diffOutput.split('\n').filter(Boolean) : [];

    const savesPath = path.join(slugDir, '.saves.json');
    let savesData: Record<string, unknown> = {};
    if (fs.existsSync(savesPath)) {
      try { savesData = JSON.parse(fs.readFileSync(savesPath, 'utf-8')); } catch { /* */ }
    }
    savesData['modules_touched'] = modulesList;
    fs.writeFileSync(savesPath, JSON.stringify(savesData, null, 2));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(chalk.yellow(`⚠ Warning: Could not capture modules_touched — saving without it. ${errMsg}`));
  }
}
```

**Secret scanning iteration (secrets.ts:134-142):**
```typescript
for (const pattern of SECRET_PATTERNS) {
  pattern.regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.regex.exec(content)) !== null) {
    if (pattern.validate && !pattern.validate(match[0])) continue;
    // ... process match
  }
}
```

**`.saves.json` reading in `writeProofChain()` (work.ts:849-860):**
```typescript
let modulesTouched: string[] = [];
try {
  const slugSaves = path.join(anaDir, 'plans', 'completed', slug, '.saves.json');
  if (fs.existsSync(slugSaves)) {
    const savesContent = JSON.parse(fs.readFileSync(slugSaves, 'utf-8'));
    if (Array.isArray(savesContent['modules_touched'])) {
      modulesTouched = savesContent['modules_touched'];
    }
  }
} catch { /* fall back to empty */ }
```

**"Build Concerns" display section in `formatHumanReadable()` (proof.ts:344-370):**
```typescript
const buildConcerns = entry.build_concerns || [];
if (buildConcerns.length > 0) {
  lines.push('');
  lines.push(chalk.bold('  Build Concerns'));
  lines.push(chalk.gray('  ' + BOX.horizontal.repeat(14)));
  // ... sort, display up to MAX_DISPLAY, show overflow count
}
```

### Proof Context

**artifact.ts** — 10 active findings, 2 build concerns. Most relevant:
- "writeSaveMetadata export scope widened for tests" — the hygiene function will be a new non-exported helper (private), so this doesn't apply.
- "Unbounded history array growth" — `commit_hygiene` is a flat array per save, not appended across saves. No growth issue.

**proofSummary.ts** — No active findings from proof context query.

**proof.ts** — No active findings from proof context query.

### Checkpoint Commands

- After adding `runCommitHygieneChecks()` to artifact.ts: `(cd packages/cli && pnpm vitest run --run tests/commands/commit-hygiene.test.ts)` — Expected: new tests pass
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2218+ tests pass (existing 2218 + new)
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2218 passed, 2 skipped (100 test files)
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected 2218 + new hygiene tests (estimate 15-25 new tests)
- Regression focus: `artifact.test.ts` (save flow), `proof.test.ts` (display), `work.test.ts` (proof chain write)
