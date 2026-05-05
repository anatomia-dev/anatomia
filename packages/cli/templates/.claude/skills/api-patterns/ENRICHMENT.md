<!-- Internal: read by ana-setup only. Not for manual editing. -->

# API Patterns — Enrichment Guide

**Who reads this:** Only the setup agent during `ana-setup`. NOT read by Build, Plan, Verify, or Think.

**Purpose:** Build reads the skill file when implementing API routes. Plan references it when specs involve API endpoints.

## What to investigate

Read: One route handler file. Find via `structure[]` for `app/api/` (Next.js App Router), `pages/api/` (Next.js Pages Router), `src/routes/` or `routes/` (Express/Fastify/Hono). Read one representative handler. Also check for `middleware.ts` or a middleware directory.

**Framework-specific investigation** — key off `scan.stack.framework`:

- **Next.js App Router:** Check `app/api/` for Route Handlers. Look for Server Actions in `app/` pages. Check if Server Components fetch data directly (good) or call their own Route Handlers (bad — the #1 Next.js API mistake).
- **Next.js Pages Router:** Check `pages/api/`. Look for `getServerSideProps` data fetching patterns.
- **Express / Fastify / Hono:** Check for middleware chain, error-handling middleware, service layer separation.
- **Remix:** Check loader/action patterns. Look for data loading in loaders vs API routes.
- **Unknown framework:** Read one route handler generically. Look for validation, error shape, auth pattern.

Look for:
- Validation approach: zod `.safeParse()` vs `.parse()`, joi, yup, manual
- Error response shape: consistent format? machine-readable codes? Stack trace leakage?
- Handler thickness: thin delegation to services, or fat handlers with inline business logic?
- Auth pattern: middleware-based or per-route checks?
- Rate limiting: exists? middleware-based?

## What to write

Write to: `## Rules` — add framework-specific rules alongside the template defaults. The template rules are universal and correct — add specificity from what you observed.

**Cross-skill overlap rule:** API-level auth and error handling belong HERE (api-patterns). Generic error handling belongs in coding-standards. Data-level scoping belongs in data-access. Don't duplicate.

## Skip conditions

Skip if: no API routes found in structure, or `stack.framework` is a CLI framework.

## Expected output

1-3 rules added. Framework-specific patterns from code observation.
