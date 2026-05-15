# Spec: Remove lesson status from proof system

**Created by:** AnaPlan
**Date:** 2026-05-14
**Scope:** .ana/plans/active/remove-lesson-status/scope.md

## Approach

Pure removal. The finding lifecycle simplifies from four states (`active | lesson | promoted | closed`) to three (`active | promoted | closed`). The lesson subcommand, the lesson status value, and the upstream auto-classification as lesson all go away. Close-with-reason already covers the "institutional decision" use case (128:6 adoption ratio).

Four areas of work:

1. **Type system cleanup.** Remove `'lesson'` from the status union in `proof.ts`, remove `lessons` from `ProofChainStats`, remove `lesson` from `ChainHealth.findings`. The compiler surfaces every consumer that needs updating.
2. **Behavioral changes.** Upstream findings get `status: 'closed'` with `closed_reason: 'upstream'`. The staleness loop's upstream skip becomes unreachable (closed skip catches first) — remove it. The backfill migration converts existing lesson findings to closed.
3. **Deletion.** The entire lesson subcommand (~260 lines), its tests (~130 lines), lesson-specific test fixtures, and template references.
4. **Documentation.** Website docs (findings lifecycle, troubleshooting, learn guide), README command table, project-level agent definitions (`.claude/agents/`), and project context all reference lesson. Update or remove each reference.

The structural analog for removal is the close subcommand (proof.ts ~753-990) — same structure as lesson, and it stays. The lesson command was a clone of close.

Follow the existing backward compat pattern in `computeChainHealth`: the `default: active++` case at line 1292 handles undefined status as active. Add `case 'lesson': closed++; break;` with a deprecation comment, matching that pattern.

## Output Mockups

**Dashboard summary line (after removal):**
```
12 runs · 3 active · 2 promoted · 7 closed
```

Previously: `12 runs · 3 active · 0 lessons · 2 promoted · 7 closed`

**`work complete` output** — unchanged. The chain line uses `stats.findings` (total) and `stats.newFindings`, neither of which referenced lessons in the display.

**JSON meta envelope (after removal):**
```json
{
  "meta": {
    "chain_runs": 12,
    "findings": {
      "active": 3,
      "closed": 7,
      "promoted": 2,
      "total": 12,
      "by_severity": { "risk": 1, "debt": 1, "observation": 1, "unclassified": 0 },
      "by_action": { "promote": 1, "scope": 1, "monitor": 0, "accept": 1, "unclassified": 0 }
    }
  }
}
```

The `lesson` field is gone from `findings`. No stub. No deprecated zero.

## File Changes

### `packages/cli/src/types/proof.ts` (modify)
**What changes:** Remove `'lesson'` from the `status` union on the findings type (~line 77). Remove `lessons: number` from `ProofChainStats` (~line 38).
**Pattern to follow:** The remaining union values — `'active' | 'promoted' | 'closed'`.
**Why:** The type system is the single source of truth for valid status values. Removing from the type forces every consumer to update at compile time.

### `packages/cli/src/utils/proofSummary.ts` (modify)
**What changes:** Four changes:
1. `ChainHealth` interface (~line 580): remove `lesson: number` from `findings`.
2. `computeChainHealth` (~line 1268): remove the `let lesson = 0` variable. Change `case 'lesson': lesson++; break;` to `case 'lesson': closed++; break;` with a comment: `// backward compat: pre-migration data`. Remove `lesson` from the return object.
3. `generateDashboard` (~line 479): remove `lessons` from the stats parameter signature. Remove lessons from the summary line format string.
4. `wrapJsonError` default (~line 1365): remove `lesson: 0` from the fallback `ChainHealth`.
**Pattern to follow:** The existing `default: active++` backward compat case at line 1292.
**Why:** `computeChainHealth` is the single counting function. All JSON meta and dashboard output flows through it.

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** Three changes:
1. Upstream auto-classification (~line 928-929): change `finding.status = 'lesson'` to `finding.status = 'closed'` and add `closed_reason`, `closed_at`, `closed_by` fields per AC3.
2. Upstream staleness skip (~line 975-976): remove the `if (finding.category === 'upstream') continue;` block. Add a comment explaining why: closed status skip at line 973 now catches upstream findings before this point.
3. Health destructure and dashboard call (~lines 1032-1044): remove `lesson: lessonsCount` from the destructure, remove `lessons` from the `generateDashboard` call, remove `lessons` from the `ProofChainStats` construction.

