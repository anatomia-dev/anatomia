# Spec: Remove `processCaptureStrict` — provenance records-and-annotates, never blocks

**Created by:** AnaPlan
**Date:** 2026-06-08
**Scope:** .ana/plans/active/remove-processcapturestrict/scope.md

## Approach

This is a pure deletion. `processCaptureStrict` is an unreleased config flag whose only job was to `process.exit(1)` at `ana work complete` when recorded process provenance was incomplete. Remove the guard and the flag from every config surface. The recorder — `assembleProcessAttestation` (gated on `processCapture` alone, always attaches a `completeness` block with gaps even for zero sessions) — is already the desired end-state and is **not modified**. After this lands the model is two-state: `processCapture` on = best-effort capture + always-annotated completeness; off = no provenance recorded. There is no third flag and no blocking path.

No back-compat code. `processCaptureStrict` shipped only on unreleased `main` (absent from the `v1.2.2` tag), our dogfood config never set it, and `AnaJsonSchema` already uses `.passthrough()` — so any stray key is tolerated without special handling. If you find yourself writing migration, inert-key tolerance, or a scrub step, stop.

**Deletion is larger than a single import.** Removing the guard block in `work.ts` orphans three imports (see File Changes). Leaving any of them trips the no-unused-import lint. This is the one place the delete needs care.

**Test rebalance — read this, it overrides the scope's AC7.** The scope called test-count parity a "hard CI constraint." That is factually wrong: there is no mechanical count gate. The real enforced gate is the **coverage thresholds in `packages/cli/vitest.config.ts`** (lines 80 / branches 75 / functions 80 / statements 80). Removing strict deletes code (numerator) and its tests (denominator) together, keeping the ratio neutral — so thresholds should hold. **Verify the thresholds pass; do not chase an integer test count.** The intent behind "count must not decrease" is to stop silent coverage erosion — that is not happening here: behavioral coverage of the surviving record path goes *up* (3 guard tests → ≥4 stronger ones), and only flag-existence plumbing tests are removed alongside the flag they covered. Do **not** pad with "assert the deleted field is absent" tests — that violates *every character earns its place* and *the elegant solution removes* to satisfy a number nothing enforces. Net count may dip ~−4. That is correct, not a regression.

## Output Mockups

`ana doctor` Enforcement view — BEFORE (three sub-lines):

```
  ℹ Enforcement
      test-evidence gate  off
      process capture     off
      strict              off
```

`ana doctor` Enforcement view — AFTER (two sub-lines, no `strict`):

```
  ℹ Enforcement
      test-evidence gate  off
      process capture     off
```

`ana work complete {slug}` with `processCapture: "on"` and incomplete provenance — BEFORE this change would `process.exit(1)` with "Process provenance is incomplete and processCaptureStrict is on." AFTER: completion proceeds normally, the proof-chain entry is written, and the entry's `process.completeness` records `complete: false` with the gap listed. No error, no block.

## File Changes

### packages/cli/src/commands/work.ts (modify)
**What changes:** Delete the §8b-strict guard. Remove the doc comment + block at **lines 1081–1119** (the `// 8b-strict.` comment through the closing `}` of the `if (isProcessCaptureStrictEnabled(...))` block). Then fix the three imports the deletion orphans:
- **Line 34** — delete the whole line: `import { isProcessCaptureStrictEnabled } from '../utils/forensics.js';`
- **Line 33** — delete the whole line: `import type { SessionProvenance } from '../types/proof.js';` (used only inside the deleted block — verified no other use in this file).
- **Line 32** — `import { writeProofChain, guardFailResult, computeCompleteness } from './work-proof.js';` → remove **only** `computeCompleteness`. Keep `writeProofChain` and `guardFailResult` (both still used 4×).
**Pattern to follow:** This is the inverse of commit `47e228ff [cross-machine-provenance:s2] Add strict completeness guard to work complete` — that commit added exactly this block; reverse it.
**Why:** The guard blocks the proof *record*, not the merge — in `--merge` the PR has already merged when it fires, so you land code and keep no audit trail. Metadata must never block a terminal pipeline action. After deletion, confirm §8b (artifact-saved guards, ends ~line 1079) and §8c (worktree metadata, starts line 1121) sit adjacent and intact. Do **not** touch `computeCompleteness`'s definition or the recorder's call to it.

