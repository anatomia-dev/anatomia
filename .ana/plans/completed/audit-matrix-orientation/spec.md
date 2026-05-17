# Spec: Audit matrix orientation

**Created by:** AnaPlan
**Date:** 2026-05-17
**Scope:** .ana/plans/active/audit-matrix-orientation/scope.md

## Approach

Two additive changes to the audit subcommand handler in `proof.ts`, plus a template update:

**Change 1 — `by_severity_action` cross-tab (always present).**
Add a `Record<string, number>` accumulator alongside the existing `severityCounts` and `actionCounts` in the active findings loop. Key format: `"severity/action"` (e.g., `"risk/scope"`). Omit zero-count pairs. This cross-tab appears in both JSON and human-readable output for standard audit, and respects filters (`--severity`, `--entry`).

**Change 2 — `--matrix` orientation mode.**
When `--matrix` is passed, the handler early-returns BEFORE the filter application and file-grouping logic. The `--matrix` path:
1. Iterates all active findings (the same loop at line 1634), but skips anchor-presence file I/O — set `anchorPresent = false` unconditionally (or restructure to avoid the file read).
2. Counts severity, action, and severity_action cross-tab from ALL active findings (ignores `--severity`/`--entry`/`--full` flags).
3. Calls `computeStaleness(chain)` for stale counts.
4. Extracts last 3 entries from `chain.entries` with active finding counts and relative timestamps.
5. Outputs the orientation payload via `wrapJsonResponse` (JSON) or a formatted block (human-readable).

The early-return design means `--matrix` never enters the file-grouping, sorting, or anchor-checking code paths. It's a separate branch within the same handler.

**Change 3 — Template update.**
Replace the "Assess the Proof Chain" section (section 2) and "Present State" section (section 4) in ana-learn.md with instructions to run `ana proof audit --matrix` as the single orientation command, then present a three-option adaptive menu. Both the template and dogfood instances must be updated identically.

**`formatRelativeTime` utility.**
A small helper in `proofSummary.ts` that converts an ISO date string to a human-readable relative time. Precision: "<1h ago" for <1 hour, "{N}h ago" for <24h, "{N}d ago" for <30d, "{N}w ago" for >=30d.

## Output Mockups

### Standard audit human-readable (with cross-tab added)

```
Proof Audit: 61 active findings (38 actionable, 23 monitoring) across 14 files
  4 risk · 34 debt · 19 observation · 4 unclassified
  3 risk/scope · 1 risk/monitor · 18 debt/scope · 16 debt/monitor · 19 observation/monitor
  12 promote · 21 scope · 24 monitor · 4 accept (closeable)

  src/commands/proof.ts (8 findings)
    ...
```

### Standard audit JSON (by_severity_action field added)

```json
{
  "command": "proof audit",
  "timestamp": "...",
  "results": {
    "total_active": 61,
    "actionable_count": 38,
    "monitoring_count": 23,
    "by_severity": { "risk": 4, "debt": 34, "observation": 19, "unclassified": 4 },
    "by_action": { "promote": 12, "scope": 21, "monitor": 24, "accept": 4, "unclassified": 0 },
    "by_severity_action": { "risk/scope": 3, "risk/monitor": 1, "debt/scope": 18, "debt/monitor": 16, "observation/monitor": 19 },
    "by_file": [...],
    "overflow_files": 6
  },
  "meta": {...}
}
```

### `--matrix` human-readable

```
Proof Orientation: 61 active findings (38 actionable, 23 monitoring)
  4 risk · 34 debt · 19 observation · 4 unclassified
  3 risk/scope · 1 risk/monitor · 18 debt/scope · 16 debt/monitor · 19 observation/monitor
  Staleness: 8 stale (5 high, 3 medium)

  Recent proofs:
    stripe-payments  PASS  3 findings  2d ago
    auth-refactor    PASS  1 finding   5d ago
    api-validation   FAIL  7 findings  1w ago
```

### `--matrix --json`