Additionally, add a **backfill migration block** inside the staleness loop (the `for (const chainEntry of allEntries)` loop at line 970). Before the `status === 'closed'` check, add: if `finding.status === 'lesson'`, migrate to closed. For findings without `closed_reason`, set `closed_reason: 'upstream'`, `closed_by: 'mechanical'`, `closed_at` from the parent entry's `completed_at`. For findings that already have `closed_reason`/`closed_at`/`closed_by`, preserve those fields and only change status. This is idempotent — already-migrated findings have `status: 'closed'` and skip.
**Pattern to follow:** The existing anchor-absent auto-close pattern at lines 988-993 (same field assignments).
**Why:** The backfill rides the existing mutation loop — zero new infrastructure. Every `work complete` progressively migrates old data.

### `packages/cli/src/commands/proof.ts` (modify)
**What changes:** Two changes:
1. Delete the entire lesson subcommand registration and handler (~lines 992-1251, from `const lessonCommand = new Command('lesson')` through `proofCommand.addCommand(lessonCommand)`). Find the exact boundaries by searching for the lesson command registration and its `addCommand` call.
2. Update the 3 remaining dashboard regeneration calls (in close ~line 920, promote ~line 1497, strengthen ~line 1792): remove `lessons: health.findings.lesson` from each call's stats object.
**Pattern to follow:** The close subcommand's dashboard call structure — just without the lessons field.
**Why:** The lesson subcommand is the primary deletion target. The dashboard calls must match the updated `generateDashboard` signature.

### `packages/cli/templates/.claude/agents/ana-learn.md` (modify)
**What changes:** Five locations reference lesson:
- Line 86: "meta includes closed and lesson findings" → "meta includes closed findings"
- Line 105: "closed/lesson entries" → "closed entries" (appears twice in the sentence)
- Line 452: "closed/lesson entries" → "closed entries"
- Line 498: remove the `ana proof lesson` command reference line entirely
- Line 506: "**Lesson candidates:**" → "**Low-priority observations:**" (these are Phase 3 triage targets — not necessarily closeable, just lower priority than risk/debt)
**Pattern to follow:** The surrounding prose style.
**Why:** The template ships to users. References to a removed command and concept create confusion.

### `packages/cli/templates/.claude/agents/ana.md` (modify)
**What changes:** Line 108: "surface relevant lessons" → "surface relevant findings"
**Pattern to follow:** The surrounding instruction style.
**Why:** The instruction was already broken (getProofContext filters lessons out). Fixing the wording to match the actual behavior.

### `website/content/docs/concepts/findings.mdx` (modify)
**What changes:** Two changes:
1. Line 15: the observation severity row's "Typical action" cell says `` `accept`, `monitor`, or record as `lesson`. `` — change to `` `accept` or `monitor`. ``
2. Lines 36-40: the Lifecycle section lists three terminal states including "lesson." Remove the `- **lesson** — recorded as institutional knowledge...` bullet entirely. The lifecycle description at line 36 ("three terminal states") becomes "two terminal states" — but actually it stays at three because active → closed, promoted remain. Wait — active is the starting state, not a terminal state. The text says "three terminal states" and lists closed, promoted, lesson. After removing lesson, update the text to say "two terminal states" and remove the lesson bullet.
**Pattern to follow:** The surrounding MDX prose and table style.
**Why:** Documentation describes a feature that no longer exists. Users reading this would try `ana proof lesson` and get an unknown command error.

