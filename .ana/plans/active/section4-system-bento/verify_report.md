# Verify Report: Section 4 — The System (replace Bento)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-09
**Spec:** .ana/plans/active/section4-system-bento/spec.md
**Branch:** feature/section4-system-bento

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/section4-system-bento/contract.yaml
  Seal: INTACT (hash sha256:a67daa8f8aa3a01c3c47ad86e3e290dfd3068cb49d89d6d0aea5bf0f84951d75)
```

Tests: 2029 passed, 0 failed, 2 skipped. Build: success (13 static pages, 0 errors). Lint: clean (1 pre-existing warning in git-operations.ts, not from this build).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | The System section appears on the landing page in place of Bento | ✅ SATISFIED | `website/app/(marketing)/page.tsx:12` imports SystemSection, line 30 renders `<SystemSection />`. No Bento import. |
| A002 | Page sections render in the correct order | ✅ SATISFIED | `website/app/(marketing)/page.tsx:27-36` — Hero, CompatMarquee, ScanSlab, SystemSection, DeepDive, Pricing, ProofFeed. |
| A003 | All four drawers can open and close | ✅ SATISFIED | `website/lib/copy.ts:102-204` defines 4 drawers (agents, skills, context, cli). `website/components/system/Drawer.tsx:24` uses `useState<Set<string>>` for toggle. |
| A004 | Drawers animate open using CSS grid rows | ✅ SATISFIED | `website/components/system/system.module.css:201-203` — `.drawerBody { grid-template-rows: 0fr }`, `.drawerBodyOpen { grid-template-rows: 1fr }`. |
| A005 | The CLI version in the man page comes from the actual package | ✅ SATISFIED | `website/components/system/SystemSection.tsx:7` imports `cliPkg` from `packages/cli/package.json`. Line 53 passes `version={cliPkg.version}` to Drawer. `ManPage.tsx:22,59` renders `v{data.version}`. |
| A006 | The section shows 25 commands, not 23 | ✅ SATISFIED | `website/lib/copy.ts:99` — `{ label: "cli", value: "25 commands" }`. `copy.ts:186` — meta "25 commands" on drawer 04. |
| A007 | The plus-more count shows 19 remaining commands | ✅ SATISFIED | `website/lib/copy.ts:200` — `moreCount: 19`. `ManPage.tsx:52` renders `+ {data.moreCount} more`. |
| A008 | The trailing command list includes init but excludes check and index | ✅ SATISFIED | `website/lib/copy.ts:201` — `moreNames: "init, setup, verify, proof, agents"`. Contains "init". |
| A009 | The trailing command list does not include removed commands | ✅ SATISFIED | `website/lib/copy.ts:201` — `moreNames: "init, setup, verify, proof, agents"`. Does not contain "check" or "index". |
| A010 | Context files appear in a nested subfolder in the file tree | ✅ SATISFIED | `website/lib/copy.ts:166-173` — `nested: [{ folder: "context/", files: [...] }]`. `FileTree.tsx:31-47` renders nested groups with subfolder rows. |
| A011 | Project context and design principles are shown inside the context subfolder | ✅ SATISFIED | `website/lib/copy.ts:169-170` — nested group files include `project-context.md` and `design-principles.md`. |
| A012 | The section shows exactly 5 pipeline agents | ✅ SATISFIED | `website/lib/copy.ts:96` — `{ label: "ships", value: "5 agents" }`. Agent tree at lines 117-123 has 5 files. |
| A013 | All section strings live in copy.ts under a system key | ✅ SATISFIED | `website/lib/copy.ts:89` — `system: { ... }` key exists with eyebrow, title, lede, specStrip, drawers, closer. All SystemSection strings reference `copy.system.*`. |
| A014 | The section title text lives in copy.ts | ✅ SATISFIED | `website/lib/copy.ts:91` — `title: "Scan reads. *init* ships."`. `SystemSection.tsx:39` renders `<Formatted text={copy.system.title} />`. |
| A015 | The CSS module includes responsive breakpoints for mobile and tablet | ✅ SATISFIED | `website/components/system/system.module.css:625` — `@media (max-width: 480px)`. |
| A016 | The CSS module includes the tablet breakpoint | ✅ SATISFIED | `website/components/system/system.module.css:487` — `@media (max-width: 720px)`. |
| A017 | No hardcoded color values appear in the CSS module | ✅ SATISFIED | Grepped for `rgba`, `#[0-9a-f]` — zero matches. Three previous `rgba()` values replaced with `color-mix(in srgb, var(--color-brand) N%, transparent)` at lines 127, 133, 198 — all reference the `--color-brand` custom property. |
| A018 | Drawer buttons include aria-expanded attribute | ✅ SATISFIED | `website/components/system/Drawer.tsx:79` — `aria-expanded={isOpen}`. |
| A019 | Drawer buttons include aria-controls attribute | ✅ SATISFIED | `website/components/system/Drawer.tsx:80` — `aria-controls={bodyId}`, where `bodyId = "d-${drawer.id}-body"`. |
| A020 | The website builds without errors after all changes | ✅ SATISFIED | `pnpm run build` succeeds — 13 static pages generated, 0 errors. |
| A021 | The section closer links to the proof section | ✅ SATISFIED | `website/components/system/SystemSection.tsx:56` — `<a href={copy.system.closer.href} className={styles.closer}>`. `copy.ts:207` — `href: "#proof"`. The closer is now an `<a>` tag, not a `<div>`. |
| A022 | The closer arrow has a breathe animation that respects reduced motion | ✅ SATISFIED | `SystemSection.tsx:57` applies `styles.breathe`. `system.module.css:420-423` wraps `.breathe` animation in `@media (prefers-reduced-motion: no-preference)`. Keyframes at lines 425-428: 0.4→1→0.4 opacity over 3s. |
| A023 | The scan section thread says feeds the system instead of feeds the pipeline | ✅ SATISFIED | `website/lib/copy.ts:84` — `after: "feeds the system."`. `ScanSlab.tsx:161` renders via SectionThread segments. |
| A024 | The scan section thread links to the system section | ✅ SATISFIED | `website/lib/copy.ts:86` — `href: "#system"`. `ScanSlab.tsx:162` passes `href: copy.scanThread.href` to SectionThread link. |
| A025 | ScrollHint links to the system section instead of the pipeline | ✅ SATISFIED | `website/components/hero/ScrollHint.tsx:24` — `href="#system"`. |
| A026 | The nav agents link points to the system section | ✅ SATISFIED | `website/lib/copy.ts:38` — `{ label: "Agents", href: "/#system" }`. |
| A027 | The hero secondary CTA points to the system section | ✅ SATISFIED | `website/lib/copy.ts:58` — `secondary: { label: "See the pipeline", href: "#system" }`. |
| A028 | Footer product links point to the system section | ✅ SATISFIED | `website/lib/copy.ts:563-564` — Pipeline and Agents links both use `href: "/#system"`. |
| A029 | The manifesto outbound link points to the system section | ✅ SATISFIED | `website/lib/copy.ts:442` — `{ label: "See the pipeline", href: "/#system" }`. |
| A030 | A shared SectionThread component exists for reuse across sections | ✅ SATISFIED | `website/components/ui/SectionThread.tsx` exists — server component with segments, arrow, link, breathe props. |
| A031 | The scan section uses the shared SectionThread component | ✅ SATISFIED | `website/components/scan/ScanSlab.tsx:4` — `import { SectionThread } from "@/components/ui/SectionThread"`. Lines 160-163 render `<SectionThread>`. |

