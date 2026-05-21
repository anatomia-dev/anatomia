# Spec: Comprehensive Documentation Update for Surface Awareness

**Created by:** AnaPlan
**Date:** 2026-05-20
**Scope:** .ana/plans/active/docs-comprehensive-update/scope.md

## Approach

Thread the `surface` field from the proof chain through the docs data pipeline (type → extract script → components), then update six content files and the README for surface awareness and factual accuracy.

The proof chain already has the `surface` field (133 entries: 88 cli, 19 website, 26 undefined). The pipeline currently strips it — the extract script doesn't map it, the type doesn't include it, and the components can't render it. This spec adds one field at each layer.

Content changes are prose-only with no runtime risk. Each page serves a specific reader and gets only the surface detail that reader needs.

**Open question from scope resolved:** The configurability settings grid uses a 2-column CSS grid with 4 cards. Adding `config delete` as a 5th card would leave an odd-numbered grid. Decision: add `config delete` as a sentence after the grid, and per-surface override syntax inside the "Build / test / lint commands" card description.

## Output Mockups

### ProofHero metadata row (when surface exists)

```
verdict PASS   score 27/27   findings 10 (3 debt · 7 obs)   duration 74m   rejection cycles 0   shipped may 4   surface cli
```

When surface is null/undefined, the "surface" item is omitted entirely.

### ProofExplorer row badges (when surface exists)

```
security-hardening
Security Hardening    [cli]  [website]  [1 rejection]
```

The surface badge renders inline after the stage badge, same styling: 10px mono, hairline border, `var(--ink-60)`. Omitted when surface is null/undefined.

### Quickstart commands callout (replacement)

```
**Verify detected commands.** Init infers Test, Build, and Lint from your package.json.
Override any command: `ana config set commands.test "your-command"`.
Monorepos with multiple surfaces: see [Configurability](/docs/guides/configurability) for per-surface overrides.
```

### Quickstart external services callout (new, between Step 3 heading and first code block)

```
**External services.** If your project uses a database, Redis, or Docker containers,
start them before running the pipeline — agents execute your test command as-is.
```

### Troubleshooting "Tests fail" card (rewrite)

```
1. **Database or service not running.** Pipeline agents run your test command exactly
   as configured. If tests need PostgreSQL, Redis, or Docker — start them first.
2. **Missing environment variables.** `.env` files aren't loaded automatically in
   all test runners. Check that CI-required vars are set in your shell.
3. **Wrong test command detected.** Run `ana config show` — check `commands.test`
   (project-wide) and `surfaces.{name}.commands.test` (per-surface). Override:
   `ana config set commands.test "your-command"`.
4. **Prisma client not generated.** If using Prisma, run `npx prisma generate`
   before the pipeline. Some test setups require this explicitly.
5. **Monorepo surface mismatch.** Init may target the wrong package. See the
   monorepo troubleshooting card above for per-surface command overrides.
```

## File Changes

### `website/lib/docs-data/types.ts` (modify)

**What changes:** Add `surface?: string | null` to the `ProofEntry` interface, after `completedAt`.
**Pattern to follow:** The existing `scopeSummary: string | null` field on line 45 — same nullability pattern.
**Why:** Without this field in the type, components can't render it and TypeScript rejects the access.

### `website/scripts/extract-docs-data.ts` (modify)

**What changes:** Add `surface: entry.surface || null` to the mapped entry object in the proof extraction function.
**Pattern to follow:** The `scopeSummary: entry.scope_summary || null` mapping on line 198 — same field-mapping pattern with null default.
**Why:** The proof chain has the field but the extract script currently drops it. This is the only place raw proof data maps to the website's type system.

### `website/components/docs/proof/ProofHero.tsx` (modify)

**What changes:** Add a surface label as the LAST item in the metadata flex row (after the "shipped" span at line 89). Conditionally rendered — only when `entry.surface` is truthy.
**Pattern to follow:** The "shipped" span at line 89: `<span><b style={{ color: "var(--ink)", fontWeight: 500 }}>shipped</b> {formatDate(entry.completedAt)}</span>`. Surface label uses the same structure: `<span><b>surface</b> {entry.surface}</span>`, wrapped in `{entry.surface && (...)}`.
**Why:** ProofHero is the detail page's header. Surface metadata belongs here for monorepo projects. Same visual weight as "shipped" — plain mono text, no badge, no color.

