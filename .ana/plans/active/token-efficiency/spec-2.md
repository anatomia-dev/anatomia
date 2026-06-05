# Spec: Phase 2 — Enrich the build briefing with touched-file symbol sites + ana.json command scalars

**Created by:** AnaPlan
**Date:** 2026-06-05
**Scope:** .ana/plans/active/token-efficiency/scope.md

## Approach

The engine already bundles contract + proof findings into `.ana/worktree-context.md`, and the build prompt already reads it (ana-build.md:93). This phase lights up an existing dark asset — the auto-built symbol index (`.ana/state/symbol-index.json`, 1449 symbols on our dogfood) — by folding two things into that already-read briefing: (1) for the files this work item touches, their **symbol definition sites** (`file:line`), and (2) the **ana.json command scalars** (build/test/lint) the agent would otherwise open ana.json to fetch. The agent gets, for free, the `file:line` it would otherwise grep for — delivered through code that reaches the installed base via CLI update, no prompt change required.

**Why this is push, not pull:** the rejected `ana where` command competed with the agent's grep reflex with no forcing function, and its only promotion channel (the prompt) doesn't propagate to existing installs. Injecting into a file the agent *already reads* reaches everyone on the current prompt.

**The discipline — symbol injection is advisory orientation, never source of truth:**
- **Freshness-stamped.** The index is a *pre-build* snapshot; it goes stale the moment Build edits. Label the section explicitly as a starting-point snapshot with the index's `generated` timestamp.
- **Scoped to touched files only.** Resolve symbols against the contract's `file_changes` paths (the same list `contextData` already derives at work.ts:1705). NEVER inject all 1449 symbols — that would mislead and bloat.
- **Soft-fallback is the law.** If `.ana/state/symbol-index.json` is absent or assembly throws, the briefing renders exactly as today — no error, no block. Mirror how `writeWorktreeContext` already degrades (returns `false` on write failure, falls back on missing data).

**Dependency on Phase 1:** none functionally, but sequenced after Phase 1 so the briefing's command-scalar section can reflect the same ana.json command resolution Phase 1 touches. Phase 2 is independently buildable/verifiable.

## Output Mockups

### `.ana/worktree-context.md` — new sections appended (after Contract Assertions / Risk Profile)
```markdown
## Symbol Locations (pre-build snapshot — advisory, may be stale)

_Source: .ana/state/symbol-index.json generated 2026-06-04T16:52:03Z. These are
starting points, NOT source of truth — they go stale the moment you edit. Verify
before relying on a line number._

For the files this work item touches:

**packages/cli/src/commands/artifact.ts**
  - `saveArtifact` (function, exported) — line 750
  - `saveAllArtifacts` (function, exported) — line 1220
  - `writeSaveMetadata` (function, exported) — line 54

**packages/cli/src/utils/worktree.ts**
  - `writeWorktreeContext` (function) — line 556
  - `runBuildCommand` (function) — line 447

## Project Commands

- build: `pnpm run build`
- test: `pnpm run test -- --run`
- lint: `pnpm run lint`
```

### Soft-fallback (index absent)
The two new sections are omitted entirely; the rest of the briefing is byte-identical to today's output.

## File Changes

### packages/cli/src/commands/work.ts (modify)
**What changes:** In the `contextData` assembly (around line 1695, before the `createWorktree` call at line 1753), after deriving `filePaths` from the contract's `file_changes` (already done at line 1705), resolve symbol sites for those paths from `.ana/state/symbol-index.json` and read the ana.json command scalars (build/test/lint). Pass both into `createWorktree`/`writeWorktreeContext` via new optional fields on the `contextData` object.
**Pattern to follow:** The existing danger-map assembly at lines 1702–1747 — it already parses the contract, extracts `file_changes` paths, queries proof context, and builds a markdown string into `contextData.proofFindings` inside a `try/catch` that soft-falls-back on failure. Add symbol resolution + command scalars the same way, in the same try/catch posture.
**Why:** This is where touched-file paths are already known and where the briefing payload is assembled.

### packages/cli/src/utils/worktree.ts (modify)
**What changes:** Extend the `writeWorktreeContext` `data` parameter type with two optional fields (e.g. `symbolSites?: string` pre-rendered markdown, `commandScalars?: string` pre-rendered markdown — OR structured data rendered inside the function; prefer rendering inside to keep work.ts thin). Append the "Symbol Locations" and "Project Commands" sections to the `sections[]` array before the write, each guarded so absence skips the section.
**Pattern to follow:** The existing conditional section appends in `writeWorktreeContext` (worktree.ts:556–616) — e.g. `if (data?.proofFindings) { sections.push(data.proofFindings, ''); }`. Use the identical guard-then-push idiom. Keep the soft-fallback: the function already `return false`s on write failure without throwing.
**Why:** This is the single renderer for the briefing; new sections belong here next to the existing ones.

