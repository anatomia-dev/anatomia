<!-- Internal: read by ana-setup only. Not for manual editing. -->

# Data Access — Enrichment Guide

**Who reads this:** Only the setup agent during `ana-setup`. NOT read by Build, Plan, Verify, or Think.

**Purpose:** Build reads the skill file when writing database queries. Plan references it when specs involve data model changes.

## What to investigate

Read: The schema file — check `scan.schemas` for the path and model count. Also search for the database client instantiation file (`lib/db.ts`, `lib/prisma.ts`, `src/db/` — grep for `new PrismaClient` or `drizzle(` or similar). If found, check: singleton pattern? `globalThis` caching? Connection pooling config?

**ORM-specific investigation** — key off `scan.stack.database`:

- **Prisma:** Read `schema.prisma`. Check for `prisma/migrations/` directory. Look for `$queryRaw` usage (SQL injection risk). Check client instantiation (singleton with `globalThis`?). Check `scan.versions` — Prisma 7 removed the Rust binary (no serverless binary warning needed).
- **Drizzle:** Check for `drizzle-kit` config. Look for `db.select()` vs raw SQL patterns. Check push vs migrate workflow.
- **Other ORMs:** Read one query file. Look for connection management, query builder vs raw SQL, transaction usage.

Look for:
- Client instantiation: singleton (good) vs per-request (connection exhaustion risk)
- Raw query usage: `$queryRaw`, `$executeRaw`, or equivalent (SQL injection vector)
- Transaction patterns: `$transaction()`, explicit BEGIN/COMMIT
- Soft delete patterns: `deletedAt` field, default filter
- Field selection: `select` clauses vs returning everything
- Migration directory: exists? What workflow (migrate dev, db push, raw SQL)?

## What to write

Write to: `## Rules` — add ORM-specific rules alongside the template defaults. The template rules are universal and strong (5 rules covering singleton, transactions, N+1, field selection, auth scoping). Add specificity from what you observed.

**Security enrichment is the highest priority.** The template covers performance. Enrichment should add: IDOR scoping patterns specific to how THIS project handles auth context, raw query safety if `$queryRaw` is used.

**Version-aware:** Reference `scan.versions` for the ORM version. Prisma 6 advice differs from Prisma 7 (Rust binary removed, new features). Don't write version-specific advice that contradicts the installed version.

**Cross-skill overlap rule:** Data-level auth scoping belongs HERE. API-level auth belongs in api-patterns. Don't duplicate.

## Skip conditions

Skip if: `stack.database` is null.

## Expected output

1-2 rules added. ORM-specific patterns from schema reading + client investigation.
