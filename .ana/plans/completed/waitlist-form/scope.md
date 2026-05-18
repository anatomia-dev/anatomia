# Scope: Team edition waitlist form

**Created by:** Ana
**Date:** 2026-05-17

## Intent

The "Join the waitlist" button on the Team pricing card links to `/contact` — a page with email addresses and no form. A visitor who wants to join the waitlist has to manually compose an email. That's a dead conversion path that loses every casual-interest lead. Replace the CTA with an inline email capture form backed by Formspree. No redirect, no modal, no page navigation. Type email, submit, see confirmation.

## Complexity Assessment

- **Kind:** feature
- **Size:** small — one new client component, CSS additions, minor copy.ts update
- **Files affected:**
  - `website/components/pricing/WaitlistForm.tsx` (new)
  - `website/components/pricing/pricing.module.css` (additions)
  - `website/components/pricing/PriceCard.tsx` (conditional rendering)
  - `website/lib/copy.ts` (add `waitlist` flag, remove href from Team CTA)
- **Blast radius:** Pricing section only. No CLI code. No templates. No other pages.
- **Estimated effort:** 2–3 hours implementation + visual QA across themes/viewports
- **Multi-phase:** no

## Approach

Extract an inline email capture form into a client component (`WaitlistForm.tsx`) that renders inside the Team pricing card, replacing the current CTA button. The form submits via AJAX to Formspree — no backend code. The card's data model gains a `waitlist` boolean flag; PriceCard conditionally renders the form or the existing Button based on that flag.

The critical design constraint: the Team card is inverted (dark background in light mode via `background: var(--fg-strong)`). The form input must be styled for this dark-on-light context, not just for dark theme. The input, button, and state transitions must feel native to the card — same tokens, same restraint, same precision as the rest of the site.

## Acceptance Criteria

- AC1: The Team pricing card displays an inline email input + submit button where the CTA link previously was. The form is always visible (no reveal-on-click).
- AC2: Submitting a valid email POSTs to the Formspree endpoint via `fetch()` with `Accept: application/json`. No page redirect occurs.
- AC3: On success, the form is replaced by a confirmation message ("✓ You're on the list. We'll reach out when Team is ready.") with a 200–300ms fade transition. The success state persists until page refresh.
- AC4: On error (network failure, 4xx/5xx), an inline error message appears below the input with a fallback email address. The form remains interactive.
- AC5: A hidden `_gotcha` honeypot field is present for spam protection. A hidden `_source` field is set to `"pricing-card"` for attribution.
- AC6: Client-side email validation prevents submission of empty or malformed input. Validation error appears inline.
- AC7: The submit button shows a loading state during submission and is disabled to prevent double-submit.
- AC8: On desktop (>768px), input and button sit side by side. On mobile (≤480px), they stack full-width. Tablet adapts based on available space.
- AC9: The form is accessible: `aria-label` on the input, descriptive button text, `aria-live="polite"` on success/error messages, form submits on Enter.
- AC10: The form renders correctly on the inverted highlighted card in both light and dark themes. Input background, text, placeholder, focus ring, and border all work on the dark card surface.
- AC11: The Formspree form ID is a hardcoded constant in WaitlistForm.tsx, not in copy.ts or any config file.
- AC12: The Individual card's CTA button is unchanged — only the Team card renders the form.

## Edge Cases & Risks

- **Inverted card styling.** The highlighted card has `background: var(--fg-strong)` (black) even in light mode. Naive use of `--bg-card` for the input background will be invisible. The input needs an explicitly lighter background (e.g., `rgba(255,255,255,0.08)`) with light text and placeholder.
- **Formspree down or rate-limited.** The error state must be graceful — show the fallback email so the user has an alternative path. Never a dead end.
- **Bot spam.** The `_gotcha` honeypot field handles this. Some bots detect `display:none` — use `position:absolute; left:-9999px` or similar off-screen technique instead. AnaPlan should investigate which approach Formspree recommends.
- **Double submission.** Button disabled during fetch prevents this. No debounce needed.
- **Network timeout.** The fetch should have a reasonable timeout or AbortController. A spinner that runs forever is worse than an error message.
- **Focus management.** After successful submission, focus should move to the success message so screen readers announce it.
- **CTA type narrowing.** Adding `waitlist?: boolean` to the plan type means `cta.href` may not exist for waitlist plans. TypeScript must handle this — either make `href` optional or restructure the union type.

## Rejected Approaches

- **Reveal-on-click (OQ4 Option B).** Adds a click, adds transition state, and the card has room for the form. Always-visible is lower friction and simpler.
- **Form ID in copy.ts.** The Formspree endpoint is an API implementation detail, not editorial content. copy.ts is for text someone might edit. Hardcoded constant in the component is the right boundary.
- **Form ID in environment variable.** Unnecessary indirection for a value that changes only if the Formspree form is recreated. A constant is simpler and doesn't require deploy config.
- **Contact page waitlist (OQ1).** Different surface, different intent. Deferred to a separate scope. The pricing card is where conversion intent lives.
- **localStorage persistence (OQ5).** YAGNI. Re-showing the form on revisit is harmless. Formspree handles duplicates.
- **Client-side rate limiting (OQ6).** Formspree has built-in rate limiting. Adding client-side throttling adds complexity without meaningful protection.
- **Keying off `highlighted` instead of `waitlist` flag.** A future highlighted plan without a waitlist shouldn't accidentally render a form. Explicit flag is safer.

