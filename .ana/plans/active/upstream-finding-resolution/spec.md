# Spec: Upstream Finding Resolution

**Created by:** AnaPlan
**Date:** 2026-05-15
**Scope:** .ana/plans/active/upstream-finding-resolution/scope.md

## Approach

Five additive changes along the existing verify_data → proof chain → proof stale data flow. Every change follows an existing pattern in the same file. No new subsystems, no new commands, no schema version bump (the field is optional).

**Data flow:** Verify reads proof context (now with IDs) → Verify writes `resolves` in verify_data.yaml → `validateVerifyDataFormat` validates it → `ProofSummary`/`ProofChainEntry` types carry it → `writeProofChain` passthrough preserves it → `work complete` emits summary → `ana proof stale` computes and displays resolution claims.

**Key design decisions:**

1. **`resolves` follows the `related_assertions` pattern exactly.** Same validation shape (optional array of strings), same type placement, same passthrough behavior. The structural analog is `related_assertions` in artifact.ts:894-906.

2. **`computeResolutionClaims` is a separate pure function, not part of `computeStaleness`.** Staleness is about file-modification signals. Resolution claims are about cross-references between findings. Different concepts, different functions. The stale command calls both and renders both sections.

3. **Finding ID format validation is a warning, not an error.** Regex `/^[a-z0-9-]+-C\d+$/` catches typos without blocking saves. Verify might reference an ID from a chain that doesn't exist locally, or misspell one — a warning surfaces this without breaking the pipeline.

4. **`resolves` on non-upstream findings produces a warning.** Matches the existing pattern at artifact.ts:912-914 where missing `file` on non-upstream findings is a warning.

## Output Mockups

### `ana proof context` (AC1)

```
Proof context for src/commands/work.ts
Touched in 17 pipeline cycles (last: 2026-05-14)

Findings:
  [code] (slug-C1) getNextAction — multi-line return breaks status output formatting
         From: work complete --merge flag

  [upstream] (slug-C3) Contract A003 value stale — says max 50 but implementation uses 100
         From: Close the Loop
```

The finding ID appears parenthesized after the category tag, before the anchor. Visually distinct from the existing `[category] anchor —` pattern.

### `work complete` summary (AC5)

```
✓ PASS — Feature Name
  5/5 satisfied · 0 deviations
  Chain: 12 runs · 34 findings (+3 new)
  Verify claims 2 findings resolved — review with `ana proof stale`
```

The claims line appears only when upstream findings contain `resolves` arrays. Same gray styling as the health line.

### `ana proof stale` with resolution claims (AC6)

```
Stale Findings: 3 findings with staleness signals

High confidence (3+ subsequent entries modified the file):
  F001 [risk] Missing validation — src/api/payments.ts
    Modified by: entry-2, entry-3, entry-4 (3 entries)
    Created in: entry-1 (2026-04-20)

Verify resolution claims:
  slug-C5 claims slug-A-C2 resolved
    "Contract A003 value corrected in this build"
    Original: [risk] Missing validation — src/api/payments.ts (active)
```

The resolution claims section appears after the existing staleness sections. Omitted entirely when no claims exist (AC7).

### verify_data.yaml with `resolves` (AC2)

```yaml
schema: 1
findings:
  - category: upstream
    summary: "Contract A003 value corrected in this build"
    severity: observation
    suggested_action: monitor
    resolves:
      - "previous-slug-C2"
      - "other-slug-C7"
```

## File Changes

### `src/types/proof.ts` (modify)
**What changes:** Add optional `resolves?: string[]` to the findings array type in both `ProofChainEntry` (line 67-82) and move it alongside `related_assertions`.
**Pattern to follow:** `related_assertions?: string[]` on the same type — same position, same optionality.
**Why:** Without the type, `resolves` would be silently stripped by the spread operator in `writeProofChain` when mapping findings through `ProofChainEntry['findings'][0]`.

### `src/utils/proofSummary.ts` (modify)
**What changes:** Three modifications:
1. Add `resolves?: string[]` to `ProofSummary.findings` array type (line 70-79).
2. Add `resolves?: string[]` to `ProofContextResult.findings` array type (line 2013-2028) and populate it in `getProofContext` (line 2157-2171).
3. Add new `computeResolutionClaims` pure function and `ResolutionClaim` interface.
**Pattern to follow:** `computeStaleness` for the pure function shape — takes a loose chain type, returns a typed result, caller handles I/O. `related_assertions` for the field additions.
**Why:** ProofSummary is the intermediate type between verify_data parsing and proof chain writing. Without `resolves` here, the field drops during the mapping at work.ts:902-906. `computeResolutionClaims` must be pure and in proofSummary.ts to match the existing computation/display separation.

