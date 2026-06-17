# Spec: Verdict Honesty — Components 1 + 2 (prompt de-contradiction + one verdict function)

**Created by:** AnaPlan
**Date:** 2026-06-16
**Scope:** .ana/plans/active/verifier-verdict-honesty/scope.md

## Approach

Two reinforcing fixes on the PASS/FAIL verdict, both pure anatomia (no anatrace dependency):

1. **Component 1 — remove the prompt contradiction.** `ana-verify.md` forbids reading the build report in two places but *licenses* it in two others. Delete only the two licenses; keep the prohibition and the source-inspection fallback intact. This is what lets Spec 2's adapter emit a clean, gate-eligible obligation.

2. **Component 2 — one verdict function.** The headline `**Result:** PASS|FAIL` is currently scraped by ≥6 copies of the same regex, each independently trusting one prose line the verify model typed. Collapse them into a single function in a new `utils/verdict.ts` that **cross-checks the headline against the compliance table** and **coerces a contradicted PASS to FAIL** — the verdict stops blindly trusting one line. Design principle in play: *the elegant solution is the one that removes* — six regexes become one function.

   **The contradiction signal is the UNSATISFIED table row, and only that.** `deriveVerdict(content)` is content-only; it parses the `## Contract Compliance` table from the report markdown. It must NOT key on findings: `severity: risk` lives in the companion `verify_data.yaml`, not the report `.md` (ana-verify.md:139 — "the YAML is authoritative for machines"; the `## Findings` section is prose), so it isn't reachable from `content`. And per ana-verify.md:412, findings — even `risk` ones — do not prevent a PASS; only UNSATISFIED assertions do. Coercing on a finding would manufacture false FAILs.

**Sequencing:** Land this **after** `verifier-intent-coverage`'s verify-path edits merge — it also touches `ana-verify.md` and `proofSummary.ts`. **Re-derive every line number below at build time** (`proofSummary.ts` is ~1285 lines and high-churn; recent commits already moved it).

**Honesty boundary (carry verbatim into code doc and proof, never soften):** Component 2 makes the verdict **not one-word-forgeable** — a one-word "PASS" that contradicts the agent's own table no longer passes. It does **NOT** make the verdict un-lie-able: a verifier that fills the table dishonestly still passes. The verdict is still self-authored. Do not write "the agent can't lie" anywhere.

## Output Mockups

**`deriveVerdict` return shape (the single source of verdict truth):**

```ts
interface VerdictResult {
  result: 'PASS' | 'FAIL' | 'UNKNOWN';   // effective verdict, post-coercion — what every consumer uses
  headline: 'PASS' | 'FAIL' | 'UNKNOWN'; // the raw scraped **Result:** line
  contradictions: string[];               // human-readable reasons; non-empty iff a PASS was coerced to FAIL
}
```

**Contradicted-PASS, as surfaced at `ana work complete` (guardFailResult message):**

```
Error: Cannot complete work with a FAIL verification result.
The verify headline says PASS but it contradicts the verifier's own report:
  • PASS headline contradicts UNSATISFIED row A003
Fix the issues and re-verify before completing.
```

**Reason string format (exact — the contract asserts this substring):**
- UNSATISFIED row: `PASS headline contradicts UNSATISFIED row {id}` (e.g. `A003`) — one per offending row

**Clean PASS (no contradiction)** is unchanged: `result: 'PASS'`, `contradictions: []`.

## File Changes

> Re-confirm each file's state with `ls`/`git log` at build time. `dist/templates/**` is **gitignored** — rebuild it with `pnpm build` for local runtime, but do NOT add it to the commit and do NOT hand-edit it. Only the 2 template masters + 2 dogfood copies are tracked changes for Component 1.

### packages/cli/templates/.claude/agents/ana-verify.md (modify)
**What changes:** Remove the two build-report *read* licenses. Today (re-derive lines):
- `:209` — "If no tagged test exists, **check the build report for coverage claims** and verify by source inspection where applicable…" → delete the build-report clause, keep source inspection: "If no tagged test exists, verify by source inspection where applicable…"
- `:226` — "For assertions with no tagged test: **check the build report for coverage claims, then** verify by source inspection if applicable." → "For assertions with no tagged test: verify by source inspection if applicable."
**Keep untouched:** the prohibition at `:30` and `:503`, and the reinforcing `:418` ("documented in their build report, which you haven't read") and `:179` (gating mechanics). Do not weaken Verify's scrutiny — the UNSATISFIED-by-source-inspection path must survive (AC2).
**Why:** The agent-def currently both forbids and orders reading the build report. Spec 2's deterministic veto requires a clean, single-meaning "never read the build report" obligation.

