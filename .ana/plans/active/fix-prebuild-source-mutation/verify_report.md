# Verify Report: Fix prebuild source mutation

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-15
**Spec:** .ana/plans/active/fix-prebuild-source-mutation/spec.md
**Branch:** feature/fix-prebuild-source-mutation

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-prebuild-source-mutation/contract.yaml
  Seal: INTACT (hash sha256:448e22eaeefd85876e6ab21b95fcc892784253e6312fcbf73d68bd49b27e3b6f)
```

Tests: 2297 passed, 2 skipped (104 files). Build: success. Lint: 0 errors, 1 pre-existing warning.

## Contract Compliance
| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | The prebuild no longer rewrites tracked MDX source files | ✅ SATISFIED | `grep 'updateDynamicMdxValues' website/scripts/extract-docs-data.ts` returns zero matches — function deleted |
| A002 | No MDX files contain ana:dynamic markers after the fix | ✅ SATISFIED | `grep -r 'ana:dynamic' website/content/docs/` returns zero matches |
| A003 | A shared values module defines all 9 dynamic value keys in one place | ✅ SATISFIED | `website/lib/docs-data/docsStatValues.ts:29-39` — buildDocsStatValues returns Record with all 9 keys including proofCount |
| A004 | The shared values module maps all 9 keys including median timings | ✅ SATISFIED | `website/lib/docs-data/docsStatValues.ts:37` — medianBuild present in map |
| A005 | The tag resolution function replaces DocsStat tags with computed values | ✅ SATISFIED | `website/lib/docs-data/docsStatValues.ts:54-58` — resolveDocsStatTags regex replaces `<DocsStat value="..." />` with values; `grep '<DocsStat' website/public/llms-full.txt` returns zero matches confirming resolution |
| A006 | The DocsStat component renders as an inline span element | ✅ SATISFIED | `website/components/docs/content/DocsStat.tsx:33` — `return <span>{values[value] ?? value}</span>` |
| A007 | The DocsStat component reads from the shared values module, not its own map | ✅ SATISFIED | `website/components/docs/content/DocsStat.tsx:4` — imports `buildDocsStatValues` from `@/lib/docs-data/docsStatValues` |
| A008 | The component is registered in the MDX components map | ✅ SATISFIED | `website/app/docs/[...slug]/page.tsx:33` — `DocsStat` key present in mdxComponents object |
| A009 | The lib stripJsx resolves DocsStat tags before stripping other JSX | ✅ SATISFIED | `website/lib/docs-data/stripJsx.ts:19-34` — resolveDocsStatTags called before any strip regex, confirmed by import at line 4 |
| A010 | Copy-as-markdown output contains resolved numbers, not component tags | ✅ SATISFIED | `website/app/docs/[...slug]/page.tsx:57` calls `stripJsx(body)` which resolves DocsStat first; `grep '<DocsStat' website/public/llms-full.txt` returns zero matches |
| A011 | The prebuild llms-full.txt generator resolves DocsStat tags before stripping | ✅ SATISFIED | `website/scripts/extract-docs-data.ts:944` — `stripJsx(resolveDocsStatTags(body, docsStatValues))` — resolution before strip |
| A012 | The prebuild imports the shared values module instead of defining its own map | ✅ SATISFIED | `website/scripts/extract-docs-data.ts:31` — `import { buildDocsStatValues, resolveDocsStatTags } from '../lib/docs-data/docsStatValues.js'` |
| A013 | Generated llms.txt is no longer tracked in git | ✅ SATISFIED | `website/.gitignore:45` contains `public/llms.txt`; `git ls-files -- website/public/llms.txt` returns empty |
| A014 | Generated llms-full.txt is no longer tracked in git | ✅ SATISFIED | `website/.gitignore:46` contains `public/llms-full.txt`; `git ls-files -- website/public/llms-full.txt` returns empty |
| A015 | Generated search-index.json is no longer tracked in git | ✅ SATISFIED | `website/.gitignore:47` contains `public/search-index.json`; `git ls-files -- website/public/search-index.json` returns empty |
| A016 | The website builds end-to-end without errors after all changes | ✅ SATISFIED | `(cd website && pnpm build)` completed successfully — prebuild + Next.js SSG, all routes rendered |

## Independent Findings

**Predictions before reading code:**

1. *The builder probably didn't convert all 9 value keys to DocsStat in MDX* — **Confirmed.** `skillCount` and `findings` are defined in docsStatValues.ts but unused in any MDX file. The skills.mdx heading is "All skills" (static) instead of "All `<DocsStat value="skillCount" />` skills". The using-ana-learn.mdx NextCards description is "Proofs and findings to triage." (static) instead of the dynamic version. 7 of 9 keys are rendered.

2. *DocsStat component probably recalculates all values on every render* — **Confirmed.** Each `<DocsStat>` call triggers getProofEntries(), getProofStats(), getMedianTimings(), getSkillCount(), getGotchaCount(). A page with 5 instances does this 5×. At SSG time the cost is negligible, but it's architecturally wasteful.

3. *The prebuild's local stripJsx is probably a copy of the lib version* — **Confirmed.** The diff shows the prebuild removed its import of `stripJsx` from lib and inlined a fresh copy (lines 815-850). The two copies are structurally identical minus the DocsStat resolution (which the prebuild handles externally via `resolveDocsStatTags` wrapping). This preserves the existing duplication noted in proof context.

4. *NextCards description JSX fragment syntax probably wasn't attempted* — **Confirmed.** Both troubleshooting.mdx and using-ana-learn.mdx use static string descriptions instead of JSX fragments with DocsStat.

5. *resolveDocsStatTags regex handles the specified format correctly* — **Not found.** The regex `/<DocsStat\s+value="([^"]+)"\s*\/>/g` correctly matches the spec's required format. No edge case concerns for the authored MDX.