### `website/content/docs/guides/troubleshooting.mdx` (modify)
**What changes:** Two changes:
1. Line 83: remove `lesson` from the command list: `` (`close`, `lesson`, `promote`, `strengthen`) `` → `` (`close`, `promote`, `strengthen`) ``
2. Line 116: remove `ana proof lesson` from the "don't edit by hand" advice: `` Use `ana proof close`, `ana proof promote`, `ana proof lesson`. `` → `` Use `ana proof close`, `ana proof promote`, `ana proof strengthen`. ``
**Pattern to follow:** The surrounding troubleshooting card prose.
**Why:** References to a removed command in troubleshooting docs will confuse users.

### `website/content/docs/guides/using-ana-learn.mdx` (modify)
**What changes:** Line 89: remove the lesson terminal state reference. Change from mentioning two other terminal states (close and lesson) to just mentioning close: `` Two other terminal states: `ana proof close` for resolved findings, and `ana proof lesson` for observations worth remembering but not worth encoding as rules. `` → `` One other terminal state: `ana proof close` for resolved findings. ``
**Pattern to follow:** The surrounding guide prose style.
**Why:** The learn guide references a command that no longer exists.

### `README.md` (modify)
**What changes:** Remove the `ana proof lesson` row from the command table at line 172: ``| `ana proof lesson <ids...>` | Record findings as institutional lessons |``
**Pattern to follow:** The surrounding table rows.
**Why:** The README is the first thing users see. A command that doesn't exist shouldn't be listed.

### `.claude/agents/ana.md` (modify)
**What changes:** Line 108: "surface relevant lessons" → "surface relevant findings". Same change as the template — this is the project-local copy.
**Pattern to follow:** Same as template change.
**Why:** The project-local agent definition must match the template. This project uses its own agents for development.

### `.claude/agents/ana-learn.md` (modify)
**What changes:** Same 5 changes as the template version — this is the project-local copy:
- Line 86: "meta includes closed and lesson findings" → "meta includes closed findings"
- Line 105: "closed/lesson entries" → "closed entries" (appears twice)
- Line 452: "closed/lesson entries" → "closed entries"
- Line 498: remove the `ana proof lesson` command reference line
- Line 506: "**Lesson candidates:**" → "**Low-priority observations:**"
**Pattern to follow:** Same as template changes.
**Why:** The project-local agent definition must match the template.

### `.ana/context/project-context.md` (modify)
**What changes:** Line 115: the Domain Vocabulary entry for "Proof finding" says "lifecycle state: active → promoted, closed, or lesson." Change to "lifecycle state: active → promoted or closed."
**Pattern to follow:** The surrounding vocabulary entries.
**Why:** Project context is consumed by all pipeline agents. A stale lifecycle description causes agents to reference a status that doesn't exist.

### `packages/cli/tests/commands/proof.test.ts` (modify)
**What changes:**
1. Remove the `lessonEntry` fixture (~lines 978-996).
2. Remove the "closes lesson finding" test (~lines 1121-1131) that uses `lessonEntry`.
3. Remove the "promotes lesson finding" test (~lines 3259-3272) that uses `lessonEntry`.
4. Remove ALL lesson subcommand tests (~lines 4062-4192): "lesson sets finding to lesson status", "lesson requires --reason", "lesson rejects closed findings", "lesson rejects promoted findings", "lesson commits with proof prefix", "lesson --dry-run does not mutate", "lesson returns FINDING_NOT_FOUND", "lesson --json returns structured response".
5. Remove the `meta.findings.lesson` assertion at line 2027.
**Pattern to follow:** Clean deletion — no replacement tests needed for removed functionality.
**Why:** Tests for removed functionality are dead weight. The backward compat behavior (old lesson data counted as closed) is tested via proofSummary.test.ts.