### `website/components/docs/proof/ProofExplorer.tsx` (modify)

**What changes:** Add a surface badge inside the inline badge container (the `<span>` with `display: "inline-flex"` at line 240) after the stage badge. Conditionally rendered like the rejection count badge.
**Pattern to follow:** The stage badge at lines 241-250 and the rejection count badge at lines 251-264. Same styling: `display: "inline-block"`, `fontFamily: "var(--font-mono)"`, `fontSize: "10px"`, `padding: "2px 6px"`, `borderRadius: "3px"`, `border: "1px solid var(--hairline)"`, `color: "var(--ink-60)"`, `letterSpacing: "0.02em"`.
**Why:** Gives the proof explorer a surface indicator per row without adding filter complexity. The badge is a display element — must not interfere with the row's onClick navigation.

### `website/content/docs/start.mdx` (modify)

**What changes:** Two changes:
1. Replace the existing commands callout (lines 43-45) with a simplified three-line version: verify detected commands, override syntax, link to configurability for monorepo per-surface config.
2. Add an external services callout between the Step 3 heading (line 63) and the first code block (line 67). Two sentences about starting database/Redis/Docker before the pipeline.

**Pattern to follow:** The existing `<Callout variant="note">` pattern with bold lead text on line 43-45.
**Why:** The current callout leads with monorepo complexity that confuses simple-app users. The new version serves the common case (single-project) first, with a link for the uncommon case (monorepo). The external services callout prevents a common failure mode where tests fail because services aren't running.

### `website/content/docs/guides/troubleshooting.mdx` (modify)

**What changes:** Two changes:
1. Rewrite the "Tests fail in pipeline but pass locally" TroubleCard (lines 73-80) with causes ranked by real frequency: database not running → missing env vars → wrong test command → Prisma client → monorepo surface mismatch. Item 5 cross-references the existing monorepo card using stable language ("See the monorepo troubleshooting card above") rather than quoting the exact card title.
2. Add two bullets to the best practices section (after line 145): "Start small" and "Check your test command first."

**Pattern to follow:** The existing TroubleCard pattern: `<TroubleCard title="...">` with numbered causes inside. For best practices, follow the existing bullet pattern with bold lead and explanation.
**Why:** The current card starts with "check detected commands" — that's cause #3 by frequency. Database not running is the most common cause. Ranking by frequency helps the frustrated reader find their answer faster. Best practices bullets address the two most common mistakes new users make.

### `website/content/docs/guides/reading-a-proof.mdx` (modify)

**What changes:** Add one sentence after the hero grid's closing `</div>` (after line 51, before the `<p>` tag on line 54): "Monorepo projects show one additional label: the surface that was verified."
**Pattern to follow:** The existing `<p>` explanatory text on line 54 — same font size, color, margin pattern.
**Why:** Readers of this guide need to know the surface label exists. It's a sentence, not a grid cell — the 3x2 grid is hardcoded and adding a 7th cell would break the layout.

### `website/content/docs/guides/using-ana-learn.mdx` (modify)

**What changes:** Add one line mentioning the `--surface` flag on `proof health` and `proof audit` for scoped triage. Place it after the "Cleanup / Highest-impact / Recent findings" direction list (after line 25), as a brief parenthetical or sentence.
**Pattern to follow:** The existing `<p>` explanatory text pattern used throughout the guide.
**Why:** The `--surface` flag shipped in stage 3 but the learn guide doesn't mention it. One line — not a section.

### `website/content/docs/guides/configurability.mdx` (modify)

**What changes:** Two additions:
1. After the settings grid closing `</div>` (after line 33), add one sentence about `config delete`: "Remove any field with `ana config delete <field>` — useful for clearing overrides and reverting to detected defaults."
2. Inside or near the "Build / test / lint commands" card (lines 23-27), add per-surface override syntax: `ana config set surfaces.cli.commands.test "your-command"`.

**Pattern to follow:** The existing prose between grid and next section heading. For the per-surface syntax, follow the existing mono code example pattern in the card.
**Why:** `config delete` is a shipped command with no docs mention. Per-surface overrides are the reader's next question after seeing project-wide commands, and AC4 in the quickstart links here.

