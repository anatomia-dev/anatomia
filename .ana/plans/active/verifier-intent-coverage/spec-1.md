# Spec: Verifier Intent Coverage — Phase 1 (Keystone: extractor + pre-seal coverage gate)

**Created by:** AnaPlan
**Date:** 2026-06-16
**Scope:** .ana/plans/active/verifier-intent-coverage/scope.md

## Approach

This phase builds the mechanism that makes contract↔scope coverage a computable fact, and a pre-seal gate that hard-blocks a contract that silently drops a scope acceptance criterion. Nothing is *activated* yet — no contract emits the activation signal until Phase 2 teaches Plan to. This phase ships **inert-but-safe**: every existing contract is `version 1.0`, so the gate no-ops everywhere on day one. That is by design — it lets the riskiest piece (the extractor) bake against the live corpus before any user can be blocked by it.

Three things get built, in this order (the order is the de-risk):

1. **The types** — additive, zero-migration. `ac?: string | string[]` on `ContractAssertion`; a new `CoverageWaiver` interface and `coverage_waivers?: CoverageWaiver[]` on `ContractSchema`. The existing `version` field carries the activation signal at the value level (`"1.1"`), so no new schema field is needed.

2. **The scope-AC extractor + the live-corpus measurement (AC1) — BUILD AND PROVE THIS FIRST.** A purpose-built `extractScopeACs(scopeContent)` returning `{ ids, ambiguous }`. The existing AC check (`artifact-validators.ts:143`) is a *counter* that requires a `- ` bullet prefix — it does not extract ids and does not match bare `## AC1` / `**AC1**` / `AC1:`. Build the extractor fresh, then prove it on the **live completed-scope corpus** (~204 scopes, glob — do NOT hardcode 187 or 204) before wiring it into any gate. **The gate must not block until the corpus measurement is green (OQ3 / Open Question 3): if the extractor can't pass the corpus sweep, it degrades to warn, never ships as a false-blocking detector.**

3. **The pre-seal coverage gate** — `evaluateCoverageGate({ scopeContent, contract })` returning a structured `{ active, block, uncovered, errors, warnings, info, diagnostic }`. Pure, no chalk. Wired into the contract-validation block of **both** save sites in `artifact.ts` (single `saveArtifact` and atomic `saveAllArtifacts`), *before* `writeSaveMetadata` computes the seal hash. `artifact.ts` prints the structured result and calls `process.exit(1)` on block — the engine/command boundary from `/coding-standards`.

### Design decisions locked with the developer

- **Activation = `version >= "1.1"` (Q1 → 1a).** Adding `ac:`/`coverage_waivers` *is* a schema change, so bumping the contract `version` is semantically honest AND is the positive activation signal the scope's AC13 demands. `version 1.0` (every contract that exists today) → gate inactive → silent no-op (AC3). `version 1.1` → gate active, *even with zero `ac:` links* → surfaces/blocks, never silently skips (AC13). This phase does not change the template, so nothing emits `1.1` yet — the gate is dormant until Phase 2.

- **Unified `coverage_waivers` (Q2 → 2a), a conscious deviation from the scope's literal `judgment_only: string[]`.** Both "judgment-only" (untestable-by-nature, AC4) and "retired" (deliberately removed, AC5) are the same concept: *an AC excused from needing a linked assertion, with a reason*. One field models both: `coverage_waivers: [{ ac, kind: "judgment" | "retired", reason }]`, **`reason` required for both kinds**. The required reason is what makes AC4's anti-silent-abuse real — a bare id array carries no justification, so over-marking is invisible; a required reason forces the planner to state intent. `kind` is preserved so Phase 2's proof card can separate judgment-verified ACs from retired ones (AC7). **This consciously supersedes the scope's literal `judgment_only: string[]` type — it is design, not drift. Verify should read it as intentional.**

