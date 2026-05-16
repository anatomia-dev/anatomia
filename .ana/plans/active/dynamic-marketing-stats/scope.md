# Scope: Dynamic marketing stats — wire command count and version fallback to extraction pipeline

**Created by:** Ana
**Date:** 2026-05-15

## Intent

The marketing site hardcodes product stats in `copy.ts` that the docs data pipeline already computes dynamically. Every new command or version bump requires a manual edit to marketing copy that nobody remembers to do — and the numbers have already drifted (copy says "26 commands" but extraction counts 32; VERSION_FALLBACK says "v1.1.0" but build-meta says "1.0.2").

Wire the 3 values that can safely be dynamic to the extraction pipeline so they stay honest automatically. Leave the values that have enumeration dependencies (agents, skills, context files) as editorial copy.

## Complexity Assessment
- **Kind:** feature
- **Size:** small — single-phase, ~60-80 lines of real change across 4-5 files
- **Files affected:**
  - `website/lib/marketing-stats.ts` (new — thin accessor with fallbacks)
  - `website/components/system/SystemSection.tsx` (import marketing stats for specStrip override)
  - `website/components/system/Drawer.tsx` (pass dynamic command count + moreCount to ManPage)
  - `website/components/system/ManPage.tsx` (no structural change — already receives moreCount as prop)
  - `website/lib/proof-feed.ts` (replace hardcoded VERSION_FALLBACK with build-meta read)
- **Blast radius:** Marketing site only. No CLI changes. No docs pages affected (they already use the extraction data). Components that render command count in the System section and the version fallback in proof-feed.ts.
- **Estimated effort:** < 1 hour
- **Multi-phase:** no

## Approach

Follow the existing precedent where proof-feed.ts is a data layer separate from copy.ts. Create a thin `lib/marketing-stats.ts` that reads from the existing extraction outputs (`data/docs/commands.json`, `data/docs/build-meta.json`) via the existing accessor functions in `lib/docs-data/`. Components that need dynamic values import from marketing-stats alongside copy.

copy.ts stays pure static editorial prose with `as const`. The hardcoded values in copy.ts become documentation of what "should" render, while the actual rendered values come from the data layer. This preserves copy.ts's design contract: one file, ctrl-F any string, literal types, plain object.

Three values become dynamic:

1. **Command count** — `getCommandCount()` from extraction, displayed as `"{N} commands"` in the specStrip and CLI drawer meta. Uses the `totalCommands` value which includes all subcommands (32 today). This is the honest count — every command is documented and user-accessible.
2. **moreCount** — computed as `totalCommands - 6` (the 6 commands shown in the manPage). Dynamic because it derives from command count.
3. **VERSION_FALLBACK** — `getBuildMeta().version` with `v` prefix prepended. Used when GitHub tags API fails. build-meta.json is available at ISR runtime because it's written at build time.

Three value categories stay static, with reasoning:

- **Agent count ("5 agents")** — The 5-agent pipeline story is editorial. The tree enumerates all 5 by name. Making the count dynamic (6, including ana-setup) would mismatch the tree and change the marketing narrative. When a pipeline agent is added, the editorial copy needs updating anyway to name it and describe its role.
- **Skill count ("8 matched", "8 skills")** — The tree lists exactly 8 named skills. Dynamic count would mismatch the enumeration. Skills change very rarely.
- **Context file count ("4 files")** — The tree lists exactly 4 files. Same enumeration mismatch problem.

## Acceptance Criteria

- AC1: The System section specStrip displays the command count from `commands.json` (currently 32), not the hardcoded "26 commands."
- AC2: The CLI drawer meta displays the same dynamic command count.
- AC3: The manPage moreCount is computed as `totalCommands - 6`, matching the 6 explicitly shown commands.
- AC4: VERSION_FALLBACK in proof-feed.ts reads from build-meta.json instead of a hardcoded string.
- AC5: If `data/docs/commands.json` or `data/docs/build-meta.json` is missing or malformed, all values fall back to sensible hardcoded defaults (the current values serve as defaults).
- AC6: copy.ts is not modified — its `as const` export and editorial content stay untouched.
- AC7: The website builds and renders correctly with `pnpm build` in the website directory.
- AC8: No TypeScript errors introduced.

## Edge Cases & Risks

- **Missing extraction data:** Fresh clone before running `extract-docs-data.ts`, or the extraction script fails. marketing-stats.ts must have fallback values for every field. The existing accessor functions (`getCommandCount()`) use `readFileSync` which will throw if the file is missing — marketing-stats.ts should catch this and return defaults.
- **build-meta.json version format:** The extraction writes `"version": "1.0.2"` (no `v` prefix). VERSION_FALLBACK uses `"v1.1.0"` (with prefix). The wiring must prepend `v`.
- **ISR runtime access:** proof-feed.ts runs at ISR time, not just build time. `data/docs/build-meta.json` is written at build time and persists in the deployment — it's available at runtime. The `getBuildMeta()` accessor uses `readFileSync` which works in Next.js server components.
- **Drawer is a client component.** It has `"use client"`. It can't call server-only functions. The dynamic values must be passed as props from a server component (SystemSection), not imported directly in Drawer.
- **ManPage version prop:** ManPage already receives `version` from `cliPkg.version` via Drawer. This stays the same — the version in ManPage is the CLI package version, not the marketing stat.

## Rejected Approaches

