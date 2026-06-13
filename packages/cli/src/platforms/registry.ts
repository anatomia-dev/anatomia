/**
 * Platform registry — the single descriptor table for every harness Anatomia
 * targets.
 *
 * Today's platform knowledge is scattered across literals: `getAgentsDir`
 * branches on `'codex'` (platform.ts), `KNOWN_PLATFORMS` is a hardcoded Set
 * (run.ts), `resolveAgentDefPath` re-derives the dir (run.ts), `detectPlatforms`
 * iterates a `['claude', 'codex']` literal (state.ts), and the Codex run
 * defaults (`gpt-5.5` / `danger-full-access`) live inline at the call site.
 * Six copies of "what platforms exist and how each one is shaped."
 *
 * This module collapses all of that to ONE descriptor per platform. The claude
 * and codex descriptors are seeded **byte-identical to today** — every consumer
 * that routes through the registry produces the same dirs, the same defaults,
 * the same detection order it did before. That identity is pinned by
 * registry.test.ts (the no-regression contract).
 *
 * Because the shape is now data, a third platform is a **data row, not a code
 * branch**: the `cursor` descriptor below adds Cursor support without touching
 * a single consumer. registry.test.ts proves a registry-only descriptor
 * resolves its agents dir with zero new branches.
 *
 * Resolvers here never throw — an unknown platform name falls through to the
 * default descriptor (claude), mirroring the fail-soft posture every consumer
 * used before (each had its own `?? 'claude'` / `=== 'codex' ? … : …`).
 */

/**
 * Everything the CLI needs to know about a single target platform.
 *
 * One descriptor per harness. The two stock descriptors (claude, codex) are
 * seeded byte-identical to the pre-registry literals; adding a platform means
 * adding a row, never editing a consumer.
 */
export interface PlatformDescriptor {
  /** Canonical platform id (the value stored in `ana.json.platforms`). */
  readonly id: string;
  /**
   * Path segments of the agents directory, relative to the project root.
   * Joined by the consumer (`getAgentsDir`, `resolveAgentDefPath`) with
   * `path.join`, so this stays platform-separator agnostic.
   * claude → `['.claude', 'agents']`; codex → `['.codex', 'agents']`.
   */
  readonly agentsDirSegments: readonly string[];
  /**
   * Agent definition files this platform scaffolds (base `.md` names).
   * The single source of truth for `AGENT_FILES` / `CODEX_AGENT_FILES` — those
   * constants are now derived from the descriptor so they can never drift.
   */
  readonly agentFiles: readonly string[];
  /**
   * Executable probed in PATH by `detectPlatforms`. When null the platform is
   * never auto-detected (it is opt-in via `ana.json.platforms`).
   */
  readonly detectExecutable: string | null;
  /**
   * Whether `ana run` recognizes this platform as a dispatch target. A
   * descriptor can exist (its dir resolves, its agents scaffold) without yet
   * having a `ana run` dispatch path — `known:false` keeps it out of
   * `KNOWN_PLATFORMS` until a dispatcher is wired.
   */
  readonly known: boolean;
  /**
   * Default runtime config applied at dispatch when the agent manifest omits a
   * value. Codex uses `model` / `sandboxMode` (the `gpt-5.5` /
   * `danger-full-access` fallbacks); platforms without a runtime config (Claude)
   * carry an empty object.
   */
  readonly runDefaults: PlatformRunDefaults;
}

/**
 * Per-platform dispatch defaults consulted when the agent manifest omits a
 * value. Both fields optional — a platform with no runtime config (Claude)
 * supplies neither.
 */
export interface PlatformRunDefaults {
  /** Default model id (Codex: `gpt-5.5`). */
  readonly model?: string;
  /** Default sandbox mode (Codex: `danger-full-access`). */
  readonly sandboxMode?: string;
}

/** The platform every fail-soft fallback resolves to (matches pre-registry behavior). */
export const DEFAULT_PLATFORM_ID = 'claude';

/**
 * The shared agent-file roster. Both stock platforms scaffold the same six
 * agents today (AGENT_FILES === CODEX_AGENT_FILES, verified byte-identical), so
 * the descriptors reference one list. A platform that ever needs a different
 * roster declares its own `agentFiles`.
 */
const STOCK_AGENT_FILES = [
  'ana.md',
  'ana-plan.md',
  'ana-setup.md',
  'ana-build.md',
  'ana-verify.md',
  'ana-learn.md',
] as const;