### packages/cli/src/utils/symbol-lookup.ts (create) — OR inline helper in work.ts
**What changes:** A small pure helper `resolveSymbolSites(indexPath, filePaths): Map<string, SymbolEntry[]> | null` that reads `.ana/state/symbol-index.json`, filters `symbols` to the touched `filePaths`, groups by file, and returns null on missing/unreadable index. Reuse the existing `SymbolEntry`/`SymbolIndex` types from `src/types/symbol-index.ts` (`{ name, type, file, line, exported }` / `{ generated, files_parsed, symbols }`).
**Pattern to follow:** Pure util, no CLI deps; `import type { SymbolEntry, SymbolIndex } from '../types/symbol-index.js'`. Return `null` (checked-and-empty) on any failure so the caller soft-falls-back.
**Why:** Keeps the filtering testable in isolation and avoids bloating work.ts; reuses existing types — no new shape.

## Acceptance Criteria

Copied from scope (AC13–AC15), plus implementation criteria:

- [ ] AC13: `writeWorktreeContext` injects, for the files the work item touches, their symbol definition sites resolved from `.ana/state/symbol-index.json`, labeled as a freshness-stamped starting-point snapshot (advisory, not source of truth).
- [ ] AC14: The briefing carries the ana.json command scalars the agent needs (build/test/lint), removing the need to open ana.json separately.
- [ ] AC15: If the symbol index is absent or assembly fails, the briefing soft-falls-back to current content (no error, no block). Symbol injection is scoped to files the work item touches (not all 1449 symbols).
- [ ] The freshness stamp uses the index's own `generated` timestamp and explicit advisory wording.
- [ ] No regression to existing briefing sections (Summary, Build Status, Contract Assertions, Risk Profile) — they render byte-identically when the new data is absent.
- [ ] `(cd packages/cli && pnpm vitest run)` passes; no new lint errors; no test-count regression.

## Testing Strategy

- **Unit (symbol-lookup):** filters to touched files only; groups by file; returns `null` on missing index; returns `null` on malformed JSON; never returns the full 1449-symbol set for a 2-file touch list.
- **Unit (renderer):** `writeWorktreeContext` appends "Symbol Locations" + "Project Commands" when data present; omits both when absent; freshness stamp contains the index `generated` value; existing sections unchanged when new data absent.
- **Integration:** full `contextData` assembly with a contract → briefing contains touched-file symbols and command scalars; with no symbol index → briefing equals current output.
- **Edge cases:** index present but none of the touched files appear in it (section omitted or shows "no indexed symbols"); contract with zero `file_changes`; ana.json missing commands (scalars section omitted); write failure → `return false`, no throw.

## Dependencies

- Existing: `.ana/state/symbol-index.json` (auto-built at init via `buildSymbolIndexSafe`), `SymbolEntry`/`SymbolIndex` types (`src/types/symbol-index.ts`), `writeWorktreeContext` (worktree.ts:556), `contextData` assembly (work.ts:1695), the contract `file_changes` list already parsed at work.ts:1705.
- No new packages.

## Constraints

- **Advisory only** — freshness-stamped, scoped to touched files. Never inject the whole index. Never present a line number as authoritative.
- **Soft-fallback is mandatory** — any failure → current briefing, no error, no block.
- **No prompt change** — the read channel (ana-build.md:93) already exists and propagates to all installs on the current prompt.
- **Generalization** — the symbol index exists for any initialized project (any language tree-sitter parses); absence is handled by soft-fallback, so a project without an index simply gets today's briefing.
- **Avoid duplicate I/O** — proof context flags `getBuildCommandString` re-reading ana.json (worktree.ts). Read ana.json command scalars once during `contextData` assembly in work.ts and pass them through; don't add a second ana.json read inside `writeWorktreeContext`.

## Gotchas

- **Staleness is the whole risk.** The index is pre-build; it's wrong the moment Build edits. The freshness stamp + advisory wording is not decoration — it's what keeps the agent from trusting a stale line number mid-edit.
- **Scope to touched files.** A whole-index dump (1449 symbols) would bloat the briefing and bury signal. Filter to `file_changes` paths.
- **Soft-fallback must be real.** Wrap symbol resolution + scalar reads in the same try/catch posture as the existing danger-map block (work.ts:1745 `catch { /* fall back */ }`).
- **Don't double-read ana.json.** Resolve command scalars in work.ts where ana.json is already available; pass them into the renderer.
- **Index path is `.ana/state/symbol-index.json`** — in the main tree, not the worktree (the worktree is fresh). Read from `projectRoot`, not `wtPath`.

