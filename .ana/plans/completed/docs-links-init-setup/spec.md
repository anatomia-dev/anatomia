# Spec: Documentation links in init and setup

**Created by:** AnaPlan
**Date:** 2026-05-14
**Scope:** .ana/plans/active/docs-links-init-setup/scope.md

## Approach

Add documentation URLs at four user-facing surfaces: init success output, `ana setup` bare command output, the ana-setup agent template's Step 6 block, and the using-ana-setup docs page's design principles subsection.

Centralize the two CLI-output URLs as named constants in `constants.ts`. The agent template and MDX file hardcode their URLs — they can't import from TypeScript modules. This matches the scope's design: constants for CLI maintainability, stable URL contracts for everything else.

All URLs use full `https://` — no terminal hyperlink escape sequences, no shorthand. Every modern terminal auto-links them.

## Output Mockups

### Init success (after the existing Next: block)

```
  Next:
    claude --agent ana          Start working (Ana knows your stack)
    claude --agent ana-setup    Enrich with your team's knowledge (optional, ~10 min)
    ana init commit             Save to main ✓

  Quickstart  https://anatomia.dev/docs/start
```

The `Quickstart` label is `chalk.bold`, the URL is `chalk.gray`. The line sits after the commit-readiness indicator, separated by a blank line, before the final trailing blank line.

### Setup bare command

```
Setup is an interactive agent flow.

  claude --agent ana-setup

  Guide  https://anatomia.dev/docs/guides/using-ana-setup

Subcommands:
  ana setup check     — validate setup state
  ana setup complete  — finalize setup
```

The `Guide` label is `chalk.bold`, the URL is `chalk.gray`. The line sits between the agent command and the subcommands list, with blank lines above and below.

## File Changes

### `packages/cli/src/constants.ts` (modify)

**What changes:** Add two named URL constants: `DOCS_QUICKSTART` and `DOCS_SETUP_GUIDE`. Place them in a new clearly labeled section after the existing legacy constants section.
**Pattern to follow:** The existing constant grouping style — section comment header (`// ===...`), JSDoc on each constant.
**Why:** AC5 requires all CLI-output documentation URLs to be centralized. Two surfaces import from here instead of hardcoding strings.

### `packages/cli/src/commands/init/state.ts` (modify)

**What changes:** Add a quickstart URL line after the commit-readiness indicator block (after the `if/else if` for `currentBranch`) and before the final `console.log('')`. Import `DOCS_QUICKSTART` from constants.
**Pattern to follow:** The existing label + value pattern in `displaySuccessMessage` — `chalk.bold` for the label, `chalk.gray` for the value. The label alignment uses padded strings (see `Stack:`, `Deploy:`, `Branch:` pattern at lines 619-674).
**Why:** AC1 — init success output ends with the quickstart URL.

### `packages/cli/src/commands/setup.ts` (modify)

**What changes:** Add a guide URL line in `setupCommand.action` between the agent command line (`console.log(chalk.cyan('claude --agent ana-setup'))`) and the subcommands block. Import `DOCS_SETUP_GUIDE` from constants.
**Pattern to follow:** Same label + value styling as the init change. `chalk.bold` label, `chalk.gray` URL.
**Why:** AC2 — `ana setup` bare command includes the guide URL.

### `packages/cli/templates/.claude/agents/ana-setup.md` (modify)

**What changes:** Add `https://anatomia.dev/docs/guides/using-ana-setup#design-principles` inside the Step 6 first interaction scripted ``` block. Place it after the "Examples from other teams:" examples and before the "Your project starts with 3 defaults:" paragraph — as a one-line reference the agent presents alongside the examples.
**Pattern to follow:** The existing prose style inside the scripted block. Plain text with the URL inline.
**Why:** AC3 — the setup agent surfaces the guide link during the design principles phase.

### `website/content/docs/guides/using-ana-setup.mdx` (modify)

**What changes:** Add a `<p style>` annotation line after the code block showing Anatomia's design principles (after line 105's closing ``` and before line 107's existing `<p style>` annotation). The new line links to the reference page's design principles section.
**Pattern to follow:** The existing `<p style={{fontSize:"13px",color:"var(--ink-60)",margin:"0 0 16px"}}>` pattern used at lines 107, 115, and 140. Use a standard markdown-style link or `<a>` tag within the `<p>` — the docs site renders these in MDX.
**Why:** AC4 — the docs page links to the reference page's design principles section.

## Acceptance Criteria

- [ ] AC1: `ana init` success output ends with `Quickstart  https://anatomia.dev/docs/start` after the existing "Next:" block
- [ ] AC2: `ana setup` (bare command, no subcommand) output includes `Guide  https://anatomia.dev/docs/guides/using-ana-setup` between the agent command and the subcommands list
- [ ] AC3: The `ana-setup.md` agent template includes `https://anatomia.dev/docs/guides/using-ana-setup#design-principles` in the Step 6 design principles framing block
- [ ] AC4: The `using-ana-setup.mdx` docs page includes a linked element in the design principles subsection pointing to `https://anatomia.dev/docs/reference/context#design-principles` with text like "See our design principles"
- [ ] AC5: All documentation URLs used in CLI output are defined as named constants in `constants.ts`, not as inline string literals
- [ ] AC6: Existing init and setup tests continue to pass
- [ ] AC7 (human): `www.anatomia.dev` redirects to `anatomia.dev` — configured in Vercel domain settings, not a code change
- [ ] Tests pass with `pnpm vitest run`
- [ ] No build errors — `pnpm run build` succeeds
- [ ] New tests verify the URL appears in init success output and setup bare command output

