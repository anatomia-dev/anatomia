# Verify Report: Section 4 — The System (replace Bento)

**Result:** FAIL
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

Tests: 2029 passed, 0 failed, 2 skipped. Build: success. Lint: clean.

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | The System section appears on the landing page in place of Bento | ✅ SATISFIED | `website/app/(marketing)/page.tsx:12` imports SystemSection, line 30 renders `<SystemSection />`. Bento import removed. |
| A002 | Page sections render in the correct order | ✅ SATISFIED | `website/app/(marketing)/page.tsx:27-36` — Hero, CompatMarquee, ScanSlab, SystemSection, DeepDive, Pricing, ProofFeed. Matches contract value. |
| A003 | All four drawers can open and close | ✅ SATISFIED | `website/lib/copy.ts:102-204` defines 4 drawers (agents, skills, context, cli). `website/components/system/Drawer.tsx:24` uses `useState<Set<string>>` for toggle. `Drawer.tsx:28-37` toggle function adds/removes from set. |
| A004 | Drawers animate open using CSS grid rows | ✅ SATISFIED | `website/components/system/system.module.css:201-203` — `.drawerBody { grid-template-rows: 0fr }`, `.drawerBodyOpen { grid-template-rows: 1fr }`. |
| A005 | The CLI version in the man page comes from the actual package | ✅ SATISFIED | `website/components/system/SystemSection.tsx:7` — `import cliPkg from "../../../packages/cli/package.json"`. Line 53 passes `version={cliPkg.version}` to Drawer, which passes it to ManPage. `ManPage.tsx:23,59` renders `v{data.version}`. |
| A006 | The section shows 25 commands, not 23 | ✅ SATISFIED | `website/lib/copy.ts:99` — `{ label: "cli", value: "25 commands" }`. `copy.ts:186` — meta "25 commands" on drawer 04. |
| A007 | The plus-more count shows 19 remaining commands | ✅ SATISFIED | `website/lib/copy.ts:200` — `moreCount: 19`. `ManPage.tsx:52` renders `+ {data.moreCount} more`. |
| A008 | The trailing command list includes init but excludes check and index | ✅ SATISFIED | `website/lib/copy.ts:201` — `moreNames: "init, setup, verify, proof, agents"`. Contains "init". |
| A009 | The trailing command list does not include removed commands | ✅ SATISFIED | `website/lib/copy.ts:201` — `moreNames: "init, setup, verify, proof, agents"`. Does not contain "check" or "index". |
| A010 | Context files appear in a nested subfolder in the file tree | ✅ SATISFIED | `website/lib/copy.ts:166-173` — `nested: [{ folder: "context/", files: [...] }]`. `FileTree.tsx:31-47` renders nested groups with subfolder rows. |
| A011 | Project context and design principles are shown inside the context subfolder | ✅ SATISFIED | `website/lib/copy.ts:169-170` — nested group files include `project-context.md` and `design-principles.md`. |
| A012 | The section shows exactly 5 pipeline agents | ✅ SATISFIED | `website/lib/copy.ts:96` — `{ label: "ships", value: "5 agents" }`. Agent tree at lines 117-123 has 5 files. |
| A013 | All section strings live in copy.ts under a system key | ✅ SATISFIED | `website/lib/copy.ts:89` — `system: { ... }` key exists with eyebrow, title, lede, specStrip, drawers, closer. All component strings reference `copy.system.*`. |
| A014 | The section title text lives in copy.ts | ✅ SATISFIED | `website/lib/copy.ts:91` — `title: "Scan reads. *init* ships."`. `SystemSection.tsx:39` renders `<Formatted text={copy.system.title} />`. |
| A015 | The CSS module includes responsive breakpoints for mobile and tablet | ✅ SATISFIED | `website/components/system/system.module.css:625` — `@media (max-width: 480px)`. |
| A016 | The CSS module includes the tablet breakpoint | ✅ SATISFIED | `website/components/system/system.module.css:487` — `@media (max-width: 720px)`. |
| A017 | No hardcoded color values appear in the CSS module | ❌ UNSATISFIED | Three `rgba()` values found: line 127 `rgba(168, 60, 50, 0.0)`, line 133 `rgba(0, 0, 0, 0.014)`, line 198 `rgba(168, 60, 50, 0.05)`. Contract says `hardcodedColors equals 0`. |
| A018 | Drawer buttons include aria-expanded attribute | ✅ SATISFIED | `website/components/system/Drawer.tsx:79` — `aria-expanded={isOpen}`. |
| A019 | Drawer buttons include aria-controls attribute | ✅ SATISFIED | `website/components/system/Drawer.tsx:80` — `aria-controls={bodyId}`, where `bodyId = "d-${drawer.id}-body"`. |
| A020 | The website builds without errors after all changes | ✅ SATISFIED | `pnpm run build` succeeds — 13 static pages generated, 0 errors. |
| A021 | The section closer links to the proof section | ❌ UNSATISFIED | `SystemSection.tsx:56-61` — closer is a `<div>` with text, not an `<a>` link. `copy.system.closer.href` is `"#proof"` in copy.ts (line 207) but is never consumed by the component. The closer renders text but does not navigate anywhere. |
| A022 | The closer arrow has a breathe animation that respects reduced motion | ✅ SATISFIED | `SystemSection.tsx:57` applies `styles.breathe`. `system.module.css:420-423` wraps `.breathe` animation in `@media (prefers-reduced-motion: no-preference)`. Keyframes at lines 425-428: 0.4→1→0.4 opacity over 3s. |
| A023 | The scan section thread says feeds the system instead of feeds the pipeline | ✅ SATISFIED | `website/lib/copy.ts:84` — `after: "feeds the system."`. `ScanSlab.tsx:161` renders `copy.scanThread.after` via SectionThread segment. |
| A024 | The scan section thread links to the system section | ✅ SATISFIED | `website/lib/copy.ts:86` — `href: "#system"`. `ScanSlab.tsx:162` passes `href: copy.scanThread.href` to SectionThread link. |
| A025 | ScrollHint links to the system section instead of the pipeline | ✅ SATISFIED | `website/components/hero/ScrollHint.tsx:24` — `href="#system"`. |
| A026 | The nav agents link points to the system section | ✅ SATISFIED | `website/lib/copy.ts:38` — `{ label: "Agents", href: "/#system" }`. |
| A027 | The hero secondary CTA points to the system section | ✅ SATISFIED | `website/lib/copy.ts:58` — `secondary: { label: "See the pipeline", href: "#system" }`. |
| A028 | Footer product links point to the system section | ✅ SATISFIED | `website/lib/copy.ts:563-564` — Pipeline and Agents links both use `href: "/#system"`. |
| A029 | The manifesto outbound link points to the system section | ✅ SATISFIED | `website/lib/copy.ts:442` — `{ label: "See the pipeline", href: "/#system" }`. |
| A030 | A shared SectionThread component exists for reuse across sections | ✅ SATISFIED | `website/components/ui/SectionThread.tsx` exists as a standalone component with segments, arrow, link, and breathe props. |
| A031 | The scan section uses the shared SectionThread component | ✅ SATISFIED | `website/components/scan/ScanSlab.tsx:4` — `import { SectionThread } from "@/components/ui/SectionThread"`. Lines 160-163 render `<SectionThread>` with scanThread copy. |

