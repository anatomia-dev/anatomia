# Verify Report: The requirements contract — validated upstream intake

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-07-02
**Spec:** .ana/plans/active/requirements-contract/spec.md
**Branch:** feature/requirements-contract

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/requirements-contract/contract.yaml
  Seal: INTACT (hash sha256:f6651c2967232570a5441c61c2e51c581c33b302dc4b110111c0ce0bf8353b7a)
```

Seal status: **INTACT** — the contract has not been modified since AnaPlan sealed it.

**Independent test re-run (sealed):**
```
<!-- ana:capture stage=verify slug=requirements-contract counts=4158p/0f/2s verdict=pass sha256=09748fe04fc3b4ba7e3779aecfdeb5f4bbe26631a88038b9da2fdab1fde50157 -->
```

Tests: 4158 passed, 0 failed, 2 skipped. Build: success (`pnpm run build`, dist fresh). Lint: clean (`eslint src/ tests/`, zero warnings).

## Contract Compliance

| ID   | Says                                                              | Status       | Evidence |
|------|-----------------------------------------------------------------|--------------|----------|
| A001 | New scaffold passes validation unmodified                        | ✅ SATISFIED | `req.test.ts:175` `validateReqFormat(scaffold)` → `toBeNull()`; confirmed live: `ana req validate REQ-proof-viewer.md` → ✓ |
| A002 | New req is open, unset, hand-written                              | ✅ SATISFIED | `req.test.ts:177-179` contains `status: open` / `priority: unset` / `source: hand-written`; scaffold `req.ts:38-46` |
| A003 | New req includes the Leads section                               | ✅ SATISFIED | `req.test.ts:181` `toContain('## Leads')`; scaffold `req.ts:57` |
| A004 | New req stamped with created date                                | ✅ SATISFIED | `req.test.ts:183` `toContain('created: 2026-07-01')`; `req.ts:197` `new Date().toISOString().slice(0,10)` |
| A005 | Well-formed requirement accepted                                 | ✅ SATISFIED | `req.test.ts:72` `validateReqFormat(p)` → `toBeNull()` |
| A006 | Unknown frontmatter field rejected                               | ✅ SATISFIED | `req.test.ts:78-80` truthy + contains `severity`; `artifact-validators.ts` KNOWN_REQ_KEYS allowlist |
| A007 | Non-enum priority rejected                                       | ✅ SATISFIED | `req.test.ts:86-88`; confirmed live: `priority: P1` → exit 1 with specific message |
| A008 | req ≠ filename stem rejected                                     | ✅ SATISFIED | `req.test.ts:94-96` truthy + contains `REQ-foo`; validator `fm['req'] !== stem` |
| A009 | Resolution on non-archived rejected                             | ✅ SATISFIED | `req.test.ts:102-104`; validator `else if (hasResolution)` branch |
| A010 | Archived missing resolution rejected                            | ✅ SATISFIED | `req.test.ts:111-113`; validator `if (status==='archived') { if(!hasResolution) ... }` |
| A011 | Missing required section rejected                                | ✅ SATISFIED | `req.test.ts:124-127` truthy + contains `Evidence`; `extractReqSection` returns null → error |
| A012 | Empty appetite (when present) rejected                          | ✅ SATISFIED | `req.test.ts:133-135`; validator `'appetite' in fm` non-empty check |
| A013 | Enums accepted case-insensitively                               | ✅ SATISFIED | `req.test.ts:140-142` `HIGH`/`OPEN` → `toBeNull()`; `canonicalizeEnumValue` lowercases before enum check |
| A014 | Aliased legacy sections validate                                 | ✅ SATISFIED | `req.test.ts:146-157` Disease/Why This Matters/What to Build → `toBeNull()`; REQUIRED_REQ_SECTIONS aliases |
| A015 | list shows id/priority/status/age/title (contains REQ-)          | ✅ SATISFIED | `req.test.ts:213-214` req === `REQ-foo`; confirmed live: table renders all columns |
| A016 | Malformed file flagged, no crash                                | ✅ SATISFIED | `req.test.ts:223-225` `malformed === true`; confirmed live: 2 malformed rows, exit 0 |
| A017 | list --json emits structured array                              | ✅ SATISFIED | `req.test.ts:213`; confirmed live: `req list --json` emits array (see note in Findings re: mapping-path test gap) |
| A018 | Higher priority listed first (critical)                         | ✅ SATISFIED | `req.test.ts:234` `items[0].priority === 'critical'`; confirmed live: critical sorts first |
| A019 | Stale claimed requirement flagged                              | ✅ SATISFIED | `req.test.ts:250` stale true + `:266` negative case false; `buildRequirementList` cross-refs discoverSlugs |
| A020 | Status prints open-requirements ℹ line                         | ✅ SATISFIED | `work.test.ts` `contains('2 open requirements')`; confirmed live: ℹ line present |
| A021 | Status JSON reports requirements.open (=2)                      | ✅ SATISFIED | `work.test.ts` `parsed.requirements.open` → `toBe(2)`; confirmed live: open=3 for 3 open files |
| A022 | No requirements field when folder absent (=false)              | ✅ SATISFIED | `work.test.ts` `'requirements' in parsed` → `toBe(false)`; `reqField = summary ? {...} : {}` spread |
| A023 | work start --req sets status claimed                            | ✅ SATISFIED | `work.test.ts` frontmatter status → `'claimed'` |
| A024 | Claimed req records claimed_by                                  | ✅ SATISFIED | `work.test.ts` `claimed_by` → `'new-slug'` |
| A025 | Claiming non-open req fails clearly                             | ✅ SATISFIED | `work.test.ts` rejects + half-started item absent; `assertRequirementClaimable` before mkdir |
| A026 | Plain start leaves requirements untouched                      | ✅ SATISFIED | `work.test.ts` status stays `'open'` |
| A027 | Complete archives the claimed requirement                      | ✅ SATISFIED | `work.test.ts` archived path exists, root removed |
| A028 | Archived req marked resolution completed                       | ✅ SATISFIED | `work.test.ts` `resolution` → `'completed'` |
| A029 | Archive failure never blocks completion                        | ✅ SATISFIED | `work.test.ts` sabotage (file at archived/ path) → completeWork resolves, completed dir exists |
| A030 | Re-init preserves requirements byte-identically               | ✅ SATISFIED | `template-propagation.test.ts:451` root + archived files byte-equal after `preserveUserState` |
| A031 | Both templates contain the pickup subsection                   | ✅ SATISFIED | `template-propagation.test.ts` both contain `## Picking up a requirement` |
| A032 | Codex body identical to Claude minus frontmatter               | ✅ SATISFIED | `template-propagation.test.ts` `codex === claudeBody.slice(7 lines)`; verified via `diff` (only 7 frontmatter lines differ) |
| A033 | Template frames requirement content as untrusted               | ✅ SATISFIED | `template-propagation.test.ts` pickup section contains `untrusted`; template body confirmed |
| A034 | Requirements not gitignored                                    | ✅ SATISFIED | `req.test.ts:164` `ANA_GITIGNORE_STOCK` not contains `requirements`; source-inspected stock (state/, worktrees/, .captures/ only) |