### packages/cli/templates/.codex/agents/ana-verify.md (modify)
**What changes:** Same two deletions, byte-consistent with the `.claude` master's intent. The codex copy has its own wording — find the equivalent clauses by content, not by line number.
**Why:** Both harnesses must change in lockstep (Edge Case 6). Never land a claude-only fix.

### .claude/agents/ana-verify.md (modify — dogfood)
**What changes:** Sync from the `.claude` template master after editing it (manual copy — byte-identical).
**Pattern to follow:** Edit master → `pnpm build` (regenerates dist) → copy master over dogfood. Enforced by `tests/templates/agent-proof-context.test.ts:67-74`.

### .codex/agents/ana-verify.md (modify — dogfood)
**What changes:** Sync from the `.codex` template master.
**Why:** Enforced by `tests/templates/codex-learn-template.test.ts:59-72` (iterates every codex agent byte-for-byte — already covers ana-verify; **no new guard needed**).

### packages/cli/src/utils/verdict.ts (create)
**What changes:** New leaf util — the single home for the verdict. Exports:
- `RESULT_HEADLINE_PATTERN` — the one `/\*\*Result:\*\*\s*(PASS|FAIL)/i` constant (the others import this; kills regex drift).
- `deriveVerdict(content: string): VerdictResult` — scrape headline, then cross-check against the compliance table and findings, coerce contradicted PASS → FAIL, populate `contradictions`.
**Pattern to follow:** mirror the cleanest existing parser `getVerifyResult` (`work-state.ts:141`) for the headline scrape; reuse `parseComplianceTable` (`proofSummary.ts:144`) for the cross-check. Both are in `utils/` so `verdict.ts` stays a leaf. No findings parser is needed — see the Approach for why findings are deliberately excluded.
**Cross-check logic:** if `headline === 'PASS'` and any compliance-table row status is `UNSATISFIED` → `result = 'FAIL'` and push one reason per offending row. Otherwise `result = headline`.
**Doc:** the JSDoc must state the honesty boundary verbatim (not one-word-forgeable; still self-authored; NOT "can't lie").
**Why:** One function, one responsibility — removes six duplicated scrapes.

