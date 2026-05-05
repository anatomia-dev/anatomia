/**
 * Partial runtime validator for `scan.json` data at module boundaries.
 *
 * Rationale: `EngineResult` has ~30 top-level fields, many nullable or deeply
 * nested. A full Zod mirror of the TypeScript interface would be ~100 lines
 * and would have to be kept manually in sync with `engineResult.ts` forever.
 * This partial schema covers only the **invariants** — the three fields that
 * MUST be present and well-shaped for any downstream consumer (`ana setup
 * check`, setup agent scaffolding, init re-read) to function:
 *
 *   - `schemaVersion: '1.0'` (exact literal) — catches format drift and
 *     forward-incompat rollbacks (e.g. a future v2 scan.json being read
 *     by a v1 CLI).
 *   - `stack.*` (all 9 fields) — every display surface reads these; a
 *     missing field or wrong type means CLAUDE.md/AGENTS.md won't render.
 *   - `commands.*` (build/test/lint/dev/packageManager/all) — consumed by
 *     init success output, AGENTS.md Commands section, skill templates.
 *
 * Drift in any OTHER field (patterns, conventions, git, deployment, etc.)
 * is caught at the next `pnpm typecheck` when `EngineResult` changes. The
 * partial schema is a runtime safety net for READS — not a contract for
 * writes. Write-side correctness comes from the typed `EngineResult`
 * constructed in `scanProject()`; if tsc accepts it, the shape is correct.
 *
 * Usage: call `parseEngineResultPartial(raw)` on any parsed JSON. Throws
 * a `ZodError` on failure with a clear path to the offending field. The
 * one production consumer (`commands/check.ts readScanJson()`) catches
 * the ZodError, logs a warning, and returns `null` to preserve the
 * existing "scan.json absent or unreadable → treat as missing" contract.
 * Test code can call `.parse()` directly and assert on the thrown shape.
 */

import { z } from 'zod';

export const EngineResultPartialSchema = z.object({
  schemaVersion: z.literal('1.0'),
  stack: z.object({
    language: z.string().nullable(),
    framework: z.string().nullable(),
    database: z.string().nullable(),
    auth: z.string().nullable(),
    // Was `string | null`, now an array of every detected
    // testing framework. Empty array = no framework detected. Consumers
    // that want a single name use `.join(', ')` or index 0.
    testing: z.array(z.string()),
    payments: z.string().nullable(),
    workspace: z.string().nullable(),
    aiSdk: z.string().nullable(),
    uiSystem: z.string().nullable(),
  }),
  commands: z.object({
    build: z.string().nullable(),
    test: z.string().nullable(),
    lint: z.string().nullable(),
    dev: z.string().nullable(),
    packageManager: z.string().nullable(),
    all: z.record(z.string(), z.string()),
  }),
});

export type EngineResultPartial = z.infer<typeof EngineResultPartialSchema>;

/**
 * Parse an unknown value (typically the result of `JSON.parse()` on a
 * `scan.json` file) against the partial schema. Throws `ZodError` on
 * failure with a path to the first invalid field.
 *
 * @param raw - Any value — typically the parsed JSON from `scan.json`.
 * @returns The same value, narrowed to `EngineResultPartial`.
 * @throws `ZodError` if the value is missing `schemaVersion: '1.0'` or
 *   has a malformed `stack` / `commands` field.
 *
 * @example
 * ```typescript
 * import { parseEngineResultPartial } from './engineResult-partial.js';
 * const raw: unknown = JSON.parse(await fs.readFile(scanPath, 'utf-8'));
 * try {
 *   parseEngineResultPartial(raw);
 *   // raw is now verified as having the critical invariants
 * } catch (err) {
 *   // ZodError: tells you exactly which invariant failed
 * }
 * ```
 */
export function parseEngineResultPartial(raw: unknown): EngineResultPartial {
  return EngineResultPartialSchema.parse(raw);
}
