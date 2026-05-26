# Scope: Show Finding Details in CLI Output

**Created by:** Ana
**Date:** 2026-05-26

## Intent
The CLI renders `f.title` for every critical/warn finding but never renders `f.detail`. Three of four finding rules write meaningful detail text — methodology disclaimers, file:line locations, actionable explanations — that the founder never sees. The detail for the validation finding ("Routes using wrapper-based or middleware-based validation may not be detected") is the only visible qualification of a heuristic count, and it's invisible. Show the detail.

## Complexity Assessment
- **Kind:** feature
- **Size:** small — 2 files changed, ~8 lines of production code
- **Surface:** cli
- **Files affected:** `src/commands/scan.ts` (display loop), `src/engine/findings/rules/validation.ts` (detail text rewrite)
- **Blast radius:** Every finding with a non-null `detail` field gains a visible detail line. Currently affects `hardcoded-secret` (critical), `api-validation` (warn), and `env-hygiene` (warn). `error-boundaries` has detail but is `info` severity — never reaches the display loop at `scan.ts:326`.
- **Estimated effort:** < 1 hour
- **Multi-phase:** no

## Approach
Add detail rendering to the existing finding display loop in `scan.ts`. For each finding, after the title line, split `f.detail` on newlines and render each as an indented, dimmed (`chalk.gray`) line. Rewrite the validation detail from a two-line string with a literal `\n` to a single concise line.

This is cross-cutting infrastructure — it makes every finding's detail visible without per-finding changes. The validation detail rewrite is a prerequisite for clean display, not a separate concern.

## Acceptance Criteria
- AC1: `ana scan` on a repo with warn/critical findings shows `f.detail` as indented gray text below each finding title.
- AC2: `ana scan` on a repo with all-pass findings shows no detail lines (pass findings only render in funnel mode, and funnel mode doesn't use the detail path).
- AC3: The validation finding's detail is a single line: `Heuristic: checks imports in first 30 lines. Wrapper or middleware validation may not be detected.`
- AC4: Secret findings show their redacted match + file:line detail below each title.
- AC5: Env hygiene finding shows its explanatory detail below the title.
- AC6: CLI output for a repo with multiple findings remains compact — one detail line per finding, indented under its title.

## Edge Cases & Risks
- **Secret finding volume:** A repo with 10 hardcoded secrets produces 10 title lines today. With detail, that's 20 lines. Each detail line is `sk_l****aBcD  src/config.ts:42` — strictly more useful than the title alone. Linear cost, not exponential. The false-positive-secrets fix (separate scope) will reduce volume at the source.
- **Future findings with multi-line detail:** The implementation splits on `\n` and renders each line. A finding that writes a 10-line detail would produce 10 gray lines. Current findings have 1-2 lines of detail. Future finding authors should keep detail concise — the display will show everything.
- **Funnel mode clean path:** The `else if (options.isFunnel)` branch at `scan.ts:333` handles repos with zero critical/warn findings. This branch renders pass summaries, not individual findings. Detail display doesn't affect this path.

## Rejected Approaches
- **First-line-only truncation (`split('\n')[0]`):** Would silently drop important qualifications. The validation detail's current `\n` splits the wrapper caveat onto line 2 — truncating produces a sentence fragment. Showing all lines is safer and the detail rewrite makes it moot for validation.
- **Collapsible/expandable detail (verbose flag):** Overengineered. One dim line per finding is not verbose. A `--verbose` flag adds surface area for near-zero benefit.

## Open Questions
None — all resolved during investigation.

## Exploration Findings

### Patterns Discovered
- `scan.ts:326-341`: Finding display loop filters `critical`/`warn`, renders `f.title` only. The `else if` branch handles funnel-mode pass summaries.
- `validation.ts:116`: Detail contains literal `\n` producing two lines. First line ends mid-sentence if split.
- `secrets.ts:180`: Detail is `${redact(match[0])}  ${file}:${line}` — one line per finding instance, highly actionable.
- `env.ts:50`: Detail is a single explanatory sentence.
- `errorBoundaries.ts:58`: Detail exists but severity is `info` — never reaches the display loop. Moot.

### Constraints Discovered
- [TYPE-VERIFIED] Finding interface (`findings/index.ts:19-25`) — `detail: string | null`. Display must null-check.
- [OBSERVED] `scan.ts:326` filters `critical`/`warn` only — `info` and `pass` findings never enter the detail display path.
- [OBSERVED] `assets.ts:449-467` AGENTS.md generation uses `f.id` and `f.severity`, not `f.title` or `f.detail` — this change does not affect AGENTS.md output.

### Test Infrastructure
- `packages/cli/src/engine/findings/rules/__tests__/` — finding rule tests check returned `Finding` objects (id, severity, title, detail, category). Detail text change needs a test update for the validation rule.
- No existing tests for `scan.ts` display rendering — the display is a formatting concern, not a logic concern. AC verification is visual (run `ana scan` on test repos).

## For AnaPlan

### Structural Analog
`scan.ts:333-340` — the funnel-mode pass display. Same loop context, same `lines.push()` pattern, same indentation style. The detail display follows the same shape: conditional content pushed as indented lines below the primary line.

### Relevant Code Paths
- `src/commands/scan.ts:326-341` — the display loop to modify
- `src/engine/findings/rules/validation.ts:116` — the detail text to rewrite
- `src/engine/findings/index.ts:19-25` — the `Finding` type definition (detail is `string | null`)

### Patterns to Follow
- `chalk.gray()` for secondary/dimmed text — used elsewhere in scan.ts for metadata
- 4-space indent for detail lines (2 for icon + 2 more for nesting under title)

### Known Gotchas
- The validation detail at line 116 uses a literal `\n` inside the string, not a template literal newline. The rewrite replaces the entire string, so this is a non-issue — but worth noting for the planner.
- Don't touch the funnel-mode branch (`else if (options.isFunnel)`) — it handles a different display path for clean repos.

### Things to Investigate
- Confirm the 4-space indent looks right visually when rendered with chalk. The title uses 2-space indent (`  ${icon} ${text}`), so detail at 4-space (`    ${detailLine}`) nests cleanly.
