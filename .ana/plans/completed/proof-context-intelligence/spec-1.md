# Spec: Proof-Context "why" — `shaped_by` + `ana proof <slug> --why` + adoption

**Created by:** AnaPlan
**Date:** 2026-06-18
**Scope:** .ana/plans/active/proof-context-intelligence/scope.md

## Approach

Enrich the existing read-only `ana proof context` surface in place — do not add a feature module. Two code changes plus template guidance:

1. **`shaped_by`** — `getProofContext` already iterates every proof entry per queried file to compute `touch_count`/`last_touched` (`proofSummary.ts:1283`). Widen its minimal projection (`ProofChainEntryForContext`, `:1177`) to read `slug`, `kind`, `scope_summary`, and collect a ranked `shaped_by` list in that same loop. Near-free: the loop already runs and already reads `completed_at`/`feature`.
2. **`ana proof <slug> --why`** — add a signal-only render branch. `formatHumanReadable` (`proof.ts:281`) renders the full card (hashes, provenance, cost, timing, attestation). `--why` renders only `scope_summary`, exceptional assertions (failed/deviated with reasons), open findings, and `modules_touched`. This is the pull-depth valve so the new `shaped_by` footer can point somewhere cheap instead of dumping the ~1,125-token full card.

**Ship order is non-negotiable (scope gotcha):** the `shaped_by` footer's `--why` hint and the `--why` render mode land in the **same** phase. A drill-down hint without `--why` is a bloat trap.

3. **Adoption** — fix `ana.md`, `ana-plan.md`, `ana-verify.md` (and `.codex` mirrors) so the command is run at the right moment with the right framing. Co-change-specific template guidance (Build Brief co-change, Verify co-change consumption) is **deferred to Phase 3** — those reference output this phase doesn't produce yet. This phase covers: the adoption/sequencing framing (AC11), and the shaped-by-as-orientation framing + dropping the "context, not a checklist" hedge in Verify (AC12, the part that doesn't need co-change).

**Ranking decision (resolves scope open question):** `shaped_by` is ordered **most-recent-first by `completed_at`**, descending. Recency answers "why is it like this *now*." `kind` is surfaced on each row (not used to reorder) so the reader weights feature/milestone over chore themselves. No churn weighting in v1 — recency is the honest primary signal and avoids a synthetic composite.

**Drill-down framing decision (resolves scope open question):** the footer gently *gates* drilling rather than inviting it — it names `--why` as the path to "the reasoning behind a specific item," not "see all N." Wording in Output Mockups below.

## Output Mockups

`ana proof context packages/cli/src/commands/work.ts` (hot file, 69 shapers):

```
Proof context for packages/cli/src/commands/work.ts
Touched in 69 pipeline cycles (last: Jun 17, 2026)

Shaped by:
  ✓ work-complete-merge (feature · Jun 17, 2026)
      Add --merge flag to ana work complete so a clean ready-to-merge item
      merges to the artifact branch and completes in one step…
  ✓ pipeline-stage-guards (fix · Jun 15, 2026)
      Guard ana work start/complete against wrong-branch and out-of-order
      stage transitions; exit non-zero with a recovery hint…
  ✓ work-status-rollup (feature · Jun 12, 2026)
      Render per-phase artifact presence in ana work status as a rollup…
  66 more — drill a specific one with `ana proof <slug> --why`

Findings:
  [code] (F-0421) work.ts:1192 — completeWork rescan persists no code-graph…
         From: proof-context-intelligence

No build concerns for this file.
```

When ≤3 shapers exist, the footer line is omitted. When no proof chain exists, the whole **Shaped by** section is absent (not "0 shapers").

`ana proof work-complete-merge --why` (signal only):

```
work-complete-merge — why

Scope:
  Add a --merge path to ana work complete so a clean ready-to-merge item
  merges to the artifact branch and completes atomically, removing the
  two-step merge-then-complete dance.

Assertions needing attention:
  ✓ all 14 satisfied

Open findings:
  (none)

Modules touched (6):
  packages/cli/src/commands/work.ts
  packages/cli/tests/commands/work.test.ts
  …
```

`--why` **omits**: the rounded header cost subtitle, the Contract proportion bar, Timing rows, Provenance stat grid, and all six sha256 hashes / attestation rows. If an assertion failed or deviated, it lists each with its deviation reason (reuse the existing exceptional-assertion loop at `proof.ts:382-388`).

## File Changes

