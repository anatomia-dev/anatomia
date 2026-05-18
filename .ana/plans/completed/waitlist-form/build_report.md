# Build Report: Team edition waitlist form

**Created by:** AnaBuild
**Date:** 2026-05-17
**Spec:** .ana/plans/active/waitlist-form/spec.md
**Branch:** feature/waitlist-form

## What Was Built

- `website/components/pricing/WaitlistForm.tsx` (created): Client component with email capture form. State machine (idle/submitting/success/error), Formspree POST with JSON headers, client-side email validation, honeypot `_gotcha` field, `_source` attribution field, AbortController with 10s timeout, accessible markup (aria-label, aria-live, tabIndex focus management on success).
- `website/components/pricing/pricing.module.css` (modified): Added `.waitlistForm` (flex layout with wrap for responsive stacking), `.waitlistInput` (styled for both default and inverted/highlighted card in light+dark themes), `.waitlistMessage`/`.waitlistError` (inline error styling), `.waitlistSuccess` (fade-in animation via `@keyframes waitlistFadeIn` at 250ms), `.waitlistHoneypot` (off-screen positioning). Mobile breakpoint at 480px stacks to column.
- `website/components/pricing/PriceCard.tsx` (modified): Added WaitlistForm import, `isWaitlist` narrowing via `"waitlist" in plan`, conditional render — WaitlistForm for waitlist plans, Button for others. Button's `href` uses `"href" in plan.cta` narrowing for type safety.
- `website/lib/copy.ts` (modified): Team plan gains `waitlist: true`, `cta.href` removed (now `{ label: "Join the waitlist" }`), TODO comment removed. TypeScript infers the union automatically.

## PR Summary

- Add inline email waitlist form to the Team pricing card, replacing the previous link CTA
- Form submits to Formspree via fetch with JSON headers, honeypot spam protection, and 10s network timeout
- Three visual states: idle form, "Sending..." loading, and fade-in success confirmation; error state shows fallback email
- Responsive layout: side-by-side on desktop, stacked on mobile; styled for the inverted highlighted card in both themes
- Accessible: aria-label on input, aria-live regions for status messages, focus management on success

## Acceptance Criteria Coverage