**Summary:** 29 SATISFIED, 2 UNSATISFIED (A017, A021).

## Independent Findings

### Prediction resolution

1. **Closer doesn't link to #proof** — Confirmed. `SystemSection.tsx:56-61` renders the closer as a `<div>` with text and a breathe arrow, but no anchor tag. `copy.system.closer.href` is defined but orphaned. Users see "Next: the proof" but can't click to navigate.

2. **Hardcoded rgba colors in CSS module** — Confirmed. Three `rgba()` values in `system.module.css` at lines 127, 133, 198. These are hover/active effects using semi-transparent overlays. The contract says zero hardcoded colors. These are likely intentional design decisions — semi-transparent overlays with fixed alpha channels are hard to express with CSS custom properties. But the contract is explicit.

3. **SectionThread `breathe` prop is dead code** — Confirmed. The prop exists, the `animate-breathe` class is applied when `breathe=true`, but no consumer ever passes `breathe=true`. Additionally, the `animate-breathe` CSS class is undefined in any stylesheet — if it were used, it would do nothing.

4. **Drawer `sectionRef` prop is dead code** — Confirmed. Defined at `Drawer.tsx:22` but `SystemSection.tsx:53` passes only `version`. The fallback to `containerRef` works correctly, scoping the pulse animation to the drawer container instead of the section root.