## Testing Strategy

- **Unit tests:** Add assertions to the existing `displaySuccessMessage` test block in `init.test.ts` — verify the quickstart URL appears in captured console output. For setup, add a test in the appropriate test file (or `init.test.ts` if setup tests don't exist for the bare command) that verifies the guide URL appears.
- **Edge cases:** Verify the quickstart URL appears even when `engineResult` is null (the function handles this case — the new line should still appear since it's in the unconditional tail of the function).
- **No integration tests needed** — these are `console.log` additions with no behavioral changes.

## Dependencies

None. All target files exist. No new packages required.

## Constraints

- URLs are stable contracts — the website must redirect if pages ever move. The three paths (`/docs/start`, `/docs/guides/using-ana-setup`, `/docs/reference/context#design-principles`) must be treated as permanent.
- No terminal escape sequences. Plain `https://` URLs only.
- The agent template URL must be INSIDE the scripted ``` block to be reliably reproduced by the agent.

## Gotchas

- **`displaySuccessMessage` signature** — the function takes 5 parameters including optional `anaConfig` and `warnings`. Existing tests call it with various argument combinations. Don't change the signature.
- **The commit-readiness block has conditional branches** — `if (currentBranch === artifactBranch)` / `else if (currentBranch)`. The quickstart line goes AFTER both branches, not inside either. It's unconditional.
- **`constants.ts` imports from engine types** — it already has `import type { EngineResult }`. The new URL constants are plain strings with no type dependencies.
- **The MDX file uses JSX-style `style={{}}` syntax** — not CSS strings. Follow the existing pattern exactly.
- **The setup bare command handler is synchronous** — it uses `console.log` directly, no async. Keep it synchronous.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { DOCS_QUICKSTART } from '../../constants.js'`
- Use `import type` for type-only imports, separate from value imports
- Prefer named exports — the URL constants are named exports
- Explicit return types on exported functions (existing functions already have them — don't change signatures)
- JSDoc `@param` and `@returns` on exported functions (existing functions already have them)
- `node:` prefix for built-in imports

### Pattern Extracts

From `packages/cli/src/commands/init/state.ts` lines 700-714 (the insertion point for the quickstart URL):

```typescript
  // Two-path next steps
  console.log('  Next:');
  console.log(chalk.cyan('    claude --agent ana') + '          Start working (Ana knows your stack)');
  console.log(chalk.cyan('    claude --agent ana-setup') + '    Enrich with your team\'s knowledge (optional, ~10 min)');

  // Commit-readiness indicator
  const artifactBranch = anaConfig?.['artifactBranch'] as string ?? 'main';
  const currentBranch = getCurrentBranch();
  if (currentBranch === artifactBranch) {
    console.log(chalk.cyan('    ana init commit') + `             Save to ${artifactBranch} ✓`);
  } else if (currentBranch) {
    console.log(chalk.cyan('    ana init commit') + `             ⚠ you're on ${currentBranch} — switch to ${artifactBranch} first`);
  }
  console.log('');
}
```

From `packages/cli/src/commands/setup.ts` lines 40-48 (the insertion point for the guide URL):

```typescript
  setupCommand.action(() => {
    console.log(chalk.bold('\nSetup is an interactive agent flow.\n'));
    console.log(`  ${chalk.cyan('claude --agent ana-setup')}`);
    console.log();
    console.log(chalk.gray('Subcommands:'));
    console.log(chalk.gray('  ana setup check     — validate setup state'));
    console.log(chalk.gray('  ana setup complete  — finalize setup'));
    console.log();
  });
```

From `packages/cli/src/constants.ts` lines 133-148 (section header style for the new URL constants):

```typescript
// ============================================================
// LEGACY CONSTANTS (pre-vault — still referenced by current code)
// These will be migrated to vault constants as init/validators are rewritten.
// ============================================================
```

From `website/content/docs/guides/using-ana-setup.mdx` line 107 (the annotation pattern):

```html
<p style={{fontSize:"13px",color:"var(--ink-60)",margin:"0 0 16px"}}>"Name the disease" means Think pushes back on symptom-level requests. "Every character earns its place" means Plan writes tighter specs. "Think more, build less" means Think spends longer on tradeoff analysis before recommending an approach. Each one shapes agent behavior on every pipeline run.</p>
```

### Proof Context

No active proof findings for affected files.

### Checkpoint Commands

- After constants change: `(cd packages/cli && pnpm vitest run)` — Expected: all existing tests pass
- After all CLI changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2288+ tests pass (existing + new URL assertions)
- Lint: `pnpm run lint`
- Build: `(cd packages/cli && pnpm run build)`

### Build Baseline
- Current tests: 2288 passed, 2 skipped (2290 total)
- Current test files: 103 passed
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected 2290+ tests (2-4 new assertions for URL presence)
- Regression focus: `tests/commands/init.test.ts` (existing displaySuccessMessage tests)
