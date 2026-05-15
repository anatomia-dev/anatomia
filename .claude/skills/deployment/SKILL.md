---
name: deployment
description: "Invoke when working on deployment configuration, CI/CD pipelines, environment variables, or release processes. Contains project-specific deploy platform conventions."
---

# Deployment

## Detected
- CI: GitHub Actions

## Rules
- CI runs on 2 runners: Ubuntu × Node 22, 24 with `fail-fast: false`. Both must pass.
- CI pipeline order: build (includes source typecheck) → typecheck tests → lint → test. If CI fails, check the FIRST failing step — later steps may cascade from an earlier failure. A type error in build will cause test failures downstream.

## Gotchas
*Not yet captured. Add as you discover them during development.*

## Examples
*Not yet captured. Add short snippets showing the RIGHT way.*