**34 of 34 assertions SATISFIED.** Every assertion has a `@ana`-tagged test whose method and value match the contract's matcher; I read each tagged test rather than trusting the tag.

## Independent Findings

**Verification method.** I ran the build (fresh dist), the full sealed suite (4158p/0f/2s), and lint (clean). I read every new file (`req-frontmatter.ts`, `req-state.ts`, `req.ts`) function-by-function, every modified diff (`work.ts`, `artifact-validators.ts`, `init/state.ts`, `index.ts`, both template pairs), and every new/modified test. I then live-tested the CLI in throwaway git repos: `req new` (both `proof-viewer` and `REQ-second` prefix forms), `req validate` (valid ✓ and invalid `P1` → exit 1), `req new` overwrite refusal (exit 1), `req list` (human + `--json`, including a mixed valid/malformed backlog), and `ana work status` (human ℹ line + `--json` requirements field).

**Headline finding (surprised — not predicted): status probe counts validation-malformed requirements as open.** In a live backlog of one valid-critical + two validation-malformed (`priority: P1`; unknown `severity` field) requirements, `ana work status` reports *"3 open requirements (highest: critical)"* while `ana req list` reports *"1 open · 2 malformed"*. `getRequirementsSummary` (`req-state.ts:210-227`) only guards against YAML **parse** failures (the inner try/catch around `parseRequirement`); it never runs `validateReqContent`, so a file that parses but fails validation still counts toward `open` as long as `status: open`. The inline comment "malformed files never count toward the open probe" is therefore misleading — it holds only for parse failures. The two open counts a user sees for the same backlog disagree. This is a real UX inconsistency, not a contract breach (A021's fixture used only well-formed open requirements, so the divergence never surfaced in tests). Recorded as a `scope` finding.

**Predictions resolved.** I made six pre-read predictions; the builder got all six right:
1. `getRequirementsSummary` zero-config-read + total try/catch → **not found** — fully wrapped, reads only the requirements dir, no `ana.json` read (satisfies the `retire-capture-self-arming-C3` blocker constraint).
2. AC6 byte-identity via absent key → **not found** — `reqField = summary ? { requirements } : {}` spread means the key is entirely absent; proven by A022's `'requirements' in parsed === false` and confirmed live.
3. Enum canonicalization on serialize → **not found** — `serializeRequirement` lowercases enum keys; tested (`priority: HIGH` → `high`).
4. `resolution` iff archived, both directions → **not found** — both the present-on-non-archived and absent-on-archived branches exist and are tested (A009/A010).
5. Template parity drift → **not found** — `diff` confirms `.codex` differs from `.claude` by exactly the 7 frontmatter lines; A032 asserts it.
6. Priority sort `unset`-last → **not found** — `PRIORITY_ORDER` + `priorityRank` correct; unknown/blank sorts last; tested.

**Production-risk question ("what would break in production the spec didn't address?").** The malformed-counted-as-open divergence above is exactly this class — a backlog accumulating hand-written files will drift the `work status` count away from `req list`. Second: the best-effort archive commit uses `git add .ana/requirements/` (whole dir), so a `work complete` run could sweep unrelated in-flight requirement edits into the archive commit — low-impact but wider than intended.

**Second sweep (areas I did not predict, and what I checked):**
- **Archive dir-wide `git add`** (`work.ts:1211`) — checked: best-effort, `--no-verify`, wrapped; consequence is over-broad staging, not data loss. Observation.
- **`claimRequirement` double file read** (`assertRequirementClaimable` then `claimRequirement` each `readFileSync`) — checked: harmless redundant IO in a single-process CLI; no TOCTOU of consequence. Observation.
- **`@ana` tag collision** in `template-propagation.test.ts` — pre-existing A029/A030 tags from a prior contract coexist with this contract's A029/A030 in the same file. Checked: does not affect this verification (I mapped each assertion to its correct test by reading), but a naive tag scanner could match the wrong test. Observation.
- **Root-level agent files** (`.claude/agents/ana.md`, `.codex/agents/ana.md`) modified beyond the contract's `file_changes` (which names only `packages/cli/templates/...`). Checked via `diff`: the additions are byte-identical to the template edits — correct dogfooding of the repo's own Think agents, additive only. Over-building relative to the declared file list, but not a defect. Observation.
- **Archive overwrites a same-named existing `archived/REQ-x.md`** silently — checked: best-effort edge case, acceptable.
- **`req-frontmatter.ts` body round-trip** — checked: `split('\n')`/`join('\n')` preserves CRLF within the body; A "body byte-identical after status rewrite" test proves it.

**Over-building / YAGNI check.** New exports are all consumed: `getRequirementsSummary`/`claimRequirement`/`archiveRequirementsForSlug`/`assertRequirementClaimable` imported by `work.ts`; `validateReqContent` by `req-state.ts`; `buildRequirementScaffold` by tests + `runReqNew`. No dead exports, no unused parameters in the new modules. No changes to `parseArtifactType`/`saveArtifact`/`ANA_GITIGNORE_STOCK` (AC11 honored). The only over-build is the root-agent-files edit noted above.

## AC Walkthrough

- **AC1** ✅ PASS — `ana req new proof-viewer` created a valid file; `ana req validate` returned ✓ unmodified (live). Defaults + `## Leads` present.
- **AC2** ✅ PASS — Each violation class returns a specific non-zero error; live-confirmed `priority: P1` → *"priority must be one of: critical, high, medium, low, unset. Got: 'P1'."* exit 1. Enums case-insensitive (A013). Valid → null.
- **AC3** ✅ PASS — Aliased `Disease`/`Why This Matters`/`What to Build` validate (A014), inline fixture per the spec correction.
- **AC4** ✅ PASS — Dual-mode enumeration; sorted table with id·priority·status·age·title; malformed rows render `⚠` and do not crash (live: exit 0 with 2 malformed); `--json` emits the structured array.
- **AC5** ✅ PASS — Stale flagged when `claimed_by` slug not in `plans/active/` (A019), with a negative counter-case.
- **AC6** ✅ PASS — ℹ line only when ≥1 open (live); `--json` gains `requirements` only when `open ≥ 1`; absent-folder output byte-identical (`'requirements' in parsed === false`, A022). ⚠️ see Findings: the *count* the probe reports includes validation-malformed files — behavior still within the AC's literal terms but inconsistent with `req list`.
- **AC7** ✅ PASS — `work start --req` claims (status claimed, claimed_by slug); non-open req errors and leaves no half-started item; plain start unchanged (A023–A026).
- **AC8** ✅ PASS — `work complete` archives to `archived/` with `resolution: completed`; sabotaged archive still completes (A027–A029).
- **AC9** ✅ PASS — `preserveUserState` copy-block + policy-comment; root + archived preserved byte-identically (A030).
- **AC10** ✅ PASS — Both templates carry the Check-State addendum, the Pipeline-State row, and the "Picking up a requirement" subsection with the untrusted-data framing; codex body = claude body minus frontmatter (A031–A033).
- **AC11** ✅ PASS — No changes to `parseArtifactType`/`saveArtifact`/`ANA_GITIGNORE_STOCK` or non-Think templates; requirements commit by default (A034). (Root Think-agent files edited additively — see Findings, permitted by AC11 which only excludes *non-Think* templates.)
- **AC12** ✅ PASS (mechanical) — Full suite 4158 passed / 0 failed / 2 skipped, green with the new tests (frontmatter round-trip, validator per-violation, list/scaffold, status ℹ + JSON, claim, archive, preservation, template parity). Test count did not decrease; named sub-cases pinned by A022 (byte-identity) and A030 (preservation) both pass. Judgment-only waiver honored.

## Blockers

None. I searched specifically for: (1) unused exports in the three new modules — all imported (`req-state` exports consumed by `work.ts`, `validateReqContent` by `req-state`, `buildRequirementScaffold` by `req.ts`/tests); (2) unused parameters in new signatures — none; (3) error paths that swallow silently — the two best-effort swallows (archive commit, `commitSaves`) are intentional per the "best-effort must never block" constraint and each has a covering behavior test; (4) external-state assumptions — the status probe deliberately reads no config, dual-mode git paths mirror the proven `discoverSlugs`; (5) spec edge cases — duplicate-id ambiguity, missing remote path (`ls-tree` non-zero → `[]`), and `resolution` both-direction rules are all implemented and tested. Nothing rises to blocker level.

## Findings

- **Code — Status probe counts validation-malformed requirements as open:** `packages/cli/src/commands/req-state.ts:219` — `getRequirementsSummary` filters on `canonicalizeEnumValue(frontmatter['status']) === 'open'` but never runs `validateReqContent`, so files that parse yet fail validation (unknown field, bad priority) still count. Live result: `ana work status` → "3 open requirements", `ana req list` → "1 open · 2 malformed" for the identical backlog. The inline comment "malformed files never count toward the open probe" only covers parse failures. Next engineer touching the probe: either exclude validation-malformed files or reconcile the two counts. Not a contract breach (A021 fixture was all-valid). Severity: debt.
- **Test — `req list --json` emission path untested:** `packages/cli/tests/commands/req.test.ts:208` — A017/A018 assert against `buildRequirementList` (the data layer). The `runReqList` `--json` mapping that reshapes malformed rows to `{req, malformed, error}` and strips `stale` is never exercised by a test; regressions in that mapping would pass CI. I confirmed it works live, but the coverage gap is real. Severity: debt.
- **Test — `@ana` tag namespace collision:** `packages/cli/tests/commands/init/template-propagation.test.ts:340` — a pre-existing test carries `@ana A018,A019,A020,A021,A029,A030` from a *different* contract; this build added new A029/A030-tagged tests in the same file. Verification-by-tag-scan would be ambiguous. Pre-existing hazard, not introduced by this build's behavior; recorded so the harness/next author knows tags are contract-relative. Severity: observation.
- **Code — Archive commit stages the whole requirements dir:** `packages/cli/src/commands/work.ts:1211` — `git add .ana/requirements/` during `work complete` stages any incidental edits in that directory, not just the moved files. Best-effort and `--no-verify`, so low-impact, but wider than the intent ("commit the moved file(s)"). Severity: observation.
- **Code — `claimRequirement` double-reads the file:** `packages/cli/src/commands/req-state.ts:296` — `assertRequirementClaimable` reads and parses the file, then `claimRequirement` reads and parses it again. Harmless redundant IO; a single read threaded through would be marginally cleaner. Severity: observation.
- **Code — Root Think-agent files edited outside declared file_changes:** `.claude/agents/ana.md:65` and `.codex/agents/ana.md` were modified in addition to the `packages/cli/templates/...` copies the contract lists. The additions are byte-identical to the template edits (verified) — correct dogfooding of this repo's own agents — but they are over-building relative to the sealed `file_changes`. Additive, permitted by AC11 (which excludes only non-Think templates). Severity: observation.

## Deployer Handoff

- Merging this ships a new `ana req` command group (`new`/`validate`/`list`) plus `--req` claim on `work start` and best-effort archive on `work complete`. All additive; no existing pipeline stage or artifact contract changed.
- The one behavior to be aware of: `ana work status` open-requirement counts include validation-malformed files, so its count can exceed `ana req list`'s "N open". Cosmetic today; worth a follow-up (see Findings) before the backlog grows.
- The build also updated this repo's own root `.claude`/`.codex` Think agents (identical to the template edits) — expected, and keeps the dogfooded agents in sync.
- No new dependencies. Requirements files commit to the repo by default (not gitignored).

## Verdict

**Shippable:** YES

All 34 contract assertions are SATISFIED against tests I read individually; all 12 acceptance criteria pass; the full suite is green (4158/0/2), build fresh, lint clean; the seal is INTACT. I live-exercised every user-facing path including error and malformed cases. The findings are one debt-level UX inconsistency (status count vs. list count) and five observations — none blocks shipping, all recorded for the next cycle. I would stake my name on this shipping.
