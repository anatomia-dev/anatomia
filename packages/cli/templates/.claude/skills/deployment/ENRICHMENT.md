<!-- Internal: read by ana-setup only. Not for manual editing. -->

# Deployment — Enrichment Guide

**Who reads this:** Only the setup agent during `ana-setup`. NOT read by Build, Plan, Verify, or Think.

**Purpose:** Build and Verify read the skill file for CI/CD constraints. Plan references it when specs touch deployment.

## What to investigate (silent, before questions)

Read CI workflow files. Check `deployment.ci` in `scan.json` for the CI system. If GitHub Actions: read `.github/workflows/*.yml`. If GitLab: read `.gitlab-ci.yml`. Extract:
- CI matrix dimensions (OS × Node/Python versions)
- Pipeline step order (build → test → lint → deploy)
- Triggers (push to main, PR, manual)
- Required checks before merge

Also check `deployment.platform` — if Vercel/Netlify/Docker detected, note the platform constraints.

## Question (asked during skill gate, loaded with investigation)

Present what you found from CI parsing, then ask: "How does code reach production — push to main goes live, or do you have staging/preview?" This fills the gap between what's in the repo and how the team actually deploys.

For CLI/library projects (`applicationShape: cli` or `library`): Deployment = CI + npm publish. No server deployment. The question becomes: "Is there a release process, or do you publish manually?"

## What to write

Write to: `## Rules` — CI pipeline rules from investigation + deployment strategy from the human answer.

## Skip conditions

Skip if: `deployment.ci` is null AND `deployment.platform` is null (no CI or deployment detected).

## Expected output

2-4 rules.