## Open Questions

- **Honeypot hiding technique.** Should `_gotcha` use `position:absolute; left:-9999px`, `clip: rect(0,0,0,0)`, or `aria-hidden` + `tabindex="-1"` + zero dimensions? Bots detect some CSS hiding methods. AnaPlan should pick the approach Formspree recommends and that passes accessibility linters.
- **Exact input background on inverted card.** `rgba(255,255,255,0.08)` is a starting point but needs visual testing. The value should feel like a subtle well in the dark surface — visible enough to read as an input, subtle enough to not break the card's visual weight.

## Exploration Findings

### Patterns Discovered

- `PriceCard.tsx` (lines 31–40): CTA lives in a `cardCta` div at the bottom of the card. The form replaces the Button inside this div, or replaces the div entirely.
- `pricing.module.css` (lines 93–97): Highlighted card forces CTA button to brand color via `!important`. The form button should follow the same treatment.
- `ScrollHint.tsx`: Simplest client component on the site — `"use client"`, useState, minimal JSX. Structural analog for WaitlistForm.
- `Button.tsx`: Has primary/secondary/ghost variants with size scale. The form's submit button can reuse Button directly (it supports `<button>` mode when no `href` is given).
- `globals.css` (lines 78–131): Full token palette for both themes. Dark theme `--bg-card` is `#0F0F14` — similar to highlighted card in light mode. Form styling converges across themes.

### Constraints Discovered

- [TYPE-VERIFIED] Highlighted card inversion (pricing.module.css:59–66) — `background: var(--fg-strong); color: var(--bg)`. Form must style for dark surface in both themes.
- [TYPE-VERIFIED] CTA brand override (pricing.module.css:93–97) — `.cardHighlighted .cardCta a, .cardHighlighted .cardCta button { background: var(--color-brand) !important; color: var(--color-brand-ink) !important; }`. Submit button inherits this if placed inside `.cardCta`.
- [OBSERVED] Card padding is 32px mobile / 40px desktop (pricing.module.css:46–58). Form must fit within this.
- [OBSERVED] copy.ts plan type is inferred from the array literal. Adding `waitlist?: boolean` requires the type to accommodate it without breaking the Individual plan's type.

### Test Infrastructure

- No existing tests for pricing components (website is not tested via Vitest — it's a Next.js site with visual QA).

## For AnaPlan

### Structural Analog

`website/components/hero/ScrollHint.tsx` — smallest client component on the site. `"use client"`, useState, event handler, conditional CSS class. WaitlistForm follows the same skeleton but with form state instead of scroll state.

### Relevant Code Paths

- `website/components/pricing/PriceCard.tsx` — where the form renders. Lines 31–40 are the CTA area.
- `website/components/pricing/pricing.module.css` — card styles, highlighted overrides. Lines 59–97.
- `website/components/ui/Button.tsx` — reusable button. Supports `<button>` mode (no href). Submit button can use this directly.
- `website/lib/copy.ts` lines 437–452 — Team plan definition with CTA.
- `website/app/globals.css` lines 24–131 — full token palette, both themes.

### Patterns to Follow

- Client component: follow ScrollHint.tsx (`"use client"`, named export, hook-based state)
- CSS: add to pricing.module.css (co-located with the card styles, not a new module)
- Button: reuse the existing Button component for the submit action
- Tokens: use CSS custom properties directly, not Tailwind color utilities, to match the rest of the pricing section

### Known Gotchas

- The `.cardHighlighted .cardCta` CSS uses `!important` on background and color for buttons. If the submit button is inside `.cardCta`, it inherits brand styling automatically. But input elements are NOT covered by this rule — they need explicit styling for the inverted context.
- The plan type in copy.ts is inferred from the array literal. Adding `waitlist?: boolean` to only the Team plan may require adjusting the type annotation or using a union type to keep TypeScript happy.
- The card uses `flex: 1` on `.cardFeatures` to push the CTA to the bottom. The form must not break this flex layout — it should occupy the same position as the button.

### Things to Investigate

- How to handle the TypeScript type for plans that have `waitlist: true` but no meaningful `cta.href`. Options: make `href` optional, use a discriminated union (`waitlist: true` plans omit `cta`), or keep `href` as a fallback. Design judgment needed on type safety vs simplicity.
- Whether the form submit button should reuse `Button` directly or render its own `<button>` with matching styles. Using `Button` is DRY but means the component must support `disabled` and loading states (it currently doesn't have those props). Extending Button vs inlining — weigh it.
