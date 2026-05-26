# Scope: Qualify Validation Finding Title

**Created by:** Ana
**Date:** 2026-05-26

## Intent
The validation finding title presents heuristic-derived counts as exact numbers: `185/464 API routes have no validation imports`. The check is file-level import matching in the first 30 lines — a useful heuristic that's ~76% accurate on the numerator across our test repos. The title should communicate approximation, not false precision. Additionally, the terminology says "routes" when the check operates on route *files* — one file can export multiple HTTP method handlers.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — 1 file changed, 2 string edits + test updates
- **Surface:** cli
- **Files affected:** `src/engine/findings/rules/validation.ts` (warn title at line 115, pass title at line 103)
- **Blast radius:** Minimal. The title is rendered in CLI output and stored in `scan.json`. AGENTS.md generation (`assets.ts:449-467`) uses `f.id` and `f.severity`, not `f.title` — the constraint "Validate all API route input with {lib} at the boundary" is unaffected. The detail display (shipped in `show-finding-details`) provides the methodology context below the title.
- **Estimated effort:** < 30 minutes
- **Multi-phase:** no

## Approach
Change the warn title from exact-negative to tilde-approximation framing. Change the pass title to use consistent "route files" terminology. Both are string-level edits in `validation.ts`.

## Acceptance Criteria
- AC1: Warn title renders as `~{n} of {total} API route files may lack input validation` (with tilde prefix on the unvalidated count).
- AC2: Pass title renders as `All {total} API route files have validation imports detected`.
- AC3: AGENTS.md constraint "Validate all API route input with {lib} at the boundary" continues to fire for repos with warn-severity validation findings.
- AC4: Existing tests for the validation rule pass with updated expected title strings.
- AC5: `ana scan` on dub shows `⚠ ~185 of 464 API route files may lack input validation`.

## Edge Cases & Risks
- **Tilde with small numbers:** A repo with `~3 of 10 API route files may lack input validation` — the tilde still reads correctly. No special casing needed.
- **Exact zero:** The pass path (`All 10 API route files have validation imports detected`) doesn't use tilde — correct, since 100% coverage is exact.
- **scan.json consumers:** External tools parsing `scan.json` may match on title text. The title change is a breaking change for exact-string matchers. `f.id` (`api-validation`) and `f.severity` are stable identifiers — consumers should use those.

## Rejected Approaches
- **Positive framing (`279 of 464 have validation detected`):** Reads as achievement, not warning. Softens the signal. Risks severity demotion to `info`/`pass`, which would kill the AGENTS.md constraint — the highest-leverage output of this finding.
- **"detected" qualifier without tilde (`185/464 API routes have no validation imports detected`):** "Detected" modifies the action ("we detected a problem"), not the certainty ("our detection may be incomplete"). All three reviewing agents rejected this independently.
- **Percentage-based display (`~40% of API route files...`):** Less informative than absolute counts. The founder wants to know the scale of the gap, not just the ratio.

## Open Questions
None — all resolved during investigation.

## Exploration Findings

### Patterns Discovered
- `validation.ts:99-107`: Pass path returns when `validated.length === routeFiles.length`. Title uses "routes" — should say "route files" for consistency with warn title.
- `validation.ts:110`: Severity threshold is `routeFiles.length < 10 ? 'info' : 'warn'`. Count-based, not percentage-based. Noted as a separate potential improvement but not in this scope.
- `validation.ts:39`: 30-line import window. Only 2 of 462 dub routes have validation imports after line 30. Window is reasonable.

### Constraints Discovered
- [TYPE-VERIFIED] AGENTS.md generation (`assets.ts:449-453`) uses `f.id` lookup (`findingInstructions['api-validation']`), not `f.title`. Title change does not affect AGENTS.md.
- [OBSERVED] The detail line (shipped in `show-finding-details`) provides methodology context below the title. The title qualifier and the detail are complementary — the tilde signals "approximate," the detail explains how.
- [OBSERVED] Multi-line import detection bug — the `hasValidationImport` function only checks lines containing `import`/`require` keywords, missing multi-line destructured imports where the `from "..."` clause is on a separate line. This accounts for ~34 of dub's 36-route overcount and is a systematic pattern affecting any repo with multi-line imports from schema packages. **Not in scope** — documented here for future work. Fix would be ~15 lines: check all 30 lines for `VALIDATION_PATH_PATTERNS` and `VALIDATION_MODULES` regardless of whether the line contains `import`/`require`, since the `from "..."` clause carries the module specifier.

### Test Infrastructure
- Validation rule tests check the returned `Finding` object including `title` string. Two test assertions need updated expected strings (warn case and pass case).

## For AnaPlan

### Structural Analog
`validation.ts:103` (pass title) — same file, same pattern. Both are template literal title strings in a `Finding` return object.

### Relevant Code Paths
- `src/engine/findings/rules/validation.ts:115` — warn title to change
- `src/engine/findings/rules/validation.ts:103` — pass title to change for consistency
- `src/commands/init/assets.ts:449-453` — AGENTS.md generation (verify no impact)

### Patterns to Follow
- Template literal interpolation for dynamic values in title strings — existing pattern at the same location.

### Known Gotchas
- The pass title at line 103 currently says "API routes" — update to "API route files" to match the warn title. This is a consistency fix, not a semantic change.
- Don't touch line 110 (severity threshold) or line 116 (detail text, already changed in `show-finding-details`). This scope is title-only.

### Things to Investigate
- None. The changes are two string edits.