### packages/cli/src/utils/forensics.ts (modify)
**What changes:** Delete `isProcessCaptureStrictEnabled` and its JSDoc doc comment — **lines 271–292**. Leave `isProcessCaptureEnabled` (lines 260–268) byte-for-byte unchanged.
**Pattern to follow:** `isProcessCaptureEnabled` directly above is the sibling that survives.
**Why:** Dead reader once the guard is gone.

### packages/cli/src/commands/init/anaJsonSchema.ts (modify)
**What changes:** Delete the `processCaptureStrict` schema field and its leading comment — **lines 116–123** (the `// No \`.default\` — same migration-safe posture as processCapture...` comment block through the `.catch(undefined),` of the `processCaptureStrict` field). Leave the `processCapture` field above untouched.
**Pattern to follow:** The surrounding `processCapture` / `testEvidenceGate` fields stay; mirror their absence-handling, don't add any.
**Why:** Remove the flag from the schema surface. `.passthrough()` already tolerates unknown keys — no replacement needed.

### packages/cli/src/commands/init/state.ts (modify)
**What changes:** In `createAnaJson`, delete the `processCaptureStrict: 'off',` emit (**line 583**) and its leading comment (**lines 580–582**, the `// Default OFF (warn-and-record)...` block). Leave the `processCapture: 'off'` emit above untouched.
**Why:** A new project's `ana.json` must contain no `processCaptureStrict` key.

### packages/cli/src/commands/config.ts (modify)
**What changes:** Remove `'processCaptureStrict',` from the `KNOWN_FIELDS` set (**line 62**). Leave `'processCapture'` above it.
**Why:** The flag is no longer a known config field.

### packages/cli/src/commands/doctor.ts (modify)
**What changes:** Remove `process_capture_strict` from the Enforcement dimension in all four places:
- Interface field `process_capture_strict: 'on' | 'off';` (**line 109**)
- The error-fallback return literal (**line 459**) — drop `process_capture_strict: 'off'`
- The assessor read (**line 471**) — drop `process_capture_strict: anaContent['processCaptureStrict'] === 'on' ? 'on' : 'off',`
- The terminal render line (**line 693**) — drop `lines.push(\`      ${'strict'.padEnd(20)}${d.enforcement.process_capture_strict}\`);`
**Pattern to follow:** `process_capture` is the sibling field that survives across all four sites — keep it everywhere, remove only the `strict` twin.
**Why:** After this scope the Enforcement view surfaces exactly two flags: `test_evidence_gate` and `process_capture`.

### packages/cli/tests/commands/work.test.ts (modify)
**What changes:** In the `describe('strict process-completeness guard (Phase 2)')` block (starts **line 1402**):
- **Rename** the describe away from "strict" — e.g. `describe('process provenance recording')`.
- **Modify** the `setCaptureFlags` helper (line 1404) to drop the `processCaptureStrict` param and stop writing it — it should set only `processCapture`.
- **Keep** helpers `seedActiveProvenance` (1413) and `readChainEntry` (1444).
- **Remove** all three strict `it()` tests: "blocks completion with exit 1..." (1452), "after a strict block, flipping strict off..." (1479), "strict on + complete proof..." (1521).
- **Add** the replacement behavioral tests below (AC2, AC2-zero, AC3).
**Why:** The record path is now the sole path and earns the coverage the guard tests held — as positive-behavior assertions, not absence checks.

### packages/cli/tests/commands/work-merge.test.ts (modify)
**What changes:** Add the keystone `--merge` regression test (see Testing Strategy). This file already has the `vi.mock('node:child_process')` + `mockGh` harness and a local `createMergedProject` — use them.
**Pattern to follow:** The existing merge tests in this file (the `mockGh` handler pattern starting ~line 117, the `createMergedProject` helper ~line 74).
**Why:** The `--merge` inversion is the exact disease this scope cures. This is the highest-value regression guard in the change.

### packages/cli/tests/commands/doctor.test.ts (modify)
**What changes:**
- **Remove** the `@ana A010` test "reports process_capture_strict 'on' when the flag is set" (**lines 658–663**).
- **Modify** "defaults all three gates to off..." (**line 665**) — drop the `process_capture_strict` assertion (line 670); the test now asserts the two surviving gates.
- **Modify** "always carries status 'info'..." (**line 674**) — drop `processCaptureStrict: 'on'` from the anaJson input (line 675); keep the rest.
- **Add** the AC5 test(s): doctor's enforcement output no longer contains `process_capture_strict`, and still reports the two surviving flags (see Testing Strategy).
**Why:** Doctor's Enforcement surface drops the strict twin.