### `packages/cli/tests/commands/work.test.ts` (modify)
**What changes:**
1. Upstream status fixture at line 2212: change `status: 'lesson'` to `status: 'closed'`.
2. Upstream staleness exemption assertion at line 2219: change `expect(...status).toBe('lesson')` to `expect(...status).toBe('closed')`.
3. Status assignment test at line 2302: update description from "assigns active status to new code findings, lesson to upstream" to "assigns active status to new code findings, closed to upstream". Update the assertion at line 2330: `expect(upstreamFinding.status).toBe('closed')`.
4. Add assertions for the new closed metadata fields on upstream findings: `closed_reason: 'upstream'`, `closed_by: 'mechanical'`, `closed_at` matches ISO timestamp pattern.
5. Fixture at line 2282: change `status: 'lesson'` to `status: 'closed'`.
**Pattern to follow:** The existing assertion style in the same test file.
**Why:** These tests verify the upstream classification behavior, which changes from lesson to closed.

### `packages/cli/tests/utils/proofSummary.test.ts` (modify)
**What changes:**
1. Update the test at line 2312 ("preserves existing status counts"): change the fixture's `status: 'lesson'` finding to `status: 'closed'`. Update assertions: `health.findings.closed` becomes 2 (was 1), remove the `health.findings.lesson` assertion. Update `total` expectation to remain 3.
2. Update the test at line 2352 ("health by_severity matches audit"): same pattern — change `status: 'lesson'` to `status: 'closed'`, update `closed` count to 2, remove `lesson` assertion, update `total` to remain 5.
3. Add a NEW backward compat test: create a fixture with `status: 'lesson'` (simulating pre-migration data), verify `computeChainHealth` counts it as closed. This tests the deprecation case in the switch statement.
4. Update all `generateDashboard` test calls: remove `lessons: 0` from the stats parameter in every call (~6 instances around lines 1733-1795).
**Pattern to follow:** The existing `computeChainHealth` test structure for the new backward compat test.
**Why:** The proofSummary tests verify counting behavior. The backward compat test is the single test that proves old lesson data is handled correctly.

## Acceptance Criteria

