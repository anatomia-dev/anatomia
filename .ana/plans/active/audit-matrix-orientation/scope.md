# Scope: Audit matrix orientation

**Created by:** Ana
**Date:** 2026-05-17

## Intent

Learn's orientation phase requires 3+ commands and manual synthesis to understand the shape of the proof chain before triage. The severity × action cross-tab (the intersection of these two dimensions) is the single most useful orientation data — it tells Learn the shape of work, not just counts. "4 risk" is less actionable than "3 risk/scope + 1 risk/monitor." Additionally, Learn needs to know what shipped recently and how many findings are stale. Today this requires running `ana proof audit`, `ana proof stale`, and manually checking the last 3 entries.

This scope delivers two changes: (1) the cross-tab as standard audit output (always present, zero cost, useful for all consumers), and (2) a `--matrix` flag that adds a bundled orientation payload — recent entries, stale count — designed as a stable surface for Learn session startup that can grow without adding new flags.

## Complexity Assessment
- **Kind:** feature
- **Size:** medium — two distinct output changes in one command, plus template update
- **Files affected:**
  - `packages/cli/src/commands/proof.ts` (audit subcommand handler)
  - `packages/cli/src/utils/proofSummary.ts` (computeStaleness import, possibly utility for relative time)
  - `packages/cli/templates/.claude/agents/ana-learn.md` (template — ships to new users)
  - `.claude/agents/ana-learn.md` (dogfood — what our pipeline reads)
  - `packages/cli/tests/commands/proof.test.ts` (new test cases)
- **Blast radius:** Low. Audit's JSON output gets new fields (additive, non-breaking). The `--matrix` flag produces a different response shape (new behavior, no existing behavior changes). Template change affects new Learn installations and our dogfood.
- **Estimated effort:** ~2-3 hours build + verify
- **Multi-phase:** no

## Approach

Two additive changes to the audit subcommand, plus a template update:

**Change 1 — `by_severity_action` always present.** Compute the severity × action cross-tab during the existing active-findings iteration. Add it to both JSON output and human-readable output. Zero-count pairs are omitted. This is a three-line accumulator added to an existing loop — no new iteration, no new I/O.

**Change 2 — `--matrix` orientation mode.** When `--matrix` is passed, audit returns ONLY orientation data: the standard summary counts (total_active, by_severity, by_action, by_severity_action) plus bundled orientation fields (recent_entries, stale_count, stale_high, stale_medium). No `by_file` array. No individual findings. No anchor-presence file I/O. This makes `--matrix` fast and focused — a summary that tells Learn where to look next, not the findings themselves.

**Change 3 — Template update.** Replace the "Assess the Proof Chain" section of ana-learn.md with instructions to run `ana proof audit --matrix` as the single orientation command, then present a three-option menu (cleanup / highest-impact / recent findings) with an adaptive recommendation. Both the template (`packages/cli/templates/.claude/agents/ana-learn.md`) and the dogfood instance (`.claude/agents/ana-learn.md`) must be updated identically — agent definitions aren't overwritten on re-init.