### `src/commands/artifact.ts` (modify)
**What changes:** Add `resolves` validation in `validateVerifyDataFormat` (after the `related_assertions` block at line 894-906). Three checks: (1) if present, must be array, (2) elements must be strings, (3) format warning for IDs not matching `{slug}-C{N}` pattern. Plus: warning when `resolves` appears on non-upstream findings.
**Pattern to follow:** The `related_assertions` validation block at lines 894-906 — identical structure. The non-upstream file warning at line 912-914 for the category-conditional warning.
**Why:** Explicit validation surfaces typos and misuse early. Without it, `resolves` passes through silently regardless of content because the validator ignores unknown fields.

### `src/commands/proof.ts` (modify)
**What changes:** Two modifications:
1. `formatContextResult` (line 2280-2323): Add finding ID to the display line, parenthesized after the category tag.
2. Stale command action (line 2180-2267): After computing staleness, call `computeResolutionClaims`, render a "Verify resolution claims" section. Include in JSON output. Skip section when empty.
**Pattern to follow:** The existing stale display sections at lines 2236-2266 — same indentation, same formatting. The finding display line format at line 2303 for the ID insertion point.
**Why:** proof context without IDs is the root blocker — Verify can't cite what it can't see. The stale section is where resolution claims surface for humans and Learn.

### `src/commands/work.ts` (modify)
**What changes:** Two modifications:
1. `writeProofChain` finding mapping (line 902-906): No code change needed if the spread operator (`...c`) already passes through `resolves`. Verify by checking that `ProofSummary.findings` includes the field — the spread handles passthrough.
2. Summary output (line 1695-1714): After the health change line, count upstream findings with `resolves` arrays in the new entry and emit the claims summary line.
**Pattern to follow:** Health change notification at lines 1704-1713 — same gray styling, same conditional emission.
**Why:** The summary line is the developer's first signal that resolution claims exist, directing them to `ana proof stale`.

### `.claude/agents/ana-verify.md` (modify)
**What changes:** Update the staleness awareness instruction (around line 102) to include structured `resolves` field usage. Add `resolves` to the verify_data.yaml example and optional fields list.
**Pattern to follow:** The existing instruction block structure — keep the same voice and density.
**Why:** Verify needs to know about `resolves` to use it. The instruction update + proof context IDs + schema support form the complete information flow.

### `templates/.claude/agents/ana-verify.md` (modify)
**What changes:** Identical changes to the dogfood instance above.
**Pattern to follow:** Same content as `.claude/agents/ana-verify.md`.
**Why:** Template is what new users get on init. Agent definitions aren't overwritten on re-init, so both must be updated explicitly (AC8).

## Acceptance Criteria

- [ ] AC1: `ana proof context {file}` human-readable output includes the finding ID for each finding (e.g., `[code] (proof-intelligence-hardening-C13) Lesson command catch block...`)
- [ ] AC2: `verify_data.yaml` accepts an optional `resolves` field (array of strings) on upstream-category findings. Validation passes when present with valid finding IDs, passes when absent, errors when present with wrong type.
- [ ] AC3: `resolves` field on non-upstream findings produces a validation warning (not error — don't block saves, but it's likely a mistake)
- [ ] AC4: `work complete` processing: when an upstream finding has a `resolves` array, the proof chain entry preserves the field on the finding object. No auto-close of referenced findings.
- [ ] AC5: `work complete` emits a summary line when upstream findings contain `resolves` claims (e.g., "Verify claims N findings resolved — review with `ana proof stale`")
- [ ] AC6: `ana proof stale` includes a new section: "Verify resolution claims" — listing upstream findings with `resolves` fields whose referenced finding IDs are still active. Shows the upstream claim summary and the original finding ID.
- [ ] AC7: `ana proof stale` resolution claims section is empty (not shown) when no unresolved claims exist
- [ ] AC8: ana-verify.md staleness awareness instruction tells Verify to: use finding IDs from proof context output, populate the `resolves` field in verify_data.yaml for upstream findings, include the original finding ID (not just the description). Applied to BOTH template and dogfood instance.
- [ ] AC9: Existing upstream findings without `resolves` field continue to work — no migration needed, no breakage of existing proof chain entries
- [ ] AC10: All new behavior has test coverage
- [ ] AC11: Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] AC12: No build errors — `(cd packages/cli && pnpm run build)`