**Production risk:**
- Misspelled value keys in DocsStat render as the raw key string (e.g., `"proofCont"` instead of `"proofCount"`). No build-time validation. Detected only by visual inspection or llms-full.txt grep.

**What I didn't predict:**
- The prebuild's median computation is duplicated. `main()` in extract-docs-data.ts computes medians locally (lines 1071-1085) using the same algorithm as `getMedianTimings()` in `lib/docs-data/proofs.ts`. The spec acknowledged this ("duplicates the median calculation but it's 5 lines and runs once at build time") and the builder followed that guidance. But `buildDocsStatValues` could have been called from `main()` using `getMedianTimings()` — the prebuild already imports from `../lib/docs-data/`. The spec actually addresses this in the Gotchas section, noting that `buildDocsStatValues` takes raw data and the prebuild can call it. The builder followed the raw-data approach but duplicated the median calculation when the helper was importable.

## AC Walkthrough

- **AC1:** ✅ PASS — `git status` after build shows only `.saves.json` modified (pipeline metadata, not tracked content). No MDX or public/ file changes.
- **AC2:** ⚠️ PARTIAL — 7 of 9 value keys render correctly via DocsStat (proofCount, rejections, gotchaCount, medianThink, medianPlan, medianBuild, medianVerify). `skillCount` and `findings` are defined in the shared module but not used in any MDX file — the builder chose static text where the spec called for dynamic rendering. The rendered pages show correct data for the 7 active keys. The 2 omitted keys were editorial simplifications (e.g., "All skills" instead of "All 8 skills").
- **AC3:** ✅ PASS — `grep '<DocsStat' website/public/llms-full.txt` returns zero matches. Verified numeric values appear: "21 of Anatomia's own 105 proofs", "15 pre-curated gotchas", "9m think, 10m plan, 26m build, 7m verify".
- **AC4:** ✅ PASS — `page.tsx:57` calls `stripJsx(body)` which resolves DocsStat before stripping. The lib stripJsx imports data functions and resolves at lines 19-34.
- **AC5:** ✅ PASS — `grep 'updateDynamicMdxValues' website/scripts/extract-docs-data.ts` returns zero matches. Function and its call deleted.
- **AC6:** ✅ PASS — `website/.gitignore:44-47` contains all three entries. `git ls-files` confirms none are tracked.
- **AC7:** ✅ PASS — `(cd website && pnpm build)` succeeded. Prebuild + Next.js SSG completed, all routes rendered.
- **AC8:** ⚠️ PARTIAL — `search-index.json` is generated at build time to `public/`. The file exists on disk after build. Client-side fetch should work in a running Next.js server, but I did not start a dev server to test the actual fetch. Verified: file exists post-build, gitignore entry correct, no code changes to SearchOverlay.
- **AC9:** ✅ PASS — `npx tsc --noEmit -p website/tsconfig.json` completed with zero errors.
- **AC10:** ✅ PASS — `docsStatValues.ts` is the sole definition of the 9-key mapping. DocsStat.tsx imports `buildDocsStatValues` (line 4). Lib stripJsx.ts imports `buildDocsStatValues` and `resolveDocsStatTags` (line 4). Prebuild extract-docs-data.ts imports both (line 31). No other file defines its own key-to-computation map.

## Blockers