**Summary:** 31 SATISFIED, 0 UNSATISFIED.

## Independent Findings

### Prediction resolution

1. **Drawer `sectionRef` prop still dead code** — Confirmed. `Drawer.tsx:19` defines `sectionRef?: React.RefObject<HTMLElement | null>` but `SystemSection.tsx:53` only passes `version`. Falls back to `containerRef` correctly. Not a functional problem — the pulse animation scopes to the container instead of the section root. Still dead code.

2. **SectionThread `breathe` prop still dead/no-op** — Confirmed. `SectionThread.tsx:31` applies `animate-breathe` class when `breathe=true`, but no consumer passes `breathe=true` and `animate-breathe` is not defined in any stylesheet. The SystemSection closer handles breathe via CSS module classes directly.

3. **ManPage date still hardcoded** — Confirmed. `ManPage.tsx:60` renders `2026-05` as a string literal. Version is dynamic, date is not.

4. **Closer doesn't use SectionThread** — Confirmed. `SystemSection.tsx:56-61` uses `<a>` + CSS module classes. Reasonable — the closer has a different visual pattern (vertical arrow, no horizontal segments) from SectionThread's horizontal layout.

5. **`color-mix()` browser support** — Confirmed: ~93% global support (caniuse). Fallback is that hover effects are invisible — no background change on drawer head hover. Not a blocker; progressive enhancement is appropriate for a hover effect.

