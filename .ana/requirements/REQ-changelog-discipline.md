---
req: REQ-changelog-discipline
title: Behavior changes merge without changelog entries — enforce at PR time
priority: medium
status: open
created: 2026-07-02
source: 1.3.0 release retro + same-day recurrence (requirements-contract, 2026-07-02)
appetite: a day
---

## Problem

Nothing forces a CHANGELOG entry when behavior changes, so release notes are reconstructed by archaeology at cut time instead of accumulated as work merges.

## Evidence

The 1.3.0 cut required excavating **490 commits / 25 pipeline proofs** into a completely empty `[Unreleased]` section — hours of reconstruction and the release shipped weeks late relative to the work. The failure mode recurred *the very next cycle*: `requirements-contract` (a full user-facing feature — new command group, template changes) merged 2026-07-02 and `[Unreleased]` is empty again right now. The only mechanical check lives in `release.yml` and fires at tag time — it verifies an entry *exists for the version being cut*, which is satisfiable by last-minute archaeology and enforces nothing per-PR. Roadmap Step 7 has carried this item since June.

## Done Looks Like

A behavior-changing PR cannot merge without either a `[Unreleased]` changelog addition or an explicit opt-out (label or commit trailer) — and cutting a release becomes assembling accumulated entries, not reconstructing history. Works for both pipeline PRs (Build writes the entry as part of the change) and direct commits.

## Leads

Two shapes surfaced in the release retro: adopt **changesets** (heavier, monorepo-standard, brings versioning automation) or a **lightweight CI check** on `test.yml` (diff touches `packages/cli/src/**` → require a CHANGELOG.md diff or a `no-changelog` label). The pipeline angle: the Build agent template could treat "user-visible behavior change ⇒ changelog entry" as part of the build report contract, making the CI check a backstop rather than the teacher.

## Constraints

Must not block docs-only, test-only, or website-only changes (website deploys independently and never enters the CHANGELOG per the release runbook). Keep the runbook's manual release ceremony intact — this governs entry *accumulation*, not the cut.

## Not This

Not automated versioning or automated releases; the human decides when and what to cut. Not a commit-message convention (conventional-commits was already effectively rejected — 0.02 adoption in the git history).