```json
{
  "command": "proof audit",
  "timestamp": "...",
  "results": {
    "total_active": 61,
    "actionable_count": 38,
    "monitoring_count": 23,
    "by_severity": { "risk": 4, "debt": 34, "observation": 19, "unclassified": 4 },
    "by_action": { "promote": 12, "scope": 21, "monitor": 24, "accept": 4, "unclassified": 0 },
    "by_severity_action": { "risk/scope": 3, "risk/monitor": 1, "debt/scope": 18, "debt/monitor": 16, "observation/monitor": 19 },
    "recent_entries": [
      { "slug": "stripe-payments", "result": "PASS", "finding_count": 3, "completed_at": "2026-05-15T14:30:00Z", "ago": "2d ago" },
      { "slug": "auth-refactor", "result": "PASS", "finding_count": 1, "completed_at": "2026-05-12T09:00:00Z", "ago": "5d ago" },
      { "slug": "api-validation", "result": "FAIL", "finding_count": 7, "completed_at": "2026-05-10T11:00:00Z", "ago": "1w ago" }
    ],
    "stale_count": 8,
    "stale_high": 5,
    "stale_medium": 3
  },
  "meta": {...}
}
```

### `--matrix` with 0 findings

```
Proof Orientation: 0 active findings
  No active findings. Chain has 5 entries.

  Recent proofs:
    stripe-payments  PASS  0 findings  2d ago
    auth-refactor    PASS  0 findings  5d ago
    api-validation   PASS  0 findings  1w ago
```

### `--matrix` with 0 entries

```
Proof Orientation: no proof chain data
  Run pipeline cycles to generate proof data.
```

## File Changes

### `packages/cli/src/commands/proof.ts` (modify)
**What changes:** Add `--matrix` option to auditCommand. Add `by_severity_action` accumulator to the counting loop. Add a `--matrix` early-return branch after chain parsing (before filters). The standard path gets `by_severity_action` added to both JSON and human-readable output.
**Pattern to follow:** The existing `--full` flag handling at lines 1591-1595 for option registration and validation. The existing severity/action counting at lines 1734-1745 for accumulator pattern.
**Why:** This is where the audit command lives. Both changes are additive branches in the same handler.

### `packages/cli/src/utils/proofSummary.ts` (modify)
**What changes:** Add exported `formatRelativeTime(isoDate: string): string` utility function.
**Pattern to follow:** Other exported utility functions in this file (e.g., `computeStaleness`, `truncateSummary`).
**Why:** `--matrix` needs relative timestamps for recent entries. No shared utility exists — work.ts has inline formatting that's not reusable.

### `packages/cli/templates/.claude/agents/ana-learn.md` (modify)
**What changes:** Replace section "2. Assess the Proof Chain" and section "4. Present State" with new instructions using `ana proof audit --matrix` and the three-option adaptive menu.
**Pattern to follow:** The existing section structure and voice in the template.
**Why:** Learn's startup flow currently requires 3+ commands. The new `--matrix` flag delivers all orientation data in one call.

### `.claude/agents/ana-learn.md` (modify)
**What changes:** Identical change to the template — these must stay in sync.
**Pattern to follow:** Same as template.
**Why:** Dogfood instance must match template. Agent definitions aren't overwritten on re-init.

### `packages/cli/tests/commands/proof.test.ts` (modify)
**What changes:** Add test cases for `by_severity_action` in standard audit output, `--matrix` JSON and human-readable output, `--matrix` edge cases (0 findings, 0 entries), `--matrix` ignoring filters, and cross-tab respecting filters in standard mode.
**Pattern to follow:** The existing `createAuditChain` helper and `runProof` test pattern.
**Why:** Every acceptance criterion needs at least one test.

## Acceptance Criteria