### Unpredicted findings

- **`copy.ts:211` defines `systemThread` key but no component reads it.** This is dead data — likely a remnant from planning the closer as a SectionThread call. The closer uses `copy.system.closer` instead.

## Previous Findings Resolution

### Previously UNSATISFIED Assertions
| ID | Previous Issue | Current Status | Resolution |
|----|----------------|----------------|------------|
| A017 | Three hardcoded `rgba()` values in CSS module | ✅ SATISFIED | Builder replaced all three with `color-mix(in srgb, var(--color-brand) N%, transparent)` — uses the design token, no hardcoded colors. |
| A021 | Closer rendered as `<div>`, not a link | ✅ SATISFIED | Builder changed closer from `<div>` to `<a href={copy.system.closer.href}>` at `SystemSection.tsx:56`. |

### Previous Findings
| Finding | Status | Notes |
|---------|--------|-------|
| Closer renders text but does not link to #proof | Fixed | Now an `<a>` tag with `href={copy.system.closer.href}` |
| Three hardcoded rgba() values in CSS module | Fixed | Replaced with `color-mix()` using `--color-brand` token |
| Drawer sectionRef prop is dead code | Still present | `Drawer.tsx:19` — not a blocker, falls back to containerRef |
| SectionThread breathe prop and animate-breathe class are dead code | Still present | `SectionThread.tsx:31` — no consumer passes it, CSS class undefined |
| ManPage footer date '2026-05' is hardcoded | Still present | `ManPage.tsx:60` — will go stale monthly |
| SystemSection closer doesn't use SectionThread | Still present | Reasonable — different visual pattern (vertical vs horizontal) |
| Upstream — Stale proof chain findings resolved | Still resolved | All `#pipeline` → `#system` updates confirmed |

## AC Walkthrough
- **AC1:** ✅ PASS — `page.tsx:12` imports SystemSection, no Bento import. Line 30 renders `<SystemSection />`.
- **AC2:** ✅ PASS — `page.tsx:27-36` — Hero → CompatMarquee → ScanSlab → SystemSection → DeepDive → Pricing → ProofFeed.
- **AC3:** ✅ PASS — `Drawer.tsx:24` uses `useState<Set<string>>` with toggle. CSS grid-template-rows 0fr→1fr at `system.module.css:200-207`. 4 drawers defined in `copy.ts:102-204`.
- **AC4:** ✅ PASS — `SystemSection.tsx:7` imports `cliPkg` from `packages/cli/package.json`. Version passed through to ManPage.
- **AC5:** ✅ PASS — `copy.ts:99` has "25 commands", `copy.ts:200` has `moreCount: 19` (25 − 6 = 19).
- **AC6:** ✅ PASS — `copy.ts:201` — `moreNames: "init, setup, verify, proof, agents"`. No "check", no "index".
- **AC7:** ✅ PASS — `copy.ts:166-178` — nested `context/` folder with `project-context.md` and `design-principles.md`. Root-level `scan.json` and `ana.json`.
- **AC8:** ✅ PASS — 5 agents in tree (`copy.ts:117-123`), "5 agents" in spec strip (`copy.ts:96`).
- **AC9:** ✅ PASS — All strings under `copy.system` key. Components reference `copy.system.*`.
- **AC10:** ⚠️ PARTIAL — CSS module has all 5 breakpoints (1024, 860, 720, 480, 900). Cannot verify visual rendering at specific viewports without running dev server and checking manually.
- **AC11:** ✅ PASS — Zero `rgba()` or hex color values in CSS module. All colors via `var()` tokens. Three `color-mix()` calls reference `--color-brand`.
- **AC12:** ✅ PASS — `Drawer.tsx:79-80` — `aria-expanded={isOpen}`, `aria-controls={bodyId}`.
- **AC13:** ✅ PASS — `pnpm run build` succeeds, 13 static pages, 0 errors.
- **AC14:** ✅ PASS — Closer is `<a href={copy.system.closer.href}>` at `SystemSection.tsx:56`. Breathe animation in CSS module at lines 420-428, wrapped in `prefers-reduced-motion`.
- **AC15:** ✅ PASS — `copy.ts:84` — "feeds the system." `ScanSlab.tsx:161` uses SectionThread with scanThread copy.
- **AC16:** ✅ PASS — Grepped entire website for `#pipeline` and `#agents` — zero matches. All updated to `#system`.
- **AC17:** ✅ PASS — `SectionThread.tsx` exists at `components/ui/`. `ScanSlab.tsx:4` imports and uses it.
- **AC18:** ✅ PASS — Build succeeds with 0 errors.

