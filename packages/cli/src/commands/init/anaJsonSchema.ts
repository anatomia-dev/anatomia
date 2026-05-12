/**
 * Zod schema for `.ana/ana.json`.
 *
 * Single source of truth for the on-disk ana.json shape. Consumed by:
 *
 * 1. `init` re-init merge — uses `.passthrough()` to preserve unknown
 *    top-level keys (e.g., user-added settings, legacy fields like
 *    `scanStaleDays` from older installs). Catches invalid enum values
 *    (e.g., `setupPhase: "guided"` from older installs) and defaults
 *    them to sensible initial values, preserving user fields verbatim.
 * 2. `setup check` dashboard — reads the file through the schema so that
 *    the ✓/○/✗ display and the completion validator both see the same
 *    validated shape.
 *
 * Per-field `.catch()` + `.default()` is deliberate: a single bad field
 * must not nuke the entire restored config. If setupPhase is invalid, ONLY
 * setupPhase resets to undefined. coAuthor, artifactBranch, and user
 * customizations survive.
 *
 * `.passthrough()` is deliberate: unknown top-level keys flow through
 * the parse unchanged. This prevents `ana init` re-runs from silently
 * deleting user-added or legacy fields — a data-loss footgun that
 * blocks `config set` on custom keys.
 *
 * Field enumeration is cross-checked against `createAnaJson` in
 * `init/state.ts` (the write-side source of truth). If a field exists in
 * createAnaJson but not here, re-init will lose it on every run — bug.
 * If a field exists here but not in createAnaJson, fresh inits are
 * missing it — bug.
 *
 * See also: `src/engine/types/engineResult-partial.ts` for the same
 * fail-soft pattern applied to scan.json.
 */

import { z } from 'zod';

export const AnaJsonSchema = z
  .object({
    anaVersion: z.string().optional().default('0.0.0').catch('0.0.0'),
    name: z.string().default('unknown').catch('unknown'),
    language: z.string().nullable().default(null).catch(null),
    framework: z.string().nullable().default(null).catch(null),
    packageManager: z.string().nullable().default(null).catch(null),
    commands: z.record(z.string(), z.unknown()).optional().catch(undefined),
    coAuthor: z.string().nullable().optional().catch(undefined),
    artifactBranch: z.string().optional().catch(undefined),
    branchPrefix: z.string().optional().default('feature/').catch('feature/'),
    setupPhase: z
      .enum(['not-started', 'context-complete', 'complete'])
      .optional()
      .catch(undefined),
    lastScanAt: z.string().nullable().optional().default(null).catch(null),
    custom: z.record(z.string(), z.unknown()).optional().default({}).catch({}),
  })
  .passthrough();

export type AnaJson = z.infer<typeof AnaJsonSchema>;