## Testing Strategy

- **Unit tests for `validateVerifyDataFormat`** (artifact.test.ts): Extend the existing `describe('validateVerifyDataFormat')` block. Test: valid `resolves` on upstream finding (no error), missing `resolves` (no error — optional), `resolves` as non-array (error), `resolves` with non-string elements (error), `resolves` with invalid ID format (warning), `resolves` on non-upstream finding (warning).
- **Unit tests for `computeResolutionClaims`** (proofSummary.test.ts): New `describe('computeResolutionClaims')` block following the `computeStaleness` test structure. Test: finds claims where referenced ID is still active, skips claims where referenced ID is closed, skips claims where referenced ID doesn't exist, deduplicates multiple claims on same original (most recent wins), empty result when no claims exist.
- **Unit tests for `formatContextResult`** (proof.test.ts): The existing proof context tests use CLI invocation via exec. Add tests or verify existing tests cover the ID in output. If `formatContextResult` is not exported, test through the command integration tests.
- **Unit tests for work complete summary** (work.test.ts): Test that upstream findings with `resolves` produce the summary line. Test that upstream findings without `resolves` don't produce it.
- **Edge cases:** Old chain entries without `resolves` (backward compat), `resolves` referencing non-existent IDs (silent skip), multiple upstream findings claiming same original (dedup), `resolves` empty array (valid, no claims emitted).

## Dependencies

- No external dependencies. All changes are within existing files.
- `computeResolutionClaims` depends on proof chain data — same as `computeStaleness`.

## Constraints

- **Backward compatibility.** Old proof chain entries and old verify_data files lack `resolves`. All consumers must handle `undefined`. The field is optional everywhere in the type chain.
- **No auto-close.** `resolves` is a claim, not an action. No code should close findings based on `resolves`. The scope explicitly rejects auto-close (Option A).
- **proofSummary.ts is ~1550 lines.** The new function adds ~60 lines. Acceptable — the file is the computation layer for proof intelligence.

## Gotchas

- **The CROSS-CUTTING warning in proof.ts:16-21.** Adding `resolves` requires changes in 4 locations: type definition (proof.ts), ProofSummary type (proofSummary.ts), verify_data validation (artifact.ts), and display (proof.ts). Miss one and the field silently drops.
- **`writeProofChain` finding mapping uses spread (`...c`).** The spread at work.ts:902 passes through all fields from `ProofSummary.findings` to `ProofChainEntry.findings`. But it then casts `as ProofChainEntry['findings'][0]` — if `resolves` isn't on that type, TypeScript would still allow it at runtime (spread doesn't strip), but the type mismatch could cause confusion. Add `resolves` to both types.
- **`getProofContext` builds `ProofContextResult` findings by manual property copying (proofSummary.ts:2157-2171).** It doesn't use spread — each field is explicitly copied. `resolves` must be added to the manual copy block, or it won't appear in proof context output. Same pattern as `related_assertions` at line 2170.
- **proof context format is consumed by agents.** The ID format `(slug-C13)` is new information in the output. Verify's instruction update handles this. Learn also reads proof context — the IDs benefit Learn too, no instruction change needed there.
- **Stale command JSON output.** Resolution claims must be included in the JSON envelope when `--json` is passed. Follow the existing pattern where `computeStaleness` result is wrapped via `wrapJsonResponse`.
- **Two ana-verify.md files.** Template (`templates/.claude/agents/ana-verify.md`) and dogfood (`.claude/agents/ana-verify.md`). Both must receive identical changes. Agent definitions are NOT overwritten on re-init.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Explicit return types on all exported functions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Prefer early returns over nested conditionals.
- `| null` for checked-and-empty fields; `?:` for optional fields that may not have been checked.
- Always pass `--run` flag when running vitest.
- Assert on specific expected values, not existence checks.
- Use `fs.mkdtemp` for temp directories in tests.

### Pattern Extracts

