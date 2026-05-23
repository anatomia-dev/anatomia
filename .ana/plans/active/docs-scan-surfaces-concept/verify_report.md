# Verify Report: Scan & Surfaces Concept Page + Docs Gaps

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-23
**Spec:** .ana/plans/active/docs-scan-surfaces-concept/spec.md
**Branch:** feature/docs-scan-surfaces-concept

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/docs-scan-surfaces-concept/.ana/plans/active/docs-scan-surfaces-concept/contract.yaml
  Seal: INTACT (hash sha256:6ce6422fdc85bc51567a05d92a1d7934248c3d452772ff5b1146ec20a6d16e62)
```

Seal: **INTACT**

Tests: 68 passed, 0 failed, 0 skipped (10 test files). Build: clean. Lint: 0 errors, 2 warnings (pre-existing in `Hero.tsx`, not in modified files).

## Contract Compliance
| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | A scan concept page exists with proper frontmatter | ✅ SATISFIED | `website/content/docs/concepts/scan.mdx:1-5` — title, description, readingTime all present |
| A002 | The scan concept page explains what the scan detects | ✅ SATISFIED | `website/content/docs/concepts/scan.mdx:7` — `## What the scan detects` section exists |
| A003 | The scan concept page explains surfaces without naming the four detection signals | ✅ SATISFIED | `website/content/docs/concepts/scan.mdx:19-35` — `## Surfaces` section describes "deployment indicators" conceptually |
| A004 | The scan concept page explains application shape | ✅ SATISFIED | `website/content/docs/concepts/scan.mdx:37-45` — `## Application shape` section exists |
| A005 | The scan concept page explains how surfaces cascade through the pipeline | ✅ SATISFIED | `website/content/docs/concepts/scan.mdx:47-65` — `## The cascade` section with full pipeline flow |
| A006 | The scan concept page includes a concrete cascade example with a surface-specific test command | ✅ SATISFIED | `website/content/docs/concepts/scan.mdx:59` — `(cd 'packages/api' && pnpm run test)` |
| A007 | The scan concept page does not reference detection signals by number | ✅ SATISFIED | grep for "Signal 1" returns 0 matches in scan.mdx |
| A008 | The scan concept page ends with navigation cards pointing to the pipeline concept | ✅ SATISFIED | `website/content/docs/concepts/scan.mdx:71` — href `/docs/concepts/pipeline` |
| A009 | The scan concept page stays within the target length | ✅ SATISFIED | `wc -l` returns 80 lines (contract: greater than 79) |
| A010 | The scan page appears first in concept navigation | ✅ SATISFIED | `website/content/docs/concepts/meta.json:3` — `pages[0]` is `"scan"` |
| A011 | All existing concept pages remain in the navigation | ✅ SATISFIED | `website/content/docs/concepts/meta.json:3` — 8 entries: scan, pipeline, skills, context, toolbelt, artifacts, contract, findings |
| A012 | The configurability guide has a surface management subsection | ✅ SATISFIED | `website/content/docs/guides/configurability.mdx:36` — `### Surface management` |
| A013 | The surface management section explains how to add a surface | ✅ SATISFIED | `website/content/docs/guides/configurability.mdx:41` — `ana config set surfaces.api.path` |
| A014 | The surface management section explains how to remove a surface | ✅ SATISFIED | `website/content/docs/guides/configurability.mdx:49` — `ana config delete surfaces.example-app` |
| A015 | The surface management section explains re-init behavior for surfaces | ✅ SATISFIED | `website/content/docs/guides/configurability.mdx:52` — "On re-init, the scan refreshes detected surfaces" |
| A016 | The surface management section mentions field protection for machine-managed fields | ✅ SATISFIED | `website/content/docs/guides/configurability.mdx:54` — mentions `path`, `language`, `framework` as machine-managed |
| A017 | The setup guide mentions stack provenance notes | ✅ SATISFIED | `website/content/docs/guides/using-ana-setup.mdx:49` — "Stack provenance notes" |
| A018 | The setup guide mentions surface gap checking | ✅ SATISFIED | `website/content/docs/guides/using-ana-setup.mdx:49` — "Surface gap checks" |
| A019 | The website builds successfully with all changes | ✅ SATISFIED | `(cd website && pnpm run build)` completed clean |

**19/19 SATISFIED. 0 UNSATISFIED.**

## Independent Findings

Predictions resolved:
1. Raw apostrophes — **not found.** Builder used `&apos;` consistently in all four files. Also proactively fixed an existing raw apostrophe in the unchanged line of using-ana-setup.mdx:47.
2. NextCards missing a target — **not found.** Both pipeline and configurability links present.
3. Vague cascade example — **not found.** Concrete with surface name, path, and exact command.
4. meta.json wrong count — **not found.** Exactly 8 entries.
5. Heading level inconsistency — **not found.** `### Surface management` is correct for a subsection within configurability.