## Acceptance Criteria
- AC1: `ana proof audit --json` output includes `by_severity_action` field — a flat object with `"severity/action": count` pairs for all non-zero combinations among active findings.
- AC2: `ana proof audit` human-readable output includes a cross-tab line showing severity/action pairs inline (e.g., `3 risk/scope · 18 debt/scope · 8 observation/monitor`), displayed after the existing severity breakdown line.
- AC3: `ana proof audit --matrix` returns ONLY orientation data — no `by_file` array, no individual findings listed. Output includes: total_active, actionable_count, monitoring_count, by_severity, by_action, by_severity_action, recent_entries (last 3), stale_count, stale_high, stale_medium.
- AC4: `ana proof audit --matrix --json` returns a JSON envelope with the orientation payload. `recent_entries` array contains objects with: slug, result, finding_count (active findings from that entry), completed_at, ago (human-readable relative time string).
- AC5: `ana proof audit --matrix` human-readable output displays a formatted orientation block: summary line, cross-tab, staleness signal, and recent proofs with relative timestamps.
- AC6: `--matrix` skips the anchor-presence file I/O loop — it does not read source files to check anchor existence.
- AC7: `--matrix` ignores `--severity` and `--entry` filters. The orientation is always the full picture. (If both are passed, `--matrix` takes precedence with no error.)
- AC8: Edge case: 0 active findings with `--matrix` returns the orientation payload with zeros and empty matrix, but still includes recent_entries if proof chain entries exist.
- AC9: Edge case: 0 proof chain entries (no proof_chain.json or empty entries array) with `--matrix` returns a clean "no data" response.
- AC10: The ana-learn.md template instructs Learn to run `ana proof audit --matrix` as the first orientation command and present a three-option menu (cleanup / highest-impact / recent findings) with adaptive recommendation logic.
- AC11: `--matrix` without `--json` does not print the file-grouped finding list. It prints only the orientation block.
- AC12: `by_severity_action` in standard (non-matrix) audit output correctly reflects filters — if `--severity risk` is applied, only risk/* pairs appear in the cross-tab.

## Edge Cases & Risks
- **Long cross-tab line in terminal.** If all 12 possible severity/action pairs have non-zero counts, the inline display wraps awkwardly. Mitigate: show top 5 pairs by count in human-readable, full set in JSON.
- **Stale computation cost.** `computeStaleness` cross-references findings against subsequent entries' `modules_touched`. With 118 entries this is fast (<50ms). At 1000+ entries it may need profiling. Acceptable for now.
- **`--matrix` + `--full` interaction.** `--full` is meaningless when `--matrix` suppresses findings. Ignore `--full` when `--matrix` is present (no error, just no effect). Document in help text.
- **`finding_count` in recent_entries.** This counts active findings FROM that entry (not total findings produced). Findings may have been closed/promoted since — count reflects current state, not historical.
- **Template backward compatibility.** Existing Learn installations (dogfood) keep their current template until re-init. Only new installations and our dogfood (manually updated) get the new startup flow.

## Rejected Approaches

**New `ana proof orient` subcommand.** Cleaner conceptual separation but adds surface area. The data comes from the same source as audit (active findings iteration + chain entries). A flag on audit is lower friction, consistent with existing `--full`/`--severity`/`--entry` pattern, and avoids teaching users a new command.

**Cross-tab on `health` instead of `audit`.** Health computes trajectory and hot modules from the full chain history. The cross-tab is about current active findings — audit's domain. Putting it on health would require audit-style iteration inside health.

**`--matrix` returns findings AND orientation.** Considered including the finding list alongside orientation data. Rejected because it defeats the purpose — orientation is about shape and direction, not detail. Learn runs `--matrix` first (fast, small), then the appropriate filtered audit (detailed, focused).

**Nested `by_severity_action` structure** (`{ risk: { scope: 3 } }`). More structured but harder to read, harder to iterate, and the keys aren't independently meaningful. The pair `risk/scope` IS the meaningful unit.

## Open Questions

None. All investigation questions resolved during scoping conversation.

## Exploration Findings

### Patterns Discovered
- `proof.ts:1578-1857`: Audit subcommand handler. Collects active findings with entry context, applies filters, groups by file, outputs JSON or human-readable. The severity/action counting already happens at lines 1734-1745 — the cross-tab accumulator goes right alongside.
- `proof.ts:1643-1654`: Anchor-presence check loop — reads every referenced file from disk. `--matrix` must skip this entirely (early return before the loop).
- `proofSummary.ts:1123-1226`: `computeStaleness` — the function `--matrix` calls for stale counts. Takes a chain object, returns `{ total_stale, high_confidence, medium_confidence }`. Already exported.
- `work.ts:719`: Inline relative time formatting (`${days}d ago`). No shared utility exists — a small `formatRelativeTime` helper is needed.

### Constraints Discovered
- [TYPE-VERIFIED] ChainHealth interface (proofSummary.ts:580-601) — used in every JSON envelope's `meta` block. The cross-tab goes in the `results` object, NOT in `meta`/ChainHealth, to avoid touching this widely-used interface.
- [OBSERVED] audit's JSON response shape (`results` key) — currently has `total_active`, `by_severity`, `by_action`, `by_file`, `overflow_files`. Adding `by_severity_action` is additive. `--matrix` replaces the entire `results` object with the orientation payload.
- [OBSERVED] `--full` only works with `--json` (line 1591-1595). Precedent for flag interaction validation.

### Test Infrastructure
- `tests/commands/proof.test.ts`: Large test file covering proof subcommands. Audit tests use fixture chains with known findings. Pattern: construct a chain JSON, write to temp dir, run command, assert output.

## For AnaPlan

### Structural Analog
`packages/cli/src/commands/proof.ts` lines 1578-1857 (the audit subcommand itself). The `--matrix` flag is a new branch within this existing handler — same pattern as `--full` changing behavior.

### Relevant Code Paths
- `packages/cli/src/commands/proof.ts:1578-1857` — audit handler (where both changes land)
- `packages/cli/src/commands/proof.ts:1634-1672` — active findings collection loop (cross-tab accumulator goes here)
- `packages/cli/src/commands/proof.ts:1734-1745` — existing severity/action counting (cross-tab is the intersection)
- `packages/cli/src/utils/proofSummary.ts:1123-1226` — `computeStaleness` (called by `--matrix`)
- `packages/cli/templates/.claude/agents/ana-learn.md:65-113` — "Assess the Proof Chain" and "Present State" sections (template)
- `.claude/agents/ana-learn.md:65-113` — same sections in dogfood instance (must match template exactly)

### Patterns to Follow
- Flag interaction: see `--full` handling at lines 1591-1595 (validates flag combinations, prints hint)
- JSON output: use `wrapJsonResponse('proof audit', result, chain)` for the envelope
- Human-readable: use `chalk.dim()` for secondary info, bare text for primary. Match existing inline count style: `4 risk · 34 debt · 19 observation`

### Known Gotchas
- The anchor-presence loop (1643-1654) is inside the active findings collection. If `--matrix` early-returns before grouping, it must still iterate findings for counts — just skip the file I/O for each finding.
- `computeStaleness` expects the full chain object. Audit already has it parsed at line 1610.
- The `SEVERITY_ORDER` constant (used for sorting) is defined elsewhere in the file — search for it if needed for cross-tab display ordering.

### Things to Investigate
- Determine whether `--matrix` should early-return after collecting counts (skipping the grouping/sorting/file-group logic entirely) or whether it should fork after collection. Early return is cleaner.
- The relative time formatter: determine precision rules. "2 hours ago", "1 day ago", "3 days ago". No need for "2 minutes ago" granularity — proofs complete on the scale of hours/days.