### packages/cli/src/utils/proofSummary.ts (modify)
**What changes:** (1) `export` `parseComplianceTable` (`:144`) so `verdict.ts` can reuse it. (2) Replace the private `parseResult` (`:189`) call sites in `buildProofSummary` with `deriveVerdict`; set `summary.result` to `deriveVerdict(content).result` and carry `contradictions` onto the proof summary (additive field — see below). (3) Delete the now-dead `parseResult`.
**Why:** The proof summary is where `result` enters the proof chain — it must use the coercing verdict, and the contradiction reasons must reach the rendered proof (decision #1: surface durably in the proof entry).

### packages/cli/src/types/proof.ts (modify)
**What changes:** Add an additive optional field to the proof-summary/proof-chain entry type to carry contradiction reasons (e.g. `verdict_contradictions?: string[]`), so a coerced FAIL renders its reason on the proof card. Follow the existing `| null` vs `?:` convention in this file.
**Why:** Decision #1 — the coercion must be observable in the proof, not silent.

### packages/cli/src/commands/work-state.ts (modify)
**What changes:** `getVerifyResult` becomes a thin wrapper: `return mapToLegacy(deriveVerdict(content).result)` where UNKNOWN → `'unknown'` (preserve its existing lowercase-`unknown` contract). Import from `../utils/verdict.js`.
**Why:** Single verdict source; preserves the public signature its callers rely on.

### packages/cli/src/commands/artifact.ts (modify)
**What changes:** `readLocalVerifyResult` (`:580`) reads the file then returns `deriveVerdict(content).result` (UNKNOWN → `'unknown'`).
**Why:** Route through the one function.

### packages/cli/src/commands/pr.ts (modify)
**What changes:** `extractVerifyResult` (`:42`) returns `deriveVerdict(content).result`, mapping UNKNOWN → `null` (preserve its `string | null` contract).
**Why:** Route through the one function.

### packages/cli/src/commands/work.ts (modify)
**What changes:** Replace the three FAIL-only inline `RESULT_HEADLINE_PATTERN.test(content)` forms (`:1341`, `:1527`, `:1534`) with `deriveVerdict(content).result === 'FAIL'`. A contradicted PASS now correctly routes to the Fix/re-verify branch. **Before replacing each, confirm at build time it is a FAIL-check** (`/…FAIL/.test(content)` → "is this a failure?"), not a verdict-*presence* check — the swap to `=== 'FAIL'` is only equivalent for the former. The per-phase guard (`:1042`, `guardFailResult(getVerifyResult(content), ...)`) already routes through the wrapper — confirm it passes `contradictions` to the message (see work-proof change).
**Why:** Consistency — a contradicted PASS must behave like a FAIL everywhere, including worktree routing.

### packages/cli/src/commands/work-proof.ts (modify)
**What changes:** `guardFailResult` (`:193`) gains an optional `contradictions?: string[]` param; when present and non-empty, the message lists them (see Output Mockups) instead of the generic "report says FAIL" line. Update the two call sites (`:290` in `writeProofChain`, and the phase guard path) to pass `proof.verdict_contradictions`.
**Why:** Decision #1 — the contradiction reason must appear in the guard message, not just "FAIL".

### packages/cli/src/commands/artifact-validators.ts (modify)
**What changes:** `validateVerifyReportFormat` (`:118`) stays a **presence** validator — do NOT fold it into `deriveVerdict` (distinct intent: it guards that the line *exists* in the first 10 lines at save time). Reconcile only by importing `RESULT_HEADLINE_PATTERN` from `verdict.ts` instead of redeclaring the regex (`:124`).
**Why:** Edge Case 5 — conflating presence-validation with parsing would break the save-time guard. Share the constant; keep the intent separate.

## Acceptance Criteria

- [ ] **AC1:** `ana-verify.md` (both masters + both dogfood copies) no longer contains the "check the build report for coverage claims" license; the prohibition (`:30`/`:503`) remains. `agent-proof-context.test.ts` and `codex-learn-template.test.ts` pass (all copies byte-consistent per harness).
- [ ] **AC2:** Verify's independence and scrutiny are unweakened — the source-inspection fallback for untested assertions survives in both agent-defs ("source inspection" still present).
- [ ] **AC3:** Exactly one function (`deriveVerdict`) parses the `**Result:**` headline; `getVerifyResult`, `readLocalVerifyResult`, `pr.ts`'s `extractVerifyResult`, and the three `work.ts` inline forms all route through it. `validateVerifyReportFormat` shares `RESULT_HEADLINE_PATTERN` but keeps its presence-only intent. `parseResult` is deleted.
- [ ] **AC4:** `deriveVerdict` coerces a PASS headline to `result: 'FAIL'` with a non-empty `contradictions` when, and only when, the compliance table has an UNSATISFIED row. A clean PASS stays PASS. (Findings are deliberately NOT a coercion signal — content-only function; risk findings don't block PASS per ana-verify.md:412.)
- [ ] **AC5:** The contradiction is surfaced, not silent — the reason string appears in the `guardFailResult` message AND on the proof entry (`verdict_contradictions`).
- [ ] **AC6:** The honesty framing ("not one-word-forgeable, still self-authored"; no "can't lie") is present in `deriveVerdict`'s JSDoc.
- [ ] **AC7:** `pnpm build` regenerates a consistent `dist/` (not committed); `(cd packages/cli && pnpm vitest run)` passes with no regressions; lint clean.

## Testing Strategy

- **Unit tests (`tests/utils/verdict.test.ts`, new):** `deriveVerdict` table — clean PASS → PASS; PASS + UNSATISFIED row → FAIL + reason `…row {id}`; FAIL headline → FAIL; missing headline → UNKNOWN; reason string matches the exact format. Follow the table-driven style in `tests/utils/proof-parsers.test.ts`.
- **Routing tests:** `getVerifyResult` / `readLocalVerifyResult` / `extractVerifyResult` each return the *coerced* result on a contradicted-PASS fixture (one fixture, three callers).
- **Guard message test (`tests/commands/work-proof` or existing):** `guardFailResult(result, ctx, contradictions)` prints each contradiction reason.
- **Template tests:** the two existing sync tests must pass; add an assertion that neither master contains "check the build report".
- **Edge cases:** empty content → UNKNOWN; PASS with multiple UNSATISFIED rows → one contradiction reason per row; a report with no `## Contract Compliance` table (old format) → headline trusted (no table = no contradiction signal).

## Dependencies

- `verifier-intent-coverage` should merge first (shared `ana-verify.md` / `proofSummary.ts`). If it hasn't, re-derive line numbers and reconcile.

## Constraints

- Both harnesses change in lockstep. Backward-compat: a verify report with no compliance table must still yield its headline verdict (no false contradiction).
- `deriveVerdict` takes a content string only (no companion-file reads) so all six call sites — including the file-only ones — can use it uniformly.

## Gotchas

- `proofSummary.ts` line numbers WILL have moved. Re-derive `:144`/`:189`/`:1026`.
- `validateVerifyReportFormat` is a presence validator, not a parser — do not fold it in (Edge Case 5).
- `dist/templates/**` is gitignored — rebuild for runtime, never commit or hand-edit.
- The codex master uses different prose than claude — locate the license clauses by content, not line number.
- `getVerifyResult` returns lowercase `'unknown'`; `parseResult` returned uppercase `'UNKNOWN'`; `extractVerifyResult` returns `null`. Preserve each public contract when wrapping `deriveVerdict`.

## Build Brief

### Rules That Apply
- All local imports end in `.js`; use `import type` for type-only imports (coding-standards).
- Named exports only; explicit return types on exported functions; `@param`/`@returns` JSDoc on exported functions (pre-commit enforces).
- `utils/` is a leaf layer — `verdict.ts` may import other utils (`proofSummary.ts`) but never from `commands/`. `work-state.ts` documents this invariant at its top ("Leaf module — imports only from utils").
- Prefer early returns; `| null` for checked-empty, `?:` for maybe-unchecked (proof.ts convention).
- No `dist/` edits — it's generated by `pnpm build` (`tsup && cp -r templates dist/`).

### Pattern Extracts

The cleanest existing scrape (the shape to centralize) — `work-state.ts:141-145`:
```ts
export function getVerifyResult(content: string): 'PASS' | 'FAIL' | 'unknown' {
  const match = content.match(/\*\*Result:\*\*\s*(PASS|FAIL)/i);
  if (!match || !match[1]) return 'unknown';
  return match[1].toUpperCase() as 'PASS' | 'FAIL';
}
```

The headline-independent contradiction signal already parsed — `proofSummary.ts:159-177` (inside `parseComplianceTable`):
```ts
    const cells = line.split('|').map(c => c.trim()).filter(c => c);
    if (cells.length >= 3) {
      const id = cells[0] ?? '';
      const says = cells[1] ?? '';
      const statusCell = cells[2] ?? '';
      const statusMatch = statusCell.match(/(SATISFIED|UNSATISFIED|DEVIATED|UNCOVERED)/i);
      const status = statusMatch && statusMatch[1] ? statusMatch[1].toUpperCase() : 'UNKNOWN';
      const evidence = cells[3] || '';
      results.push({ id, says, status, evidence });
    }
```

The guard to extend — `work-proof.ts:193-201`:
```ts
export function guardFailResult(result: string, context?: string): void {
  if (result === 'FAIL') {
    const prefix = context ? `${context}: ` : '';
    console.error(chalk.red(`Error: ${prefix}Cannot complete work with a FAIL verification result.`));
    console.error(chalk.gray('The verify report says FAIL. Fix the issues and re-verify before completing.'));
    console.error(chalk.gray(`Run: ${agentCommand('build')} to fix, then ${agentCommand('verify')}`));
    process.exit(1);
  }
}
```

### Proof Context
Run `ana proof context <each file>` at build time. No active proof findings were loaded into this spec — surface any that exist for `proofSummary.ts`, `work-proof.ts`, `ana-verify.md`.

### Checkpoint Commands
- After editing `ana-verify.md` (both masters + dogfood) and `pnpm build`: `(cd packages/cli && pnpm vitest run tests/templates)` — Expected: sync + "no build-report license" tests pass.
- After `verdict.ts` + call-site rewrites: `(cd packages/cli && pnpm vitest run tests/utils/verdict.test.ts)` — Expected: verdict table green.
- After all changes: `pnpm run test -- --run` — Expected: full suite green, no regressions.
- Lint: `pnpm run lint`.

### Build Baseline
Run `pnpm run test -- --run` and record exact counts before starting.
- Current tests: {fill from terminal}
- Current test files: {fill from terminal}
- Command used: `pnpm run test -- --run`
- After build: expected current + new `verdict.test.ts` cases (and the added template assertion).
- Regression focus: `proofSummary.ts` consumers, `work.ts` completion flow, `pr.ts`, `artifact.ts` — every former scrape site.