### `README.md` (modify)

**What changes:** Two additions:
1. Add `config delete` row to the "Scan and init" commands table (after line 163, near `config show`).
2. Add one sentence about monorepo surface detection in the init section (around line 88, after "Re-running `ana init` refreshes scan data without overwriting your edits.").

**Pattern to follow:** The existing table row format: `| \`ana config delete <field>\` | Remove a config field, reverting to detected default |`. For the init sentence, match the existing prose style.
**Why:** README is the first thing an evaluator reads. Missing a shipped command makes the product look incomplete.

## Acceptance Criteria

- [x] AC1: `ProofEntry` type includes `surface?: string | null` and the extract script maps it from proof chain entries
- [ ] AC2: ProofHero displays a `surface` label as the LAST item in the metadata row (after "shipped"), only when the entry has a surface value, styled at the same visual weight as "shipped" — plain mono text, no badge, no color
- [ ] AC3: ProofExplorer shows surface as an inline 10px mono label on each row (same styling as existing stage badge), only for entries with a surface value — no filter chip added
- [ ] AC4: Quickstart commands callout simplified to three lines: verify detected commands, override syntax, link to configurability guide for monorepo per-surface config
- [ ] AC5: Quickstart has an external services callout between the Step 3 heading and the first code block — two sentences about starting database/Redis/Docker before the pipeline
- [ ] AC6: Troubleshooting "Tests fail in pipeline but pass locally" card rewritten with causes ranked: database not running, missing env vars, wrong test command, Prisma client, monorepo surface mismatch — where item 5 cross-references the existing monorepo card
- [ ] AC7: Troubleshooting best practices section gains two bullets: "Start small" and "Check your test command first"
- [ ] AC8: README commands table includes `config delete` with a one-line description
- [ ] AC9: README init section includes one sentence about monorepo surface detection
- [ ] AC10: Reading-a-proof guide mentions the surface label after the hero grid
- [ ] AC11: Using-ana-learn guide includes a brief mention of `--surface` flag on `proof health` and `proof audit`
- [ ] AC12: Configurability guide includes `config delete` mention and per-surface command override syntax
- [ ] AC13: No changes to toolbelt, pipeline, or context concept pages
- [ ] AC14: Website builds without errors (`pnpm run build` in `website/`)
- [ ] AC15: All existing tests pass (`pnpm run test -- --run`)

## Testing Strategy

- **Primary verification:** Website build (`cd website && pnpm run build`). This compiles all TSX components and MDX content. A type error in ProofEntry or a broken JSX element will fail the build.
- **Unit tests:** No new tests required. The changes are a type addition, two small component modifications, and prose content. The website test suite is a separate in-flight work item.
- **Edge cases:** Verify that proof entries with `surface: undefined` (the 26 entries without surface) render without the surface label in both ProofHero and ProofExplorer. The conditional rendering (`entry.surface && (...)`) handles this — `undefined` and `null` are both falsy.
- **Visual check:** After build, spot-check the proof explorer and a proof detail page to confirm surface labels render correctly.

## Dependencies

None. All files exist. No new packages required.

## Constraints

- `reading-a-proof.mdx` hero grid is a hardcoded 3x2 CSS grid. Do NOT add a 7th grid cell — the surface mention is a prose sentence after the grid.
- ProofExplorer rows are clickable (`onClick` navigates to detail page). The surface badge must be a display element only — no `onClick`, no `stopPropagation`, no interactive behavior.
- The quickstart's existing "start small" guidance at line 65 ("Describe a small change — a single-file fix or a feature you'd normally spend 30 minutes on") must not be duplicated by the new best practices bullet.
- Troubleshooting card item 5 cross-references the monorepo card with stable language ("See the monorepo troubleshooting card above"), not the exact card title, to avoid breakage if the title changes.
- Use `&apos;` for apostrophes in JSX text content — `react/no-unescaped-entities` lint rule.

## Gotchas

