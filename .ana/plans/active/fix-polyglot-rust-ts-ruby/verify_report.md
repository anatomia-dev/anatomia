# Verify Report: Fix Polyglot Detection for Tauri+TS and Ruby+JS Projects

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-19
**Spec:** .ana/plans/active/fix-polyglot-rust-ts-ruby/spec.md
**Branch:** feature/fix-polyglot-rust-ts-ruby

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-polyglot-rust-ts-ruby/contract.yaml
  Seal: INTACT (hash sha256:d033dee05b38b3d5ae0eefe57a86d2d7300e0f88f27aa84c00edca4b31a0c3c1)
```

Seal status: **INTACT**

Tests: 2556 passed, 0 failed, 2 skipped (112 test files). Build: PASS (cached). Lint: PASS (1 pre-existing warning in `git-operations.ts` — not introduced by this build).

Polyglot-specific: 35 tests passed in `polyglot.test.ts` (was 27 before this build, +8 new).

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Tauri monorepo with pnpm workspace detects as TypeScript project | ✅ SATISFIED | `polyglot.test.ts:487` — `expect(result.type).toBe('node')` |
| A002 | Tauri monorepo detection has high but not maximum confidence | ✅ SATISFIED | `polyglot.test.ts:488` — `expect(result.confidence).toBe(0.85)` |
| A003 | Tauri monorepo detection includes the pnpm workspace file as evidence | ✅ SATISFIED | `polyglot.test.ts:489` — `expect(result.indicators).toContain('pnpm-workspace.yaml')` |
| A004 | Rust workspace without Tauri still detects as Rust | ✅ SATISFIED | `polyglot.test.ts:298` — `expect(result.type).toBe('rust')`. Existing test, block name matches exactly. |
| A005 | Tauri project without pnpm workspace correctly stays Rust | ✅ SATISFIED | `polyglot.test.ts:506` — `expect(result.type).toBe('rust')` |
| A006 | Pure Tauri desktop app keeps Rust confidence | ✅ SATISFIED | `polyglot.test.ts:507` — `expect(result.confidence).toBe(0.90)` |
| A007 | Ruby on Rails project with package.json detects as Ruby | ✅ SATISFIED | `polyglot.test.ts:578` — `expect(result.type).toBe('ruby')` |
| A008 | Ruby detection with lockfile has high confidence | ✅ SATISFIED | `polyglot.test.ts:579` — `expect(result.confidence).toBe(0.90)` |
| A009 | Ruby detection includes Gemfile as evidence | ✅ SATISFIED | `polyglot.test.ts:580` — `expect(result.indicators).toContain('Gemfile')` |
| A010 | Ruby project without lockfile still detects as Ruby | ✅ SATISFIED | `polyglot.test.ts:591` — `expect(result.type).toBe('ruby')` |
| A011 | Ruby detection without lockfile has reduced confidence | ✅ SATISFIED | `polyglot.test.ts:592` — `expect(result.confidence).toBe(0.85)` |
| A012 | Plain Node project with lockfile still detects correctly | ✅ SATISFIED | `polyglot.test.ts:347` — `expect(result.type).toBe('node')`. Existing test, updated Tier 1 gate now includes `!hasGemfile`. |
| A013 | Plain Node fast path confidence is unchanged | ✅ SATISFIED | `polyglot.test.ts:348` — `expect(result.confidence).toBe(0.95)` |
| A014 | When Python and Rust both compete, Python wins by priority | ✅ SATISFIED | `polyglot.test.ts:608` — `expect(result.type).toBe('python')` |
| A015 | Tauri monorepo without lockfile detects as Node at lower confidence | ✅ SATISFIED | `polyglot.test.ts:524` — `expect(result.type).toBe('node')` |
| A016 | Tier 4 Tauri detection has appropriately reduced confidence | ✅ SATISFIED | `polyglot.test.ts:525` — `expect(result.confidence).toBe(0.80)` |
| A017 | Malformed Cargo.toml workspace dependencies fall through safely to Rust | ✅ SATISFIED | `polyglot.test.ts:543` — `expect(result.type).toBe('rust')` |
| A018 | Sub-table TOML format for tauri dependency is correctly detected | ✅ SATISFIED | `polyglot.test.ts:562` — `expect(result.type).toBe('node')` |
| A019 | Sub-table format Tauri detection has same confidence as inline format | ✅ SATISFIED | `polyglot.test.ts:564` — `expect(result.confidence).toBe(0.85)` |

19/19 SATISFIED.

## Independent Findings

### Prediction Resolution

1. **Regex too loose on `tauri`** — Not found. `/^\s*tauri\s*=/m` requires whitespace or `=` after `tauri`, so `tauri-build = "2.5.0"` doesn't match. Sub-table regex `/^\[workspace\.dependencies\.tauri\]\s*$/m` requires exact line match. Both are correctly scoped.

2. **`indexOf('\n[')` edge case** — Confirmed (inherited). `hasTauriWorkspaceDep` line 60 uses the same `indexOf('\n[')` pattern as `hasPythonProjectDeps`. If `[workspace.dependencies]` is the LAST section in the file AND immediately followed by another section header without a newline prefix... this is a theoretical edge. The existing proof chain finding (polyglot-language-detection-C3) covers it.

3. **Ruby detection content-blind** — Confirmed by design. Gemfile existence alone triggers Ruby. A Gemfile with only `gem "bundler"` (dev tooling, not a real Ruby app) would still flip detection. Spec required this — existence is the discriminator. Minor observation.

4. **Tier 1 fast path gate** — Not found. Builder correctly added `!hasGemfile` to the gate at line 172.

5. **`hasPnpmWorkspace` placement** — Not found. Declared once at line 170 alongside other manifest checks, reused in both Tier 3 (line 196) and Tier 4 (line 245). Builder followed spec guidance exactly.

### Surprise Finding

The `detectProjectType` docstring at line 133 says "Falls through to Python → Go → Rust → Ruby → PHP" but the actual polyglot tier ordering inside the `package.json` branch is Python → Rust → Ruby → Go. The non-package.json fallthrough (lines 273-315) is Python → Go → Rust → Ruby → PHP. These are two different orderings. The docstring describes the latter but not the former.

## AC Walkthrough

- **AC1:** Tauri+TS monorepo → Node 0.85 — ✅ PASS — test at `polyglot.test.ts:471` passes, asserts all three properties.
- **AC2:** Rust workspace without tauri → Rust 0.90 — ✅ PASS — existing test at `polyglot.test.ts:285` still passes unmodified.
- **AC3:** Tauri dep but no pnpm-workspace.yaml → Rust 0.90 — ✅ PASS — test at `polyglot.test.ts:493` passes.
- **AC4:** workspaces field overrides Tauri check → Node 0.90 — ✅ PASS — existing test at `polyglot.test.ts:352` passes. Tier 2 fires before Tier 3 Rust check.
- **AC5:** Ruby with lockfile → Ruby 0.90 — ✅ PASS — test at `polyglot.test.ts:570` passes.
- **AC6:** Ruby without lockfile → Ruby 0.85 — ✅ PASS — test at `polyglot.test.ts:584` passes.
- **AC7:** Node fast path unchanged → Node 0.95 — ✅ PASS — test at `polyglot.test.ts:340` passes. Tier 1 gate includes `!hasGemfile`.
- **AC8:** All existing polyglot tests pass without modification — ✅ PASS — 35/35 tests pass. Existing tests were not modified (verified via `git diff`).
- **AC9:** Priority ordering: Python + Rust → Python wins — ✅ PASS — test at `polyglot.test.ts:596` passes. Addresses proof finding rust-go-polyglot-detection-C5.
- **AC10:** Tier 4 Tauri (no lockfile) → Node 0.80 — ✅ PASS — test at `polyglot.test.ts:511` passes.
- **AC11:** Malformed [workspace.dependencies] → Rust — ✅ PASS — test at `polyglot.test.ts:529` passes. Garbled content doesn't match `tauri =` regex.
- **AC12:** Sub-table format detected — ✅ PASS — test at `polyglot.test.ts:548` passes.
- **AC13:** Tests pass: `pnpm run test -- --run` — ✅ PASS — 2556 passed, 0 failed, 2 skipped.
- **AC14:** No build errors: `pnpm run build` — ✅ PASS — all tasks successful.
- **AC15:** Lint passes — ✅ PASS — 0 errors, 1 pre-existing warning (not introduced by this build).

15/15 ✅ PASS.

## Blockers

None. All 19 contract assertions satisfied. All 15 acceptance criteria pass. No regressions (2556 tests pass, up from 2548 baseline — 8 new tests added as expected). No unused exports in new code (`hasTauriWorkspaceDep` is module-private). No unused parameters (checked all new function signatures). No unhandled error paths (new function follows existing try/catch-return-false pattern). No assumptions about external state beyond filesystem reads already used by existing code. Lint clean (0 errors).

## Findings

- **Code — Stale docstring on `detectProjectType`:** `packages/cli/src/engine/detectors/projectType.ts:133` — says "Falls through to Python → Go → Rust → Ruby → PHP" but the polyglot tier order inside the `package.json` branch is Python → Rust → Ruby → Go. The non-package.json fallthrough order differs. Misleading for future contributors reading the code.

- **Code — `indexOf('\n[')` section boundary inherited:** `packages/cli/src/engine/detectors/projectType.ts:60` — `hasTauriWorkspaceDep` uses the same `indexOf('\n[')` pattern as `hasPythonProjectDeps`. A section header at byte position 0 of the sliced block (no preceding newline) would be missed. Theoretical edge — still present, see polyglot-language-detection-C3.

- **Code — Tauri discriminator omits Cargo.toml from indicators:** `packages/cli/src/engine/detectors/projectType.ts:197` — when the Tauri check flips the result to Node, indicators include `pnpm-workspace.yaml` but not `Cargo.toml`. Downstream consumers can't tell Rust is involved. Design choice rather than bug — indicators represent "evidence for the detected type."

- **Code — Ruby detection is existence-only:** `packages/cli/src/engine/detectors/projectType.ts:208` — unlike Python (which reads `pyproject.toml` for real deps) and Rust (which checks for `[workspace]`), Ruby detection checks only for Gemfile existence. A project using Gemfile purely for dev tooling (e.g., `gem "bundler"` only) would be classified as Ruby. Low risk — Gemfile in a project root is a strong Ruby signal.

- **Test — `@ana` tag collision across contracts:** `packages/cli/tests/engine/detectors/polyglot.test.ts:35` — IDs A001-A019 appear in tags from the previous polyglot-language-detection and rust-go-polyglot-detection contracts AND this contract. The same file has `// @ana A001` at line 35 (old) and `// @ana A001, A002, A003` at line 470 (new). Future tooling that searches by ID will find ambiguous matches.