- **AC14 fail-open is a per-run, per-scope classifier — not a global switch.** `extractScopeACs` returns `ambiguous: true` when a scope shows AC-signal (an "Acceptance Criteria" heading, or `AC`-prefixed lines) but the extractor cannot cleanly recover well-formed ids from it. When `ambiguous`, the gate degrades to **warn-only for that single scope**, never blocks. This protects stranger teams whose AC formats we never measured: an unfamiliar format warns on every run rather than false-blocking once. "One false block is a release blocker" must hold for formats outside our corpus.

- **AC13 always-on diagnostic.** The gate result carries a `diagnostic` string and `artifact.ts` always prints exactly one line describing the gate's decision — `active (N/M ACs covered)`, `inactive (legacy contract, version 1.0)`, or `skipped (AC format unrecognized — warn only)`. An inactive gate is therefore never invisible.

- **"Covered" = structural, not semantic (edge case 6).** Coverage = the scope AC id appears in at least one assertion's `ac:` field, OR in a `coverage_waivers` entry. The gate verifies the *link exists*; it does NOT judge whether the assertion semantically tests the AC (that stays Verify's job). An AC covered only by weak matchers (`exists`/`contains`/`truthy`) counts as **covered** — record "covered by weak matcher only" as `info`, never a block. The weak-matcher linter was cut from the feature (49% false-alarm rate, measured).

### Open Questions from scope — resolved

- *Where does the measurement harness live and what does it assert?* (scope "Things to Investigate"). **Reframed and confirmed with the developer:** with **0 contracts currently using `ac:` links** (verified: `grep -rl "^\s*ac:" .ana/plans/completed/*/contract.yaml` → 0), there is no coverage to measure against. AC1 is therefore an **extractor-accuracy + confidence-classification** test over the live corpus, not a coverage test: does the extractor recover the right AC id-set from every well-formed scope, and never misclassify a well-formed scope into the `ambiguous` (warn) or empty (no-op) bucket? This ties directly to AC14's classifier. The harness reads `.ana/plans/completed/*/scope.md` live (glob, repo-root-resolved — see Gotchas).

- *Retired-AC representation* (edge case 3). Resolved by `coverage_waivers` with `kind: "retired"` + required `reason`. The reason is the positive signal that distinguishes a *deliberately retired* AC (does not block) from a *silently dropped* AC (blocks).

## Output Mockups

The gate is surfaced by `artifact.ts` when a `contract` is saved. Three decision paths:

