---
req: REQ-req-v1-hardening
title: work status and req list disagree on what "open" means
priority: medium
status: open
created: 2026-07-02
source: verify-findings (requirements-contract verify report, 2026-07-02)
appetite: half a day
---

## Problem

`ana work status` counts validation-malformed requirement files as open, while `ana req list` counts them as malformed — two commands report different numbers for the identical backlog.

## Evidence

Verify's headline finding on the `requirements-contract` build (live-reproduced, not theoretical): a backlog of one valid-critical + two validation-malformed files (`priority: P1`; unknown `severity` key) renders as **"3 open requirements (highest: critical)"** in `ana work status` and **"1 open · 2 malformed"** in `ana req list`. Cause: `getRequirementsSummary` (`packages/cli/src/commands/req-state.ts:219`) filters on `status: open` and guards only against YAML *parse* failures — it never runs `validateReqContent`. The inline comment "malformed files never count toward the open probe" is true only for parse failures. A second, related debt from the same report: the `runReqList` `--json` mapping (reshapes malformed rows to `{req, malformed, error}`, strips `stale`) is untested — A017/A018 assert against the data layer only (`packages/cli/tests/commands/req.test.ts:208`), so a mapping regression would pass CI.

## Done Looks Like

One definition of "open" shared by both commands — the same backlog produces the same count everywhere it's reported (ℹ line, status `--json`, `req list`). The `--json` emission path has test coverage. The misleading inline comment matches the actual behavior.

## Leads

Verify suggested two shapes: exclude validation-malformed files from the probe's count (runs `validateReqContent` per file — mind the status hot path), or keep the probe cheap and reconcile the *wording* instead. The validator core `validateReqContent(content, stem)` already exists and is content-based, so the probe could reuse it without extra file reads.

## Constraints

The status probe must stay a single best-effort directory read — no config reads (the `retire-capture-self-arming-C3` constraint held in v1 and must keep holding), and no meaningful latency added to `ana work status`, which every agent runs on boot.

## Not This

Not a redesign of the malformed-file UX (⚠ rows in `req list` are correct); not validation-on-write enforcement — hand-editing files into a temporarily invalid state must stay legal.
