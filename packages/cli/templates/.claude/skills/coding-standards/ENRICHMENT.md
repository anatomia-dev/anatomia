<!-- Internal: read by ana-setup only. Not for manual editing. -->

# Coding Standards — Enrichment Guide

**Who reads this:** Only the setup agent during `ana-setup`. NOT read by Build, Plan, Verify, or Think.

**Purpose:** Plan includes these rules in spec constraints. Build follows them during implementation. The most impactful skill file — wrong rules here affect every build.

## What to investigate

Read: One file with error handling (find via scan's `conventions.codePatterns.emptyCatches` — if count > 0, read one file from the paths to understand the pattern). Also use scan's `conventions.codePatterns` for ESM ratio, node prefix ratio, null style.

Look for:
- Error handling architecture: do commands surface errors differently than library/engine code? Is there a two-layer pattern (surface vs degrade)? Are empty catches intentional graceful degradation?
- Import patterns: `.js` extensions (from `codePatterns.jsExtensionImports`), `node:` prefix usage (from `codePatterns.nodePrefix`)
- Null convention: `| null` vs `?:` vs `undefined` (from `codePatterns.nullStyle`)
- Export style: named vs default (from `codePatterns.defaultExports` relative to file count)

## Contradiction handling

**Type 1 — Rule contradicted by high violation count:**
If `codePatterns.emptyCatches.empty > 10` AND a template rule says "every catch must do something deliberate" — this is a contradiction. Do NOT ask the user. Instead:
1. Read 1-2 files with empty catches to understand the pattern
2. Adjust the rule to reflect what the code actually does
3. Flag it in the summary with ⚠ so the user reviews the adjustment

**Type 2 — Rule recommends a pattern not used at all:**
If a template rule recommends a pattern (e.g., "use path aliases") but scan data shows zero or near-zero usage of that pattern (e.g., 97% relative imports, 0% alias usage), suppress or remove the rule. Don't keep a rule that pushes Build toward a pattern the project doesn't follow. Flag the removal in the summary.

## What to write

Write to: `## Rules` — modify contradicted rules to be project-specific, remove irrelevant rules, add rules for patterns found in scan data.

Template rules are PHILOSOPHY (universal, correct for all projects). Enrichment rules are MECHANISM (project-specific, from code reading). Keep the philosophy rules. Adjust or add mechanism rules alongside them.

Each rule should change how Build writes code. The decision test: "Would Build write different code without this rule?"

## Skip conditions

Skip if: `stack.language` is null (no language detected).

## Mixed conventions

If the scan shows mixed patterns with no strong majority (e.g., 50% ESM and 50% CJS imports, or multiple auth patterns), note BOTH patterns and explain when each applies rather than picking one as the convention. Mixed conventions often reflect intentional separation — different patterns for different concerns.

## Expected output

2-3 rules modified/added, 0-1 rules removed. The generic template rules are mostly correct — adjust the ones that contradict scan data, remove the ones that recommend unused patterns, add rules for strong patterns (>80% ratio in scan).