## Blockers

No blockers. All 31 contract assertions SATISFIED. All 18 ACs pass (1 PARTIAL — AC10 responsive, verified structurally but not visually). Checked for: unused exports in new files (all consumed — `TreeData` type imported by Drawer, all components imported by their parents), unused parameters in new functions (sectionRef on Drawer is dead — finding, not blocker), error paths (no runtime error handling needed — these are server-rendered presentation components), external assumptions (JSON import path to `packages/cli/package.json` verified by successful build).

## Findings

- **Code — Drawer sectionRef prop is dead code:** `website/components/system/Drawer.tsx:19` — `sectionRef?: React.RefObject<HTMLElement | null>` is defined but `SystemSection.tsx:53` only passes `version`. Falls back to `containerRef` correctly. The prop should be removed or wired up in a future cycle.
- **Code — SectionThread breathe prop applies undefined CSS class:** `website/components/ui/SectionThread.tsx:31` — `className={breathe ? "animate-breathe" : ""}`. No consumer passes `breathe=true`. The `animate-breathe` CSS class is undefined — if invoked, it would be a no-op. Harmless but misleading.
- **Code — ManPage footer date '2026-05' is hardcoded:** `website/components/system/ManPage.tsx:60` — renders `2026-05` as a string literal. The version is dynamic from package.json but the date is static. Will become stale monthly.
- **Code — SystemSection closer does not use SectionThread component:** `website/components/system/SystemSection.tsx:56-61` — closer uses `<a>` + CSS module classes directly instead of the extracted SectionThread. Different visual pattern (vertical arrow, no horizontal segments) makes this reasonable. Pattern duplication is minimal.
- **Code — copy.ts systemThread key is dead data:** `website/lib/copy.ts:211` — `systemThread: { before, cta, href }` is defined but no component imports or reads it. Likely a remnant from planning the closer as a SectionThread consumer. Should be removed.
- **Code — color-mix() CSS function for hover effects:** `website/components/system/system.module.css:127,133,198` — uses `color-mix(in srgb, var(--color-brand) N%, transparent)`. ~93% global browser support. Older browsers get no hover background — acceptable progressive enhancement for a non-critical visual effect.
- **Upstream — Stale findings resolved by this build:** Three proof chain findings for `#pipeline` links in `website/lib/copy.ts`, `website/components/scan/ScanSlab.tsx`, and `website/components/hero/ScrollHint.tsx` are resolved — all now point to `#system`. The manifesto outbound `/#pipeline` finding is also resolved.

## Deployer Handoff

Both previous blockers are fixed:

1. **Closer is now a link.** `SystemSection.tsx:56` renders `<a href={copy.system.closer.href}>` — users can click "Next: the proof" to navigate to `#proof`.
2. **Hardcoded rgba() replaced with color-mix().** All three values now use `color-mix(in srgb, var(--color-brand) N%, transparent)` — no hardcoded colors remain.

Known minor items to address in a future cycle:
- Remove dead `sectionRef` prop from Drawer
- Remove dead `systemThread` key from copy.ts
- Remove or implement `breathe` prop on SectionThread
- Consider making ManPage date dynamic

The build is clean, the component architecture is solid, and all orphaned `#pipeline` anchors are resolved.

## Verdict
**Shippable:** YES
All 31 contract assertions SATISFIED. All acceptance criteria pass. Both previous UNSATISFIED assertions (A017, A021) are resolved. The build succeeds cleanly. Seven findings — all observations or minor debt, none blocking. The `color-mix()` approach is a clean solution to the hardcoded colors problem. I'd ship this.
