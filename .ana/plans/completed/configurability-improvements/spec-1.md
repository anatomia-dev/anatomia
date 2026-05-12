# Spec: Schema Passthrough and Verify Agent Skills

**Created by:** AnaPlan
**Date:** 2026-05-11
**Scope:** .ana/plans/active/configurability-improvements/scope.md

## Approach

Two independent changes bundled because they're both small and share the configurability consistency motivation.

**Change 1: Schema passthrough.** Replace `.strip()` with `.passthrough()` on `AnaJsonSchema` so unknown top-level keys survive re-init. The merge path in `preserveUserState()` already uses spread (`{ ...parsed.data, anaVersion, lastScanAt }`) — with passthrough, unknown keys flow through the spread unchanged. No consumer code changes needed — all 4 consumers access only known fields (verified by scope exploration, no `Object.keys()` or property enumeration on the parsed result).

The doc comment at the top of `anaJsonSchema.ts` describes `.strip()` as intentional design ("strips orphaned fields"). Update it to reflect the new passthrough behavior — otherwise the next developer reads the comment and thinks passthrough is a bug.

**Change 2: Verify agent skills.** Add `skills: [testing-standards, coding-standards]` to the verify agent template frontmatter and update step 7's body text. Currently verify's step 7 says "Invoke after reading contracts: `/testing-standards`... `/coding-standards`..." — this manual invocation is inconsistent with plan and build agents which use frontmatter-based auto-loading. The step should change to inform the agent that skills are auto-loaded, not instruct it to invoke them.

Both the template file and the dogfood copy must be updated identically. The existing dogfood sync test (`agent-proof-context.test.ts`) enforces byte-identical match.

## Output Mockups

**Change 1 — passthrough behavior:**
```
# Before: unknown keys stripped on re-init
$ cat .ana/ana.json  # has "branchPrefix": "dev/", "myTeamSetting": true
$ ana init .
$ cat .ana/ana.json  # branchPrefix preserved (schema field), myTeamSetting GONE

# After: unknown keys preserved
$ cat .ana/ana.json  # has "branchPrefix": "dev/", "myTeamSetting": true
$ ana init .
$ cat .ana/ana.json  # both preserved
```

**Change 2 — agents dashboard after skills added:**
```
$ ana agents
Agents:
  ana          14,883 chars  0 skills  ...
  ana-build    32,100 chars  1 skill   ...
  ana-plan     28,500 chars  2 skills  ...
  ana-verify   25,200 chars  2 skills  ...  <-- was 0 skills
```

## File Changes

### `packages/cli/src/commands/init/anaJsonSchema.ts` (modify)
**What changes:** Replace `.strip()` with `.passthrough()` on the schema chain (line 49). Update the doc comment (lines 1-27) to describe passthrough behavior instead of strip behavior.
**Pattern to follow:** The `.catch()` + `.default()` pattern on each field is unchanged — passthrough only affects unknown keys.
**Why:** Without this, any unknown top-level key in ana.json is silently deleted on `ana init` re-run. This is a data-loss footgun that blocks `config set` on custom keys.

### `packages/cli/tests/commands/init/anaJsonSchema.test.ts` (modify)
**What changes:** Three existing tests assert stripping behavior — flip them to assert preservation. Add tests for: unknown keys surviving parse, passthrough not interfering with `.catch()` defaults on known fields.
**Pattern to follow:** Existing test structure in the file — `describe` groups by behavior category, each test with clear setup/act/assert.
**Why:** Tests must match the new passthrough behavior. The strip-assertion tests would fail after the schema change.

### `packages/cli/templates/.claude/agents/ana-verify.md` (modify)
**What changes:** Add `skills: [testing-standards, coding-standards]` to the frontmatter block. Rewrite step 7 body to inform the agent that skills are auto-loaded via frontmatter rather than instructing manual invocation.
**Pattern to follow:** `ana-build.md` frontmatter (line 5: `skills: [git-workflow]`) and `ana-plan.md` frontmatter (line 5: `skills: [coding-standards, testing-standards]`) for the skills declaration pattern.
**Why:** Verify is the only pipeline agent that doesn't declare skills in frontmatter. This makes the `ana agents` dashboard show 0 skills for verify, and the skill loading mechanism is inconsistent with the other agents.

### `.claude/agents/ana-verify.md` (modify)
**What changes:** Byte-identical copy of the template changes above.
**Pattern to follow:** Must match `packages/cli/templates/.claude/agents/ana-verify.md` exactly.
**Why:** Dogfood sync test enforces byte-identical match between template and `.claude/agents/`.

## Acceptance Criteria