5. **ManPage date hardcoded** — Confirmed. `ManPage.tsx:60` renders `2026-05` as a string literal. This will become stale monthly. The version is dynamic (from package.json) but the date is not.

### Unpredicted findings

- **Upstream — Stale proof chain findings resolved.** Three active proof chain findings for `#pipeline` links in copy.ts, ScanSlab.tsx, and ScrollHint.tsx are resolved by this build. All three now point to `#system`. The manifesto outbound finding is also resolved.

- **SystemSection closer doesn't use SectionThread.** The spec mentions extracting SectionThread for reuse across sections. The closer has the same pattern (hairline border, mono text, arrow, link target) but uses raw `<div>` + CSS module classes instead. Not a blocker — the contract doesn't require it — but it's a missed reuse opportunity and creates duplication if future sections follow the closer pattern.

## AC Walkthrough
- **AC1:** ✅ PASS — Bento import removed from page.tsx, SystemSection imported and rendered.
- **AC2:** ✅ PASS — Section order in page.tsx matches: Hero → CompatMarquee → ScanSlab → SystemSection → DeepDive → Pricing → ProofFeed.
- **AC3:** ✅ PASS — Drawer.tsx uses `useState<Set<string>>` with toggle function. CSS grid-template-rows 0fr→1fr animation. 4 drawers defined in copy.ts.
- **AC4:** ✅ PASS — `cliPkg.version` imported from `packages/cli/package.json` at build time, passed to ManPage.
- **AC5:** ✅ PASS — `copy.system.specStrip` has "25 commands", `moreCount: 19` (25 - 6 = 19).
- **AC6:** ✅ PASS — `moreNames: "init, setup, verify, proof, agents"` — no "check", no "index".
- **AC7:** ✅ PASS — Context tree uses `nested` array with `folder: "context/"` containing project-context.md and design-principles.md. scan.json and ana.json at root level.
- **AC8:** ✅ PASS — 5 agents in tree, "5 agents" in spec strip.
- **AC9:** ✅ PASS — All strings under `copy.system` key. Components reference `copy.system.*`.
- **AC10:** ⚠️ PARTIAL — CSS module has all 5 breakpoints (1024, 860, 720, 480, 900). Cannot verify visual rendering without running dev server at specific viewports.
- **AC11:** ❌ FAIL — Three hardcoded `rgba()` values in system.module.css (lines 127, 133, 198).
- **AC12:** ✅ PASS — `aria-expanded` and `aria-controls` on drawer buttons.
- **AC13:** ✅ PASS — `pnpm run build` succeeds with 0 errors.
- **AC14:** ❌ FAIL — Breathe animation works and respects reduced-motion, but closer does not link to `#proof`. The `<div>` is not an `<a>`.
- **AC15:** ✅ PASS — `scanThread.after: "feeds the system."`, `scanThread.href: "#system"`.
- **AC16:** ✅ PASS — Zero `#pipeline` or `#agents` anchors remain in the website codebase (grep confirms).
- **AC17:** ✅ PASS — SectionThread component exists at `components/ui/SectionThread.tsx`. ScanSlab imports and uses it.
- **AC18:** ✅ PASS — Build succeeds.