- AC1 "Team card displays inline email form" -> WaitlistForm.tsx renders inside `.cardCta` div; PriceCard.tsx conditionally renders via `isWaitlist` flag (code inspection — no unit test, visual QA)
- AC2 "POSTs to Formspree with JSON headers" -> WaitlistForm.tsx lines 37-44: `method: "POST"`, `Accept: "application/json"` (code inspection)
- AC3 "Success replaces form with confirmation + fade" -> success state returns `<p>` with `waitlistSuccess` class and fade-in animation (code inspection)
- AC4 "Error shows inline message with fallback email" -> error state renders "team@anatomia.dev" link, form stays interactive (`setState("error")` doesn't disable inputs) (code inspection)
- AC5 "Honeypot `_gotcha` + `_source` field" -> both present in form markup and JSON body (code inspection)
- AC6 "Client-side email validation" -> `EMAIL_RE` regex + empty check, shows "Enter a valid email address." (code inspection)
- AC7 "Loading state: disabled button, 'Sending...' text" -> `disabled={state === "submitting"}`, children ternary (code inspection)
- AC8 "Responsive: side-by-side desktop, stacked mobile" -> flex-wrap default + `@media (max-width: 480px)` column override (code inspection)
- AC9 "Accessible: aria-label, aria-live, Enter submits" -> `aria-label="Email address"`, `aria-live="polite"` on message div and success element, native form submit on Enter (code inspection)
- AC10 "Renders correctly on inverted card both themes" -> `.cardHighlighted .waitlistInput` styles + `[data-theme="dark"]` variant (code inspection)
- AC11 "Formspree ID hardcoded in WaitlistForm.tsx" -> `const FORMSPREE_ID = "xbdbjkkg"` at top of file (code inspection)
- AC12 "Individual card CTA unchanged" -> PriceCard only renders WaitlistForm when `isWaitlist` is true; Free plan has no `waitlist` flag (code inspection)
- AC13 "No build errors" -> `pnpm run build` succeeds (verified)
- AC14 "Input has type=email" -> `type="email"` on input element (code inspection)
- AC15 "Focus moves to success message" -> `successRef` + `requestAnimationFrame(() => successRef.current?.focus())`, `tabIndex={-1}` on success `<p>` (code inspection)

Note: No Vitest unit tests — website has no test infrastructure. All criteria verified via code inspection and build verification per spec's Testing Strategy.

## Implementation Decisions

1. **`noValidate` on form element.** Spec says client-side validation via regex; added `noValidate` to prevent browser's built-in validation UI from competing with our inline error messages. Browser validation is still a secondary check via `type="email"` (AC14) but won't show its own popups.

2. **`requestAnimationFrame` for focus.** Focus to the success message needs to happen after React renders the success state. `requestAnimationFrame` ensures the ref is attached before calling `.focus()`.

3. **`flex-wrap` instead of media query for desktop row layout.** The form uses `flex-wrap: wrap` with `flex: 1 1 200px` on the input. On wide viewports, input and button naturally sit side by side. On narrow viewports (<480px), explicit `flex-direction: column` ensures full stacking. This handles tablet gracefully without a separate breakpoint.

4. **Error color on highlighted card.** Used `#ff8a8a` for error text on the dark highlighted card — the default `--color-danger` is too dark on the inverted surface. This is a direct hex value rather than a CSS custom property since it's specific to this one context.

5. **`"href" in plan.cta` narrowing in Button.** After removing `href` from Team's cta, the union type means `plan.cta.href` doesn't always exist. Used `"href" in plan.cta ? plan.cta.href : undefined` in the else branch to satisfy TypeScript without a cast.

## Deviations from Contract

None — contract followed exactly. All 23 assertions are addressable through the code as built. Since the testing strategy is build-only (no Vitest tests for the website), contract assertions are satisfied by code inspection rather than tagged unit tests. No `@ana` tags were placed because there are no test files to tag.

## Test Results

### Baseline (before changes)
```
pnpm run test -- --run
 Test Files  108 passed (108)
      Tests  2486 passed | 2 skipped (2488)
```

### After Changes
```
pnpm run test -- --run
 Test Files  108 passed (108)
      Tests  2486 passed | 2 skipped (2488)
```

### Build Verification
```
pnpm run build
 Tasks:    2 successful, 2 total
```

### Comparison
- Tests added: 0 (website has no Vitest test infrastructure — per spec)
- Tests removed: 0
- Regressions: none
- Build: passes clean

### New Tests Written
None — spec's testing strategy is visual QA only. No Vitest test infrastructure exists for the website.

## Verification Commands
```bash
pnpm run build
pnpm run test -- --run
(cd packages/cli && pnpm run lint)
```

## Git History
```
74fb82f4 [waitlist-form] Wire form into PriceCard and update copy
c1527a73 [waitlist-form] Add WaitlistForm component and CSS
```

## Open Issues

1. **No automated test coverage for form behavior.** The website has no Vitest/testing-library infrastructure, so form states (submit, validation, error, success) are only verifiable through manual QA or a future E2E setup. This is per spec — not a regression.

2. **Error color on highlighted card is a hardcoded hex.** `#ff8a8a` in `.cardHighlighted .waitlistError` isn't a CSS custom property. If the brand palette changes, this won't update automatically. Low risk — it's scoped to one error state on one card variant.

3. **`--color-danger` fallback.** The `.waitlistError` rule uses `var(--color-danger, #dc3545)`. If `--color-danger` is not defined in the site's CSS custom properties, the fallback `#dc3545` applies. Verified the site doesn't currently define `--color-danger`, so the fallback is active. Not a bug — works correctly — but worth noting for future theming work.

Verified complete by second pass.
