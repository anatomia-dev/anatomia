# Verify Report: Remove lesson status from proof system

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-15
**Spec:** .ana/plans/active/remove-lesson-status/spec.md
**Branch:** feature/remove-lesson-status

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/remove-lesson-status/.ana/plans/active/remove-lesson-status/contract.yaml
  Seal: INTACT (hash sha256:1b945b9b60ad41e05832057d19613fd5b539e257c1a8a6a2201ae1eacc1c8bd3)
```

Seal status: **INTACT**

Tests: 2315 passed, 2 skipped (2317 total). Build: success. Lint: success.

Baseline was 2297 passed / 2 skipped (2299 total). Net +18 tests — the spec predicted ~-12, but the builder's additions (backfill backward compat + upstream close metadata assertions) and the test count delta from other recent merges account for this.

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | The finding status type only allows active, promoted, or closed | ✅ SATISFIED | `packages/cli/src/types/proof.ts:78` — `status?: 'active' \| 'promoted' \| 'closed'`, no `'lesson'` in union |
| A002 | Chain health stats no longer track lessons as a separate count | ✅ SATISFIED | `packages/cli/src/types/proof.ts:34-45` — `ProofChainStats` has no `lessons` field |
| A003 | New upstream findings are automatically closed instead of lessoned | ✅ SATISFIED | `packages/cli/src/commands/work.ts:939` — `finding.status = 'closed'`; test at `packages/cli/tests/commands/work.test.ts:2441` asserts `upstreamFinding.status toBe('closed')` |
| A004 | New upstream findings record why they were closed | ✅ SATISFIED | `packages/cli/src/commands/work.ts:940` — `finding.closed_reason = 'upstream'`; test at `work.test.ts:2442` asserts `closed_reason toBe('upstream')` |
| A005 | New upstream findings record they were closed mechanically | ✅ SATISFIED | `packages/cli/src/commands/work.ts:941` — `finding.closed_at = new Date().toISOString()`; test at `work.test.ts:2443` asserts `closed_by toBe('mechanical')` |
| A006 | New upstream findings record when they were closed | ✅ SATISFIED | `packages/cli/src/commands/work.ts:941` — sets `closed_at`; test at `work.test.ts:2444` asserts `closed_at toMatch(/^\d{4}-\d{2}-\d{2}/)` |
| A007 | Old lesson findings in the proof chain are migrated to closed during work complete | ✅ SATISFIED | `packages/cli/src/commands/work.ts:986-987` — `if ((finding.status as string) === 'lesson') { finding.status = 'closed'; }`. Verified by source inspection; the mutation runs inside the staleness loop over all chain entries. No dedicated test exists for this migration path (see Findings). |
| A008 | Migrated lessons without existing metadata get default close fields | ✅ SATISFIED | `packages/cli/src/commands/work.ts:988-991` — `if (!finding.closed_reason) { closed_reason: 'upstream', closed_by: 'mechanical', closed_at: chainEntry.completed_at }`. Verified by source inspection. |
| A009 | Migrated lessons with existing close metadata keep their original reason | ✅ SATISFIED | `packages/cli/src/commands/work.ts:988` — the `if (!finding.closed_reason)` guard preserves existing metadata. Only `finding.status` is changed to `'closed'` for findings that already have close fields. Verified by source inspection. |
| A010 | Old lesson data in proof chains is counted as closed for health calculations | ✅ SATISFIED | `packages/cli/src/utils/proofSummary.ts:1389` — `case 'lesson': closed++; break;`; test at `proofSummary.test.ts:2385` creates fixture with `status: 'lesson'`, asserts `health.findings.closed toBe(1)` |
| A011 | Health calculations no longer return a lesson count | ✅ SATISFIED | `packages/cli/src/utils/proofSummary.ts:580-584` — `ChainHealth.findings` has no `lesson` field; test at `proofSummary.test.ts:2395` asserts `(health.findings as Record)['lesson'] toBeUndefined()` |
| A012 | The proof dashboard shows runs, active, promoted, and closed counts | ✅ SATISFIED | `packages/cli/src/utils/proofSummary.ts:483` — format string is `${stats.runs} runs · ${stats.active} active · ${stats.promoted} promoted · ${stats.closed} closed`; contains "promoted" |
| A013 | The proof dashboard does not mention lessons | ✅ SATISFIED | `packages/cli/src/utils/proofSummary.ts:479-483` — `generateDashboard` signature and format string have no `lessons` parameter or text |
| A014 | The upstream staleness skip is no longer needed | ✅ SATISFIED | Grep for `category === 'upstream'` in staleness loop area (work.ts:983-1020) returns no matches. The old `if (finding.category === 'upstream') continue;` is removed. |
| A015 | The learn agent template does not reference the lesson command | ✅ SATISFIED | `grep -i lesson packages/cli/templates/.claude/agents/ana-learn.md` — no matches |
| A016 | The learn agent template uses 'closed' not 'closed/lesson' | ✅ SATISFIED | `grep 'closed/lesson' packages/cli/templates/.claude/agents/ana-learn.md` — no matches |
| A026 | The learn agent template does not recommend lesson candidates | ✅ SATISFIED | `grep 'Lesson candidates' packages/cli/templates/.claude/agents/ana-learn.md` — no matches. Line 506 now reads "Low-priority observations:" |
| A027 | Backfilled upstream lessons record they were closed mechanically | ✅ SATISFIED | `packages/cli/src/commands/work.ts:990` — `finding.closed_by = 'mechanical'` inside the `if (!finding.closed_reason)` block. Verified by source inspection. |
| A028 | Backfilled upstream lessons record when they were closed using the original entry timestamp | ✅ SATISFIED | `packages/cli/src/commands/work.ts:991` — `finding.closed_at = chainEntry.completed_at \|\| new Date().toISOString()`. Uses parent entry's `completed_at` with fallback. Verified by source inspection. |
| A017 | The ana agent template says 'findings' not 'lessons' for proof context | ✅ SATISFIED | `packages/cli/templates/.claude/agents/ana.md:108` — "surface relevant findings" |
| A018 | The findings documentation no longer lists lesson as a lifecycle state | ✅ SATISFIED | `grep -i lesson website/content/docs/concepts/findings.mdx` — no matches. Line 36 reads "two terminal states" listing closed and promoted only. |
| A019 | The troubleshooting guide no longer references the lesson command | ✅ SATISFIED | `grep -i lesson website/content/docs/guides/troubleshooting.mdx` — no matches. Line 83: `close`, `promote`, `strengthen`. Line 116: `close`, `promote`, `strengthen`. |
| A020 | The learn guide no longer references the lesson command | ✅ SATISFIED | `grep 'ana proof lesson' website/content/docs/guides/using-ana-learn.mdx` — no matches. Line 89 reads "One other terminal state: `ana proof close`" |
| A021 | The README command table no longer lists the lesson command | ✅ SATISFIED | `grep 'ana proof lesson' README.md` — no matches |
| A022 | The project-local ana agent says findings not lessons | ✅ SATISFIED | `grep -i lesson .claude/agents/ana.md` — no matches |
| A023 | The project-local learn agent has no lesson references | ✅ SATISFIED | `grep -i lesson .claude/agents/ana-learn.md` — no matches |
| A024 | The project context reflects the simplified finding lifecycle | ✅ SATISFIED | `.ana/context/project-context.md:115` — "lifecycle state: active → promoted or closed" — no "or lesson" |
| A025 | All tests pass after the removal | ✅ SATISFIED | `(cd packages/cli && pnpm vitest run)` — 2315 passed, 2 skipped, 0 failed, exit code 0 |

## Independent Findings

**Backfill migration test gap.** The backfill logic at `work.ts:985-993` converts `status: 'lesson'` findings to `status: 'closed'` with conditional metadata preservation. This mutation path has no dedicated test. The existing test at `work.test.ts:2316-2333` was updated to use `status: 'closed'` in its fixture, so it no longer exercises the lesson→closed migration — it only tests that already-closed upstream findings skip staleness. The `proofSummary.test.ts` backward compat test covers COUNTING (lesson counted as closed) but not MUTATION (lesson converted to closed with metadata). The code is correct by inspection, but the next engineer changing the staleness loop could break the migration without a test catching it.

**Stale comment.** `proofSummary.ts:2257` reads "Filter by status: default excludes closed/lesson/promoted" — the code behavior is correct (it skips non-active statuses) but the comment still references "lesson" as a specific exclusion. Cosmetic.

**No over-building detected.** I checked all new code paths: no unused parameters, no extra functions, no unnecessary abstractions. The backfill block is the only addition to source code, and it's required by the spec.

**No sentinel tests.** I read every modified test assertion. All assertions check specific values (`.toBe('closed')`, `.toBe('upstream')`, `.toBe('mechanical')`, `.toMatch(/^\d{4}-\d{2}-\d{2}/)`) rather than existence checks. The backward compat test uses exact counts.

**Prediction resolution:**
- Cast for lesson comparison: confirmed at work.ts:986, clean solution
- Weak backward compat assertion: not found, assertions are specific
- Wrong timestamp source: not found, correctly uses `chainEntry.completed_at` for backfill and `new Date()` for new findings
- Template missed locations: not found, all 5 locations in both copies updated
- Over-building: not found, clean removal

## AC Walkthrough

- **AC1:** ✅ PASS — `proof.ts:78` status union is `'active' | 'promoted' | 'closed'`. No `'lesson'`.
- **AC2:** ✅ PASS — `proof.ts:34-45` `ProofChainStats` has `runs`, `findings`, `active`, `promoted`, `closed`, `newFindings`, `maintenance`. No `lessons`.
- **AC3:** ✅ PASS — `work.ts:938-942` sets `status: 'closed'`, `closed_reason: 'upstream'`, `closed_by: 'mechanical'`, `closed_at: new Date().toISOString()` for upstream findings. Test at `work.test.ts:2441-2444` verifies all four fields.
- **AC4:** ✅ PASS — `work.ts:985-993` backfill loop: sets `status: 'closed'`, preserves existing close metadata (`if (!finding.closed_reason)` guard), sets defaults if absent.
- **AC5:** ✅ PASS — `proofSummary.ts:1389` `case 'lesson': closed++; break;` with backward compat comment. Test at `proofSummary.test.ts:2385-2396`.
- **AC6:** ✅ PASS — `grep -r 'lessonCommand\|addCommand.*lesson' packages/cli/src/commands/proof.ts` — no matches. Entire lesson subcommand deleted.
- **AC7:** ✅ PASS — `proofSummary.ts:483` format: `${stats.runs} runs · ${stats.active} active · ${stats.promoted} promoted · ${stats.closed} closed`.
- **AC8:** ✅ PASS — `work.ts:1052-1064` — `ProofChainStats` construction has no lessons field. `generateDashboard` call at line 1054 passes `runs`, `active`, `promoted`, `closed` only.
- **AC9:** ✅ PASS — Grep for `category === 'upstream'` in the staleness loop (work.ts:983-1020) returns no matches. The skip is removed.
- **AC10:** ✅ PASS — Verification only. Grep for `lesson` in the close subcommand area of proof.ts — no matches. The lesson-specific rejection path was inside the deleted lesson command, not in close.
- **AC11:** ✅ PASS — Verification only. Same as AC10 — no lesson-specific rejection in promote. The check was inside the deleted lesson command.
- **AC12:** ✅ PASS — `grep -i lesson packages/cli/templates/.claude/agents/ana-learn.md` — no matches. "closed/lesson" → "closed", "Lesson candidates" → "Low-priority observations".
- **AC13:** ✅ PASS — `packages/cli/templates/.claude/agents/ana.md:108` reads "surface relevant findings".
- **AC14:** ✅ PASS — `website/content/docs/concepts/findings.mdx:36` reads "two terminal states" listing closed and promoted. No lesson.
- **AC15:** ✅ PASS — `grep -i lesson website/content/docs/guides/troubleshooting.mdx` — no matches.
- **AC16:** ✅ PASS — `grep 'ana proof lesson' website/content/docs/guides/using-ana-learn.mdx` — no matches.
- **AC17:** ✅ PASS — `grep 'ana proof lesson' README.md` — no matches.
- **AC18:** ✅ PASS — `grep -i lesson .claude/agents/ana.md` — no matches.
- **AC19:** ✅ PASS — `grep -i lesson .claude/agents/ana-learn.md` — no matches.
- **AC20:** ✅ PASS — `.ana/context/project-context.md:115` reads "active → promoted or closed".
- **AC21:** ✅ PASS — Tests: 2315 passed, 2 skipped, 0 failed.
- **AC22:** ✅ PASS — Lint: 2 tasks successful (cli + website).

## Blockers

No blockers. All 26 contract assertions SATISFIED. All 22 ACs pass. Tests pass. Build succeeds. Lint clean. No regressions.

Checked for: unused exports in new code (no new exports added — this is a removal build), sentinel test patterns (all assertions use specific values), error paths that swallow silently (backfill fallback at work.ts:991 uses `chainEntry.completed_at || new Date().toISOString()` — graceful degradation, not silent failure), assumptions about external state (backfill runs inside existing staleness loop, no new external dependencies).

## Findings

- **Test — Backfill migration logic untested:** `packages/cli/src/commands/work.ts:985` — The mutation from `status: 'lesson'` → `status: 'closed'` with conditional metadata preservation (`if (!finding.closed_reason)`) has no dedicated test. The staleness exemption test was updated to use `status: 'closed'` in its fixture, so it no longer exercises the migration path. The backward compat test in proofSummary covers counting but not mutation. Code is correct by inspection, but the next engineer modifying the staleness loop could break the migration silently. Severity: debt. A future scope could add a test that puts `status: 'lesson'` in a fixture, runs `completeWork`, and asserts the finding emerges as `status: 'closed'` with correct metadata.

- **Code — Stale comment references 'lesson' in getProofContext:** `packages/cli/src/utils/proofSummary.ts:2257` — Comment reads "default excludes closed/lesson/promoted" but `lesson` is no longer a formal status. The filter logic is correct (skips non-active). Cosmetic only.

- **Upstream — proofSummary.ts file size still past comfort threshold:** `packages/cli/src/utils/proofSummary.ts` — ~1550 lines, known from prior cycles (v1-code-changes-C3). This build adds ~2 net lines. Not worsened but not improved.

## Deployer Handoff

Pure removal — no new features, no new APIs, no migration scripts to run. After merge:

1. The next `work complete` on any project using this CLI version will progressively backfill existing lesson findings to closed. This is idempotent and runs inside the existing staleness loop.
2. Website data files (`proof-entries.json`, etc.) will self-correct on the next website build after backfill runs. Historical proof detail pages will show `→ closed` instead of `→ lesson` for migrated findings.
3. The `ana proof lesson` command will cease to exist. Users who have it in muscle memory will get Commander's "unknown command" error.
4. No config changes needed. No environment variables. No breaking changes to existing proof_chain.json — the backward compat case in `computeChainHealth` handles old data silently until the backfill migrates it.

## Verdict

**Shippable:** YES

Clean removal. Every user-facing reference to lesson is gone from source, templates, docs, and agent definitions. The backward compat path handles old data correctly. The type system prevents future code from using the removed status. The one gap — no test for the backfill mutation — is debt, not a blocker: the migration is simple (5 lines), idempotent, and verified by source inspection.