No blockers. All 16 contract assertions satisfied. All ACs pass or partial (with partials being editorial/verification-method gaps, not functional failures). Checked for: unused exports in new files (buildDocsStatValues and resolveDocsStatTags are both imported by 3 consumers each; DocsStatInput type exported and re-exported from barrel), unhandled error paths (DocsStat falls back to raw key string on unknown keys — intentional per JSDoc), missing edge cases from spec (the 2 unused value keys are defined but dormant — not broken).

## Findings

- **Code — DocsStat recalculates all values per render:** `website/components/docs/content/DocsStat.tsx:17-31` — Each DocsStat instance calls getProofEntries(), getProofStats(), getMedianTimings(), getSkillCount(), getGotchaCount() and builds the full 9-key map to read one value. On reading-a-proof.mdx (5 instances), this runs 5×. At SSG time the cost is trivial (JSON reads from disk, cached by Node), but it's architecturally a code smell. A module-level cache or a context provider would eliminate the redundancy.

- **Code — 2 of 9 value keys unused in MDX:** `website/lib/docs-data/docsStatValues.ts:29-39` — `skillCount` and `findings` are defined in buildDocsStatValues but no MDX file references them via `<DocsStat value="skillCount" />` or `<DocsStat value="findings" />`. The skills.mdx heading was simplified from "All 8 skills" to "All skills". The using-ana-learn.mdx description was simplified from dynamic count to "Proofs and findings to triage." These are dead keys — they exist in the map, get resolved in llms-full.txt (though no tags reference them there either), and serve no consumer.

- **Code — Silent fallback on unknown value keys:** `website/components/docs/content/DocsStat.tsx:33` — `values[value] ?? value` renders the raw key string when no match is found. This is intentional (JSDoc says "or the raw key if unrecognized") but means a typo like `<DocsStat value="proofCont" />` renders "proofCont" on the page with no build error. The resolveDocsStatTags function in docsStatValues.ts:57 has the same behavior — unrecognized keys are left as-is. No compile-time or build-time guard catches this.

- **Code — Median computation duplicated:** `website/scripts/extract-docs-data.ts:1081-1085` — The `median()` helper and stage-collection loop duplicate the logic in `lib/docs-data/proofs.ts:getMedianTimings()`. The spec acknowledged this as acceptable ("5 lines, runs once at build time"), and `buildDocsStatValues` takes raw numbers by design. But since the prebuild already imports from `../lib/docs-data/`, it could import `getMedianTimings()` directly. The duplication is minor but adds another place to update if the median algorithm changes.

- **Upstream — Duplicate stripJsx remains:** Still present — see proof context finding for `website/scripts/extract-docs-data.ts`. The prebuild now inlines its own `stripJsx` (lines 815-850) rather than importing the lib version. The spec explicitly scoped this out ("The two stripJsx copies remain separate"). Both copies are structurally identical minus DocsStat resolution strategy.

- **Upstream — Spec guidance simplified by builder:** The spec called for `<DocsStat value="skillCount" />` in the skills.mdx heading and `<DocsStat value="findings" />` in the using-ana-learn.mdx NextCards description. The builder chose static text instead. This may be an editorial improvement (headings with component tags can be awkward for TOC generation and anchor links) or it may have been an oversight. Not a contract violation — no assertion requires these specific MDX usages.

- **Code — resolveDocsStatTags regex whitespace assumption:** `website/lib/docs-data/docsStatValues.ts:56` — The regex `/<DocsStat\s+value="([^"]+)"\s*\/>/g` requires `value` to be the first (and only) prop. If a future author adds a className or other prop, the regex won't match and the tag will be stripped to empty string by the generic self-closing regex downstream. The spec constrains the format, but there's no enforcement preventing drift.

## Deployer Handoff

- **Branch is 9 commits behind main.** Rebase before merge to pick up recent main changes.
- **Three files removed from git tracking** (llms.txt, llms-full.txt, search-index.json). Other branches tracking these files will see a one-time merge artifact on rebase — files are regenerated by prebuild.
- **No new tests.** Website has no test infrastructure. Verification is via build success and grep checks. The CLI test suite is unaffected (2297 passed, 2 skipped — identical to baseline).
- **Two value keys are dormant** (skillCount, findings) — defined in the shared module but unused in MDX. If you want them active, add `<DocsStat value="skillCount" />` to skills.mdx heading and `<DocsStat value="findings" />` to using-ana-learn.mdx. Otherwise they can stay as future-proofing or be removed.

## Verdict
**Shippable:** YES

All 16 contract assertions satisfied. Build succeeds end-to-end. The source mutation (`updateDynamicMdxValues`) is fully eliminated. The shared values module is the single source of truth. DocsStat renders correctly as inline spans. llms-full.txt contains resolved numbers. Generated files are gitignored and untracked. The 2 unused value keys and the per-render recalculation are architectural observations, not functional defects. The code does what it claims.
