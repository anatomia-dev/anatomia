# Scope: Verify Certifier — De-risk Spike

**Created by:** Ana
**Date:** 2026-06-04

## Intent

This is the first piece of a four-part initiative to make Anatomia's rigor *provable* rather than asserted. The disease: **the proof chain certifies the work but not the verification of the work.** Build is checked by Verify; Verify is checked by nobody. The independence that is the entire differentiator — the verifier never reads the build report, predicts before reading — lives today only in a prompt asking nicely. Anatomia's founding principle is "verified over trusted," and the product currently *trusts its own verifier*. That is a self-consistency gap at the product's own root.

The layer under it: a prompt is a request, not a constraint, and the data proves the rule isn't obeyed (predictions are absent in 71–80% of honest verify runs). The certifier is the first place we convert an agent-prompt-guarantee into a mechanical one, starting with the most load-bearing rule. The threat model is verifier **sloppiness/drift, not malice** — we catch a verifier that got lazy and skipped its protocol while we shipped the result stamped "proven." We advertise exactly that, never "tamper-proof against a malicious model."

**This scope does NOT build the certifier.** It builds the de-risk spike: prove the single load-bearing signal is mechanically recoverable from real transcripts, with zero false violations, and produce a citable go/no-go number. The full certifier (gate, proof field, command surface) is deferred until the spike's number says go.

## Complexity Assessment