**Surprise finding:** The surface management section contradicts itself. Line 41 shows `ana config set surfaces.api.path "apps/api"` as the way to add a new surface. Line 54 says `path` is machine-managed and "blocked from config set." Both can't be true simultaneously. If `path` is truly blocked, the documented workflow for adding a new surface doesn't work. (Note: the spec mockup also contains this contradiction, so this is an upstream issue, not a builder error.)

## AC Walkthrough

- **AC1:** `scan.mdx` exists with frontmatter and covers all four topics. ✅ PASS — verified frontmatter fields at lines 1-5, sections at lines 7, 19, 37, 47.
- **AC2:** `meta.json` includes "scan" positioned before "pipeline." ✅ PASS — `["scan", "pipeline", ...]` at line 3.
- **AC3:** At least one concrete cascade example. ✅ PASS — line 59: `(cd 'packages/api' && pnpm run test)` with surface name and path.
- **AC4:** Does NOT explain the 4 signals by name. ✅ PASS — grep for "Signal" returns 0. Content describes "deployment indicators" conceptually (lines 25-30).
- **AC5:** Configurability has surface management covering add, remove, re-init, field protection. ✅ PASS — lines 36-54 cover all four topics.
- **AC6:** Setup guide mentions stack provenance and surface gap check in Step 1. ✅ PASS — line 49, within `### 1. Config confirmation` section.
- **AC7:** 80-120 lines, direct prose, no filler, NextCards linking to pipeline. ✅ PASS — 80 lines, prose-driven, NextCards at lines 67-80 with pipeline link.
- **AC8:** Website builds successfully. ✅ PASS — `(cd website && pnpm run build)` clean.
- **AC9:** No build errors or lint warnings in modified files. ✅ PASS — 2 lint warnings are pre-existing in `Hero.tsx` (not modified).

**9/9 PASS. 0 FAIL.**

## Blockers

None. All 19 contract assertions satisfied, all 9 ACs pass, no regressions. Checked: no unescaped apostrophes in JSX content, no broken links in new content, existing links in using-ana-setup.mdx preserved (design-principles link at line 108 untouched), no lint errors in modified files, meta.json count matches contract expectation, website builds clean.

## Findings

- **Upstream — Surface management section contradicts itself on field protection:** `website/content/docs/guides/configurability.mdx:41` shows `ana config set surfaces.api.path "apps/api"` as the add workflow, but `:54` says `path` is machine-managed and blocked from `config set`. The spec mockup has the same contradiction — this is an upstream issue. Next scope touching surface management should clarify: either `path` is only blocked for existing surfaces (and allowed when creating new ones), or the add workflow uses a different command.

- **Code — scan.mdx at minimum of target range:** `website/content/docs/concepts/scan.mdx` is 80 lines, which satisfies A009 (> 79) and AC7 (80-120 range) but sits below the spec's stated target of "~90-100 lines." The content is complete and well-structured — the brevity reflects tight writing, not missing content. No action needed.

- **Code — Builder converted existing apostrophe outside diff scope:** `website/content/docs/guides/using-ana-setup.mdx:47` — the existing `that's` was changed to `that&apos;s` in a line the builder didn't otherwise modify. Correct behavior (prevents potential lint issues), but technically beyond spec scope. Harmless — the build passes and it's the right fix.

- **Code — Extra build command in configurability example:** `website/content/docs/guides/configurability.mdx:43` adds `ana config set surfaces.api.commands.build "cd apps/api && pnpm build"` — the spec mockup only showed path and test commands. Minor over-building. The example is better with three commands (realistic monorepo setup), so this improves the docs.

## Deployer Handoff

Pure documentation change — four MDX files, no code changes, no test changes. The website build is the primary gate and it passes clean. The scan concept page is the new entry point for concept navigation (first in sidebar). The proof context finding about the `/docs/reference/context#design-principles` link in using-ana-setup.mdx is unchanged — existing issue, not introduced by this build. The surface management field protection contradiction (see Findings) is worth noting for future docs work but doesn't block shipping.

## Verdict
**Shippable:** YES
All 19 contract assertions satisfied. All 9 acceptance criteria pass. Website builds clean. No regressions (68 tests still pass, lint clean on modified files). The scan concept page is well-written — concise, concrete, follows the pipeline.mdx pattern. The configurability and setup guide additions are correctly placed and match the spec's intent. One upstream contradiction noted (field protection vs. add workflow) inherited from the spec — not a builder error.
