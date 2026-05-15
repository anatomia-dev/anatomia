# Scope: Remove lesson status from proof system

**Created by:** Ana
**Date:** 2026-05-14

## Intent

The lesson status occupies a semantic niche already filled by close-with-reason. Post-availability adoption data shows 128 findings closed with "accept/intentional" reasons vs. 6 using the lesson command — the workflow voted with its feet. The Learn agent's triage phases produce close, keep, or promote — lesson isn't part of the loop. No agent reads lessons, no command surfaces them, and Ana's own instruction to "surface relevant lessons" via `proof context` is broken because `getProofContext` filters lessons out. Meanwhile, 116 upstream auto-lessons (pipeline forensics about contract quality and tag collisions) dilute the concept so thoroughly that a lesson query would return 95% noise. The status adds a fourth value every consumer must handle while contributing no retrievable information.

## Complexity Assessment
- **Kind:** chore
- **Size:** medium
- **Files affected:**
  - `src/commands/proof.ts` — remove lesson subcommand (~260 lines), remove lessons param from 4 dashboard calls
  - `src/commands/work.ts` — change upstream auto-classification from lesson to closed, remove upstream staleness skip (now redundant), remove lessons from stats destructure and output
  - `src/utils/proofSummary.ts` — backward compat case in computeChainHealth, remove lessons from generateDashboard signature and summary line
  - `src/types/proof.ts` — remove `'lesson'` from status union, remove `lessons` from ProofChainStats
  - `templates/.claude/agents/ana-learn.md` — remove lesson command from reference, update "closed/lesson" mentions
  - `templates/.claude/agents/ana.md` — fix broken "surface relevant lessons" instruction
  - `tests/commands/proof.test.ts` — remove lesson subcommand tests
  - `tests/commands/work.test.ts` — update upstream status assertions and fixtures
  - `tests/utils/proofSummary.test.ts` — update fixtures, verify backward compat
- **Blast radius:** Every proof subcommand reads the chain, but audit, context, health, and staleness already filter lessons out — no behavioral change for those. The close and promote commands currently reject lesson-status findings — those guards simplify. The dashboard summary line loses the lessons count. JSON meta output loses the `lessons` field. User projects with existing lesson-status findings in their proof_chain.json need backward compat handling until the backfill migration runs on their next `work complete`.
- **Estimated effort:** ~30 minutes pipeline time. Mostly deletion.
- **Multi-phase:** no

## Approach

Removal, not replacement. The finding lifecycle simplifies from four states (`active | lesson | promoted | closed`) to three (`active | promoted | closed`). Close-with-reason already captures the "institutional decision" use case — 128 findings prove it. The lesson command, the lesson status, and the upstream auto-classification all go away. Existing lesson-status findings migrate to closed in the backfill loop, preserving their `closed_reason` where it exists.

The one non-obvious piece is backward compatibility. User projects that upgrade the CLI will still have `status: 'lesson'` in their proof_chain.json until the next `work complete` triggers the backfill. Direct chain readers (health, audit, close, promote) must handle this gracefully. The approach: `computeChainHealth` maps lesson to closed in its switch statement with a deprecation comment. The backfill loop does the real migration.

## Acceptance Criteria

- AC1: `ProofChainEntry` finding status union is `'active' | 'promoted' | 'closed'`. The literal `'lesson'` does not appear in the type definition.
- AC2: `ProofChainStats` does not have a `lessons` field.
- AC3: New upstream findings (`category === 'upstream'`) get `status: 'closed'`, `closed_reason: 'upstream'`, `closed_by: 'mechanical'`, `closed_at` set to current ISO timestamp. They do not get `status: 'lesson'`.
- AC4: The backfill loop in `writeProofChain` migrates existing findings with `status === 'lesson'`: sets `status: 'closed'`. For findings without `closed_reason`, sets `closed_reason: 'upstream'`, `closed_by: 'mechanical'`, `closed_at` from the parent entry's `completed_at`. For findings that already have `closed_reason`/`closed_at`/`closed_by` (human-created lessons), preserves those fields and only changes status.
- AC5: `computeChainHealth` handles `status === 'lesson'` in old data by counting it as closed. Comment explains this is backward compat for pre-migration proof chains.
- AC6: The `ana proof lesson` subcommand does not exist. Running `ana proof lesson` produces Commander's default "unknown command" error.
- AC7: `generateDashboard` summary line does not include a lessons count. Format: `{N} runs · {N} active · {N} promoted · {N} closed`.
- AC8: `work complete` output does not include a lessons count in the chain stats line.
- AC9: The upstream staleness skip at work.ts (currently `if (finding.category === 'upstream') continue`) is removed. Upstream findings are now closed, so the existing `if (finding.status === 'closed') continue` handles them before the category check would be reached.
- AC10: The close command no longer has a special rejection for lesson-status findings (the `'already a lesson'` guard is removed).
- AC11: The promote command no longer has a special rejection for lesson-status findings.
- AC12: The ana-learn.md template does not reference the lesson command. Mentions of "closed/lesson" are updated to "closed".
- AC13: The ana.md template's proof context instruction says "surface relevant findings" not "surface relevant lessons".
- AC14: Tests pass: `(cd packages/cli && pnpm vitest run)`
- AC15: Lint passes: `pnpm run lint`

