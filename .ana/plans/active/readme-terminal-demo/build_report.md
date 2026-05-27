# Build Report: README Terminal Demo

**Created by:** AnaBuild
**Date:** 2026-05-27
**Spec:** .ana/plans/active/readme-terminal-demo/spec.md
**Branch:** feature/readme-terminal-demo

## What Was Built

- `assets/demo/dub-scan.tape` (created): VHS tape file that records `ana scan .` on dub. Sets 1200x1000 terminal, Catppuccin Mocha theme, font size 18, 50ms typing speed, 25s hold. Documents full clone requirement and re-recording instructions.
- `assets/demo/dub-scan.gif` (created): 155KB animated GIF recorded from a full clone of dub at `/Users/rsmith/Projects/ana-dogfood-p2/dub`. Shows full scan output including Intelligence section (Activity, Hot files, Docs).
- `README.md` (modified): Replaced lines 11-50 (static scan output code block) with `<img>` tag embedding the GIF, followed by `npx` command in bash block, followed by "See more examples" link. The `## Scan any project in 10 seconds` heading preserved.

## PR Summary

- Replace the static README hero code block with an animated GIF of `ana scan .` running on dub, showing the full scan output including Intelligence section
- Add a VHS tape file (`assets/demo/dub-scan.tape`) as a reproducibility artifact for re-recording the demo
- Restructure the hero CTA: GIF first, then `npx` command, then "See more examples" link to docs

## Acceptance Criteria Coverage

- AC1 "README hero contains animated GIF showing ana scan on dub with Intelligence section" → GIF recorded from full dub clone, visually verified 155KB output contains full scan. Manual verification only (animated GIF content).
- AC2 "Static code block removed" → README no longer contains "Here's what you'll see" or "inbox-zero". Verified by reading final README.
- AC3 "npx command appears below the GIF" → Lines 13-15 of final README show bash block after img tag.
- AC4 "GIF embedded via img tag with alt text and width=600" → Line 11: `<img alt="..." width="600" src="...">`
- AC5 "assets/demo/dub-scan.tape exists and is valid" → Created, validated with `vhs validate`.
- AC6 "GIF exists and is under 500KB" → 155KB at `assets/demo/dub-scan.gif`.
- AC7 "GIF renders correctly on GitHub" → NO TEST (requires push and browser verification)
- AC8 "GIF renders correctly on npmjs.com" → NO TEST (requires publish and browser verification)
- AC9 "See more examples link points to anatomia.dev/docs" → Line 17: `[See more examples →](https://anatomia.dev/docs)`
- AC10 "No build errors" → Pre-commit hook runs `pnpm run build` on every commit, both passed.
- AC11 "No test regressions" → 2981 passed, 2 skipped (matches baseline exactly).

## Implementation Decisions

- **VHS Output path:** VHS writes the GIF to the working directory, not relative to the tape file. The `Output dub-scan.gif` directive means the GIF lands in whatever directory you `cd` into before running `vhs`. Documented this in the tape file comments with usage instructions.
- **Recorded from existing full clone:** Used the full dub clone at `/Users/rsmith/Projects/ana-dogfood-p2/dub` rather than cloning fresh. The clone is not shallow (`git rev-parse --is-shallow-repository` = false), satisfying the full clone requirement.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
pnpm run test -- --run

 Test Files  127 passed (127)
      Tests  2981 passed | 2 skipped (2983)
   Start at  01:11:55
   Duration  46.95s

 Tasks:    4 successful, 4 total
Cached:    2 cached, 4 total
  Time:    49.796s
```
Tests: 2981 passed, 0 failed, 2 skipped

### After Changes
```
pnpm run test -- --run

 Tasks:    4 successful, 4 total
Cached:    4 cached, 4 total
  Time:    42ms >>> FULL TURBO
```
Tests: 2981 passed, 0 failed, 2 skipped (all cached — no source changes)

### Comparison
- Tests added: 0
- Tests removed: 0
- Regressions: none

### New Tests Written
None — documentation-only change per spec's testing strategy.

## Verification Commands
```bash
pnpm run build
pnpm run test -- --run
pnpm run lint
vhs validate assets/demo/dub-scan.tape
```

## Git History
```
ab121493 [readme-terminal-demo] Replace README hero with animated GIF embed
79c28c2f [readme-terminal-demo] Add VHS tape file and demo GIF
```

## Open Issues

- **GIF rendering on GitHub/npm requires manual verification after push.** AC7 and AC8 cannot be verified until the branch is pushed and viewed in a browser. The `<img>` tag uses only safe attributes (`alt`, `width`, `src`) per npm's sanitizer constraints.
- **VHS Output directive is CWD-relative, not tape-relative.** The tape comments document this, but someone unfamiliar with VHS might expect the GIF to land next to the tape file. If re-recording, you must either `cd` into the dub clone or handle the output path manually.
- **Pre-existing lint warning** in `packages/cli/src/utils/git-operations.ts:198` — unused eslint-disable directive. Not introduced by this build.

Verified complete by second pass.