- The extract script uses `entry.surface` (not `entry.surface_name` or similar). The proof chain field name is `surface` directly — verified on the latest entry (`surface: "website"`). Older entries have `surface: undefined`, not `surface: null` — the `|| null` normalization handles this.
- The ProofHero metadata row uses a flex-wrap div with `gap: "20px"`. Adding the surface span doesn't require adjusting the gap — flex-wrap handles overflow naturally.
- The configurability settings grid is a 2-column CSS grid with 4 cards. Adding a 5th card would render 3+2 with a visual gap. `config delete` goes as a sentence after the grid instead.
- The `--surface` flag on `proof health` and `proof audit` validates the surface name against `ana.json` surfaces and prints an error if the surface doesn't exist. The learn guide mention doesn't need to explain validation — just mention the flag exists.

## Build Brief

### Rules That Apply
- Use `&apos;` for apostrophes in JSX text content (`react/no-unescaped-entities` lint rule)
- Use `import type` for type-only imports, separate from value imports
- Prefer early returns and conditional rendering over nested ternaries
- Explicit return types on all exported functions

### Pattern Extracts

**ProofHero metadata item pattern** (`website/components/docs/proof/ProofHero.tsx` line 89):
```tsx
        <span><b style={{ color: "var(--ink)", fontWeight: 500 }}>shipped</b> {formatDate(entry.completedAt)}</span>
```

**ProofExplorer inline badge pattern** (`website/components/docs/proof/ProofExplorer.tsx` lines 241-250):
```tsx
                      <span style={{
                        display: "inline-block",
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        padding: "2px 6px",
                        borderRadius: "3px",
                        border: "1px solid var(--hairline)",
                        color: "var(--ink-60)",
                        letterSpacing: "0.02em",
                      }}>{e.stage.toLowerCase()}</span>
```

**ProofExplorer conditional badge pattern** (`website/components/docs/proof/ProofExplorer.tsx` lines 251-264):
```tsx
                      {e.rejectionCycles > 0 && (
                        <span style={{
                          display: "inline-block",
                          fontFamily: "var(--font-mono)",
                          fontSize: "10px",
                          padding: "2px 6px",
                          borderRadius: "3px",
                          border: "1px solid var(--hairline)",
                          color: "var(--ink-60)",
                          letterSpacing: "0.02em",
                        }}>
                          {e.rejectionCycles} rejection{e.rejectionCycles > 1 ? "s" : ""}
                        </span>
                      )}
```

**Extract script field mapping pattern** (`website/scripts/extract-docs-data.ts` lines 197-198):
```ts
      completedAt: entry.completed_at || '',
      scopeSummary: entry.scope_summary || null,
```

**Callout pattern** (`website/content/docs/start.mdx` lines 43-45):
```mdx
<Callout variant="note">
**Verify detected commands.** The Test, Build, and Lint lines above are project-wide commands inferred from your package.json. For monorepos, `surfaces` contains per-surface commands. Override with `ana config set surfaces.cli.commands.test "your-command"` if needed.
</Callout>
```

**TroubleCard pattern** (`website/content/docs/guides/troubleshooting.mdx` lines 73-80):
```mdx
<TroubleCard title="Tests fail in pipeline but pass locally">

1. Check the detected commands: `ana config show` — look at `commands.test` (project-wide) and `surfaces.{name}.commands.test` (per-surface)
2. In monorepos, init may target the wrong surface or produce an invalid invocation
3. Override: `ana config set commands.test "your-command"` for project-wide, or `ana config set surfaces.{name}.commands.test "your-command"` for a specific surface
4. Common fixes: `pnpm --filter web test`, `npx vitest run`, `npm run test:unit`

</TroubleCard>
```

### Proof Context
- `extract-docs-data.ts`: [debt] Median computation duplicated between extract script and proofs.ts — not affected by this change, just be aware the file has known duplication.
- `ProofExplorer.tsx`: [debt] formatDuration duplicated in 4 files — not affected by this change, badge addition is independent.
- No active findings for types.ts, ProofHero.tsx, or any of the MDX content files.

### Checkpoint Commands
- After type + extract script changes: `(cd website && pnpm run build)` — Expected: build succeeds
- After component changes: `(cd website && pnpm run build)` — Expected: build succeeds, no type errors
- After all changes: `pnpm run test -- --run` — Expected: 2711 tests pass (120 files)
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2711 passed, 2 skipped (120 test files)
- Command used: `pnpm run test -- --run`
- After build: 2711 tests (no new tests — changes are type/component/prose)
- Regression focus: Website build is the primary regression check. No CLI test files are affected.