### packages/cli/tests/commands/config.test.ts (modify)
**What changes:** Remove the `@ana A018` test "does not warn when setting processCaptureStrict" (**lines 380–388**).
**Why:** Once `processCaptureStrict` leaves `KNOWN_FIELDS`, the test asserting it is a known field is obsolete. Do **not** replace it with a "now warns" test — that is testing the deleted flag's absence (padding).

### packages/cli/tests/commands/init.test.ts (modify)
**What changes:**
- **Modify** "createAnaJson writes processCaptureStrict: off" (**lines 134–144**, `@ana A032`) → rename to "createAnaJson emits no processCaptureStrict key" and flip both assertions to `toBeUndefined()` (the field must be absent from both the returned config and the written JSON).
- **Remove** "keeps an explicit processCaptureStrict: on through a re-init merge" (**lines 802–833**, `@ana A033`).
**Why:** New projects must not emit the key; re-init preservation of a deleted flag is moot.

### packages/cli/tests/commands/init/anaJsonSchema.test.ts (modify)
**What changes:** Remove the entire `describe('processCaptureStrict enum values')` block (**lines 237–258**, 4 `it()` tests: accepts on / accepts off / catches invalid / absence yields undefined).
**Why:** Pure schema-existence tests for a deleted field. Removed with the field; not replaced (replacements would be absence checks = padding).

## Acceptance Criteria

- [ ] AC1: `ana work complete` never blocks on incomplete process provenance — no code path exits non-zero on a provenance gap.
- [ ] AC2: With `processCapture: "on"` and incomplete provenance (verify session missing), `work complete` writes the proof-chain entry and the entry's `process.completeness` records the gap (`complete: false`, gap listed) — recorded, not hidden, not blocked.
- [ ] AC3: The record path is unchanged: with full provenance, the attestation and `completeness.complete: true` match pre-change output for the same inputs.
- [ ] AC4: `processCaptureStrict` is gone from the schema, `createAnaJson` output, and `KNOWN_FIELDS`; a new project's `ana.json` contains no `processCaptureStrict` key.
- [ ] AC5: `ana doctor`'s Enforcement view reports `test_evidence_gate` and `process_capture` only — no strict line — and `ana doctor` still exits 0 on valid config.
- [ ] AC6: `isProcessCaptureStrictEnabled` and `processCaptureStrict` no longer exist anywhere in `packages/cli/src` (grep → zero); `processCapture` / `isProcessCaptureEnabled` / `computeCompleteness` / `assembleProcessAttestation` are unchanged.
- [ ] AC7 (REFRAMED — supersedes the scope): Behavioral coverage of the surviving record path is ≥ prior (the 3 guard tests replaced by ≥4 stronger ones, including the `--merge` keystone); flag-plumbing tests are removed with the flag they covered; **`vitest.config.ts` coverage thresholds still pass** (lines 80 / branches 75 / functions 80 / statements 80). A net total-test-count dip (~−4) is expected and correct — it is not a regression. There is no mechanical count gate; the coverage thresholds are the real constraint.
- [ ] `(cd packages/cli && pnpm vitest run)` passes (no new failures vs baseline 3587 passed / 2 skipped).
- [ ] `(cd packages/cli && pnpm run lint)` clean — specifically no `no-unused-vars` on the trimmed work.ts imports.
- [ ] `(cd packages/cli && pnpm run build)` succeeds.

## Testing Strategy

- **Replacement behavioral tests (work.test.ts, in the renamed provenance describe block):**
  - **AC2 — incomplete records and completes:** `createMergedProject({ slug: 'test-slug', phases: 1 })`; `setCaptureFlags('on')`; seed plan + build provenance, **omit verify**; commit. Call `completeWork('test-slug')` and assert it **resolves** (no `process.exit` throw). Assert `readChainEntry('test-slug')` is non-null, the completed dir exists, and `entry.process.completeness.complete === false` with the gap naming `verify`. This is the positive inverse of the deleted block-and-write-nothing test.
  - **AC2-zero — zero sessions still recorded as incomplete:** same setup, seed **no** provenance files; assert completion resolves, entry written, `completeness.complete === false`. Confirms zero-session gaps are recorded, not hidden.
  - **AC3 — full provenance marks complete (record path unchanged):** seed plan + build + verify; assert completion resolves, entry written, `completeness.complete === true`. This is the golden record-path assertion.