## Blockers

**A021 — Closer doesn't link to `#proof`.** The `SystemSection.tsx` closer renders a `<div>` with text but no anchor tag. `copy.system.closer.href` is `"#proof"` but the component never reads it. The text says "Next: **the proof**" but the user can't click to navigate. This is a functional gap — the closer is decorative when it should be a navigation element. Fix: wrap the closer content (or at minimum the bold text) in an `<a href={copy.system.closer.href}>`.

**A017 — Hardcoded rgba() in CSS module.** Three `rgba()` values at lines 127, 133, 198 for hover/active effects. The contract specifies `hardcodedColors equals 0`. Fix: use CSS custom properties or move these to a scoped token. Note: these are semi-transparent overlays, not solid colors — the builder may have reasoned they're not "color values" in the brand sense. But the contract is unambiguous.

## Findings

- **Code — Closer renders text but does not link to #proof:** `website/components/system/SystemSection.tsx:56` — `<div className={styles.closer}>` is not an `<a>`. `copy.system.closer.href` is defined but orphaned. Users see "Next: the proof" but can't navigate.
- **Code — Three hardcoded rgba() values in CSS module:** `website/components/system/system.module.css:127,133,198` — `rgba(168, 60, 50, 0.0)`, `rgba(0, 0, 0, 0.014)`, `rgba(168, 60, 50, 0.05)`. Used for hover/active overlay effects. Contract says zero hardcoded colors.
- **Code — Drawer sectionRef prop is dead code:** `website/components/system/Drawer.tsx:22` — `sectionRef?: React.RefObject<HTMLElement | null>` is defined but `SystemSection.tsx:53` only passes `version`. Falls back to `containerRef` correctly. The prop should be removed or wired up.
- **Code — SectionThread breathe prop and animate-breathe class are dead code:** `website/components/ui/SectionThread.tsx:31` — `className={breathe ? "animate-breathe" : ""}`. No consumer passes `breathe=true`. The `animate-breathe` CSS class is also undefined in any stylesheet — if invoked, it would be a no-op.
- **Code — ManPage footer date '2026-05' is hardcoded:** `website/components/system/ManPage.tsx:60` — renders `2026-05` as a string literal. The version is dynamic from package.json but the date will become stale monthly. Consider deriving from build time or package.json metadata.
- **Code — SystemSection closer doesn't use SectionThread component:** `website/components/system/SystemSection.tsx:56-61` — closer uses raw div + CSS module classes instead of the extracted SectionThread. Pattern duplication between the closer pattern and SectionThread.
- **Upstream — Stale findings resolved by this build:** Three proof chain findings for `#pipeline` links in `website/lib/copy.ts`, `website/components/scan/ScanSlab.tsx`, and `website/components/hero/ScrollHint.tsx` are resolved — all now point to `#system`. The manifesto outbound `/#pipeline` finding is also resolved.

## Deployer Handoff

Two contract failures need Build attention before this can ship:

1. **Make the closer a link.** Wrap the closer content in `<a href={copy.system.closer.href}>` so "Next: the proof" navigates to `#proof`. The copy.ts data is already there — just unused.

2. **Address hardcoded rgba() in CSS module.** Either replace with CSS custom properties (e.g., `var(--hover-overlay)`) or accept as intentional. The contract says zero, so either the code or the contract needs to change.

Everything else is solid. The component architecture is clean — proper client/server split, Drawer is the only `"use client"`, copy.ts centralization is thorough. All 4 orphaned `#pipeline` anchor families are resolved. The SectionThread extraction works. The build passes cleanly.

After these two fixes, expect a clean re-verify.

## Verdict
**Shippable:** NO
Two contract assertions are UNSATISFIED: A021 (closer doesn't link) and A017 (hardcoded colors). The closer link is a functional gap — users can't navigate. The hardcoded colors are a contract compliance gap. Both are fixable in minutes. The rest of the build is high quality.