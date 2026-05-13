# Verify Report: Content Pages — Phase 3 (Six Guide Pages)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-12
**Spec:** .ana/plans/active/content-pages/spec-3.md
**Branch:** feature/content-pages

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/content-pages/contract.yaml
  Seal: INTACT (hash sha256:896416df802a4fce8b0542d20c16951270dd5e1d97df0ee616209bcfbeac1613)
```

Seal status: **INTACT**

Tests: 2178 passed, 0 failed, 2 skipped. Build: success (27 pages generated, 16 docs pages). Lint: 2 pre-existing errors in PlatformProvider.tsx (not introduced by this build — `setState` in effect, present before phase 3).

## Contract Compliance

Phase 3 assertions are A013–A015 (guide pages) and A032 (TroubleCard registration). Remaining assertions are from phases 1–2; verified by source inspection for completeness.

| ID   | Says                                                          | Status        | Evidence |
|------|---------------------------------------------------------------|---------------|----------|
| A001 | The overview page loads at /docs with dynamic proof statistics | ✅ SATISFIED | `website/app/docs/page.tsx` exists, build output shows `/docs` route |
| A002 | Overview stats strip shows proof count from data loader       | ✅ SATISFIED | `website/app/docs/page.tsx:23` calls `getProofStats()`, passes to StatsStrip |
| A003 | Overview pipeline diagram shows all 5 stages                  | ✅ SATISFIED | `website/components/docs/content/PipelineDiagram.tsx:12-53` STAGES array has 5 entries (Think, Plan, Build, Verify, Learn) |
| A004 | Overview curated proof table shows 6 real proof entries        | ✅ SATISFIED | `website/components/docs/content/CuratedProofs.tsx:16-53` CURATED array has 6 entries |
| A005 | Curated proofs display real assertion counts from data loader  | ✅ SATISFIED | `website/components/docs/content/CuratedProofs.tsx:126-129` renders `entry.contract.satisfied` / `entry.contract.total` from ProofEntry data |
| A006 | Overview audience cards link to correct destinations           | ✅ SATISFIED | `website/components/docs/content/AudienceCards.tsx:11-36` CARDS array has 3 entries with hrefs |
| A007 | Overview has no RightRail component                           | ✅ SATISFIED | `website/app/docs/page.tsx` — no RightRail import or usage; only the catch-all page uses RightRail |
| A008 | The quickstart page loads at /docs/start                      | ✅ SATISFIED | `website/content/docs/start.mdx` exists, build output shows `/docs/start` |
| A009 | Quickstart page includes install, init, pipeline run, and complete sections | ✅ SATISFIED | `website/content/docs/start.mdx` contains h2 sections for install, init, pipeline, and complete |
| A010 | All 7 concept pages compile and render at their routes        | ✅ SATISFIED | 7 .mdx files in `website/content/docs/concepts/`: pipeline, skills, context, toolbelt, artifacts, contract, findings. Build succeeds. |
| A011 | Each concept page includes MetaRow with reading time and last reviewed | ✅ SATISFIED | All 7 concept pages have `readingTime` and `lastReviewed` frontmatter; MetaRow rendered by catch-all page.tsx:55-58 |
| A012 | Each concept page has NextCards linking to next page in sequence | ✅ SATISFIED | Grep confirms NextCards usage in all 7 concept pages |
| A013 | All 6 guide pages compile and render at their routes          | ✅ SATISFIED | 6 .mdx files in `website/content/docs/guides/`: using-ana-setup, verifying-changes, reading-a-proof, using-ana-learn, configurability, troubleshooting. Build succeeds with all routes. |
| A014 | Troubleshooting page uses TroubleCard component               | ✅ SATISFIED | `website/content/docs/guides/troubleshooting.mdx` uses `<TroubleCard>` 14 times across 3 sections |
| A015 | Each guide page has NextCards linking to related content       | ✅ SATISFIED | All 6 guide pages end with `<NextCards>` — verified by reading each file |
| A016 | Root meta.json establishes correct top-level sidebar order    | ✅ SATISFIED | `website/content/docs/meta.json` exists with pages: ["start", "concepts", "guides"] |
| A017 | Concepts meta.json orders pages correctly                     | ✅ SATISFIED | `website/content/docs/concepts/meta.json:3` — order matches contract value exactly: pipeline,skills,context,toolbelt,artifacts,contract,findings |
| A018 | Guides meta.json orders pages correctly                       | ✅ SATISFIED | `website/content/docs/guides/meta.json:3` — order matches contract value exactly: using-ana-setup,verifying-changes,reading-a-proof,using-ana-learn,configurability,troubleshooting |
| A019 | Callout component displays a label before content             | ✅ SATISFIED | `website/components/docs/content/Callout.tsx:46-56` renders `<span>` with `LABELS[variant]` before children div |
| A020 | Rule callout shows RULE label and note callout shows NOTE label | ✅ SATISFIED | `Callout.tsx:11-12` LABELS record has `rule: "Rule"`, `note: "Note"`. CSS `uppercase` class on line 47 renders them as "RULE" and "NOTE" visually. |
| A021 | RightRail no longer uses Tailwind hidden/xl:block classes     | ✅ SATISFIED | Grep for "hidden" in `RightRail.tsx` returns no matches |
| A022 | RightRail retains docs-right-rail CSS class                   | ✅ SATISFIED | `website/components/docs/layout/RightRail.tsx:26` — className includes "docs-right-rail" |
| A023 | DocsNav GitHub link points to TettoLabs organization          | ✅ SATISFIED | `website/components/docs/layout/DocsNav.tsx:74` — href="https://github.com/TettoLabs/anatomia" |
| A024 | Catch-all page editUrl points to TettoLabs organization       | ✅ SATISFIED | `website/app/docs/[...slug]/page.tsx:65` — editUrl template includes "TettoLabs/anatomia" |
| A025 | Overview imports data loader functions instead of hardcoding  | ✅ SATISFIED | `website/app/docs/page.tsx:2-8` imports getProofEntries, getProofStats, getAgentCount, getCommandCount, getSkillCount from `@/lib/docs-data` |
| A026 | No agents concept page exists at concepts/agents              | ✅ SATISFIED | `website/content/docs/concepts/agents.mdx` — file does not exist (confirmed by filesystem check) |
| A027 | The Scope 1 test index.mdx file is deleted                    | ✅ SATISFIED | `website/content/docs/index.mdx` — file does not exist (confirmed by filesystem check) |
| A028 | Next.js build completes without errors for all 16 pages       | ✅ SATISFIED | `pnpm build` exits 0, generates 27 total pages including 16 docs pages |
| A029 | MDX pages produce heading structure that populates the right rail TOC | ✅ SATISFIED | All guide pages have h2 headings. `page.tsx:37` extracts `page.data.toc`, maps to tocItems, passes to RightRail. |
| A030 | Pipeline concept links to skills concept and verifying changes guide | ✅ SATISFIED | `website/content/docs/concepts/pipeline.mdx:60` — NextCards href="/docs/concepts/skills"; line 66 — href="/docs/guides/verifying-changes" |
| A031 | Quickstart links to pipeline concept and reading a proof guide | ✅ SATISFIED | `website/content/docs/start.mdx:105` — href="/docs/concepts/pipeline"; line 110 — href="/docs/guides/reading-a-proof" |
| A032 | TroubleCard is available as an MDX component                  | ✅ SATISFIED | `website/app/docs/[...slug]/page.tsx:14` imports TroubleCard; line 23 registers in mdxComponents |

**32/32 assertions SATISFIED.**

## Independent Findings

Predictions resolved:
1. **TroubleCard typing** — Not found. Properly typed with interface.
2. **NextCards to nonexistent pages** — Confirmed. Multiple guides link to `/docs/reference/*` and `/docs/proof/*` routes that don't exist yet. Acknowledged in spec constraints.
3. **Markdown inside TroubleCard** — Not found. Build compiles successfully; MDX children render.
4. **Guides meta.json ordering** — Not found. Exact match to contract.
5. **TroubleCard registration** — Not found. Properly registered.

Surprised: The Callout label stores text as title-case ("Rule", "Note") but relies on CSS `uppercase` to render as "RULE", "NOTE". The contract says the value should be "RULE". This works visually but the DOM text node is "Rule". Minor — the visual output matches intent.

Over-building check: Read every export in `TroubleCard.tsx` — single named export, used in exactly one file (`troubleshooting.mdx` via mdxComponents registration). No unused parameters, no dead code paths. Clean.

## AC Walkthrough

**AC4: All 6 guide pages render at `/docs/guides/{slug}` with correct content**
✅ PASS — All 6 MDX files exist, build succeeds, routes generated in build output. Troubleshooting page uses TroubleCard (14 cards across 3 sections: gate, pipeline, config).

**AC13: TOC (right rail) populates correctly on all guide pages**
✅ PASS — All guide pages have h2/h3 headings. catch-all page.tsx extracts `page.data.toc` and passes to RightRail. RightRail renders TOC with scroll spy.

**AC14: NextCards at the bottom of each page link to correct next page**
✅ PASS — Verified each guide page:
- using-ana-setup → verifying-changes, reference/agents/ana-setup
- verifying-changes → reading-a-proof, proof/security-hardening
- reading-a-proof → using-ana-learn, proof/security-hardening
- using-ana-learn → configurability, proof
- configurability → troubleshooting, concepts/toolbelt
- troubleshooting → reference/cli, proof

**AC12: `pnpm build` succeeds with all 16 pages**
✅ PASS — Build exits 0. Output shows 27 total pages (16 docs + 11 marketing/meta).

**No type errors or missing component imports**
✅ PASS — TypeScript check runs as part of Next.js build. No type errors.

**TroubleCard renders correctly in the troubleshooting page**
✅ PASS — TroubleCard registered in mdxComponents, imported and used in troubleshooting.mdx. Build succeeds. Component renders title as h4 and children as div.

## Blockers

No blockers. All 32 contract assertions satisfied. All 6 ACs pass. Build succeeds. No regressions. Checked: TroubleCard has no unused exports (1 export, 1 consumer). No unused function parameters in TroubleCard or any new code. No error paths to exercise (these are static content components). No external state assumptions (all data comes from data loaders or static content).

## Findings

- **Code — NextCards link to unbuilt pages:** `website/content/docs/guides/using-ana-setup.mdx:148`, `verifying-changes.mdx:119`, `reading-a-proof.mdx:109`, `troubleshooting.mdx:128` — Multiple NextCards link to `/docs/reference/*` and `/docs/proof/*` routes that don't exist yet. Acknowledged in spec constraints. These will 404 until Scope 5 ships. Not a blocker — the hrefs are correct and will resolve — but users navigating guides before Scope 5 will hit dead links.

- **Code — Stale dynamic-value comments in guides:** `website/content/docs/guides/verifying-changes.mdx:74` says "17 of Anatomia's own 78 proofs had rejection cycles" with a `{/* Dynamic: update on data change */}` comment. `troubleshooting.mdx:47` has the same pattern. The spec gotcha says "use the real numbers, not the supermock's stale numbers" — but these are hardcoded editorial numbers that will rot. Future data changes won't automatically update them. Consider extracting to the data loader.

- **Code — TroubleCard lacks accessibility role:** `website/components/docs/content/TroubleCard.tsx:10` — The outer div has no `role` or `aria-*` attributes. The Callout component (used as the pattern reference) has `role="note"`. TroubleCard semantically groups a problem/solution pair — `role="group"` with `aria-labelledby` pointing to the h4 would improve screen reader experience.

- **Code — Callout label text vs contract value:** `website/components/docs/content/Callout.tsx:56` — LABELS record stores `rule: "Rule"` (title case). Contract A020 says `value: "RULE"`. CSS `uppercase` class on the span renders it as "RULE" visually, so the user sees the right thing. The DOM text node differs from the contract literal. Functionally correct; noted for precision.

- **Test — No unit tests for TroubleCard:** `website/components/docs/content/TroubleCard.tsx` — Only verified via build compilation. Consistent with other Phase 1/2 components (Callout, AudienceCards, PipelineDiagram — none have unit tests either). This is the testing strategy specified in the spec (build verification + visual verification). Not a gap for this phase.

- **Upstream — Spec allows broken navigation links:** The spec explicitly acknowledges NextCards linking to reference pages that "will 404 until Scope 5." This is a product decision, not a build error. Worth tracking: if Scope 5 is delayed, users hitting these links from the troubleshooting and configurability guides will have a degraded experience.

## Deployer Handoff

This is Phase 3 of 3 — the final phase. After merging:
- All 16 docs pages are live: 1 overview, 1 quickstart, 7 concepts, 6 guides, plus 1 deleted test page.
- Several NextCards link to `/docs/reference/*` and `/docs/proof/*` pages that don't exist yet. These are Scope 5 deliverables. Until then, those links 404.
- The `help@anatomia.dev` email referenced in the troubleshooting page needs to be configured before Scope 6 per scope acknowledgment.
- Lint shows 2 pre-existing errors in PlatformProvider.tsx (setState in effect) — not introduced by this build.
- The guides contain hardcoded proof statistics (e.g., "17 of 78 proofs") marked with `{/* Dynamic: update on data change */}` comments. These will need manual updates as the proof chain grows.

## Verdict
**Shippable:** YES

32/32 assertions satisfied. 6/6 acceptance criteria pass. Build succeeds with all 16 pages. No regressions. TroubleCard is clean — single export, single consumer, typed props. Guide content is thorough and well-structured. The broken links to future scope pages are acknowledged and acceptable. I'd ship this.