- [ ] AC1: `ProofChainEntry` finding status union is `'active' | 'promoted' | 'closed'`. The literal `'lesson'` does not appear in the type definition.
- [ ] AC2: `ProofChainStats` does not have a `lessons` field.
- [ ] AC3: New upstream findings get `status: 'closed'`, `closed_reason: 'upstream'`, `closed_by: 'mechanical'`, `closed_at` set to current ISO timestamp.
- [ ] AC4: The backfill loop migrates existing `status === 'lesson'` findings: sets `status: 'closed'`. Preserves existing `closed_reason`/`closed_at`/`closed_by` if present; sets defaults if absent.
- [ ] AC5: `computeChainHealth` handles `status === 'lesson'` in old data by counting it as closed.
- [ ] AC6: The `ana proof lesson` subcommand does not exist.
- [ ] AC7: `generateDashboard` summary line format: `{N} runs · {N} active · {N} promoted · {N} closed`.
- [ ] AC8: `work complete` output does not include a lessons count.
- [ ] AC9: The upstream staleness skip is removed.
- [ ] AC10: The close command has no lesson-specific rejection path. (Verification only — no code change needed. The scope claimed a guard existed; it doesn't. The only `'already a lesson'` check was inside the lesson command itself, which is deleted.)
- [ ] AC11: The promote command has no lesson-specific rejection path. (Verification only — no code change needed. Same as AC10.)
- [ ] AC12: ana-learn.md template does not reference the lesson command. "closed/lesson" mentions updated to "closed".
- [ ] AC13: ana.md template says "surface relevant findings" not "surface relevant lessons".
- [ ] AC14: The findings.mdx lifecycle section does not list lesson as a terminal state.
- [ ] AC15: The troubleshooting.mdx does not reference the lesson command.
- [ ] AC16: The using-ana-learn.mdx does not reference `ana proof lesson`.
- [ ] AC17: The README command table does not include `ana proof lesson`.
- [ ] AC18: The project-local `.claude/agents/ana.md` says "findings" not "lessons".
- [ ] AC19: The project-local `.claude/agents/ana-learn.md` has no lesson references.
- [ ] AC20: The project-context.md domain vocabulary reflects the simplified lifecycle.
- [ ] AC21: Tests pass: `(cd packages/cli && pnpm vitest run)`
- [ ] AC22: Lint passes: `pnpm run lint`

## Testing Strategy

- **Unit tests:** Update `computeChainHealth` tests to remove lesson field assertions and add backward compat test for old `status: 'lesson'` data counted as closed. Update `generateDashboard` calls to remove `lessons` param.
- **Integration tests:** Update `work complete` tests for upstream status assignment (lesson → closed with metadata fields). Update staleness exemption test fixtures.
- **Edge cases:** The backward compat test in proofSummary.test.ts is the critical edge case — it proves that user projects with old lesson data in proof_chain.json won't break after upgrade.

## Backfill Migration

The backfill handles two distinct populations of lesson findings in proof_chain.json. Both are migrated to `status: 'closed'` during the next `work complete`. The migration is idempotent — once a finding has `status: 'closed'`, it's skipped on subsequent runs.

### Scenario 1: Upstream auto-lessons (122 findings)
- **Profile:** `category: 'upstream'`, no `closed_reason`, no `closed_at`, no `closed_by`
- **Origin:** Auto-assigned by `work.ts` line 929 (`finding.status = 'lesson'`)
- **Migration:** Set `status: 'closed'`, `closed_reason: 'upstream'`, `closed_by: 'mechanical'`, `closed_at: entry.completed_at` (from the parent proof chain entry's `completed_at` field — preserving the original timestamp rather than using `new Date()`)
- **Website impact:** Proof detail pages change `→ lesson` to `→ closed` for these findings after website rebuild

### Scenario 2: Human-created lessons (6 findings)
- **Profile:** `category: 'code'` or `'test'`, has `closed_reason`, `closed_at`, `closed_by: 'human'`
- **Origin:** Created via `ana proof lesson` command by a human developer
- **Migration:** Set `status: 'closed'` only. Preserve `closed_reason`, `closed_at`, `closed_by` — the semantic content of the institutional decision survives
- **Website impact:** Same as Scenario 1 — `→ lesson` becomes `→ closed`

### What is NOT backfilled
- **Historical assertion `says` text** — assertions like "Findings from upstream observations are classified as lessons" are historical records in proof_chain.json. They accurately describe what was verified when that pipeline ran. They are NOT modified. They will continue to display on proof detail pages with their original text.
- **Finding `summary` text** — some finding summaries mention "lesson" in prose (e.g., "Lesson command duplicates close's pattern"). These are historical observations. They are NOT modified.
- **Finding `closed_reason` text** — some closed_reason values mention "lesson" in prose (e.g., "Systemic tag collision (lesson C3)"). These are historical decision records. They are NOT modified.
- **`scope_summary` text** — entry-level summaries mentioning lessons (e.g., "57 active findings, 31 mechanically closed, 21 lessons") are historical. NOT modified.
- **`CHANGELOG.md`** — lines 23 and 71 reference `ana proof lesson` and list `lesson` as a lifecycle state. These are historical records of what shipped in those versions. NOT modified. The CHANGELOG accurately describes what was available at that time.
- **Website data files** (`proof-entries.json`, `commands.json`, `agent-templates.json`, `search-index.json`, `llms-full.txt`) — all generated by the `prebuild` script. They self-correct on the next website build after CLI changes land and `work complete` runs the backfill. Do NOT manually edit.

### Backfill timing
The backfill runs inside `writeProofChain` (work.ts), which is called by `work complete`. This means:
1. CLI ships with the code change
2. User upgrades CLI
3. Between upgrade and next `work complete`, the `computeChainHealth` backward compat case counts old lesson findings as closed (no crash, correct counts)
4. Next `work complete` runs the backfill — lesson findings mutated to closed in proof_chain.json
5. Next website build runs `prebuild` extraction — proof-entries.json reflects the migrated data

## Dependencies

None. All changes are internal to the CLI package.

## Constraints

- **Backward compatibility.** User projects with `status: 'lesson'` in proof_chain.json must not break between CLI upgrade and next `work complete`. The `computeChainHealth` backward compat case handles the counting path. The backfill migration handles the mutation path.
- **Test count.** Net test count will decrease (removing ~10 lesson subcommand tests, adding ~1 backward compat test). This is acceptable — we're removing functionality, not breaking it.

## Gotchas

- The 3 dashboard regeneration calls in proof.ts (close, promote, strengthen) each destructure `health.findings.lesson`. After removing `lesson` from `ChainHealth`, all 3 error at compile time. Good — the type system catches them. But make sure to update all 3, not just the first one found.
- The `wrapJsonError` function has a hardcoded default `ChainHealth` object at proofSummary.ts ~1365 that includes `lesson: 0`. This must be removed or the type will error.
- The backfill migration must check `finding.status === 'lesson'` using a string comparison, not the TypeScript type — because `'lesson'` is being removed from the type union. Cast to string or use `as unknown` if the compiler complains about comparing to a value not in the union.
- Template changes are in `packages/cli/templates/`, not the root `templates/` directory. The scope's paths omit `packages/cli/` — use the full paths.
- The `getProofContext` filter at proofSummary.ts:2154 already excludes non-active findings. No change needed there — lesson findings were already filtered out.
- **Website data files are generated, not source.** `website/data/docs/proof-entries.json`, `commands.json`, `agent-templates.json`, `search-index.json`, and `llms-full.txt` are all regenerated by the `prebuild` script (`website/scripts/extract-docs-data.ts`) from source data (proof_chain.json, CLI source code, templates, content pages). Do NOT manually edit these files. They self-correct on the next website build after CLI changes land.
- **Website proof pages won't break.** `FindingsList.tsx` renders finding status as a raw string — no enum matching, no switch statement. Historical findings with `status: "lesson"` will display `→ lesson` on proof detail pages until the backfill runs and a website rebuild extracts the updated data. This is cosmetically stale but not a breakage. No website component or page code changes are needed.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Explicit return types on all exported functions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Always pass `--run` with pnpm vitest to avoid watch mode.
- Tests that create git repositories must use `git init -b main`.
- Test behavior, not implementation. Assert on specific expected values.

### Pattern Extracts

**Backward compat case pattern (proofSummary.ts:1287-1292):**
```typescript
      switch (f.status) {
        case 'active': active++; break;
        case 'lesson': lesson++; break;
        case 'promoted': promoted++; break;
        case 'closed': closed++; break;
        default: active++; break; // undefined = active
      }
```
Change `case 'lesson': lesson++; break;` to `case 'lesson': closed++; break; // backward compat: pre-migration data`

**Upstream auto-classification pattern (work.ts:926-933):**
```typescript
  // Assign status to new findings (AC5)
  for (const finding of entry.findings) {
    if (finding.category === 'upstream') {
      finding.status = 'lesson';
    } else {
      finding.status = 'active';
    }
  }
```

**Auto-close field assignment pattern (work.ts:988-993):**
```typescript
          finding.status = 'closed';
          finding.closed_reason = 'code changed, anchor absent';
          finding.closed_at = new Date().toISOString();
          finding.closed_by = 'mechanical';
```

### Proof Context

- "Lesson command duplicates close's finding-search loop pattern" — this finding is resolved by removing lesson entirely.
- "Lesson command catch block at proof.ts:1141 loses error detail" — this finding is resolved by removing lesson entirely.
- No other active findings for the remaining affected files are relevant to this build.

### Checkpoint Commands

- After type changes (`proof.ts` types + `proofSummary.ts` interface): `(cd packages/cli && pnpm vitest run tests/utils/proofSummary.test.ts --run)` — Expected: tests fail until test fixtures updated
- After all source changes: `(cd packages/cli && pnpm vitest run --run)` — Expected: all tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2297 passed, 2 skipped (2299 total)
- Current test files: 103 passed
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2285 tests (net ~12 removed lesson tests, ~1 added backward compat test)
- Regression focus: `tests/commands/proof.test.ts`, `tests/commands/work.test.ts`, `tests/utils/proofSummary.test.ts`
