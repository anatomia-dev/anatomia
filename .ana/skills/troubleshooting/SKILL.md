---
name: troubleshooting
description: "Invoke when debugging failures, diagnosing unexpected behavior, or investigating test failures. Contains project-specific failure modes, diagnostic workflows, and known issues."
---

# Troubleshooting

## Detected

### Common Issues
- **TypeScript reports "possibly null" or "possibly undefined" after a type guard, but only in async functions — the guard works in sync code** — Type narrowing does not persist across `await` boundaries because the variable could be reassigned between suspension points. Re-narrow after each `await`: `if (!x) throw` before the `await`, then `if (!x) throw` again after.
- **Object literal type is widened to `string` instead of the literal value, or array type is `string[]` instead of a tuple** — Add `as const` to the declaration: `const x = { type: "success" } as const` gives `{ readonly type: "success" }` instead of `{ type: string }`. For arrays: `const arr = ["a", "b"] as const` gives `readonly ["a", "b"]` instead of `string[]`.
- **"ERR_REQUIRE_ESM" when importing an ESM-only package, or "SyntaxError: Cannot use import statement in a module"** — ESM-only packages (like `chalk` v5+, `execa` v6+, `node-fetch` v3+) cannot be `require()`'d. Either: (1) switch your project to ESM (`"type": "module"` in package.json), (2) use dynamic `import()` for the ESM package, or (3) pin an older CJS-compatible version.
- **Process crashes with "UnhandledPromiseRejection" — an async function throws but nothing catches it** — Ensure every Promise chain has a `.catch()` or is inside a `try/catch` in an `async` function. For fire-and-forget promises, add `.catch(err => logger.error(err))`. Check for missing `await` on async calls — without it, the rejection is unhandled. Prevention: Add `process.on("unhandledRejection", handler)` as a safety net, but fix the root cause — unhandled rejections indicate a code bug.
- **Tests hang indefinitely in CI or when run from scripts — process never exits** — Vitest defaults to watch mode in interactive terminals. Pass `--run` flag to run tests once and exit: `vitest run` instead of `vitest`. In CI, Vitest auto-detects non-interactive environments, but scripts piping output may still trigger watch mode. Prevention: Always use `vitest run` in CI scripts and non-interactive contexts.
- **Tests pass individually but fail when run together — mock from one test bleeds into another** — Call `vi.restoreAllMocks()` in `afterEach` or set `mockReset: true` / `restoreAllMocks: true` in `vitest.config.ts`. Module mocks (`vi.mock()`) persist across tests in the same file — use `vi.unmock()` or restructure to avoid shared module-level mocks.

## Rules

**Pre-commit hook rejects commit.** The hook runs `tsc --noEmit` (source + tests) and `eslint`. It does NOT run tests. The most common cause is a type error. Run `cd packages/cli && pnpm typecheck` to see the specific error. Don't use `--no-verify` to skip the hook — the build (tsup/SWC) strips types without checking, so the hook is the only enforcement.

**Gotcha triggers don't fire on the expected stack.** Gotcha triggers match against `stack.*` fields which store DISPLAY NAMES, not package names. `{ aiSdk: 'Anthropic' }` fires. `{ aiSdk: '@anthropic-ai/sdk' }` does not. Check `packages/cli/src/data/gotchas.ts` for existing trigger values.

**Schema detection shows wrong file or wrong model count.** In monorepos, census first checks `{root}/prisma/schema.prisma` and `{root}/schema.prisma` for each workspace package. If multiple schema files exist, the scan picks the one with the most models. For multi-file schemas (Prisma `prismaSchemaFolder`), models are counted across all `.prisma` files in the directory. If the wrong schema is selected, check which workspace packages have a `prisma/` directory.

**Re-init doesn't show new template content.** CLAUDE.md, AGENTS.md, and agent definitions use merge-not-overwrite — existing files are preserved. To see fresh template output after changing templates, delete the existing files first: `rm CLAUDE.md AGENTS.md && rm -rf .claude/agents/` then re-run `ana init --force`.

**`pnpm test` at workspace root behaves differently than in packages/cli.** The root `test` script runs through turbo, which handles argument passthrough differently. Use `cd packages/cli && pnpm test -- --run` for reliable test execution with the `--run` flag. Running `pnpm test --run` from the workspace root may fail or pass arguments incorrectly.

## Gotchas
*Add new entries as they're discovered during development. Each entry should describe the symptom, the cause, and the fix.*

## Examples
*Not yet captured. Add diagnostic workflows showing how to investigate common failures.*