## Edge Cases & Risks

**Backward compatibility window.** Between CLI upgrade and next `work complete`, a user's proof_chain.json still contains `status: 'lesson'` findings. Direct chain readers (proof health, proof audit, proof close, etc.) encounter these values. AC5 covers the counting path. The audit and context filters already exclude non-active findings — lesson was already excluded. The close and promote commands removing their lesson guards (AC10, AC11) means old lesson findings become closable/promotable, which is correct.

**User projects with human-created lessons.** A project where someone explicitly used `ana proof lesson` to record a decision will have those findings silently migrated to closed. The `closed_reason` is preserved, so the institutional decision text survives. The status label changes but the semantic content doesn't. If a user inspects their proof chain, they'll see `status: 'closed'` where they expected `status: 'lesson'` — but since no command ever surfaced lesson-status findings, this was already invisible.

**Dashboard count shift.** The summary line changes from "121 lessons · 411 closed" to "532 closed" (after migration). This is cosmetic — no behavioral impact. The active count (what matters for triage) is unchanged.

**ProofChainStats consumers.** Any code destructuring `lessons` from the stats return will get a TypeScript error at compile time. This is intentional — it forces all consumers to update. The work.ts output formatting and all dashboard generation calls are the known consumers.

**JSON meta field removal.** The JSON envelope's `meta.findings.lesson` field disappears. Agent consumers parsing JSON output will see the field missing. Since lesson count was always 0 for new projects and irrelevant for triage (audit handles active counts), this is non-breaking in practice.

## Rejected Approaches

**Keep lesson, fix retrieval.** The retrieval problem is real — institutional decisions aren't queryable. But building retrieval for lessons misses the point: 128 of 134 institutional decisions are already close-with-reason findings. Any useful "what risks are we carrying?" query must search close reasons regardless. The lesson status adds no signal that close reasons don't already carry.

**Keep lesson, stop upstream auto-classification.** Cleaner lesson pool (6 real lessons vs. 116 noise), but still redundant with close-with-reason. Maintains a fourth status value and a command for a 128:6 adoption ratio. Two changes to preserve a concept the workflow doesn't use.

**Rename lesson to "accepted."** Reshuffles the label without solving the redundancy. The workflow still has to decide between `close --reason "accept: ..."` and `accepted`, and 128:6 shows it already chose close.

**Eager migration (script or init hook).** A one-time migration of proof_chain.json on CLI upgrade. Cleaner than lazy backfill, but requires a new migration mechanism that doesn't exist. The backfill loop already does mutations on every `work complete` — riding it is zero new infrastructure.

## Open Questions

None. All design decisions resolved through code investigation and data analysis.

## Exploration Findings

### Patterns Discovered

- work.ts:926-932 — upstream auto-classification: `if (finding.category === 'upstream') finding.status = 'lesson'`. This is where 116 of 122 lessons originated.
- work.ts:970-976 — upstream staleness skip: checks `category === 'upstream'` after checking `status === 'closed'`. The category check becomes unreachable after upstream findings are closed.
- proof.ts:993-1251 — lesson subcommand: clones close's structure exactly. Same variadic IDs, `--reason` required, `--dry-run`, `--json`, branch check, findFindingById, git commit. 260 lines.
- proofSummary.ts:1286-1289 — computeChainHealth switch: `case 'lesson': lesson++; break;`. Only counting location for lessons.
- proofSummary.ts:2153 — getProofContext filter: `if (!options?.includeAll && finding.status && finding.status !== 'active') continue`. Lessons already excluded. The `includeAll` option is never passed as true from any CLI command.

### Constraints Discovered

