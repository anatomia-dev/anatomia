# Spec: Team edition waitlist form

**Created by:** AnaPlan
**Date:** 2026-05-17
**Scope:** .ana/plans/active/waitlist-form/scope.md

## Approach

Create a client component `WaitlistForm.tsx` that renders an inline email capture form inside the Team pricing card, replacing the current CTA button. The form submits via `fetch()` to Formspree with JSON accept headers — no page redirect, no backend code.

The component follows the ScrollHint pattern: `"use client"`, `useState` for form/submission state, event handler for submit. Three states: idle (form visible), submitting (loading), success (confirmation message), error (message + fallback email). Success and error are terminal until page refresh.

PriceCard conditionally renders `WaitlistForm` or `Button` based on a `waitlist` flag in copy.ts. The flag is checked with the same `"waitlist" in plan` narrowing pattern used for `"highlighted" in plan`.

**Key design decisions:**

1. **Button reuse for submit.** The existing `Button` component supports `<button>` mode (no `href` prop), accepts `disabled` via rest spread, and inherits brand styling from the `.cardHighlighted .cardCta button` CSS rule. Loading state is a children text swap — no Button extension needed.

2. **Type narrowing via inferred union.** Remove `href` from the Team plan's `cta` in copy.ts, add `waitlist: true`. TypeScript infers a union from the array literal. PriceCard narrows with `"waitlist" in plan` — same pattern already used for `highlighted`.

