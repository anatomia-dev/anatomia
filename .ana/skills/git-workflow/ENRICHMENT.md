<!-- Internal: read by ana-setup only. Not for manual editing. -->

# Git Workflow — Enrichment Guide

**Who reads this:** Only the setup agent during `ana-setup`. NOT read by Build, Plan, Verify, or Think.

**Purpose:** Build reads the skill file to know how to commit, branch, and work with git on this project.

## What to investigate

Read: Nothing beyond `scan.json` — all signals are already detected. Use: `git.commitFormat`, `git.branchPatterns`, `git.hooks`, `git.mergeStrategy`, `git.coAuthor`, `git.recentActivity.activeContributors`.

## What to write from scan data

- **Commit format rule:** if `commitFormat.conventional` is true with high confidence, write the format. If false, describe the detected pattern (prefix style, message style).
- **Branch naming:** from `branchPatterns.primary` — "Feature branches use `{prefix}/{name}`" or "No consistent branch pattern detected."
- **Pre-commit hooks:** from `hooks.preCommit` — list what runs (typecheck, lint, test). Note what does NOT run if relevant.
- **Co-author:** from `coAuthor` — if detected, document the convention.
- **Merge strategy:** from `mergeStrategy` — squash, merge, rebase.

## Critical filter — tool-managed operations

Do NOT write rules for things the Ana CLI already manages. The pipeline handles commit formatting (`ana artifact save`), co-author trailers (from `ana.json`), branch creation (agents handle checkout), and artifact staging. This skill covers GAPS between tools, not everything about git. If the CLI already handles an operation, writing a rule for it is redundant. Only write rules for manual workflow gaps the tools don't cover.

## Skip conditions

Skip if: `git.commitCount < 10` (not enough history to detect patterns). For Level 0 maturity (no patterns detected): keep template defaults as prescriptive conventions — they ESTABLISH patterns rather than codify existing ones.

## Expected output

2-3 rules added. All from scan data. Zero file reads.