- **Kind:** feature
- **Size:** small
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/utils/transcript.ts` (new) — session location, window reconstruction, path normalization, the one check
  - A batch harness (vitest or tsx script under `packages/cli/`) that runs the check across all historical verify sessions and writes the report artifact. **No registered CLI command.**
  - Test file for `transcript.ts`
- **Blast radius:** Effectively zero. Read-only forensic over `~/.claude/projects/` and `.ana/plans/completed/`. Touches no pipeline code, no `work complete`, no proof chain, no customer-facing surface. Nothing it does can block a completion or mutate state.
- **Estimated effort:** Half a day to one day.
- **Multi-phase:** no

## Approach

Build the smallest thing that de-risks the most. The single largest uncertainty in the entire initiative is: *can we mechanically recover `never_read_build_report` from historical verify transcripts, reliably, with no false violations on honest work?* Everything downstream is moot if that signal is noise. So we prove it on our own data before building anything that depends on it.

`transcript.ts` locates a slug's **accepted** verify session in `~/.claude/projects/<dashified-cwd>/`, reconstructs the verify window, and runs exactly one deterministic check — `never_read_build_report` — scoped to that window. A throwaway batch harness runs it across all ~217 historical verify sessions in `.ana/plans/completed/` and emits a citable report: how many sessions located, how many returned a clean verdict, and every positive with its exact triggering tool action so each can be eyeballed by hand.

The production architecture this spike validates (but does **not** build): **transcript-first for reading the evidence** (the transcript is written by Claude Code itself — a harness-written, third-party witness, independent of our agent, which is the stronger evidence source for an *independence* claim), with a **deterministic session-stamp** (`CLAUDE_CODE_SESSION_ID` + cwd + timestamp written into `.saves.json` at verify time) as the production locator. The stamp removes the session-disambiguation problem for future runs. **History has no stamp**, so the spike must solve disambiguation by archaeology — which is itself part of what makes the spike a real test.

We do **not** build a `PreToolUse` hook. A hook is new agent surface in every customer's `settings.json`, can't certify our existing 187 proofs, and is our own instrument rather than an independent witness. The hook earns its place later only if the JSONL format drifts or we need Codex parity.

## Acceptance Criteria

- **AC1:** `transcript.ts` derives the project transcript directory by applying the forward dashification transform to `process.cwd()` (`/` **and** `_` → `-`). The transform is lossy/non-invertible — transform `cwd`, never invert the directory name. (Verified: `anatomia_project` → `anatomia-project`.)
- **AC2:** For a given slug, `transcript.ts` locates candidate verify sessions by first-line `agentSetting === 'ana-verify'` (NOT `agentType`, which is `None` across the corpus) and confirms the slug via the `cwd` field — which carries the worktree path `.../.ana/worktrees/{slug}` — read from **event lines, not the first line** (the first line carries only `type`/`agentSetting`/`sessionId`; verified).
- **AC3 (accepted-session disambiguation — first-class):** For each slug, the spike certifies **only the accepted verify session** — the one whose in-transcript `ana artifact save verify-report {slug}` timestamp matches the on-disk `verify-report.saved_at` for that phase (latest / PASS). Earlier FAILED re-verify sessions are **excluded from scanning**. ~13% of slugs have 2–3 verify sessions; a failed re-verify session may legitimately have read the build report, and scanning it would produce a false violation on honest work. This is a correctness requirement of `transcript.ts`, not a refinement.
- **AC4:** The verify window is reconstructed explicitly as `[ ts(ana work start {slug} | ana verify pre-check {slug}) … ts(ana artifact save verify-report {slug}) ]`, scoped to the slug. All checks run **only inside this window** (a session can interleave Build/Verify/unrelated work across hours and repos).
- **AC5:** The `never_read_build_report` check returns a violation only when an in-window **read-class tool_use** targets a `build_report*` / `build_data*` file. Read-class = `Read` (`file_path`), `Grep` (`pattern`/`path`), `Glob` (`path`), `Bash` (`command`). The Bash read-list **must include** `git show` / `git cat-file` (a legit `git show origin/main:...build_report.md` must not false-block).
- **AC6:** Matching is by **basename/suffix**, because transcript paths are absolute (`/.../.ana/worktrees/{slug}/...`). An anchored full-path regex would never match.
- **AC7:** The check scans **only tool_use `input` fields** — never assistant text, tool results, or the system prompt. (`build_report` appears in the system prompt and `work status` output; a whole-file grep over-matched 301/302 honest sessions. Input-only scoping is what makes the signal real.)
- **AC8 (usefulness bar):** Location / clean-verdict rate ≥ 90% across historical verify sessions. Misses are acceptable — in production they fail-open to `unverifiable`. This is the "is it useful" target, not a safety bar.
- **AC9 (safety bar — separate and absolute):** The false-violation rate is **literally zero**. Every positive the spike reports is eyeballed against its exact triggering tool_use. One unexplained positive on known-honest work **fails the spike**. AC8 and AC9 are different gates and must not be blurred — "≥90%" must never be read as "10% false positives acceptable."
- **AC10 (citable report artifact):** The spike persists its output as a written, citable report (not console-only): total verify sessions examined, % located, % clean verdict, and **every positive with its exact triggering tool_use action**. This is the go/no-go number for the whole initiative AND the moat-strength number we will cite ("X% of the proof chain is transcript-certified"). It must survive the run as a file.
- **AC11:** `transcript.ts` is covered by tests using real or realistically-shaped transcript fixtures: a clean honest session (no violation), a session with a genuine in-window build_report read (true violation), a false-match guard (build_report in system prompt / tool result / `git show` forensic — must NOT flag), and a re-verified slug where the failed earlier session read the build report but the accepted session did not (must scan only the accepted session — exercises AC3).

## Edge Cases & Risks

- **Re-verified slugs (AC3) are the highest false-positive risk.** This is the case that turns the spike's number untrustworthy. Pinned as a first-class requirement above, not a footnote.
- **First line lacks `cwd`/`gitBranch`** (verified — only `type`/`agentSetting`/`sessionId`). Slug confirmation must read `cwd` from event lines. `gitBranch` is unusable (records launch branch `main`, not the worktree branch).
- **`git show`/`git cat-file` forensic reads** of a build report are legitimate and must not block (AC5).
- **Basename over-match:** `build_report.md` and `build_data*` must match; unrelated files must not. The eyeball pass (AC9/AC10) is the backstop.
- **Window anchors absent or malformed** (e.g. session split/compacted, missing `ana work start` line): the session is treated as **not located / unverifiable**, never as a violation. Fail-open, never fail-loud.
- **Multi-phase slugs** with phase-numbered verify reports (`verify_report_N.md`): the accepted-session match (AC3) is per-phase against the matching `verify-report-N.saved_at`.

## Rejected Approaches

- **Spike + thin gate.** Rejected. A blocking gate in `work complete` before we've *measured* the false-violation rate risks blocking legitimate customer completions. Thin is better than wrong. The gate's safety depends entirely on the number this spike produces — so the gate sequences *after* the measurement, not alongside it.
- **Hook-first (`PreToolUse`).** Rejected for v1. New agent surface in every customer's `settings.json`; can't certify our 187 existing proofs; our own instrument rather than an independent witness. Deferred, with a real future trigger (JSONL format drift or Codex parity), not a someday-hedge.
- **More than one check in the spike.** Rejected. The other transcript checks share the same window+location machinery — proving one check end-to-end proves the machinery. Adding checks adds surface, not de-risking. (See "Things to Investigate" — `read_what_it_judged` specifically is NOT de-risked by this spike.)
- **Registering an `ana verify certify` command in the spike.** Rejected. The command surface belongs with the gate scope. The spike is a library function + a throwaway batch harness. Thinner.
- **Relying on the ambient `CLAUDE_CODE_SESSION_ID` to locate the session.** Rejected as production architecture (see concern in "For AnaPlan") — but moot for the spike, which is forensic over history and locates by `agentSetting` + slug + window.
- **Whole-file `grep build_report` over the transcript.** Rejected — over-matched 301/302 honest sessions. Input-fields-only, window-scoped, basename-matched (AC5–AC7).

## Open Questions

None blocking. Design judgment AnaPlan should exercise is captured in "For AnaPlan → Things to Investigate." The historical re-verify false-positive (AC3), the two-bar split (AC8/AC9), and the citable artifact (AC10) are settled requirements, not open questions.

## Exploration Findings

### Patterns Discovered
- `.saves.json` per slug records `saved_at` + `hash` for each artifact type, phase-aware (`verify-report` vs `verify-report-N`). Written by `writeSaveMetadata` (artifact.ts:54). This is the anchor for AC3's accepted-session match.
- `buildWasSavedAfterVerify` (artifact.ts:513) and `getPhaseSavedAt` (artifact.ts:509) show the existing phase-aware `saved_at` comparison pattern to reuse for the accepted-session timestamp match.
- Transcript event lines carry `cwd`; in the sampled verify session 94 lines carried the worktree path `.../.ana/worktrees/audit-matrix-orientation` and 16 carried the repo root. First line carried neither.
- Every transcript event carries a `timestamp` (ISO). Window reconstruction and any future predictions-timestamp compare are feasible.

### Constraints Discovered
- [TYPE-VERIFIED] `agentSetting` is reliable on transcript line 1 (`ana-verify`/`ana-build`/`ana-plan`/`ana`/`ana-learn` across a 40-session sample); `agentType` is `None` on every line. Session selection MUST use `agentSetting`.
- [OBSERVED] Sampled honest verify session (`audit-matrix-orientation`): window anchors all present and parseable as Bash commands — `npx ana work start ...`, `npx ana verify pre-check ...`, `(cd packages/cli && pnpm vitest run)`, `npx ana artifact save verify-report ...`. Zero build_report reads. Reads all worktree-absolute. Confirms the thesis is recoverable by hand.
- [OBSERVED] The sampled verify session **ended at `save verify-report`** — `ana work complete` was not in it. Corroborates that complete ≠ verify session in general, which is why the production locator must be the verify-time stamp, not the ambient session id (out of scope here, recorded for the gate scope).
- [INFERRED] The test runner in real verify runs is the focused Build-Brief command (`(cd packages/cli && pnpm vitest run)`), NOT `commands.test` — confirmed in the sample. Relevant to the deferred `ran_the_tests` check, not this spike.

### Test Infrastructure
- Vitest, `--run` flag required (no watch). Per-surface command: `(cd packages/cli && pnpm vitest run)`.
- Fixtures should be realistically-shaped JSONL lines (a small synthesized transcript per AC11 case) rather than copying a real 122-line session, to keep tests legible and avoid leaking real paths.

## For AnaPlan

### Structural Analog
**`packages/cli/src/commands/artifact.ts`** — specifically `readSaveMetadata` / `getPhaseSavedAt` / `buildWasSavedAfterVerify` (artifact.ts:~500–525). Same shape as what `transcript.ts` needs: read `.saves.json`, do phase-aware `saved_at` lookups, compare timestamps. The accepted-session match (AC3) is structurally this pattern applied across transcript sessions. Read it before designing the disambiguation logic.

### Functional Analog
`packages/cli/src/utils/proofSummary.ts` — same domain (reads completed-plan artifacts, derives a structured record from filesystem state), different shape (synchronous summary builder, not a transcript parser). Useful for how this codebase structures pure filesystem-reading utilities with no CLI dependency.

### Relevant Code Paths
- `packages/cli/src/commands/artifact.ts:54` (`writeSaveMetadata`), `:509` (`getPhaseSavedAt`), `:513` (`buildWasSavedAfterVerify`) — the `.saves.json` read/compare pattern.
- `~/.claude/projects/-Users-rsmith-Projects-anatomia-project-anatomia/*.jsonl` — the live transcript corpus (665 sessions) to test against.
- `.ana/plans/completed/` — 187 slugs, all with `.saves.json`, 217 verify reports — the spike's batch input.

### Patterns to Follow
- Pure utility, no CLI/`process.exit` coupling — `transcript.ts` returns structured results; the batch harness handles I/O and the report write.
- `node:` import prefix (ratio 1.0 in this codebase) and `.js` extension imports (ratio 1.0).
- The batch harness is throwaway-grade but its **output artifact is not** — the report (AC10) is the deliverable.

### Known Gotchas
- Dashification is **lossy** — transform `cwd`, never invert the dir name (AC1). A customer with `_` in their path would break an inverter.
- `cwd` is on event lines, not line 1 (AC2).
- Input-fields-only scan, or the signal drowns in the system-prompt mention (AC7).
- The accepted-session match (AC3) is the difference between a trustworthy number and a false-positive-laden one. Treat it as load-bearing.

### Things to Investigate (design judgment, not lookups)
- **The exact accepted-session match for multi-phase slugs.** AC3 says match `save verify-report {slug}` timestamp to on-disk `verify-report.saved_at`. Decide the tolerance (exact string vs nearest-timestamp) and the per-phase resolution for `verify_report_N.md`. The `.saves.json` and `getPhaseSavedAt` pattern is the basis; the matching policy is a design call.
- **Report artifact location and format (AC10).** Where does the citable report land (e.g. `.ana/plans/active/verify-certifier-spike/spike-report.md` vs a tmp path) and what's its shape? It must be quotable as a product-truth number. Design call.
- **Fixture strategy for AC11** — synthesized minimal JSONL vs sanitized real session. Lean synthesized for legibility.

### Carry-forward concerns (preserve into spec — these are gate-scope, NOT spike work, but must not be lost)
1. **Production locator = verify-time session-stamp, NOT ambient `CLAUDE_CODE_SESSION_ID`.** The sampled verify session ended at `save verify-report`; complete runs in a different session ~as often as not. The gate scope must stamp `CLAUDE_CODE_SESSION_ID` + cwd + timestamp into `.saves.json` during verify and read it at complete-time. (Concern #1 / #2.)
2. **`ran_the_tests` allowlist must derive from scan.json's detected testing framework + a sane default set**, or it false-fails non-JS customers (a Go shop runs `go test`). (Concern #5.)
3. **`read_what_it_judged` needs its own gate-scope validation** — worktree-prefix-strip + repo-relative-to-absolute matching is where naive matching previously reported 0 reads. This spike proving `never_read_build_report` green-lights the *machinery* but NOT this check specifically. (Concern #6.)
4. **Predictions prompt fix is a separate change:** make `ana-verify.md` emit a machine-readable `<!-- ana:predictions -->` anchor *before* reading code, so `predictions_before_code` can graduate from signal to blocking later. The certifier surfaced the 71–80%-skip gap; the fix is a parallel agent-template change, not certifier work. (Concern #7.)
5. **Fail-open caps the moat claim — the AC10 number must be published, not hidden.** "% transcript-certified" is the honest ceiling on the claim; if it's low, fail-open is doing too much work and the stamp matters sooner. (Concern #3.)