3. **Formspree ID as component constant.** The form ID is a hardcoded `const` at the top of WaitlistForm.tsx. Not in copy.ts (it's an API implementation detail, not editorial content), not in env vars (unnecessary indirection).

4. **AbortController with 10s timeout.** Prevents infinite loading state on network issues. On timeout, shows the same error state with fallback email.

5. **Honeypot technique.** `_gotcha` field positioned off-screen with `position: absolute; left: -9999px`, plus `aria-hidden="true"` and `tabindex="-1"`. Bots detect `display: none` — this approach is Formspree-recommended and passes accessibility linters.

## Output Mockups

### Idle state (desktop, side-by-side)
```
┌─────────────────────────────────────────────────┐
│  [email input          ] [Join the waitlist]     │
└─────────────────────────────────────────────────┘
```

### Idle state (mobile, stacked)
```
┌──────────────────────────┐
│  [email input           ]│
│  [Join the waitlist     ]│
└──────────────────────────┘
```

### Submitting
```
┌─────────────────────────────────────────────────┐
│  [email input          ] [Sending...] (disabled) │
└─────────────────────────────────────────────────┘
```

### Success (replaces entire form)
```
✓ You're on the list. We'll reach out when Team is ready.
```
The success message fades in with a 200–300ms CSS transition.

### Validation error (below input)
```
┌─────────────────────────────────────────────────┐
│  [email input          ] [Join the waitlist]     │
│  Enter a valid email address.                    │
└─────────────────────────────────────────────────┘
```

### Submission error (below input)
```
┌─────────────────────────────────────────────────┐
│  [email input          ] [Join the waitlist]     │
│  Something went wrong. Email us at               │
│  team@anatomia.dev instead.                      │
└─────────────────────────────────────────────────┘
```

## File Changes

### `website/components/pricing/WaitlistForm.tsx` (create)
**What changes:** New client component. `"use client"`, useState for form state (idle/submitting/success/error), fetch to Formspree, email validation, honeypot field, AbortController timeout, accessible markup.
**Pattern to follow:** `website/components/hero/ScrollHint.tsx` for the client component skeleton. Form state machine is custom — no analog on the site.
**Why:** The Team card needs an inline form instead of a link button. This is the only client-side form on the site.

### `website/components/pricing/pricing.module.css` (modify)
**What changes:** Add styles for the waitlist form: `.waitlistForm` (flex layout, responsive stacking), `.waitlistInput` (input styling for inverted card), `.waitlistMessage` (success/error text), `.waitlistError` (error color), `.waitlistSuccess` (fade-in transition), `.waitlistHoneypot` (off-screen positioning).
**Pattern to follow:** Existing card styles in the same file. Use CSS custom properties, not Tailwind utilities, matching the rest of the pricing section.
**Why:** Inputs are not covered by the existing `.cardHighlighted .cardCta` rule (which only targets `a` and `button`). They need explicit styles for the dark card surface in both themes.

### `website/components/pricing/PriceCard.tsx` (modify)
**What changes:** Import `WaitlistForm`. Conditionally render it instead of the `Button` when `"waitlist" in plan` is true. The form renders inside the existing `.cardCta` div to maintain flex layout positioning.
**Pattern to follow:** The existing `"highlighted" in plan && plan.highlighted` narrowing pattern at line 8.
**Why:** The conditional render is the integration point. Without it, the form component exists but never appears.

### `website/lib/copy.ts` (modify)
**What changes:** On the Team plan object: add `waitlist: true`, remove `href` from `cta` (keep `label`), remove the TODO comment. The `cta` becomes `{ label: "Join the waitlist" }`.
**Pattern to follow:** The existing plan structure — minimal change, type inference handles the union.
**Why:** The `waitlist` flag drives PriceCard's conditional rendering. Removing `href` ensures TypeScript catches any code path that tries to use it on a waitlist plan.

## Acceptance Criteria

- [ ] AC1: The Team pricing card displays an inline email input + submit button where the CTA link previously was. The form is always visible (no reveal-on-click).
- [ ] AC2: Submitting a valid email POSTs to the Formspree endpoint via `fetch()` with `Accept: application/json`. No page redirect occurs.
- [ ] AC3: On success, the form is replaced by a confirmation message ("✓ You're on the list. We'll reach out when Team is ready.") with a 200–300ms fade transition. The success state persists until page refresh.
- [ ] AC4: On error (network failure, 4xx/5xx), an inline error message appears below the input with a fallback email address. The form remains interactive.
- [ ] AC5: A hidden `_gotcha` honeypot field is present for spam protection. A hidden `_source` field is set to `"pricing-card"` for attribution.
- [ ] AC6: Client-side email validation prevents submission of empty or malformed input. Validation error appears inline.
- [ ] AC7: The submit button shows a loading state during submission and is disabled to prevent double-submit.
- [ ] AC8: On desktop (>768px), input and button sit side by side. On mobile (≤480px), they stack full-width. Tablet adapts based on available space.
- [ ] AC9: The form is accessible: `aria-label` on the input, descriptive button text, `aria-live="polite"` on success/error messages, form submits on Enter.
- [ ] AC10: The form renders correctly on the inverted highlighted card in both light and dark themes. Input background, text, placeholder, focus ring, and border all work on the dark card surface.
- [ ] AC11: The Formspree form ID is a hardcoded constant in WaitlistForm.tsx, not in copy.ts or any config file.
- [ ] AC12: The Individual card's CTA button is unchanged — only the Team card renders the form.
- [ ] AC13: No build errors (`pnpm run build` succeeds).
- [ ] AC14: The input field has `type="email"` for mobile keyboard optimization and built-in browser validation as a secondary check.
- [ ] AC15: Focus moves to the success message after submission so screen readers announce it.

## Testing Strategy

No Vitest tests — the website has no test infrastructure and this is a visual, client-side component. Testing is visual QA:

- **Manual QA checklist:**
  - Light mode: form visible on Team card, input readable, submit button brand-colored
  - Dark mode: same checks — input background visible against dark card
  - Submit with valid email: success message with fade transition
  - Submit with empty input: validation error appears
  - Submit with malformed email: validation error appears
  - Network error simulation (DevTools offline): error message with fallback email
  - Mobile viewport (≤480px): input and button stack full-width
  - Desktop viewport (>768px): input and button side by side
  - Keyboard: Tab to input, type, Enter submits
  - Screen reader: aria-live region announces success/error
  - Individual card: still shows "Install" button, no form

- **Build verification:** `pnpm run build` completes without errors (type-checks the entire Next.js site).

## Dependencies

- Formspree form ID: `xbdbjkkg`. Endpoint: `https://formspree.io/f/xbdbjkkg`. The builder hardcodes `const FORMSPREE_ID = "xbdbjkkg"` at the top of WaitlistForm.tsx and constructs the endpoint URL from it.
- No npm packages to install. `fetch` is built-in.

## Constraints

- **No new npm dependencies.** fetch, AbortController, and FormData are all browser-native.
- **CSS custom properties only.** No Tailwind color utilities in the form styles — match the rest of the pricing section.
- **Card flex layout must be preserved.** `.cardFeatures` uses `flex: 1` to push the CTA to the bottom. The form must render in the same `.cardCta` position.
- **`!important` brand override.** The `.cardHighlighted .cardCta button` rule applies `background: var(--color-brand) !important`. The submit button inherits this. Disabled/loading visual states must use opacity or cursor, not color changes.

## Gotchas

- **Input elements are NOT covered by `.cardHighlighted .cardCta` CSS.** That rule only targets `a` and `button`. The `<input>` needs its own styles for the inverted card — background, text color, placeholder color, focus ring, border. Without this, the input is invisible on the dark surface in light mode.
- **The Plan type is inferred from the array literal.** There's no explicit type definition to update. When you add `waitlist: true` to Team and remove `href` from its `cta`, TypeScript automatically creates a union type. PriceCard's existing `type Plan = typeof import("@/lib/copy").copy.pricing.plans[number]` picks it up. Don't create a manual Plan interface — it would fight the inference.
- **`plan.cta.href` becomes conditional.** After the copy.ts change, `plan.cta.href` only exists on non-waitlist plans. Any reference to `plan.cta.href` without narrowing first will be a type error. The Button in PriceCard's else branch needs narrowing to compile.
- **Success checkmark is a literal character.** The "✓" in the success message is a Unicode character (U+2713), not an emoji. Matches the feature tick marks already used in the card.
- **Formspree expects specific field names.** The email field should be named `email` in the POST body. `_gotcha` and `_source` are Formspree-specific hidden fields (underscore prefix = Formspree metadata, not submitted to the form owner).
- **The `.cardCta` div has `margin-top: 28px`.** The form inherits this spacing. Don't add extra top margin on the form wrapper.

## Build Brief

### Rules That Apply
- `"use client"` directive required — this is a client component in a Next.js app with server components by default.
- Named exports only, no default exports.
- CSS custom properties for colors, not Tailwind color utilities — match pricing section convention.
- CSS module classes for layout and styling — co-located in `pricing.module.css`.
- 2-space indentation, TypeScript.

### Pattern Extracts

**ScrollHint.tsx (structural analog — client component skeleton):**
```tsx
// website/components/hero/ScrollHint.tsx lines 1-6
"use client";

import { useEffect, useState } from "react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import styles from "./hero.module.css";
```

**PriceCard.tsx (narrowing pattern — lines 7-9):**
```tsx
// website/components/pricing/PriceCard.tsx lines 7-9
export function PriceCard({ plan }: { plan: Plan }) {
  const highlighted = "highlighted" in plan && plan.highlighted;
```

**PriceCard.tsx (CTA area — lines 31-40):**
```tsx
// website/components/pricing/PriceCard.tsx lines 31-40
      <div className={styles.cardCta}>
        <Button
          variant={highlighted ? "primary" : "secondary"}
          size="md"
          href={plan.cta.href}
          className="w-full justify-center"
        >
          {plan.cta.label}
        </Button>
      </div>
```

**pricing.module.css (highlighted CTA override — lines 93-97):**
```css
/* website/components/pricing/pricing.module.css lines 93-97 */
.cardHighlighted .cardCta a,
.cardHighlighted .cardCta button {
  background: var(--color-brand) !important;
  color: var(--color-brand-ink) !important;
}
```

**copy.ts (Team plan — lines 436-452):**
```typescript
// website/lib/copy.ts lines 436-452
      {
        name: "Team",
        flag: "Beta · waitlist",
        price: "$45",
        priceUnit: "/seat",
        sub: "hosted · coming Q3 2026",
        highlighted: true,
        features: [
          "Dashboard · proof explorer, pipeline health, shareable URLs",
          "AnaWeb · pipeline access for product and leadership",
          "Team visibility · Slack · GitHub PRs",
          "Hosted backlog · queue, build, verify",
          "Cross-project intelligence · patterns from one repo improve the next",
        ],
        // TODO: Replace with waitlist form URL when available
        cta: { label: "Join the waitlist", href: "/contact" },
      },
```

### Proof Context
- `pricing.module.css`: Highlighted CTA uses `!important` to override Button Tailwind utilities — accounted for in design (submit button inherits brand colors, disabled states use opacity not color).
- `copy.ts`: Two existing findings about stale links elsewhere in the file — not related to this change. Don't fix them in this scope.
- `PriceCard.tsx`: No active proof findings.

### Checkpoint Commands
- After WaitlistForm.tsx created + CSS added: `pnpm run build` — Expected: builds successfully (type-checks all website code)
- After PriceCard.tsx + copy.ts modified: `pnpm run build` — Expected: builds successfully, no type errors from the union narrowing
- After all changes: `pnpm run test -- --run` — Expected: 2486 tests pass (no website tests affected)
- Lint: `(cd packages/cli && pnpm run lint)` — Expected: clean (no CLI changes)

### Build Baseline
- Current tests: 2486 passed, 2 skipped
- Current test files: 108
- Command used: `pnpm run test -- --run`
- After build: 2486 tests (no new test files — website has no Vitest tests)
- Regression focus: None — no CLI code changes. Build verification is `pnpm run build` for the Next.js site.