- [ ] AC1: `ana proof audit --json` output includes `by_severity_action` field — a flat object with `"severity/action": count` pairs for all non-zero combinations among active findings.
- [ ] AC2: `ana proof audit` human-readable output includes a cross-tab line showing severity/action pairs inline (e.g., `3 risk/scope · 18 debt/scope · 8 observation/monitor`), displayed after the existing severity breakdown line.
- [ ] AC3: `ana proof audit --matrix` returns ONLY orientation data — no `by_file` array, no individual findings listed. Output includes: total_active, actionable_count, monitoring_count, by_severity, by_action, by_severity_action, recent_entries (last 3), stale_count, stale_high, stale_medium.
- [ ] AC4: `ana proof audit --matrix --json` returns a JSON envelope with the orientation payload. `recent_entries` array contains objects with: slug, result, finding_count (active findings from that entry), completed_at, ago (human-readable relative time string).
- [ ] AC5: `ana proof audit --matrix` human-readable output displays a formatted orientation block: summary line, cross-tab, staleness signal, and recent proofs with relative timestamps.
- [ ] AC6: `--matrix` skips the anchor-presence file I/O loop — it does not read source files to check anchor existence.
- [ ] AC7: `--matrix` ignores `--severity` and `--entry` filters. The orientation is always the full picture. (If both are passed, `--matrix` takes precedence with no error.)
- [ ] AC8: Edge case: 0 active findings with `--matrix` returns the orientation payload with zeros and empty matrix, but still includes recent_entries if proof chain entries exist.
- [ ] AC9: Edge case: 0 proof chain entries (no proof_chain.json or empty entries array) with `--matrix` returns a clean "no data" response.
- [ ] AC10: The ana-learn.md template instructs Learn to run `ana proof audit --matrix` as the first orientation command and present a three-option menu (cleanup / highest-impact / recent findings) with adaptive recommendation logic.
- [ ] AC11: `--matrix` without `--json` does not print the file-grouped finding list. It prints only the orientation block.
- [ ] AC12: `by_severity_action` in standard (non-matrix) audit output correctly reflects filters — if `--severity risk` is applied, only risk/* pairs appear in the cross-tab.
- [ ] AC13: Tests pass with `pnpm vitest run`
- [ ] AC14: No build errors (`pnpm run build`)

## Testing Strategy

- **Unit tests:** Test `formatRelativeTime` directly — pass known dates relative to a mocked `Date.now()` and assert output strings. Can stub Date.now via `vi.useFakeTimers`.
- **Integration tests:** Use the existing `createAuditChain` pattern — construct chain JSON with known severities and actions, write to temp dir, run `runProof(['audit', '--json'])` and assert `by_severity_action` field. Same pattern for `--matrix`.
- **Edge cases:**
  - 0 active findings + `--matrix` → orientation payload with zeros
  - 0 entries (empty chain) + `--matrix` → clean "no data" message
  - `--matrix` + `--severity risk` → filters ignored, full orientation returned
  - `--severity risk` without `--matrix` → cross-tab only shows risk/* pairs
  - All findings have same severity/action → single cross-tab entry
  - Chain with entries but no findings → `recent_entries` shows entries with `finding_count: 0`

## Dependencies

- `computeStaleness` already exported from `proofSummary.ts` and already imported in `proof.ts`.
- The `ProofChain` type and `chain` variable are already parsed before the audit logic begins.

## Constraints

- JSON output is additive — existing fields must remain unchanged. No consumer should break.
- `--matrix` must not read source files (no anchor-presence I/O). The point is speed for orientation.
- Human-readable cross-tab capped at 5 pairs (sorted by count descending) to avoid terminal wrapping.
- Template and dogfood instances of ana-learn.md must be byte-for-byte identical in the replaced sections.

## Gotchas

- **The anchor-presence loop is INSIDE the findings collection loop (lines 1642-1654).** For `--matrix`, the handler must still iterate findings for counting but skip the `fs.existsSync`/`fs.readFileSync` calls. The cleanest approach: check if `--matrix` is set and skip the file-read block, or restructure the `--matrix` path to use its own simpler iteration that only collects counts (no `anchorPresent` field needed since `--matrix` never outputs per-finding data).
- **Filter application happens AFTER collection (lines 1676-1691).** The `--matrix` branch must diverge BEFORE filters are applied — it uses unfiltered counts. But the standard path must apply filters BEFORE computing the cross-tab, so the cross-tab respects filters.
- **`computeStaleness` returns `StalenessResult` with `high_confidence: StaleFinding[]` and `medium_confidence: StaleFinding[]` arrays.** For `--matrix` output, use `.length` for counts — don't serialize the full arrays.
- **`recent_entries` finding_count must count CURRENT active findings from that entry, not historical.** Iterate `activeFindings` (before filters) and count by `entry_slug`. Findings may have been closed since the entry was created.
- **`SEVERITY_ORDER` is at line 203** — use it if you need to order cross-tab pairs for human-readable display.
- **The `--matrix` early-return path for zero entries is different from zero findings.** Zero entries = no `proof_chain.json` exists (already handled at line 1599-1606) OR the chain has an empty entries array. The handler must check `chain.entries.length === 0` after parsing for the matrix path.

## Build Brief

### Rules That Apply
- All local imports use `.js` extensions (`import { foo } from './bar.js'`).
- Use `import type` for type-only imports, separate from value imports.
- Prefer named exports. No default exports.
- Prefer early returns over nested conditionals.
- Explicit return types on all exported functions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Tests must use `--run` flag (handled by test command, but remember if running individually).
- Tests that create git repos must use `git init -b main`.
- Assert on specific expected values, not just existence.

### Pattern Extracts

**Existing severity/action counting (proof.ts:1734-1745):**
```typescript
      // Severity and action summary counts (active findings only)
      const severityCounts: Record<string, number> = {};
      const actionCounts: Record<string, number> = {};
      let allUnclassified = true;
      for (const f of activeFindings) {
        const sev = f.severity === '—' ? 'unclassified' : f.severity;
        severityCounts[sev] = (severityCounts[sev] || 0) + 1;
        if (f.severity !== '—') allUnclassified = false;

        const act = f.suggested_action === '—' ? 'unclassified' : f.suggested_action;
        actionCounts[act] = (actionCounts[act] || 0) + 1;
      }
```

**Test helper pattern (proof.test.ts:1322-1361):**
```typescript
  async function createAuditChain(findingCount: number, fileCount: number): Promise<void> {
    const findings: Array<Record<string, unknown>> = [];
    for (let i = 0; i < findingCount; i++) {
      const fileIdx = i % fileCount;
      findings.push({
        id: `F${String(i + 1).padStart(3, '0')}`,
        category: 'code',
        summary: `Finding ${i + 1} in file ${fileIdx}`,
        file: `src/file${fileIdx}.ts`,
        anchor: null,
        status: 'active',
        severity: i % 3 === 0 ? 'risk' : 'observation',
        suggested_action: i % 2 === 0 ? 'scope' : 'monitor',
      });
    }

    const entry = {
      slug: 'bulk-test',
      feature: 'Bulk Test Feature',
      result: 'PASS',
      ...
      completed_at: '2026-04-20T10:00:00Z',
      modules_touched: [],
      findings,
      ...
    };

    await createTestProject(tempDir);
    await fs.writeFile(
      path.join(tempDir, '.ana', 'proof_chain.json'),
      JSON.stringify({ entries: [entry] }, null, 2),
    );
  }
```

**Human-readable severity display (proof.ts:1801-1812):**
```typescript
        if (activeFindings.length > 0 && !allUnclassified) {
          const sevOrder = ['risk', 'debt', 'observation', 'unclassified'];
          const sevParts = sevOrder
            .filter(s => (severityCounts[s] || 0) > 0)
            .map(s => `${severityCounts[s]} ${s}`);
          // Include any unknown severity values not in sevOrder
          for (const [key, count] of Object.entries(severityCounts)) {
            if (!sevOrder.includes(key) && count > 0) {
              sevParts.push(`${count} ${key}`);
            }
          }
          console.log(chalk.dim(`  ${sevParts.join(' · ')}`));
```

### Proof Context

No active proof findings for affected files.

### Checkpoint Commands

- After adding `by_severity_action` to standard audit: `(cd packages/cli && pnpm vitest run tests/commands/proof.test.ts --run)` — Expected: existing audit tests still pass
- After `--matrix` implementation: `(cd packages/cli && pnpm vitest run tests/commands/proof.test.ts --run)` — Expected: all new tests pass
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2429+ tests pass
- Build: `(cd packages/cli && pnpm run build)` — Expected: clean compile
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2429 passed, 2 skipped (2431 total)
- Current test files: 107
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2445+ tests in 107 files (new tests added to existing proof.test.ts)
- Regression focus: `tests/commands/proof.test.ts` — existing audit tests must continue to pass since we're modifying the audit handler