/**
 * The descriptor table. Order is load-bearing for `detectPlatforms`, which
 * probes executables in registry order — claude before codex, matching the
 * pre-registry `['claude', 'codex']` literal exactly.
 *
 * `cursor` is a registry-only descriptor: it proves a third platform is a data
 * row. It resolves its agents dir and scaffolds the stock agents with zero
 * consumer changes. It is `known:false` (no `ana run` dispatcher yet) and has
 * no detect executable (opt-in only), so it changes nothing for existing
 * installs — `detectPlatforms` and `KNOWN_PLATFORMS` stay byte-identical.
 */
export const PLATFORM_REGISTRY: readonly PlatformDescriptor[] = [
  {
    id: 'claude',
    agentsDirSegments: ['.claude', 'agents'],
    agentFiles: STOCK_AGENT_FILES,
    detectExecutable: 'claude',
    known: true,
    runDefaults: {},
  },
  {
    id: 'codex',
    agentsDirSegments: ['.codex', 'agents'],
    agentFiles: STOCK_AGENT_FILES,
    detectExecutable: 'codex',
    known: true,
    runDefaults: {
      model: 'gpt-5.5',
      sandboxMode: 'danger-full-access',
    },
  },
  {
    id: 'cursor',
    agentsDirSegments: ['.cursor', 'agents'],
    agentFiles: STOCK_AGENT_FILES,
    detectExecutable: null,
    known: false,
    runDefaults: {},
  },
];

/** Index for O(1) descriptor lookup by id. Built once at module load. */
const REGISTRY_BY_ID: ReadonlyMap<string, PlatformDescriptor> = new Map(
  PLATFORM_REGISTRY.map((d) => [d.id, d]),
);

/**
 * Look up a platform descriptor by id.
 *
 * @param id - Platform id (e.g. 'claude', 'codex')
 * @returns The descriptor, or null when no platform with that id is registered
 */
export function getPlatformDescriptor(id: string): PlatformDescriptor | null {
  return REGISTRY_BY_ID.get(id) ?? null;
}

/**
 * Resolve the descriptor for a platform, falling back to the default (claude)
 * when the id is unknown. Never returns null — mirrors the pre-registry
 * fail-soft behavior where an unknown platform was treated as claude.
 *
 * @param id - Platform id (may be undefined or unknown)
 * @returns The matching descriptor, or the default (claude) descriptor
 */
export function resolvePlatformDescriptor(id: string | undefined): PlatformDescriptor {
  const descriptor = id !== undefined ? REGISTRY_BY_ID.get(id) : undefined;
  if (descriptor) return descriptor;
  // The default descriptor is guaranteed present (claude is the first row).
  return REGISTRY_BY_ID.get(DEFAULT_PLATFORM_ID) as PlatformDescriptor;
}

/**
 * The set of platform ids `ana run` accepts as dispatch targets — derived from
 * the descriptors flagged `known:true`. Replaces the hardcoded
 * `new Set(['claude', 'codex'])` literal; stays byte-identical because only
 * claude and codex carry `known:true` today.
 *
 * @returns A fresh Set of known platform ids
 */
export function knownPlatformIds(): Set<string> {
  return new Set(PLATFORM_REGISTRY.filter((d) => d.known).map((d) => d.id));
}

/**
 * The ordered list of (id, executable) pairs `detectPlatforms` probes — derived
 * from descriptors that declare a `detectExecutable`. Preserves registry order
 * (claude before codex), matching the pre-registry `['claude', 'codex']`
 * iteration exactly.
 *
 * @returns Ordered detection probes (platform id + executable name)
 */
export function platformDetectProbes(): Array<{ id: string; executable: string }> {
  const probes: Array<{ id: string; executable: string }> = [];
  for (const d of PLATFORM_REGISTRY) {
    if (d.detectExecutable !== null) {
      probes.push({ id: d.id, executable: d.detectExecutable });
    }
  }
  return probes;
}

/**
 * Resolve the agents directory segments for a platform (the path relative to
 * the project root). Unknown platforms fall back to the default descriptor.
 *
 * @param id - Platform id (may be undefined or unknown)
 * @returns Path segments to join under the project root (e.g. ['.claude', 'agents'])
 */
export function agentsDirSegmentsFor(id: string | undefined): readonly string[] {
  return resolvePlatformDescriptor(id).agentsDirSegments;
}
