# Verify Report: Surface the proof after `work complete` + `ana proof --last`

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-09
**Spec:** .ana/plans/active/proof-last-and-completion-hint/spec.md
**Branch:** feature/proof-last-and-completion-hint

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../proof-last-and-completion-hint/contract.yaml
  Seal: INTACT (hash sha256:2add731fd017535176563c7c511aba952f292365f3847aeba9257fc08eab7b91)
```

Seal status: **INTACT** — contract unmodified since AnaPlan sealed it.

**Build/Test/Lint (independent re-run):**
- Build: `(cd packages/cli && pnpm run build)` — success (40ms, dist/index.js emitted).
- Tests: **3642 passed, 0 failed, 2 skipped** via sealed verify runner.
  `<!-- ana:capture stage=verify slug=proof-last-and-completion-hint counts=3642p/0f/2s verdict=pass sha256=2abd0c626f852993096cd23421526aec377a96f8f14185e6f8914ff650187c4b -->`
- Lint: 0 errors, 1 warning. The single warning is in `packages/cli/src/utils/git-operations.ts:198` (unused eslint-disable) — a file this build does **not** touch. Pre-existing, not a regression.

## Contract Compliance
| ID   | Says                                                          | Status       | Evidence |
|------|--------------------------------------------------------------|--------------|----------|
| A001 | Completing work points you to the proof command              | ✅ SATISFIED | `work.test.ts:1402` asserts human output contains `View the full proof: ana proof test-slug`; impl `work.ts:1254` (gray, human branch). Live: hint prints. |
| A002 | Completion JSON gives the next command                       | ✅ SATISFIED | `work.test.ts:1411` asserts `parsed.results.next_command === 'ana proof test-slug'`; impl `work.ts:1212`. |
| A003 | Already-completed item still points to its proof             | ✅ SATISFIED | `work-merge.test.ts:835` recovery scenario asserts human output contains hint; impl `work.ts:939`. |
| A004 | Already-completed item returns next command in JSON          | ✅ SATISFIED | `work-merge.test.ts:846` asserts `json.results.next_command === 'ana proof recovery-slug'`; impl `work.ts:931`. |
| A005 | Latest proof shows the most recently completed one           | ✅ SATISFIED | `proof.test.ts:638` asserts stdout contains `recent-slug`, the recent feature, and NOT older feature. Live: `--last` picked `gitignore-merge-on-reinit` (top `completed_at` of 198 entries). See Finding (upstream). |
| A006 | Latest proof JSON labelled with real slug                    | ✅ SATISFIED | `proof.test.ts:653` asserts `lastJson.command === 'proof recent-slug'`; impl `proof.ts:857` uses `entry.slug`. Live confirmed. |
| A007 | `--last --json` shape-identical to `<slug> --json`           | ✅ SATISFIED | `proof.test.ts:660-664` deep-equals `results` and `command` vs by-name. Live `diff` of both JSON outputs: IDENTICAL byte-shape. |
| A008 | `--latest` works the same as `--last`                        | ✅ SATISFIED | `proof.test.ts:671` asserts `--latest` shows recent entry; commander `.option('--latest, --last', …)` keys to `options.last`. Live: `--latest --json` returned correct slug. |
| A009 | Slug + latest is rejected, not guessed                       | ✅ SATISFIED | `proof.test.ts:686` asserts stderr contains `Pick one selector`; impl `proof.ts:822` guard. Live: prints error. |
| A010 | Slug + latest exits non-zero                                 | ✅ SATISFIED | `proof.test.ts:685` asserts exitCode 1; impl `process.exit(1)`. Live: `exit=1`. |
| A011 | Latest on empty chain → friendly message                    | ✅ SATISFIED | `proof.test.ts:697` asserts stdout `No proofs yet.`; impl `proof.ts:850` graceful read + empty branch. Corrupt-chain test at `:707` also green. |
| A012 | Latest on empty chain exits zero                             | ✅ SATISFIED | `proof.test.ts:696` asserts exitCode 0 (early `return`, no exit code). |
| A013 | Equal-instant tie-break selects most recently added         | ✅ SATISFIED | `proof.test.ts:732` pushes `[tie-old, newer-slug]`, asserts stdout contains `newer-slug` and NOT `tie-old`; impl secondary key `b.idx - a.idx` (proof.ts:768). |

All 13 assertions SATISFIED. Every assertion carries an `@ana` tag on a test that mechanically matches the contract's matcher/value — and most assert *stronger* than the contract (e.g. A002/A004 use `.toBe(...)` where the contract only requires `contains`).

## Independent Findings

**Predictions resolved (Step 3):**
1. *Tie-break inverted* — **Not found.** The secondary key `b.idx - a.idx` (descending append index) is correct; both the equal-`completed_at` and both-missing cases fall through to it. A013 asserts the specific `newer-slug` wins. Logic traced by hand and confirmed by live test.
2. *Commander exposes `options.latest`* — **Not found.** `.option('--latest, --last', …)` orders the canonical (last) long flag as `--last` → `options.last`. The guard and resolution both read `options.last`; A008 alias test green; live `--latest` works.
3. *Empty-branch JSON duplication* — **Confirmed (minor).** The `--last` empty branch reintroduces `wrapJsonResponse('proof', { entries }, chain)`, a third copy of the payload flagged by `audit-matrix-orientation-C5`. Spec-prescribed, low risk. Recorded as a code finding.
4. *Tie-break test too generic* — **Not found (surprised positive).** The test asserts the exact last-pushed slug AND that the tied loser is absent — precisely the trap the gotcha warned about.
5. *Docs too thin* — **Not found.** The single `<p>` documents both `--last` and `--latest` and the new hint, with `&lt;slug&gt;` correctly escaped; lint-clean.

**Production-risk prediction:** corrupt/missing `proof_chain.json` + `--last` must not hit the detail-view hard exit. **Verified safe** — impl uses the graceful read (try/catch → `{ entries: [] }`); `proof.test.ts:707` corrupt-chain test green.

**Over-building / YAGNI:** None. `sortEntriesByRecency` is used in exactly two sites (`formatListTable`, `--last`) and is **not exported** — appropriate restraint given proof.ts's documented over-export history. `next_command` appears at exactly the two JSON insertion points. No unused params, no dead branches.

**Regression safety:** Test diff is purely additive — zero deletions or weakened assertions. The intentional equal-timestamp table reorder (gotcha) broke no existing test; full suite green at 3642/0.

**Code quality:** Implementation mirrors the spec's pattern extracts precisely. Guard clauses are early-return; JSDoc present on the new helper; `chalk.red` + `process.exit(1)` for the user error; the hint is a literal `ana proof <slug>` (not routed through `agentCommand()`), matching the existing `ana proof audit` style. Human hint correctly gated to the non-JSON branch (proven by passing JSON-parse tests A002/A004).

## AC Walkthrough

- **AC1** ✅ PASS — Hint prints in both paths. Normal: `work.ts:1254`, test `work.test.ts:1402`. Recovery: `work.ts:939`, test `work-merge.test.ts:835`. Live: prints on real chain.
- **AC2** ✅ PASS — `next_command` in both JSON results objects (`work.ts:1212`, `:931`); tests `work.test.ts:1411`, `work-merge.test.ts:846`.
- **AC3** ✅ PASS — `--last` renders detail card for most-recent `completed_at`. Live: selected the entry with the top timestamp from 198 real entries.
- **AC4** ✅ PASS — `--last --json` byte-shape-identical to `<slug> --json` (live `diff`: IDENTICAL); uses `wrapJsonResponse(\`proof ${entry.slug}\`, …)`.
- **AC5** ✅ PASS — `--latest` alias reaches the same path (commander key `options.last`); test `:671`, live confirmed.
- **AC6** ✅ PASS — `proof <slug> --last` → `Error: Cannot combine a slug with --last. Pick one selector.`, exit 1. Live confirmed.
- **AC7** ✅ PASS — empty/missing/corrupt chain → `No proofs yet.`, exit 0, no crash. Tests `:697`, `:707`.
- **AC8** ✅ PASS — explicit tie-break test asserts the last-pushed `newer-slug` wins (`:732`).
- **AC9** ✅ PASS — full CLI suite green after build: 3642 passed, 0 failed, 2 skipped.
- **AC10** ✅ PASS — build clean; lint 0 errors (1 pre-existing warning in an untouched file).

## Blockers

None. Searched specifically for: contract assertions without real tests (all 13 have `@ana`-tagged tests asserting matcher/value or stronger); sentinel/tautological assertions (none — every test asserts concrete values and most also assert the negative, e.g. older entry absent); error paths that swallow silently (the corrupt-chain catch is intentional graceful degradation, covered by a test); unhandled external state (graceful read handles missing/corrupt chain; verified live); the four-insertion-point trap for Part A (all four present, both human and both JSON, JSON-gating proven); the tie-break direction trap (correct). Nothing qualifies as a blocker.

## Findings

- **Code — Empty-chain JSON payload now triplicated:** `packages/cli/src/commands/proof.ts:838` — the `--last` empty branch adds a third `wrapJsonResponse('proof', { entries }, chain)`, alongside the two copies already flagged by `audit-matrix-orientation-C5`. Spec-prescribed and low risk (the branch only fires on an empty chain), but it extends a known duplication rather than consolidating it. A small `emptyProofJson(chain)` helper would collapse all three. (severity: debt, monitor)
- **Test — `--last --json` on an empty chain is uncovered:** `packages/cli/tests/commands/proof.test.ts:690` — A011/A012 exercise only the human `No proofs yet.` path and exit code; the JSON empty branch (the duplicated payload above) has no test. If that payload shape ever drifts, nothing catches it. Low risk; worth a one-line addition next time this file is touched. (severity: debt, monitor)
- **Upstream — A005 stdout match leans on fixture naming:** The detail card does not print the bare slug as its own field, so A005's `stdout contains "recent-slug"` is satisfied because the test fixture embeds the slug inside the `feature` string. Mechanically correct and the test additionally asserts correct selection (recent feature present, older absent), so the assertion is sound — but the contract's literal value couples to how the fixture is named rather than to a real printed field. Note for whoever reseals this contract. (severity: observation, monitor)
- **Code — Good restraint, recorded for the chain:** `packages/cli/src/commands/proof.ts:742` — `sortEntriesByRecency` is kept module-private (not exported), which is the right call given proof.ts's documented history of growing its public surface (`learn-session-memory-C1`, and the multi-phase-Gantt note that `formatHumanReadable` was made public). One definition of recency, consumed by two in-module call sites. (severity: observation, acknowledge)

## Deployer Handoff

- This is two additive, backward-compatible changes: a `View the full proof:` hint on `work complete` (both completion paths, human + JSON), and a new `ana proof --last` / `--latest` selector that routes through the existing detail render.
- **One intentional behavior change:** the shared recency comparator now reorders equal-`completed_at` rows in the `ana proof` list table to last-appended-first (previously preserved oldest-first). This is by design (more correct) and broke no existing test.
- `--last --json` deliberately reuses the real-slug envelope (`proof <slug>`) so agents fetching "the proof I just completed" get a shape identical to naming the slug — verified byte-identical live.
- The branch is 2 commits behind `main`; a merge/rebase before merging is advisable but there are no conflicts in the touched files' neighborhood worth flagging.
- The lint warning in `git-operations.ts` is pre-existing and unrelated to this work.

## Verdict
**Shippable:** YES

All 13 contract assertions SATISFIED with strong, contract-aligned tests; all 10 acceptance criteria PASS; full suite 3642/0; build and lint clean; live invocation of every new code path (selection, alias, mutual exclusion, empty/corrupt chain, JSON parity) behaves exactly as specified. The four findings are forward-looking quality notes, none blocking. I would stake my name on this shipping.
