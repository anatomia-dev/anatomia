---
name: git-workflow
description: "Invoke before any git operations — branching, committing, merging, or creating pull requests. Contains project-specific branch naming, commit format, and merge strategy."
---

# Git Workflow

## Detected
- Default branch: main
- Contributors: 4
- Ana CLI: pipeline artifacts committed via `ana artifact save` with [slug] prefix. Build agent creates `{branchPrefix}{slug}` branches (read `branchPrefix` from `.ana/ana.json`, default `feature/`). Co-author from ana.json.

## Rules
- Commit each logical change separately. Don't batch unrelated changes into one commit.
- Write commit messages that explain what changed and why: `feat: add input validation to signup` not `update files`.
- Stage specific files for each commit. Avoid `git add .` or `git add -A` — review what you're committing.
- The pre-commit hook runs typecheck and lint but NOT tests. A commit that passes the hook may still break tests. Run `pnpm test -- --run` after each commit — the hook doesn't catch test regressions.
- For non-pipeline work (sprint work, direct commits to main), use `[s{N}] type: description` format. For pipeline work, Build's agent definition specifies `[{slug}] description`. The repo has 50+ stale branches from old sprints (effort/*, s18/*, lane0/*) — current conventions are `s{N}/` for sprints and `feature/{slug}` for pipeline.

## Gotchas
*Not yet captured. Add as you discover them during development.*

## Examples
*Not yet captured. Add short snippets showing the RIGHT way.*
