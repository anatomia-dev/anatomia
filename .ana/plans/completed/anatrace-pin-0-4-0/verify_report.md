# Verify Report: Bump anatrace-core 0.2.0 → 0.4.0 (pin, fail-closed emit, reason lock, real-engine CI)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-16
**Spec:** .ana/plans/active/anatrace-pin-0-4-0/spec.md
**Branch:** feature/anatrace-pin-0-4-0

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../anatrace-pin-0-4-0/contract.yaml
  Seal: INTACT (hash sha256:e6c21fdab1c7507013459a9ed2fe9f56dce5a25a33a3cf75421946a36045f5d9)
```

Seal status: **INTACT** — contract unmodified since AnaPlan sealed it.

**Independent verify-stage test run (sealed):**
```
<!-- ana:capture stage=verify slug=anatrace-pin-0-4-0 counts=3733p/0f/2s verdict=pass sha256=c29529fa1df5fc1ccec3602a7d87ff8cbea698ec5a029a408b9cf802766e875d -->
```

- **Tests:** 3733 passed, 0 failed, 2 skipped (verdict: pass) — run via `ana test --stage verify`.
- **Build:** clean — `pnpm --filter anatomia-cli build` (tsc --noEmit + tsup ESM, build success).
- **Lint:** 0 errors, 1 warning. The lone warning is an unused eslint-disable in `packages/cli/src/utils/git-operations.ts:198` — a file this build never touched. Pre-existing, not a regression.

## Contract Compliance

| ID   | Says                                                                 | Status        | Evidence |
|------|----------------------------------------------------------------------|---------------|----------|
| A045 | The behavioral engine is installed at version 0.4.0                  | ✅ SATISFIED  | `require.resolve` from `packages/cli` → 0.4.0; engine `dist/index.d.mts` confirms; `_capture.test.ts:226` asserts installed `corePkg.version === '0.4.0'` |
| A046 | The project pins the engine to exactly 0.4.0                         | ✅ SATISFIED  | `packages/cli/package.json` → `"anatrace-core": "0.4.0"` (exact, no caret); `_capture.test.ts:224` asserts pin `=== '0.4.0'` |
| A047 | A reason the 0.4.0 engine produces is recognized as known           | ✅ SATISFIED  | `compliance.test.ts:283` — `isVerdictReason('command-unresolvable')` → `true` (member new in 0.4.0, proves the set was built from the live engine) |
| A048 | A reason the engine does not produce is flagged as unknown          | ✅ SATISFIED  | `compliance.test.ts:289` — `isVerdictReason('not-a-real-reason')` → `false` (matcher equals false) |
| A049 | An unrecognized reason is kept exactly as reported, never dropped   | ✅ SATISFIED  | `compliance.test.ts:293` — `projectVerdicts([... reason:'totally-made-up'])` returns `reason === 'totally-made-up'` verbatim AND warns exactly once |
| A050 | When engine version cannot be resolved, no attestation is written   | ✅ SATISFIED  | `compliance.test.ts:317` — `captureComplianceAtSave(..., {readCoreVersion: () => ''})` returns `null`; gate at `compliance.ts:200` (`if (!coreVersion) return null`) |
| A051 | An unresolvable engine version leaves no compliance record on disk  | ✅ SATISFIED  | `compliance.test.ts:333` — compliance dir contains 0 records after the empty-version abstain |
| A052 | A written attestation always carries a real, non-empty engine version| ✅ SATISFIED | `compliance.test.ts:343` — `rec.anatrace_core_version` is truthy on a normal capture |
| A053 | Every verdict reason the real engine emits is one we recognize      | ✅ SATISFIED  | `compliance.test.ts:357` — real-engine capture, `verdicts.length > 0` guard then count of out-of-`VERDICT_REASONS` reasons `=== 0` |
| A054 | Recorded engine version matches the engine that judged the session  | ✅ SATISFIED  | `compliance.test.ts:349` — `rec.anatrace_core_version === createRequire(...)('anatrace-core/package.json').version` (dynamic, auto-tracks the next bump) |
| A055 | An obfuscated forbidden command is caught as a violation (real engine)| ✅ SATISFIED | `compliance.test.ts:396` — `git $'push' --force` (ANSI-C-decodable class) judged by real 0.4.0 → `verdicts.some(v => v.status === 'violated')` true. Verified the fixture is the decodable class, not the `command-unresolvable` wrapper class |

All 11 assertions SATISFIED. Every tagged test was read and confirmed to do what the contract specifies — matchers and values match (`equals false`, `truthy`, `equals "violated"`, etc.). No rubber-stamping.

## Independent Findings

**Predictions (Step 3) and how they resolved:**
1. *Predicted: builder would hardcode `"0.4.0"` in the emit/version test instead of reading it dynamically.* **Not found** — A054 reads the installed version via `createRequire` and compares; the single `0.4.0` literal lives only in the AC1 pin/install check (`_capture.test.ts`), exactly as the spec mandated.
2. *Predicted: AC4(iii) fixture would be weakened to a trivially-forbidden command to go green.* **Not found** — the fixture is the genuine ANSI-C `git $'push' --force` decodable class; I confirmed against the engine that the wrapper/eval class would return `command-unresolvable → unverifiable` and never flip. The builder used the correct class and asserts on `status` only.
3. *Predicted: the abstain test would be a sentinel (pass even with the gate removed).* **Investigated and cleared** — the `env()` helper defaults `ANA_ROLE: 'verify'`, so A050's setup is otherwise complete; the injected empty version is the only cause of the `null`. The gate sits before the role check but the test still isolates it. Strong test.
4. *Predicted: scope creep beyond the 5 contract files.* **Surprised (partially confirmed)** — 6 extra test files changed, but they are forced ripple from the bump, not gold-plating (see Findings / upstream).
5. *Predicted: spec guidance might mislead the fixture.* **Confirmed** — the spec told the builder to source the no-force-push obligation from `ana-build.md`; it actually lives in the engine's VERIFY role. The builder caught this and adapted (see Findings).

**Production risk question — "what would break in production this spec didn't address?"** The `--frozen-lockfile` CI install is load-bearing: I confirmed `pnpm-lock.yaml` regenerated cleanly to `anatrace-core@0.4.0` with zero incidental churn (only the specifier/version/integrity/snapshot lines for that one package changed; the transitive `yaml@2.8.3` was already present). A stale lockfile would have died at CI install — that risk is closed.

**Code quality:** The `proof.ts` change is a clean single-source-of-truth: `VERDICT_REASONS` (15 members) → derived `VerdictReason` type → `isVerdictReason` guard backed by an O(1) `Set`. The `reason: VerdictReason | (string & {})` narrowing documents the closed set while remaining assignable from any string (backward-compatible — `tsc` clean proves no reader breaks). The fail-closed gate computes the version once and stamps from the same value, collapsing the prior double `readCoreVersion()` call. `.js` import extensions and `import type` separation are correct throughout. JSDoc present on all new exported functions.

**Scope discipline:** `commit_hygiene` (out-of-scope C6) untouched in `proof.ts`; C9 (malformed-readable transcript) correctly left alone; the lockfile diff is surgically scoped.

## AC Walkthrough

- **AC1** ✅ PASS — pin `== "0.4.0"` exact; installed engine resolves 0.4.0 (verified via `require.resolve` from `packages/cli` and the engine's own `dist`); `pnpm-lock.yaml` regenerated and scoped to `anatrace-core` only; `tsc --noEmit` + tsup build clean.
- **AC2** ✅ PASS — `reason` locked to the closed set via `VERDICT_REASONS` + `isVerdictReason`, validated in `projectVerdicts`. An out-of-set reason is recorded verbatim and surfaced as exactly one stderr drift warning (A049) — never rejected or abstained. Scope limited to the reason set + its check; no broader `proof.ts` refactor.
- **AC3** ✅ PASS — `captureComplianceAtSave` abstains (`return null`, writes no record) when the core version is empty (A050/A051); version computed once at `compliance.ts:200` and stamped from the same value at `:283`. No `anatrace_core_version: ""` can land. Closes C12.
- **AC4** ✅ PASS — (i) zero out-of-set reasons under the real engine (A053); (ii) emitted version equals installed engine, read dynamically (A054); (iii) ANSI-C `git $'push' --force` reads `violated` under real 0.4.0 (A055), asserting on `status` only per the spec gotcha.
- **AC5** ✅ PASS (correctly deferred) — `CHANGELOG.md` is NOT in the diff; the bump/semantics shift belongs in the PR description and proof entry. Verified no CHANGELOG edit rode this PR.
- **Observable (NON-GATING)** -- UNVERIFIABLE at this stage — no `anatrace_core_version == "0.4.0"` record on disk yet; it emits at `ana artifact save`, not at `ana test`. Expected to land when this report is saved. Per spec, absence is a ~5-min follow-on, never a held PR.
- **Build clean** ✅ PASS — `pnpm --filter anatomia-cli build`.
- **Lint clean** ✅ PASS — `cd packages/cli && pnpm lint` → 0 errors (1 pre-existing warning in an untouched file).
- **Full suite green, count non-decreasing** ✅ PASS — 3733 passed / 0 failed / 2 skipped; this build adds ~7 `it()` blocks in `compliance.test.ts` and modifies (does not remove) the `_capture.test.ts` pin test. Count strictly increased.

## Blockers

None. I searched specifically for: (1) UNSATISFIED contract assertions — read every tagged test, all 11 satisfied with matching matchers/values; (2) a weakened AC4(iii) fixture — confirmed it is the genuine decodable force-push class, not a trivial command; (3) a sentinel abstain test — confirmed A050 isolates the version gate because `env()` supplies a valid role; (4) unscoped lockfile churn — confirmed only `anatrace-core` entries changed; (5) scope-limit violations in `proof.ts` — `commit_hygiene` untouched; (6) broken call sites from the new optional `deps` param — both `artifact.ts` sites pass 3 args and `tsc`/suite are green. Nothing qualifies as a blocker.

## Findings

- **Upstream — Contract `file_changes` under-scoped the bump ripple:** the 0.4.0 engine re-exports a newer `PRICE_TABLE_VERSION` (`2026-06-08` → `2026-06-14`, verified in the installed `anatrace-core@0.4.0/dist/index.mjs:907`), which forced edits to 5 test files the contract never listed — `packages/cli/tests/data/pricing.test.ts:89`, `packages/cli/tests/utils/forensics.test.ts:223`, `packages/cli/tests/utils/forensics-derive.test.ts` (3 sites), `packages/cli/tests/commands/proof-card-golden.test.ts` (+ its `.snap`), plus the A001 pin assertion in `packages/cli/tests/commands/_capture.test.ts`. These are mechanically-forced re-baselines to the *real* installed value (not made-to-pass — I confirmed the engine genuinely ships `2026-06-14`), so they don't change product behavior. Worth recording: a `anatrace-core` bump has a price-table side effect Plan should anticipate next time.
- **Upstream — Spec A055 guidance named the wrong obligation source:** the spec directed the builder to use `installAgentDef('build')` because "`ana-build.md` declares the no-force-push obligation." It does not — the forbidden-command predicate (`git push --force`, `git rebase`) is the engine's built-in `VERIFY_FORBIDDEN_COMMANDS` generated for the VERIFY role (`anatrace-core index.mjs:5265,5463`). The builder caught this, switched to the verify role, and documented the deviation inline at `packages/cli/tests/utils/compliance.test.ts:396`. Contract A055 is satisfied regardless of role. Following the spec literally would likely have produced a fixture that never flipped to `violated` and a false STOP. Good catch by the builder; the spec is the thing that was wrong.
- **Code — `projectVerdicts` default param re-invokes `readCoreVersion`:** `packages/cli/src/utils/compliance.ts:84` defaults `coreVersion: string = readCoreVersion()`. The sole production caller (`:264`) passes the already-resolved `coreVersion` explicitly, so the default never fires today. But it's a latent footgun — a future caller relying on the default would resolve a possibly-empty version *outside* the fail-closed gate and interpolate an empty `anatrace-core@` into the drift warning. Defense-in-depth only; not a bug now. Consider making `coreVersion` a required param.
- **Code — C12 confirmed FIXED:** `readCoreVersion` previously returned `''` on failure and the record stamped it unconditionally, so a record could carry an empty engine version while satisfying the "exists" assertion. The fail-closed gate (`compliance.ts:200`) abstains on empty, curing it. The standing build concern ("abstain path had no reliable external trigger") is now ADDRESSED via the `deps.readCoreVersion` seam (A050). This finding `resolves` `anatrace-core-integration-C12` in the proof chain.
- **Test — Real-engine happy-path fixture is trivial but well-guarded:** A053 (`compliance.test.ts:357`) judges a minimal "doing work" transcript and asserts zero out-of-set reasons; the `verdicts.length > 0` guard prevents a vacuous pass if a future engine emitted nothing. Preserve that guard if the fixture is ever simplified. No action needed.

## Deployer Handoff

- This is a **dogfood-only** change: `packages/cli` source/tests + root `pnpm-lock.yaml`. Nothing in `templates/` or generators — no customer-facing artifact ships.
- **The PR description must carry the AC5-deferred CHANGELOG content:** the `anatrace-core` 0.2.0 → 0.4.0 bump and the verdict-semantics shift (ANSI-C-obfuscated force-push now reads `violated`; new reasons `command-unresolvable` / `harness-version-unrecognized` / `session-parse-suspect`). `CHANGELOG.md` is intentionally untouched (slotted for the 1.3.0 cut).
- CI installs with `--frozen-lockfile`; the regenerated lockfile is scoped and will install cleanly. The static `anatrace-core` import makes the install load-bearing on every matrix runner — a green CI install is itself part of the proof.
- Two `Upstream` findings (contract under-scope, spec A055 mis-guidance) are for AnaPlan's attention on the next engine bump — neither blocks this merge.
- Non-gating observable (a 0.4.0 record on disk) emits at artifact-save time; if absent after merge it's a ~5-min `ana run`, not a defect.

## Verdict

**Shippable:** YES

All 11 contract assertions SATISFIED, all gating acceptance criteria PASS, full suite green (3733/0/2), build and lint clean, lockfile scoped, scope limits respected. I read every new source file and every new test assertion, ran the build/test/lint myself, verified the AC4(iii) fixture is the genuine decodable class against the engine bytes, confirmed the abstain test isolates the fail-closed gate, and verified the out-of-contract test edits track the real installed engine value rather than being made-to-pass. The two upstream findings are spec/contract-quality observations for the next cycle, not defects in this code. I would stake my name on this shipping.