- **Upstream — Gemfile + Cargo.toml [workspace] coexistence untested:** A project with both Gemfile and Cargo.toml with `[workspace]` section (e.g., Ruby project with Rust native extensions using a workspace) is not tested. By code position, Rust wins (Tier 3 Rust at line 190 fires before Tier 3 Ruby at line 208). Whether that's the correct priority is a design question for a future scope.

- **Code — `hasTauriWorkspaceDep` catch block unreachable:** `packages/cli/src/engine/detectors/projectType.ts:67` — regex operations can't throw. Same pattern as `hasRustWorkspace` (rust-go-polyglot-detection-C4). Defensive-only — consistent with codebase convention.

## Deployer Handoff

Clean feature branch. Two files changed: `projectType.ts` (new `hasTauriWorkspaceDep` helper + Gemfile detection + Tier 1 gate update) and `polyglot.test.ts` (8 new tests). No new dependencies. No config changes. No migration needed.

The `hasPnpmWorkspace` check adds one filesystem read per detection call (line 170). This is always computed even when Cargo.toml doesn't exist. Cost is negligible (single `fs.access`) but worth knowing.

Lint warning in `git-operations.ts` is pre-existing and unrelated to this build.

## Verdict

**Shippable:** YES

19/19 contract assertions satisfied. 15/15 ACs pass. 2556 tests green. Build and lint clean. The implementation follows the spec precisely — two surgical additions (Tauri discriminator inside Rust path, Ruby competing manifest) with no over-building. The `hasTauriWorkspaceDep` helper is well-scoped (section-aware, handles both TOML formats, private to the module). Ruby tiers are correctly ordered after Rust, before Go, and the Tier 1 fast path gate is updated.