- **Modify copy.ts to import JSON:** Violates copy.ts's design contract (pure static object, `as const`, ctrl-F any string). Mixing computed values into the const assertion complicates typing. copy.ts explicitly delegates dynamic data to other modules (proof-feed.ts precedent).
- **Make all counts dynamic (agents, skills, context files):** Each of these has an explicit enumeration (file tree) in the same drawer that lists N items by name. A dynamic count that doesn't match the enumeration is worse than a hardcoded count that does. Making the enumerations dynamic is a much larger change that would turn editorial marketing copy into generated content.
- **Use `marketing-stats.json` written by the extraction script:** Adds a new output file to maintain. The data already exists in `commands.json` and `build-meta.json`. A new file is scaffolding — the accessor functions are foundation.
- **Direct commit without pipeline:** The change affects what visitors see on the marketing site. A regression means broken numbers on the landing page. The pipeline exists for exactly this: small changes with visible impact.
- **Make moreNames dynamic:** The "init, setup, verify, proof, config, agents" list is curated to tease interesting commands, not an exhaustive inventory. It reads well as editorial copy. Auto-generating it from the command tree would produce a similar list but lose the editorial voice.

## Open Questions

None remaining — all investigative questions from the requirements file have been resolved:

1. **Command count discrepancy:** Use `totalCommands` (32) as-is. Every command including subcommands is user-accessible and documented. "32 commands" is the honest number.
2. **How to get dynamic values into components:** Create `lib/marketing-stats.ts` reading from existing accessor functions with fallbacks. Server component (SystemSection) reads stats and passes to client component (Drawer) as props.
3. **moreCount:** Computed as `totalCommands - 6`. moreNames stays editorial.
4. **VERSION_FALLBACK:** Wire to `getBuildMeta().version` with `v` prefix. Works at ISR runtime because data files persist in deployment.
5. **Proof card mock:** Leave alone — it's obviously a design illustration, not a live stat claim.
6. **Scope boundaries:** Pure wiring, no new features. Fallback strategy covers missing data.
7. **Scope vs direct commit:** Scope — visible user impact warrants verification.

## Exploration Findings

### Patterns Discovered
- `website/lib/proof-feed.ts` — established precedent for data living outside copy.ts. Header explicitly notes that version/hash/ago fields come from getProofFeed(), not copy.ts.
- `website/components/system/SystemSection.tsx:7` — already imports `cliPkg` from `packages/cli/package.json` directly, establishing that server components read non-copy data.
- `website/components/system/Drawer.tsx:1` — marked `"use client"`, receives data through props from SystemSection.
- `website/lib/docs-data/commands.ts` — accessor pattern: `readFileSync` from `data/docs/commands.json`, cached in module scope. `getCommandCount()` returns `totalCommands`.
- `website/lib/docs-data/meta.ts` — same pattern for build-meta.json. `getBuildMeta()` returns `{ version, commitSha, buildTimestamp }`.

### Constraints Discovered
- [TYPE-VERIFIED] `as const` on copy.ts export (copy.ts:688) — every field is a literal type. Dynamic values cannot live in this object without changing the type contract.
- [TYPE-VERIFIED] Drawer is `"use client"` (Drawer.tsx:1) — cannot import server-only modules. Dynamic values must flow through props from SystemSection.
- [OBSERVED] `readFileSync` in accessor functions — throws if file missing. marketing-stats.ts must wrap in try/catch.
- [OBSERVED] build-meta.json version lacks `v` prefix (value: `"1.0.2"` not `"v1.0.2"`).
- [OBSERVED] `setup index` is the only hidden command (`setup.ts:34`, registered with `{ hidden: true }`). totalCommands (32) includes it.

### Test Infrastructure
- No unit tests for copy.ts or marketing components currently. The website has no test suite — verification is build success + visual inspection.

## For AnaPlan

### Structural Analog
`website/lib/proof-feed.ts` — a data-layer module that reads from an external source (GitHub API), has fallbacks, and is consumed by multiple components. marketing-stats.ts follows the same pattern but reads from local extraction data instead of an API.

### Relevant Code Paths
- `website/lib/docs-data/commands.ts` — `getCommandCount()` returns `totalCommands` from commands.json
- `website/lib/docs-data/meta.ts` — `getBuildMeta()` returns `{ version, commitSha, buildTimestamp }`
- `website/lib/docs-data/index.ts` — re-exports all accessor functions
- `website/components/system/SystemSection.tsx` — server component, renders specStrip from copy.system.specStrip, passes version to Drawer
- `website/components/system/Drawer.tsx` — client component, renders drawer meta and manPage with data from copy.system.drawers
- `website/components/system/ManPage.tsx` — receives `{ version, commands, moreCount, moreNames }` as props
- `website/lib/proof-feed.ts:59` — `VERSION_FALLBACK = "v1.1.0"` used in `getLatestVersion()` fallback

### Patterns to Follow
- `website/lib/docs-data/commands.ts` — accessor with readFileSync, module-level cache, typed return
- `website/lib/proof-feed.ts` — fallback pattern (try/catch, return hardcoded default on failure)
- `website/components/system/SystemSection.tsx:7` — importing data outside copy.ts in a server component

### Known Gotchas
- The specStrip items in copy.ts are `readonly` tuples due to `as const`. SystemSection currently passes `copy.system.specStrip` directly to SpecStrip. To override one item's value, SystemSection needs to construct a new array with the dynamic value replacing the static one — it can't mutate the const array.
- Drawer receives all drawer data from `copy.system.drawers` which is also const. To pass dynamic meta/moreCount, SystemSection needs to pass these as separate props to Drawer, or Drawer needs to import marketing-stats directly (but it's `"use client"` — check if docs-data accessors work client-side... they use `readFileSync`, so NO). Dynamic values must flow as props.

### Things to Investigate
- What's the cleanest way to override specific specStrip items and drawer values without fragmenting the data flow? Two approaches: (a) SystemSection constructs a modified copy of the arrays with dynamic values spliced in, passes to children. (b) SystemSection passes dynamic values as separate props, children merge them. The planner should decide which is cleaner given the component hierarchy.