- **Keystone --merge regression test (work-merge.test.ts):** Using this file's `mockGh` + `createMergedProject` harness, set `processCapture: 'on'`, seed incomplete provenance (omit verify), and call `completeWork('test-slug', { merge: true })`. Assert: the gh merge proceeds (mock records the merge call) **AND** the proof-chain entry is still written with `completeness.complete === false`. This proves the inversion (merge lands, proof refused) can never return.
- **AC5 doctor tests (doctor.test.ts):** With a minimal project (no strict key possible), assert the enforcement `--json` object reports `test_evidence_gate` and `process_capture` and that the serialized enforcement output does **not** contain `process_capture_strict`. Assert `ana doctor` exits 0 on valid config (an existing test may already cover the exit code — extend rather than duplicate).
- **Modified plumbing tests:** init.test.ts createAnaJson → assert no key (`toBeUndefined`). doctor.test.ts 665/674 → drop strict references, keep the surviving assertions.
- **Edge cases:** incomplete provenance where the missing role is plan or build (not just verify) — the gap list must still name the missing role; `--merge` with full provenance still completes and records `complete: true` (the merge path's happy case, if not already covered).

## Dependencies

Both prerequisite scopes are merged on `main`: `enforcement-state-in-doctor` (A — added the doctor Enforcement view this scope edits) and `rename-capturegate-testevidencegate` (B — renamed `test_evidence_gate`). No new dependencies.

## Constraints

- **Do not modify the recorder.** `assembleProcessAttestation` (`work-proof.ts:118–183`), `computeCompleteness` (`work-proof.ts:56–90`), `isProcessCaptureEnabled` (`forensics.ts:260–268`), and all `processCapture` references stay byte-for-byte. Only the guard's *call site* to `computeCompleteness` is removed, never the function or the recorder's call.
- **Coverage thresholds are the real gate** (vitest.config.ts: 80/75/80/80). They must still pass.
- **No back-compat code.** No migration, no inert-key tolerance, no scrub. `.passthrough()` already handles stray keys.
- **Grep precision.** `processCapture` (KEEP) and `processCaptureStrict` (DELETE) differ only by the `Strict` suffix. A sloppy delete catches the recorder.
- **Do not edit prior contracts.** The merged scopes' `contract.yaml` files and historical `@ana` tags (A010, A018, A031–A033, A027–A030, A045/A046) belong to immutable proof entries. Remove only live code and the now-obsolete *tests*, never historical contracts.

## Gotchas

- **Three orphaned imports, not one.** This is the single most likely miss: deleting the guard block leaves `isProcessCaptureStrictEnabled` (line 34), `SessionProvenance` (line 33), and `computeCompleteness` (within the combined import on line 32) unused. Lint will fail. Lines 33 and 34 are whole-line deletes; line 32 keeps `writeProofChain` and `guardFailResult`.
- **Line numbers have drifted from the scope.** The scope cited `work.ts:1117–1155` for the guard; it is actually **1081–1119**. The forensics reader is at **271–292**, not the scope's 271–292 (correct), anaJsonSchema field at **116–123**, state emit at **583**. Trust the numbers in this spec — they were read from the live files this session — but confirm by content (the `if (isProcessCaptureStrictEnabled(...))` line, the `// 8b-strict.` comment) since any edit shifts subsequent numbers.
- **Deletion ordering is not load-bearing here.** The §8b-strict comment warns it must run before destructive steps — but since the whole block is deleted, there is no ordering to preserve. Just confirm §8b and §8c remain adjacent and intact after removal.
- **The scope undercounted the tests.** It missed `config.test.ts:380` (`@ana A018`) and treated `doctor.test.ts:665/674` as removable — they are MODIFY (drop the strict reference, keep the test). This spec lists every test site explicitly.
- **`processCaptureStrict` ≠ `processCapture`.** After the change: `grep -rn "processCaptureStrict\|isProcessCaptureStrictEnabled\|process_capture_strict" packages/cli/src` → zero; `grep -c "processCapture\b\|isProcessCaptureEnabled"` per file → unchanged from baseline.

## Build Brief

### Rules That Apply
- All relative imports end in `.js` and built-ins use `node:` prefix — but this is a deletion task; when trimming the combined import on `work.ts:32`, keep the `.js` extension intact.
- Use `import type` for type-only imports — `SessionProvenance` (line 33) is a type import; delete the whole `import type { ... }` line.
- Avoid disabling lint rules inline — the no-unused-import errors are fixed by removing the imports, not by suppressing.
- Tests live in `packages/cli/tests/`, mirroring `src/` paths — not co-located with source.
- `--merge`-path tests require module-level `vi.mock('node:child_process')`; that mock lives in `work-merge.test.ts` only (it would affect every test in a shared file) — keep the keystone test there, not in `work.test.ts`.

### Pattern Extracts

The guard block to delete (`work.ts:1081–1119`), for unambiguous identification:
```ts
  // 8b-strict. Strict process-completeness guard (Phase 2).
  // MUST run before any destructive/archival step (removeWorktree / cp active→
  // ...
  if (isProcessCaptureStrictEnabled(projectRoot)) {
    const activeProvDir = path.join(activePath, 'provenance');
    const strictSessions: SessionProvenance[] = [];
    // ...
    const completeness = computeCompleteness(activePath, strictSessions);
    if (!completeness.complete) {
      console.error(chalk.red('Error: Process provenance is incomplete and processCaptureStrict is on.'));
      // ...
      process.exit(1);
    }
  }
```

The surviving sibling reader (`forensics.ts:260–268`) — KEEP, shows the shape the deleted `isProcessCaptureStrictEnabled` mirrored:
```ts
export function isProcessCaptureEnabled(projectRoot: string): boolean {
  let anaJson: Record<string, unknown>;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(projectRoot, '.ana', 'ana.json'), 'utf-8')) as unknown;
    anaJson = AnaJsonSchema.parse(raw) as Record<string, unknown>;
  } catch {
    return false;
  }
  return anaJson['processCapture'] === 'on';
}
```

Test helpers to reuse (`work.test.ts:1404–1449`) — `setCaptureFlags` (drop the strict param), `seedActiveProvenance`, `readChainEntry`:
```ts
function setCaptureFlags(processCapture: 'on' | 'off', processCaptureStrict: 'on' | 'off'): void {
  fsSync.writeFileSync(
    path.join(tempDir, '.ana', 'ana.json'),
    JSON.stringify({ artifactBranch: 'main', processCapture, processCaptureStrict }),
    'utf-8',
  );
}
// → becomes: setCaptureFlags(processCapture: 'on' | 'off') writing only { artifactBranch, processCapture }

function readChainEntry(slug: string): { process?: { completeness?: { complete?: boolean } } } | null {
  const chainPath = path.join(tempDir, '.ana', 'proof_chain.json');
  if (!fsSync.existsSync(chainPath)) return null;
  const chain = JSON.parse(fsSync.readFileSync(chainPath, 'utf-8'));
  return chain.entries.find((e: { slug: string }) => e.slug === slug) ?? null;
}
```

### Proof Context
Run `ana proof context packages/cli/src/commands/work.ts packages/cli/src/commands/doctor.ts` if you want the institutional history before editing — `work.ts` has 27+ prior cycles on the completion path. No blocker-severity active findings were surfaced for these files during planning. The completion path is hot and fragile: after the work.ts deletion, run the full completion suite (`work.test.ts`, `work-merge.test.ts`, `work-proof-process.test.ts`) to confirm no surrounding guard regressed.

### Checkpoint Commands
- After work.ts + forensics.ts edits: `(cd packages/cli && pnpm vitest run tests/commands/work.test.ts tests/commands/work-merge.test.ts tests/commands/work-proof-process.test.ts)` — Expected: pass (after you've added the replacement tests).
- After doctor.ts edits: `(cd packages/cli && pnpm vitest run tests/commands/doctor.test.ts)` — Expected: pass.
- After config/init/schema edits: `(cd packages/cli && pnpm vitest run tests/commands/config.test.ts tests/commands/init.test.ts tests/commands/init/anaJsonSchema.test.ts)` — Expected: pass.
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: ~3583 passed / 2 skipped (baseline 3587 minus ~6 net removed plumbing tests + ~4 added behavioral). No failures.
- Coverage gate: `(cd packages/cli && pnpm vitest run --coverage)` — Expected: thresholds 80/75/80/80 still pass.
- Lint: `(cd packages/cli && pnpm run lint)` — Expected: clean (watch the trimmed work.ts imports).

### Build Baseline
- Current tests: **3587 passed | 2 skipped (3589 total)**
- Current test files: **146**
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expect a net dip of ~4 (remove ~10 flag tests, add ~6 behavioral/doctor tests) → ~3583 passing. This is expected and correct — see AC7 reframed.
- Real gate: **coverage thresholds in vitest.config.ts (lines 80 / branches 75 / functions 80 / statements 80)** must still pass.
- Regression focus: `work.test.ts`, `work-merge.test.ts`, `work-proof-process.test.ts` (completion path), `doctor.test.ts` (Enforcement view).