## Build Brief

### Rules That Apply
- Local imports end in `.js`; `node:` prefix for built-ins.
- `import type` for the `SymbolEntry`/`SymbolIndex` types, separate from value imports.
- Named exports only.
- `| null` return for the checked-and-empty resolver (missing/malformed index → `null`).
- Early returns; soft-fallback via try/catch, no throw to the caller.
- `writeWorktreeContext` is in `src/utils/` — keep it CLI-dependency-free (no chalk); it builds a markdown string and writes it.

### Pattern Extracts

**The contextData assembly + soft-fallback to mirror (work.ts:1695–1748, condensed):**
```typescript
  let contextData: { contractAssertions?: string; proofFindings?: string; summary?: string } | undefined;
  const contractPath = path.join(activePath, 'contract.yaml');
  if (fs.existsSync(contractPath)) {
    const contractContent = fs.readFileSync(contractPath, 'utf-8');
    contextData = { contractAssertions: contractContent };
    try {
      const parsed = yaml.parse(contractContent);
      const fileChanges: Array<{ path: string }> = parsed?.file_changes ?? [];
      const filePaths = fileChanges.map(fc => fc.path).filter(Boolean);
      if (filePaths.length > 0) {
        // … existing proof-context danger map builds contextData.proofFindings …
      }
    } catch {
      // YAML parse failure — fall back to raw string behavior, no danger map
    }
  }
  // … later:
  const result = await createWorktree(projectRoot, slug, branchPrefix, contextData);
```
Extend `contextData`'s type with `symbolSites?`/`commandScalars?` and populate them inside this same `if (filePaths.length > 0)` / try-catch block. `filePaths` is already the touched-file list.

**The renderer's conditional-append idiom to mirror (worktree.ts:556–616, condensed):**
```typescript
async function writeWorktreeContext(
  wtPath: string, slug: string,
  data?: { contractAssertions?: string; proofFindings?: string; summary?: string },
  buildSucceeded?: boolean | null
): Promise<boolean> {
  // …
  const sections: string[] = [ `# Worktree Context: ${slug}`, '', /* … */ ];
  sections.push('## Contract Assertions', '');
  if (data?.contractAssertions) { sections.push(data.contractAssertions); }
  else { sections.push('_No contract assertions available._'); }
  sections.push('');
  if (data?.proofFindings) { sections.push(data.proofFindings, ''); }
  try {
    await fsPromises.writeFile(contextPath, sections.join('\n'), 'utf-8');
    return true;
  } catch { return false; }
}
```
Add `if (data?.symbolSites) { sections.push(data.symbolSites, ''); }` and `if (data?.commandScalars) { sections.push(data.commandScalars, ''); }` before the write, after the proofFindings push. Update the `data` parameter type accordingly.

**The symbol types to reuse (types/symbol-index.ts):**
```typescript
export interface SymbolEntry {
  name: string;
  type: 'function' | 'class' | 'method' | 'variable';
  file: string;
  line: number;
  exported: boolean;
}
export interface SymbolIndex {
  generated: string;
  files_parsed: number;
  symbols: SymbolEntry[];
}
```

### Proof Context
- **work.ts** — touched in 25 cycles; finding: two result parsers with different casing (not in this path). No active blocker for the briefing assembly. The danger-map block is recent (2026-06-01) and stable — extend it, don't rewrite it.
- **worktree.ts** — finding: `getBuildCommandString` re-reads ana.json (duplicate I/O). Directly relevant: resolve command scalars once in work.ts, pass them in — do not add another ana.json read in the renderer.
- No active proof findings for `types/symbol-index.ts`.

### Checkpoint Commands
- After symbol-lookup.ts: `(cd 'packages/cli' && pnpm vitest run symbol)` — Expected: resolver unit tests pass.
- After work.ts + worktree.ts: `(cd 'packages/cli' && pnpm vitest run worktree work)` — Expected: briefing assembly + renderer tests pass.
- After all changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: full suite green, 0 regressions.
- Lint: `(cd 'packages/cli' && pnpm run lint)` — Expected: clean.

### Build Baseline
- Current tests: **3234 passing** (2 skipped, 3236 total)
- Current test files: **132**
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected 3234 + new (resolver + renderer + assembly tests) in 132 + new files
- Regression focus: `worktree.ts` (`writeWorktreeContext` signature change ripples to all callers), `work.ts` (`contextData` assembly).