**Structural analog — `related_assertions` validation (artifact.ts:894-906):**
```typescript
      // related_assertions optional, but if present must be array of strings
      if (ra !== undefined) {
        if (!Array.isArray(ra)) {
          errors.push(`${prefix}: "related_assertions" must be an array`);
        } else {
          for (const item of ra) {
            if (typeof item !== 'string') {
              errors.push(`${prefix}: "related_assertions" elements must be strings`);
              break;
            }
          }
        }
      }
```

**Non-upstream warning pattern (artifact.ts:912-914):**
```typescript
      } else if (!file && cat !== 'upstream' && typeof cat === 'string') {
        warnings.push(`Finding ${i + 1} (category: ${cat}) has no file reference.`);
      }
```

**Finding display in proof context (proof.ts:2300-2305):**
```typescript
    for (const finding of result.findings) {
      const anchor = finding.anchor ? ` ${finding.anchor} —` : '';
      const truncatedSummary = truncateSummary(finding.summary, 250);
      lines.push(`  ${chalk.dim(`[${finding.category}]`)}${anchor} ${truncatedSummary}`);
      lines.push(`         ${chalk.gray(`From: ${finding.from}`)}`);
      lines.push('');
    }
```

**Stale section rendering (proof.ts:2236-2250):**
```typescript
      if (result.high_confidence.length > 0) {
        console.log('');
        console.log('High confidence (3+ subsequent entries modified the file):');
        for (const f of result.high_confidence) {
          console.log(`  ${f.id} [${f.severity}] ${f.summary} — ${f.file}`);
          const slugList = f.subsequent_slugs.length <= 3
            ? f.subsequent_slugs.join(', ')
            : `${f.subsequent_slugs.slice(0, 3).join(', ')}, ... (${f.subsequent_count} entries)`;
          console.log(`    Modified by: ${slugList} (${f.subsequent_count} ${f.subsequent_count !== 1 ? 'entries' : 'entry'})`);
```

**Health change notification pattern (work.ts:1704-1713):**
```typescript
    if (healthChange.changed && healthChange.details.length > 0) {
      let healthLine = `  Health: ${healthChange.details.join(' · ')}`;
      if (healthChange.triggers.includes('new_candidates')) {
        healthLine += ' → claude --agent ana-learn';
      } else if (healthChange.triggers.includes('trend_worsened')) {
        healthLine += ' → ana proof audit';
      }
      console.log(chalk.gray(healthLine));
    }
```

**computeStaleness function signature (proofSummary.ts:1124-1141):**
```typescript
export function computeStaleness(
  chain: {
    entries: Array<{
      slug?: string;
      completed_at?: string;
      modules_touched?: string[];
      findings?: Array<{
        id?: string;
        status?: string;
        severity?: string;
        category?: string;
        summary?: string;
        file?: string | null;
      }>;
    }>;
  },
  options?: { afterSlug?: string; minConfidence?: 'high' | 'medium' },
): import('../types/proof.js').StalenessResult {
```

### Proof Context

**src/types/proof.ts:**
- [code] commit_hygiene type duplicated in three locations — not relevant to this build, but be aware the type file has multiple consumers.

**src/commands/work.ts:**
- [code] Two different result parsers with different casing — not relevant, but shows the file has coupling patterns.
- [build concern] Main path re-reads proof_chain.json because writeProofChain returns stats not chain — relevant: the summary line must count `resolves` from the entry being written, not from a chain re-read. Count from `entry.findings` before the chain write.

**src/utils/proofSummary.ts:**
- [code] proofSummary.ts ~1550 lines — past comfort threshold. New function adds ~60 lines. Acceptable given the computation belongs here.
- [build concern] stale command uses direct string comparison on file paths — not directly relevant but shows path matching is simple equality.

### Checkpoint Commands

- After type changes (proof.ts, proofSummary.ts): `(cd packages/cli && pnpm run build)` — Expected: clean compile
- After validation changes (artifact.ts): `(cd packages/cli && pnpm vitest run tests/commands/artifact.test.ts)` — Expected: all existing tests pass + new tests pass
- After proofSummary changes: `(cd packages/cli && pnpm vitest run tests/utils/proofSummary.test.ts)` — Expected: all existing tests pass + new tests pass
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2297+ tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2297 passed, 2 skipped (2299 total)
- Current test files: 104
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2320+ tests in 104 test files (new tests added to existing files)
- Regression focus: proof.test.ts (context output format), artifact.test.ts (validation), proofSummary.test.ts (staleness computation), work.test.ts (complete flow)
