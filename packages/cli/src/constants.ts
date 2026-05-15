/**
 * Shared constants for CLI
 *
 * Centralizes magic strings and numbers for maintainability.
 *
 * CONTEXT_FILES, CORE_SKILLS, CONDITIONAL_SKILL_TRIGGERS, computeSkillManifest
 * are the single source of truth for the file manifest.
 * Hooks, check.ts, init, and display code should read from these.
 * Adding a context file or skill means updating THIS file.
 */

import type { EngineResult } from './engine/types/engineResult.js';

// ============================================================
// File Manifest
// ============================================================

/** Context files in .ana/context/ */
export const CONTEXT_FILES = ['design-principles', 'project-context'] as const;

/**
 * Directory names recognized as test directories.
 *
 * Single source of truth for "is this entry a test dir?" checks. Used by
 * init.ts's injectTestingStandards to decide "dedicated test directory" vs
 * "co-located with source." Must stay in sync with the structure analyzer's
 * DIRECTORY_PURPOSES map in engine/analyzers/structure.ts — if you add a
 * test convention here, add the corresponding purpose label there so scan
 * output labels it correctly.
 *
 * Why not derived from DIRECTORY_PURPOSES: that map is keyed by dir name but
 * valued by a free-text label ('Tests', 'Jest tests', 'E2E tests', etc.), so
 * filtering it by purpose-contains-"test" is string-matching fragile. An
 * explicit list here is simpler and the drift window is small (8 entries).
 */
export const TEST_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  'tests',
  'test',
  '__tests__',
  'spec',
  'e2e',
  'integration',
  'cypress',
  'playwright',
]);

/** Core skills — always scaffolded */
export const CORE_SKILLS = [
  'coding-standards',
  'testing-standards',
  'git-workflow',
  'deployment',
  'troubleshooting',
] as const;

/**
 * CLI frameworks that have no API surface — api-patterns should not fire
 * for these. All 4 values are passthrough (no display-name transform),
 * so they match `stack.framework` exactly. Adding a new CLI framework is
 * one line here.
 *
 * Failure mode is safe by design: forgetting a CLI framework means it
 * gets api-patterns (same as today — not a regression). A category map
 * was considered and rejected for the opposite failure mode: forgetting
 * an API framework would lose api-patterns silently.
 */
const NON_API_FRAMEWORKS = new Set<string>([
  'typer',      // Python CLI
  'click',      // Python CLI
  'clap-cli',   // Rust CLI
  'cobra-cli',  // Go CLI
]);

/**
 * Conditional skills — scaffolded only when scan detects the trigger
 */
export const CONDITIONAL_SKILL_TRIGGERS: Record<string, (result: EngineResult) => boolean> = {
  'ai-patterns': (r) => !!r?.stack?.aiSdk,
  'api-patterns': (r) => !!r?.stack?.framework && !NON_API_FRAMEWORKS.has(r.stack.framework),
  'data-access': (r) => !!r?.stack?.database,
};

/**
 * Compute which skills to scaffold based on scan results.
 * This function IS Anatomia's adaptive intelligence.
 *
 * @param engineResult - Scan engine result
 * @returns Array of skill names to scaffold
 */
export function computeSkillManifest(engineResult: EngineResult): string[] {
  const skills: string[] = [...CORE_SKILLS];
  for (const [skill, trigger] of Object.entries(CONDITIONAL_SKILL_TRIGGERS)) {
    if (trigger(engineResult)) {
      skills.push(skill);
    }
  }
  return skills;
}

/**
 * Get stack summary as a filtered array of non-null stack fields.
 * Single source of truth — used by CLAUDE.md, AGENTS.md, init success, scaffold generators.
 *
 * NOTE: `result.stack.workspace` (e.g., "pnpm monorepo") is deliberately
 * EXCLUDED from this summary. The 7 fields below are "what the project is
 * built with"; workspace is "how the project is structured." The Phase 2
 * testing report (N1 finding) flagged this as an open UX question: should
 * "pnpm monorepo" appear in the CLAUDE.md Stack line? Current answer is
 * no — workspace is surfaced in the Monorepo section of scan output and
 * in AGENTS.md metadata, not in the identity line.
 *
 * @param result - Scan engine result
 * @returns Array of display-ready stack strings (e.g., ["TypeScript", "Next.js", "Supabase"])
 */
export function getStackSummary(result: EngineResult): string[] {
  // stack.testing is `string[]`. Join detected frameworks with
  // a comma so multi-framework projects surface correctly in the single-
  // line stack summary; empty array means "no testing detected" and is
  // filtered out alongside the other null values.
  const testingDisplay =
    result.stack.testing.length > 0 ? result.stack.testing.join(', ') : null;
  return [
    result.stack.language,
    result.stack.framework,
    result.stack.database,
    result.stack.auth,
    testingDisplay,
    result.stack.aiSdk,
    result.stack.payments,
  ].filter(Boolean) as string[];
}

// ============================================================
// Documentation URLs
// Centralized so CLI output surfaces stable, maintainable links.
// ============================================================

/** Quickstart guide — shown after `ana init` success */
export const DOCS_QUICKSTART = 'https://anatomia.dev/docs/start';

/** Setup guide — shown by bare `ana setup` command */
export const DOCS_SETUP_GUIDE = 'https://anatomia.dev/docs/guides/using-ana-setup';

// ============================================================
// LEGACY CONSTANTS (pre-vault — still referenced by current code)
// These will be migrated to vault constants as init/validators are rewritten.
// ============================================================

/** Scaffold marker (first line of every context file scaffold) */
export const SCAFFOLD_MARKER = '<!-- SCAFFOLD - Setup will fill this file -->';

/** Validation thresholds */
export const MIN_FILE_SIZE_WARNING = 20; // Lines
export const MAX_FILE_SIZE_WARNING = 1500; // Lines
/** Context files required for setup complete validation */
export const REQUIRED_CONTEXT_FILES = [
  'context/project-context.md',
  'context/design-principles.md',
] as const;

/** Agent definition files */
export const AGENT_FILES = [
  'ana.md',
  'ana-plan.md',
  'ana-setup.md',
  'ana-build.md',
  'ana-verify.md',
  'ana-learn.md',
] as const;