### packages/cli/src/utils/proofSummary.ts (modify)
**What changes:** Add an optional `shaped_by` field to `ProofContextResult` (`:1147`). Widen `ProofChainEntryForContext` (`:1177`) to carry `slug?`, `kind?`, `scope_summary?`. In the `getProofContext` loop (`:1283`), when an entry touches the queried file (`entryTouches` is already tracked), push a shaped-by row `{ slug, kind, completed_at, scope_summary }`. After the loop, sort most-recent-first by `completed_at` desc and assign to `shaped_by`. Carry the full ranked list plus the array length is the source for the footer count — render decides the display cap.
**Pattern to follow:** the existing optional-field, grouped-object discipline already in this file; the `matched.x !== undefined` guarded-assignment style at `:1303-1307`.
**Why:** without this the command can't answer "why is this file the way it is" — the uncopyable core of the scope.

### packages/cli/src/commands/proof.ts (modify)
**What changes:** (a) In `formatContextResult` (`:3158`) render a **Shaped by** section after the header and before **Findings**, capped at top 3, with the gating footer when more exist. Truncate each `scope_summary` with the existing `truncateSummary` helper (already imported, `:40`). (b) Add a `--why` boolean to the `ana proof <slug>` command definition and thread it through the detail-view handler (`:1079-1117`) into a new render path. (c) Add the signal-only renderer — either a `formatWhy(entry)` function or a `{ why?: boolean }` parameter on `formatHumanReadable`; prefer a separate `formatWhy` so the full renderer stays untouched and the omission set is explicit by construction (it renders nothing it shouldn't, rather than stripping).
**Pattern to follow:** footer house style is `${list.length - MAX}  more — see …` (`proof.ts:265`, `:434`, `:656`); adapt the pointer to `` `ana proof <slug> --why` ``. The exceptional-assertion loop (`:382-388`) lifts directly into `formatWhy`.
**Why:** `formatContextResult` emits no slugs and no drill hint today — the cascade surface is introduced here, so `--why` must ship with it or the hint is a bloat trap.

### packages/cli/templates/.claude/agents/ana.md (modify)
**What changes:** At the scope process (~`:108`, step 3 "Check proof chain"), make `ana proof context {files}` a **non-optional** step for any scope touching existing code, sequenced so file identification precedes (or explicitly seeds) the query. Frame `shaped_by` as "why this file is the way it is" orientation.
**Pattern to follow:** the existing numbered process-step prose.
**Why:** AC11 — adding sections without fixing adoption makes the command heavier *and* still under-run.

### packages/cli/templates/.claude/agents/ana-verify.md (modify)
**What changes:** At the proof-context paragraph (~`:105`), drop the "they're context, not a checklist" hedge, and add that the shaped-by history is **orientation only** — Verify forms findings independently (protects the two-account independence model). Co-change consumption is added in Phase 3.
**Why:** AC12 (the part not dependent on co-change).

### packages/cli/templates/.claude/agents/ana-plan.md (modify)
**What changes:** At the "Proof Context" Build-Brief section (~`:438`), note that `shaped_by` orients the architect on intent history. The co-change-partners-in-Build-Brief instruction (AC13) is added in Phase 3.
**Why:** keeps Plan's framing current with the new section; AC13 proper lands with co-change.

### packages/cli/templates/.codex/agents/ana.md, ana-verify.md, ana-plan.md (modify)
**What changes:** Mirror the three `.claude` edits above. The `.codex` mirrors must move in lockstep (scope gotcha) — never ship a one-platform template change.
**Why:** AC14 — the change works for both platforms.

## Acceptance Criteria
- [ ] AC1: `ana proof context {file}` output includes a **Shaped by** section listing verified work items (`slug`, `kind`, `completed_at`, truncated `scope_summary`), capped at top 3, with a "N more — drill with `ana proof <slug> --why`" footer when more exist.
- [ ] AC6: `ana proof <slug> --why` renders signal only — `scope_summary`, failed/deviated assertions with reasons, open findings, `modules_touched` — and omits cost, token counts, hashes, timing, provenance, attestation.
- [ ] AC9: `scope_summary` in **Shaped by** is truncated to a hard char cap via `truncateSummary`; never reworded or embellished — raw text.
- [ ] AC11: `ana.md` runs `ana proof context` on seed files as a non-optional step for scopes touching existing code, sequenced after file identification, framing intent history as orientation.
- [ ] AC12 (partial): `ana-verify.md` drops the "context, not a checklist" hedge and states shaped-by history is orientation only; Verify forms findings independently. (Co-change consumption → Phase 3.)
- [ ] AC14 (partial): `.codex` mirrors carry the equivalent of this phase's template edits.
- [ ] `shaped_by` is an **optional** field on `ProofContextResult`; the JSON shape for old callers is unaffected (contributes to AC8).
- [ ] With no proof chain, **Shaped by** is absent and `getProofContext` returns cleanly (contributes to AC7).
- [ ] Tests pass with `pnpm run test -- --run`; no build errors; lint clean.

## Testing Strategy
- **Unit (`getProofContext`):** entry touching a file produces a `shaped_by` row with `slug`/`kind`/`completed_at`/`scope_summary`; rows ordered most-recent-first; no proof chain → `shaped_by` undefined/absent and no crash; legacy entry lacking `scope_summary` still produces a row (summary empty, not crash).
- **Unit (render):** `formatContextResult` shows ≤3 shapers; footer appears only when >3 and names `--why`; footer absent at exactly 3; `scope_summary` truncated at the cap.
- **Unit (`--why`):** rendered output **contains** scope text and modules; **does not contain** any sha256 (assert no 64-hex-char run), the word "Provenance"/cost `$`, or timing rows. Deviated assertion renders its reason.
- **Edge cases:** file with shapers but zero findings (Shaped by renders, Findings absent); exactly 3 shapers (no footer); `--why` on a slug with a deviated assertion.
- Follow the existing `proof` command test structure in `packages/cli/tests/commands/`.

## Dependencies
None. This phase reads only the proof chain, which exists on `main`. Ships independently end-to-end.

## Constraints
- Engine/command boundary: `getProofContext` logic stays free of chalk (it's in `utils/`, returns data); all rendering/color in `proof.ts`.
- New result field is optional (`shaped_by?:`) — old callers and the JSON shape unaffected (AC8).
- Default output must stay a first-screen: top-3 cap is mandatory, not advisory.

## Gotchas
- **Cascade trap:** do not add the `shaped_by` footer's `--why` hint before `--why` renders. They ship together here.
- **`kind` is top-level optional** on `ProofChainEntry` (`types/proof.ts:335`), values `'feature'|'fix'|'chore'|'milestone'|''`. Read `entry.kind`, default to no badge when absent.
- **Truncation must not embellish:** hard char cap on raw `scope_summary`. No rewording, no "…" mid-word cleverness beyond what `truncateSummary` already does.
- **`--why` is an omission renderer, not a stripper:** build it to render only the allowed fields, so a future field added to the full card can't leak into `--why` by default.
- **11/208 chain entries lack `modules_touched`** and a handful predate fields — guard with `?? []`/optional reads, never assume presence.

## Build Brief

### Rules That Apply
- All relative imports end in `.js`; `import type` for type-only imports, separate from value imports (ESM runtime requirement — compiles without but crashes).
- Explicit return types on exported functions; `@param`/`@returns` JSDoc on exported functions (pre-commit lint rejects missing tags).
- `?:` (optional) for fields that may not have been checked; the new `shaped_by?` is genuinely optional (absent when no chain) — correct use.
- Command-layer errors: `chalk.red` + `process.exit(1)`. `utils/proofSummary.ts` returns data, never prints.
- Prefer early returns; no default exports.

### Pattern Extracts

Guarded optional-field assignment in the `getProofContext` loop (`proofSummary.ts:1303-1307`) — follow this style for the shaped-by row:
```ts
if (finding.line !== undefined) matched.line = finding.line;
if (finding.severity !== undefined) matched.severity = finding.severity;
if (finding.suggested_action !== undefined) matched.suggested_action = finding.suggested_action;
if (finding.related_assertions !== undefined) matched.related_assertions = finding.related_assertions;
if (finding.resolves !== undefined) matched.resolves = finding.resolves;
```

Footer house style to adapt (`proof.ts:265`):
```ts
    lines.push(`  ${sorted.length - MAX_DISPLAY} more — see \`ana proof ${slug} --json\``);
```

Exceptional-assertion loop to lift into `formatWhy` (`proof.ts:382-388`):
```ts
  for (const a of entry.assertions) {
    if (a.status === 'SATISFIED') continue;
    lines.push(`  ${statusGlyph(a.status)} ${a.id}  ${a.says}`);
    if (a.status === 'DEVIATED' && a.deviation) {
      lines.push(`        → ${a.deviation}`);
    }
  }
```

### Proof Context
Run `ana proof context packages/cli/src/utils/proofSummary.ts packages/cli/src/commands/proof.ts` and curate findings before building. (Plan note: at spec time the live chain shows `proof.ts` and `proofSummary.ts` among the most-touched files — expect active findings; prioritize any whose `related_assertions` overlap this contract's render assertions.) If no active findings exist for these files, state so.

### Checkpoint Commands
- After `proofSummary.ts` change: `(cd 'packages/cli' && pnpm vitest run)` scoped to proof-summary tests — Expected: shaped-by unit tests pass.
- After all changes: `pnpm run test -- --run` — Expected: 3893 + new tests pass, 0 regressions.
- Lint: `pnpm run lint`.

### Build Baseline
- Current tests: **3893** test cases
- Current test files: **171**
- Command used: `pnpm run test -- --run`
- After build: expected 3893 + new shaped-by/`--why` cases in 171 + (0–1 new) files
- Regression focus: `packages/cli/tests/commands/proof*.test.ts`, any test asserting current `formatContextResult` output (the header/Findings layout shifts when **Shaped by** is inserted).