- [ ] AC1: Unknown top-level keys in ana.json survive `ana init` re-init (e.g., `"myTeamSetting": true` persists)
- [ ] AC2: `.catch()` defaults still fire for invalid known fields with passthrough active (e.g., `setupPhase: "guided"` still defaults to `undefined`)
- [ ] AC3: `ana-verify` agent template declares `skills: [testing-standards, coding-standards]` in frontmatter
- [ ] AC4: Verify template body text reflects that skills are auto-loaded, not manually invoked
- [ ] AC5: Dogfood verify agent (`.claude/agents/ana-verify.md`) is byte-identical to template
- [ ] AC6: `ana agents` dashboard shows 2 skills for verify
- [ ] AC16: No existing tests break. Test count increases.
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors with `pnpm run build`

## Testing Strategy

- **Unit tests (anaJsonSchema.test.ts):**
  - Flip 3 existing strip-assertion tests to assert preservation: `scanStaleDays` test (line 71: `expect('scanStaleDays' in parsed).toBe(false)` → `toBe(true)`), `setupMode` test (lines 102-103: same flip), and any other strip assertion.
  - Add test: unknown key round-trips through parse unchanged (value preserved, not just key)
  - Add test: passthrough + `.catch()` coexistence — invalid `setupPhase` still defaults while unknown keys survive in the same parse call
- **Integration:** Dogfood sync test already covers AC5 (byte-identical match). No new integration test needed.
- **Edge cases:** Test that `custom` field's `.default({}).catch({})` still works with passthrough active — parse with no `custom` key should still default to `{}`.

## Dependencies

None. Both changes are self-contained.

## Constraints

- Dogfood sync must remain byte-identical — edit both files, not just one.
- The `AnaJson` type widens from `{ known fields }` to `{ known fields } & { [k: string]: unknown }`. All consumers access only named fields, so this is safe, but the builder should not add property enumeration to any consumer.

## Gotchas

- The doc comment at the top of `anaJsonSchema.ts` is long (27 lines) and describes `.strip()` as intentional. If you only change line 49 and leave the comment, the next developer reads "strips orphaned fields" and thinks passthrough is a bug. Update the comment.
- The verify template's step 7 currently has a `### 7. Load Skills (reference material)` heading. Keep the heading but change the body. The heading is referenced by the step numbering in the overall verification process.
- The frontmatter `skills:` field uses YAML array syntax: `skills: [testing-standards, coding-standards]`. This is parsed by `parseFrontmatter()` in `agent-config.ts`. The square bracket format matches `ana-build.md` and `ana-plan.md`.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins
- Use `import type` for type-only imports, separate from value imports
- Prefer named exports
- Exported functions require `@param` and `@returns` JSDoc tags
- Pre-commit hooks run tsc, lint, and tests — all must pass

### Pattern Extracts

**Frontmatter skills declaration (from `packages/cli/templates/.claude/agents/ana-build.md:1-6`):**
```markdown
---
name: ana-build
model: opus[1m]
description: "AnaBuild — reads spec, produces working code, tests, and build report. The builder."
skills: [git-workflow]
---
```

**Strip-assertion test to flip (from `packages/cli/tests/commands/init/anaJsonSchema.test.ts:56-76`):**
```typescript
it('strips scanStaleDays fossil without touching other fields', () => {
  const input = {
    anaVersion: '0.1.0',
    name: 'anatomia',
    language: 'TypeScript',
    framework: null,
    packageManager: 'pnpm',
    commands: { build: 'pnpm run build' },
    coAuthor: 'Ana <build@anatomia.dev>',
    artifactBranch: 'main',
    setupPhase: 'complete',
    scanStaleDays: 7,
    lastScanAt: '2026-04-07T17:58:30.491Z',
  };
  const parsed = AnaJsonSchema.parse(input);
  expect('scanStaleDays' in parsed).toBe(false);  // ← flip to true
  // ... rest of assertions unchanged
});
```

### Proof Context
- Verify template has had formatting tweaks flagged as out-of-scope in prior cycles — keep changes to frontmatter and step 7 only.
- `index.ts` has a known fragility around Commander `--json` inheritance — not relevant to this phase (no `--json` changes).

### Checkpoint Commands

- After schema change: `(cd packages/cli && pnpm vitest run --reporter verbose 2>&1 | grep -E "anaJsonSchema|FAIL")` — Expected: anaJsonSchema tests pass (some will fail if tests not yet updated)
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2107+ tests pass, 0 failures
- Lint: `pnpm run lint`
- Build: `pnpm run build`

### Build Baseline
- Current tests: 2107 passed, 2 skipped (2109 total)
- Current test files: 99 passed
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected 2109+ tests (2 new tests added, 3 existing modified)
- Regression focus: `anaJsonSchema.test.ts` (direct changes), `agent-proof-context.test.ts` (dogfood sync assertion)