- [DATA-VERIFIED] 122 lesson-status findings across 87 of 102 entries. 116 upstream (auto-assigned, no closed_reason/closed_at/closed_by), 6 human (have all metadata fields).
- [DATA-VERIFIED] Post-availability adoption: 102 findings closed with accept/intentional reasons after May 5 (lesson command shipped May 4) vs. 6 findings lessoned. 128:6 total.
- [DATA-VERIFIED] 36 upstream lessons have file references, 33 of those files still exist. After migration to closed, these are correctly handled — `status === 'closed'` skip at line 973 catches them before any staleness check.
- [TYPE-VERIFIED] `status?: 'active' | 'lesson' | 'promoted' | 'closed'` at proof.ts:77. The union is the single source of truth for status values.
- [OBSERVED] Learn agent triage workflow (ana-learn.md:212-296) has three phases producing close, keep, or promote. No phase produces lesson. The lesson command appears only in the command reference section.
- [OBSERVED] Ana agent template (ana.md:108) says "surface relevant lessons" but `getProofContext` filters lessons out. The instruction and implementation contradict.

### Test Infrastructure

- `tests/commands/proof.test.ts` — lesson subcommand tests at ~line 1122 (successful lesson, missing reason, already-closed rejection, already-promoted rejection, not-found, dry-run). These are removed.
- `tests/commands/work.test.ts` — upstream status test at line 2302 (`assigns active status to new code findings, lesson to upstream`), upstream staleness exemption test at line 2205, fixture data at lines 2212 and 2282. These change assertions from `'lesson'` to `'closed'`.
- `tests/utils/proofSummary.test.ts` — computeChainHealth tests verify lesson counting. These update to verify backward compat (old lesson data counted as closed).

## For AnaPlan

### Structural Analog

`proof.ts` close subcommand (lines 753-990) — same structure as lesson, and it STAYS. The lesson command was a clone of close. Removing lesson means deleting the clone while the original remains untouched.

### Relevant Code Paths

- `packages/cli/src/types/proof.ts:77` — status union type definition
- `packages/cli/src/types/proof.ts:39` — ProofChainStats with lessons field
- `packages/cli/src/commands/work.ts:926-932` — upstream auto-classification
- `packages/cli/src/commands/work.ts:970-976` — upstream staleness skip
- `packages/cli/src/commands/work.ts:1032-1034` — stats destructure with lessons
- `packages/cli/src/commands/proof.ts:993-1251` — lesson subcommand (delete target)
- `packages/cli/src/commands/proof.ts:920, 1188, 1497, 1792` — 4 dashboard regen calls passing lessons param
- `packages/cli/src/utils/proofSummary.ts:1286-1289` — computeChainHealth lesson case
- `packages/cli/src/utils/proofSummary.ts:479-483` — generateDashboard summary line with lessons
- `templates/.claude/agents/ana-learn.md:86, 105, 452, 498` — lesson references
- `templates/.claude/agents/ana.md:108` — broken "surface relevant lessons" instruction

### Patterns to Follow

- Backward compat case in switch: `case 'lesson': closed++; break; // deprecated: pre-migration data` — same pattern used for handling undefined status as active (the `default: active++` case at line 1292).
- Backfill migration: rides the existing loop at work.ts:970+ that already handles closed findings. Same idempotent pattern — check status, skip if already handled, mutate in place.

### Known Gotchas

- The 4 dashboard regeneration calls in proof.ts each destructure `health.findings.lesson` for the `lessons` parameter. After removing `lessons` from ProofChainStats, all 4 call sites error at compile time. Good — the type system catches them. But Plan should ensure Build updates all 4 (lines 920, 1188, 1497, 1792) and the function signature of `generateDashboard`.
- The close command at proof.ts:~835 has an `'already a lesson'` rejection path that feeds into `exitError('ALREADY_LESSON', ...)`. The lesson-specific error code and hint should be removed along with the guard. Same for promote at ~1350.
- The `lessonEntry` test fixture in proof.test.ts (around line 978) is used by both lesson tests and other tests (close-lesson-finding, promote-lesson-finding). Removing the lesson tests is clean, but the fixture itself is used by close and promote tests that verify transitioning FROM lesson status. Those tests need updating — they should use a closed finding or just be removed since lesson status won't exist.
- The upstream staleness skip removal (AC9) is safe because line 973 catches closed findings first. But if a future change ever reintroduces a non-closed status for upstream findings, the skip would need to come back. Note in a code comment.

### Things to Investigate

- The `lessonEntry` fixture in proof.test.ts — verify exactly which tests consume it beyond the lesson subcommand tests. Close and promote tests may use it to verify "transitions from lesson" behavior. Plan should decide: remove those transition tests (lesson won't exist), or convert them to test transitions from a different starting state.