**Inactive (legacy contract, `version 1.0` — today's default, always):**
```
Coverage gate: inactive (legacy contract, version 1.0)
✓ Saved Contract for `my-feature` to `main`.
```

**Active and clean (`version 1.1`, every AC covered):**
```
Coverage gate: active — 6/6 acceptance criteria covered (1 by judgment-only waiver)
✓ Saved Contract for `my-feature` to `main`.
```

**Active and blocking (`version 1.1`, AC3 has no covering assertion and no waiver):**
```
Coverage gate: active — 5/6 acceptance criteria covered
Error: Contract leaves 1 scope acceptance criterion uncovered.
  - AC3 has no covering assertion and no coverage_waivers entry.
    Either add an assertion with `ac: AC3`, or add a coverage_waivers entry
    ({ ac: AC3, kind: judgment|retired, reason: "..." }) explaining why it is not mechanically pinned.
The seal was not written. Fix the contract and re-save.
```

**Skipped (scope AC format unrecognized — fail open, AC14):**
```
Coverage gate: skipped (AC format unrecognized — warn only, not blocking)
✓ Saved Contract for `my-feature` to `main`.
```

`evaluateCoverageGate` returns this shape (consumed by `artifact.ts` and, in Phase 2, by `ana plan coverage`):
```
{
  active: boolean,        // version >= 1.1 AND scope has high-confidence ACs
  block: boolean,         // active AND ≥1 AC uncovered
  uncovered: string[],    // AC ids with no assertion link and no waiver
  errors: string[],       // human-readable block reasons (printed red, then exit 1)
  warnings: string[],     // non-blocking (e.g. fail-open degrade)
  info: string[],         // weak-matcher-only coverage notes
  diagnostic: string      // the single always-printed decision line
}
```

## File Changes

All paths under `packages/cli/`. Verified current state via Read this session.

### src/types/contract.ts (modify)
**What changes:** Add `ac?: string | string[]` to `ContractAssertion`. Add a new exported `CoverageWaiver` interface (`ac: string; kind: 'judgment' | 'retired'; reason: string`) and `coverage_waivers?: CoverageWaiver[]` to `ContractSchema`. Leave `version?: string` as-is (the activation lives in the value, not the type).
**Pattern to follow:** the existing additive optional fields already in these two interfaces (`block?`, `target?`, `file_changes?`).
**Why:** the typed link is the foundation the whole feature rests on; without it coverage is inferred and fuzzy. Document in a JSDoc comment that `coverage_waivers` consciously supersedes the scope's literal `judgment_only: string[]`, and why (reason-required honesty + removes the judgment/retired duplication), so a future reader doesn't "fix" it back.

### src/commands/artifact-validators.ts (modify)
**What changes:** Add two exported functions beside `validateContractFormat` (the functional analog — same domain, same file):
- `extractScopeACs(scopeContent: string): { ids: string[]; ambiguous: boolean }` — recovers AC ids from `- AC1:`, `## AC1`, `**AC1**`, and bare `AC1:` forms. De-duplicates ids (one AC mentioned in a heading AND a bullet is one id). Sets `ambiguous: true` when AC-signal is present but no clean ids are recoverable (the AC14 classifier). Returns `{ ids: [], ambiguous: false }` for a scope with no AC section at all (build-only, AC6).
- `evaluateCoverageGate(input: { scopeContent: string; contract: ContractSchema }): CoverageGateResult` — the pure gate. Define and export the `CoverageGateResult` interface (shape in Output Mockups). Activation logic: parse `contract.version` (major.minor compare) → `active` only when `version >= "1.1"` AND extraction is non-ambiguous AND `ids.length > 0`. When active, compute `uncovered` = AC ids absent from every assertion's `ac:` field AND absent from `coverage_waivers`. `block = active && uncovered.length > 0`. Always populate `diagnostic`. Never throw — a malformed contract/scope degrades to a warn-only result.
**Pattern to follow:** `validateContractFormat` (`artifact-validators.ts:305-406`) — error-accumulation, returns data not chalk, no `process.exit`. `extractScopeACs` parallels the section-walking in `validateScopeFormat` (`:160-176`).
**Why:** the extractor + gate are the keystone. They belong here, next to the validators, because the save flow already calls this module and the engine/command boundary keeps them chalk-free.

### src/commands/artifact.ts (modify)
**What changes:** In **both** save paths, inside the `if (typeInfo.baseType === 'contract')` validation block — `saveArtifact` (~line 1081) and `saveAllArtifacts` (~line 1505) — after `validateContractFormat` passes, read the sibling `scope.md` from the same plan dir, parse the contract YAML, call `evaluateCoverageGate`, print `result.diagnostic` (one line), print `result.info`/`result.warnings` (yellow) and, if `result.block`, print `result.errors` (red) and `process.exit(1)`. This must run BEFORE `writeSaveMetadata` is reached (the seal hash is at `artifact.ts:79`, called at ~1214 and ~1658) — the contract block is already upstream of those, so placement inside it is correct.
**Pattern to follow:** the adjacent `applyTestEvidenceGate` call (`:1078` / `:1502`) — a gate that runs in the validation block, prints with chalk, and `process.exit(1)` on block. Double-wiring both save sites is mandatory and already the established pattern (every validator and gate is wired in both).
**Why:** the gate is worthless if either save path skips it. The scope's "save-flow wiring (scrutiny correction)" edge case 7 names this exact nuance: gate function with the validators, gate *call* before the seal hash.

### tests/commands/coverage-gate.test.ts (create)
**What changes:** Unit tests for `extractScopeACs` (all four AC forms, ambiguous classification, empty/no-AC scope) and `evaluateCoverageGate` (active/inactive by version, block on dropped AC, no-block when covered, waiver satisfies coverage, retired-vs-dropped, fail-open on ambiguous, weak-matcher info, always-present diagnostic). Inline fixture strings — no real corpus here.
**Pattern to follow:** `tests/commands/verify.test.ts` header (vitest, temp dirs only where a filesystem is needed; pure-function tests need no temp dir).

### tests/commands/scope-ac-corpus.test.ts (create)
**What changes:** The AC1 live-corpus measurement. Glob `<repoRoot>/.ana/plans/completed/*/scope.md` (resolve repo root explicitly — see Gotchas), run each through `extractScopeACs`, and assert: (a) zero scopes that visibly contain an AC section are misclassified `ambiguous`; (b) zero scopes with an AC section yield an empty id set; (c) the extractor never throws on any corpus scope. Assert exact counts (`toBe(0)`), per testing-standards.
**Pattern to follow:** `tests/capture-corpus/invariants.test.ts` — a corpus sweep with exact-count invariants.

## Acceptance Criteria

Copied from scope (AC1–AC6, AC13, AC14 — the mechanism ACs), expanded with build criteria. **Intra-spec ordering (the de-risk): AC1 must be green before the gate is allowed to block.**

- [ ] **AC1:** `extractScopeACs`, run over the live completed-scope corpus (glob, ~204 scopes), recovers the correct AC id-set and misclassifies **zero** well-formed scopes as `ambiguous` or empty. Handles `- AC1:`, `## AC1`, `**AC1**`, `AC1:`. **This is the gate on the gate** — must be green before `evaluateCoverageGate` is wired to block (OQ3: degrade to warn if it can't pass).
- [ ] **AC2:** `evaluateCoverageGate` sets `block: true` **iff** the contract is active AND a scope AC has zero covering assertions AND no `coverage_waivers` entry. Nothing else sets `block`.
- [ ] **AC3:** All existing contracts (every one is `version 1.0`) still validate via `validateContractFormat` and save unchanged — the gate reports `active: false` and no-ops. `validateContractFormat` accepts `version "1.1"` additively (confirmed: only presence is checked at `:322`).
- [ ] **AC4 (gate behavior):** A `coverage_waivers` entry with `kind: judgment` satisfies its AC's coverage and never blocks. (The *count surfacing* in the proof/card is Phase 2.)
- [ ] **AC5:** A retired AC (`coverage_waivers` entry, `kind: retired`, with `reason`) does not block; an AC with neither assertion nor waiver does block.
- [ ] **AC6:** A build-only / no-AC scope, or a contract with no assertions, never triggers the gate (`active: false`, `block: false`).
- [ ] **AC13:** A `version 1.1` contract with zero `ac:` links but a scope that has ACs reports `active: true` and `block: true` (surfaced, never silently skipped). The gate always emits a `diagnostic` line; `artifact.ts` always prints it.
- [ ] **AC14:** A scope whose AC format is ambiguous/unrecognized yields `ambiguous: true`, and the gate degrades to warn-only (`block: false`) for that scope.
- [ ] Gate wired into BOTH `saveArtifact` and `saveAllArtifacts`, before the seal hash; `process.exit(1)` on block.
- [ ] `evaluateCoverageGate` and `extractScopeACs` are pure (no chalk, no `process.exit`); all user output is in `artifact.ts`.
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`; test count does not decrease; no build or lint errors.

## Testing Strategy

- **Unit (`coverage-gate.test.ts`):** every AC form extracts; ambiguous fixture classifies `ambiguous: true`; no-AC fixture returns empty + non-ambiguous. Gate: inactive at `1.0`; active at `1.1`; block on dropped AC; no-block when an assertion's `ac:` covers it; waiver (judgment + retired) satisfies coverage; weak-matcher-only AC is covered with an `info` note; `diagnostic` always non-empty. Cover the error path (malformed contract YAML → never throws, degrades to warn).
- **Corpus (`scope-ac-corpus.test.ts`):** the AC1 sweep — exact `toBe(0)` on false-ambiguous and empty-extraction counts across the live corpus.
- **Edge cases:** one assertion serving multiple ACs (`ac: [AC1, AC2]`); an AC mentioned in both a heading and a bullet (de-dup to one id); a scope with `AC10`/`AC11` (multi-digit ids); a contract with `coverage_waivers` referencing an AC that does not exist in the scope (ignore — never blocks).

## Dependencies

None. This is the first phase; it builds on existing types and the existing save flow only.

## Constraints

- **Backward-compat is absolute (AC3):** every current contract is `version 1.0` and must save unchanged. The gate must no-op, never throw, on: no contract, no ACs, legacy `1.0` contracts, malformed YAML.
- **Inert on ship:** this phase changes no template, so no contract emits `1.1`. The gate is dormant until Phase 2. That is intentional and must hold — do not bump the template here.
- **Pre-commit runs `tsc --noEmit` (not the SWC build).** New optional fields must be threaded with correct types everywhere or the hook (not the build) rejects.
- Must work for all customers (Python, Go, etc.) — the extractor parses Markdown AC conventions, not language-specific anything. The corpus harness must tolerate a project with zero completed scopes (empty glob → trivially passes, never errors).

## Gotchas

- **The corpus harness must resolve the repo root explicitly, not via `process.cwd()`.** Vitest tests sometimes `process.chdir` into temp dirs. Resolve the completed-plans dir from a stable anchor (e.g. walk up from `import.meta.url`/`__dirname`, or from the known test-file location to the package root, then to `../../.ana/plans/completed`). A `cwd`-relative glob will silently find nothing and pass vacuously — a false green on the feature's safety gate. Assert the glob found a non-trivial number of scopes (e.g. `> 50`) so a vacuous pass is caught, *unless* the corpus is legitimately empty (guard for the stranger case).
- **`version` compare is value-level, string-typed.** `contract.version` is a YAML string (`"1.0"`/`"1.1"`). Parse major/minor as integers and compare numerically — do not string-compare (`"1.10" < "1.9"` lexically). Define a `COVERAGE_GATE_MIN_VERSION = "1.1"` constant.
- **Gate must no-op, never throw**, on: no contract file, no `scope.md` sibling, no assertions, no ACs, legacy `1.0`, unparseable YAML. Wrap the gate call in `artifact.ts` defensively, but the gate function itself should already be total.
- **`ac:` and `coverage_waivers` pass `validateContractFormat` untouched** — it checks named fields only, never iterates keys. Confirmed. Do not add validation that rejects them.
- **De-dup AC ids.** A scope often repeats an id (heading + bullet, or "AC3" referenced in prose). The id-set is a `Set`; coverage joins on unique ids.
- **`coverage_waivers` is self-reported by Plan.** The gate verifies the entry exists and has a `reason`; it does not police whether the `reason` is honest (visibility-only protection, by design — scope edge case 2). Do not add a cap or a block on waiver count.

## Build Brief

### Rules That Apply
- **All local imports end in `.js`** and use `import type` for type-only imports (`import type { ContractSchema, CoverageWaiver } from '../types/contract.js'`). Omitting `.js` compiles but crashes at runtime (ESM).
- **Engine/command boundary:** `artifact-validators.ts` returns data (errors/results as plain objects/arrays), never chalk, never `process.exit`. All printing + exit lives in `artifact.ts`. This mirrors `validateContractFormat` → its callers.
- **Explicit return types on all exported functions;** `@param`/`@returns` JSDoc on exports (pre-commit eslint enforces this).
- **Prefer `| null`/early returns;** avoid `any` — use `unknown` + narrowing for parsed YAML.
- **Tests:** exact-value matchers (`toBe(0)`, not `toBeGreaterThan`). Temp git repos use `git init -b main`. Inline fixtures, no standalone manifest files. Source-content/corpus assertions are legitimate here (structural-invariant enforcement).

### Pattern Extracts

The gate's home and shape — mirror `validateContractFormat`'s data-return contract (`artifact-validators.ts:305-320`):
```ts
export function validateContractFormat(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const errors: string[] = [];
  let contract: ContractSchema;
  try {
    contract = yaml.parse(content);
  } catch (e) {
    return [`YAML parse error: ${e instanceof Error ? e.message : 'Invalid YAML'}`];
  }
  if (!contract || typeof contract !== 'object') {
    return ['Contract must be a YAML object'];
  }
  // ... named-field checks, returns errors[] — caller prints + exits
}
```

The section-walk the extractor mirrors (`artifact-validators.ts:160-173`, from `validateScopeFormat`):
```ts
const lines = content.split('\n');
let inIntent = false;
const intentLines: string[] = [];
for (const line of lines) {
  if (/^##\s+Intent/i.test(line)) { inIntent = true; continue; }
  if (inIntent) {
    if (/^##/.test(line)) break; // Next section starts
    intentLines.push(line);
  }
}
```

The adjacent gate to mirror for wiring (`artifact.ts:859-877`, `applyTestEvidenceGate`) — runs in the validation block, prints with chalk, exits on block:
```ts
function applyTestEvidenceGate(filePath: string, projectRoot: string): void {
  const enabled = isTestEvidenceGateEnabled(projectRoot);
  const gate = evaluateTestEvidenceGate(filePath, { enabled });
  if (gate.blocked) {
    console.error(chalk.red('Error: build_report.md has no valid captured test evidence.'));
    for (const err of gate.errors) console.error(chalk.red(`  ${err}`));
    process.exit(1);
  }
  for (const warning of gate.warnings) console.warn(chalk.yellow(`Warning: capture evidence — ${warning}`));
}
```

The contract-validation block where the gate call goes (`artifact.ts:1081-1090`, single-save; the save-all mirror is at `:1505-1514`):
```ts
if (typeInfo.baseType === 'contract') {
  const errors = validateContractFormat(filePath);
  if (errors.length > 0) {
    console.error(chalk.red('Contract validation failed:'));
    for (const error of errors) console.error(chalk.red(`  - ${error}`));
    process.exit(1);
  }
  // ← coverage gate call goes here: read sibling scope.md, parse contract,
  //   evaluateCoverageGate, print diagnostic + info/warnings, exit(1) on block
}
```

### Proof Context
Ran `ana proof context` against the affected files conceptually; no active proof findings reference `artifact-validators.ts`, `artifact.ts`, or `contract.ts` for coverage/gate behavior. If `ana proof context packages/cli/src/commands/artifact.ts packages/cli/src/commands/artifact-validators.ts packages/cli/src/types/contract.ts` surfaces findings at build time, prioritize any tagged `risk` that overlaps the save-flow wiring. No active proof findings for affected files at plan time.

### Checkpoint Commands
- After `artifact-validators.ts` (extractor + gate): `(cd packages/cli && pnpm vitest run tests/commands/coverage-gate.test.ts tests/commands/scope-ac-corpus.test.ts)` — Expected: all green; corpus sweep reports `0` false-ambiguous / `0` empty-extraction.
- After `artifact.ts` wiring: `(cd packages/cli && pnpm vitest run tests/commands/artifact.test.ts)` — Expected: existing save tests still pass (gate no-ops on their `1.0` contracts).
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: baseline + new tests pass, count does not decrease.
- Lint: `(cd packages/cli && pnpm run lint)`.

### Build Baseline
Run `(cd packages/cli && pnpm vitest run)` and record exact counts before writing code. (Approximate at plan time: ~159 test files; do not trust this number — measure.)
- Current tests: {run the command, record exact}
- Current test files: {record exact}
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected baseline + new tests across 2 new test files.
- Regression focus: `tests/commands/artifact.test.ts`, `tests/commands/verify.test.ts` (anything exercising contract save — they all use `1.0` contracts, so the gate must stay inert).
