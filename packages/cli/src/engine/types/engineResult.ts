/**
 * EngineResult — the unified scan output schema.
 *
 * Returned by scanProject(). Consumed by scan.ts for terminal/JSON output
 * and by init.ts for context generation. D2-compliant schema with typed
 * patterns, conventions, deployment, and Phase 1+ null stubs.
 *
 * CROSS-CUTTING: Adding a field requires changes in 5+ locations:
 *   1. Type definition below
 *   2. Default value in createEmptyEngineResult() (bottom of this file)
 *   3. Population in scan-engine.ts
 *   4. Consumers in assets.ts, skills.ts, or scaffold-generators.ts
 *   5. Field completeness check in tests/contract/analyzer-contract.test.ts
 * Missing #2 causes runtime errors in tests that use createEmptyEngineResult().
 */

import type { ConventionAnalysis } from './conventions.js';
import type { PatternAnalysis } from './patterns.js';
import type { DetectedCommands } from '../detectors/commands.js';
import type { GitInfo } from '../detectors/git.js';
import type { DetectedDeployment, DetectedCI } from '../detectors/deployment.js';
import type { ApplicationShape } from '../detectors/applicationShape.js';
import type { DocumentationResult } from '../detectors/documentation.js';

/**
 * Closed set of stack roles an external service may fulfill. Used by
 * `annotateServiceRoles()` to tag each detected service with the stack
 * positions it occupies, so display code can dedupe with
 * `stackRoles.length === 0` rather than substring-matching detector names.
 *
 * Adding a new role = edit this union first; TypeScript then forces every
 * push site and consumer to acknowledge it. The five values cover every
 * current duplication case (see serviceAnnotation.ts for the mapping).
 */
export type StackRole =
  | 'database'
  | 'auth'
  | 'payments'
  | 'aiSdk'
  | 'deployment';

/**
 * Extracted README content, categorized by heading type.
 * Populated by detectReadme() — see detectors/readme.ts.
 */
export interface ReadmeResult {
  description: string | null;
  architecture: string | null;
  setup: string | null;
  source: 'heading' | 'pre-section' | 'fallback';
}

/**
 * The unified scan result returned by `scanProject()` and consumed by every
 * display surface in the CLI (`ana scan` terminal output, `ana init` success
 * message, `CLAUDE.md`, `AGENTS.md`, and the Detected section of every
 * `.claude/skills/<name>/SKILL.md`). Adding a field here is the single edit
 * point — `tsc` then forces `createEmptyEngineResult()` below to populate it
 * and any consumer that destructures the shape to handle it.
 *
 * After Phase 1, five sub-fields compose their detector
 * types directly rather than duplicating them inline:
 * - `commands: DetectedCommands & { packageManager: string | null }`
 * - `git: GitInfo`
 * - `deployment: DetectedDeployment & DetectedCI`
 * - `patterns: PatternAnalysis | null`
 * - `conventions: ConventionAnalysis | null`
 *
 * Each composition has a compile-time assertion in `tests/engine/types.test.ts`
 * that fails if the field regresses to an inline type.
 */
export interface EngineResult {
  schemaVersion: string;
  applicationShape: ApplicationShape;
  overview: {
    project: string;
    scannedAt: string;
    depth: 'surface' | 'deep';
  };
  stack: {
    language: string | null;
    framework: string | null;
    database: string | null;
    auth: string | null;
    /**
     * Every testing framework detected in dependencies, deduplicated by
     * display name. Empty array means "no testing detected"; previously
     * `string | null`, which silently dropped every non-primary framework
     * in multi-framework projects.
     *
     * Consumers that want a single display name should use
     * `testing[0] ?? null` or `testing.join(', ')` — the first entry is
     * implicitly "primary" because TESTING_PACKAGES orders unit runners
     * before E2E and helpers.
     */
    testing: string[];
    payments: string | null;
    workspace: string | null;
    aiSdk: string | null;
    uiSystem: string | null;
  };
  /** Declared version strings for all deps. Keys are package names, values from package.json (e.g., "^7.2.0"). */
  versions: Record<string, string>;
  files: {
    source: number;
    test: number;
    config: number;
    total: number;
  };
  structure: Array<{ path: string; purpose: string }>;
  // Composed from the detector's DetectedCommands — adding a field
  // to DetectedCommands now flows through automatically. The only extra field
  // scan-engine appends on top is packageManager, which is nullable because
  // non-Node projects (Python, Go, Rust) have no package manager in the Node
  // sense — the detector previously fell back to "npm", which was a semantic
  // lie that propagated into ana.json for every non-Node project.
  commands: DetectedCommands & { packageManager: string | null };
  // Imported directly from the git detector — inline shape was byte-identical
  // to GitInfo, so importing eliminates a drift trap at zero semantic cost.
  git: GitInfo;
  monorepo: {
    isMonorepo: boolean;
    tool: string | null;
    packages: Array<{ name: string; path: string }>;
    primaryPackage: { name: string; path: string } | null;
  };
  externalServices: Array<{
    name: string;
    category: string;
    source: string;
    configFound: boolean;
    // Stack roles the service fulfills. Empty array = service is not part of
    // the stack (e.g., a standalone analytics service). Populated by
    // annotateServiceRoles() at scan time. Consumers filter for display with
    // `stackRoles.length === 0` instead of fragile substring matching
    // Replaced 4 copies of `!stackValues.some(v => v.includes(svc.name))`.
    // Typed as a branded union so typos fail at compile time —
    // the set is closed, every push site uses one of these 5 literals, and
    // the type IS the source of truth (adding a role means editing it here).
    stackRoles: StackRole[];
  }>;
  schemas: Record<string, {
    found: boolean;
    path: string | null;
    modelCount: number | null;
    provider?: string | null;
  }>;
  secrets: {
    envFileExists: boolean;
    envExampleExists: boolean;
    gitignoreCoversEnv: boolean;
  };
  projectProfile: {
    type: string | null;
    hasExternalAPIs: boolean;
    hasDatabase: boolean;
    hasBrowserUI: boolean;
    hasAuthSystem: boolean;
    hasPayments: boolean;
    hasFileStorage: boolean;
  };
  blindSpots: Array<{
    area: string;
    issue: string;
    resolution: string;
  }>;
  // Deterministic checks surfacing what AI got wrong.
  // Always an array — empty when no rules fire, never null.
  findings: Array<{
    id: string;
    severity: 'critical' | 'warn' | 'info' | 'pass';
    title: string;
    detail: string | null;
    category: 'security' | 'reliability' | 'quality';
  }>;
  // Composed from the deployment detectors. detectDeployment returns
  // DetectedDeployment (platform+configFile nullable), detectCI returns
  // DetectedCI (ci nullable). scan-engine merges them with
  // object spread — the type matches the runtime shape exactly now.
  deployment: DetectedDeployment & DetectedCI;
  // Deep tier only (null when surface). Uses the analyzer's PatternAnalysis
  // type directly — no translation layer that could lose variant or MultiPattern
  // information.
  patterns: PatternAnalysis | null;
  // Convention analysis uses the analyzer's type directly — no translation
  // layer that could silently drop fields when they're added.
  conventions: ConventionAnalysis | null;

  // README extraction — populated by detectReadme() in scan-engine.
  // null when no README found or content is empty after stripping.
  readme: ReadmeResult | null;

  // Documentation inventory — paths and metadata for all discovered docs.
  // Populated by detectDocumentation() in scan-engine.
  documentation: DocumentationResult;

  // Phase 1: Secret Intelligence
  secretFindings: Array<{
    type: string;
    file: string;
    line: number;
    severity: 'critical' | 'high' | 'medium';
    redacted: string;
  }> | null;
  envVarMap: Array<{
    name: string;
    files: string[];
    inExample: boolean;
    isSecret: boolean;
  }> | null;

  // Phase 1: Code Intelligence
  duplicates: {
    totalClones: number;
    totalDuplicateLines: number;
    clones: Array<{
      fileA: string;
      fileB: string;
      linesA: [number, number];
      linesB: [number, number];
      duplicateLines: number;
    }>;
  } | null;
  circularDeps: Array<{
    cycle: string[];
    length: number;
  }> | null;
  orphanFiles: string[] | null;
  complexityHotspots: Array<{
    function: string;
    file: string;
    line: number;
    cyclomatic: number;
    cognitive: number;
  }> | null;

  // Phase 1: Git Intelligence (grouped)
  gitIntelligence: {
    churnHotspots: Array<{
      file: string;
      changeCount: number;
      period: string;
    }> | null;
    busFactor: Array<{
      directory: string;
      contributors: number;
      primaryAuthor: string;
    }> | null;
    coChangeCoupling: Array<{
      fileA: string;
      fileB: string;
      coChangePercentage: number;
      hasImportRelationship: boolean;
    }> | null;
    bugMagnetFiles: Array<{
      file: string;
      bugCommitCount: number;
      totalCommitCount: number;
      ratio: number;
    }> | null;
  } | null;

  // Phase 1: Dependency Intelligence (grouped)
  dependencyIntelligence: {
    health: Array<{
      name: string;
      installedVersion: string;
      latestVersion: string | null;
      lastPublished: string | null;
      vulnerabilities: number;
      deprecated: boolean;
    }> | null;
    overlaps: Array<{
      category: string;
      packages: string[];
    }> | null;
    versionBreaks: Array<{
      name: string;
      installedVersion: string;
      breakVersion: string;
      description: string;
      aiImpact: string;
    }> | null;
  } | null;

  // Phase 1: Decision Archaeology
  technicalDebtMarkers: {
    total: number;
    byType: Record<string, number>;
    locations: Array<{
      type: string;
      file: string;
      line: number;
      text: string;
    }>;
  } | null;

  // Phase 2: AI Readiness
  inconsistencies: Array<{
    category: string;
    variants: Array<{
      pattern: string;
      percentage: number;
      fileCount: number;
    }>;
  }> | null;
  conventionBreaks: Array<{
    convention: string;
    expected: string;
    file: string;
    actual: string;
  }> | null;
  aiReadinessScore: {
    score: number;
    breakdown: {
      duplicates: number;
      inconsistencies: number;
      complexity: number;
      circularDeps: number;
      deadCode: number;
    };
  } | null;

}

/**
 * Build a minimal valid EngineResult with every field at its "empty" default.
 *
 * Used as a fallback when scan fails gracefully and downstream scaffolds still
 * need a well-typed result to operate on. Lives next to the EngineResult type
 * definition so that adding a field to EngineResult is a single-file
 * edit — the factory was previously in commands/init.ts, requiring a parallel
 * update whenever a new field was added to the type.
 *
 * Contract: EVERY field on EngineResult must be assigned here. Do not use
 * `as EngineResult` — the explicit return-type annotation makes TypeScript
 * enforce completeness, which is the whole point of having this factory.
 */
export function createEmptyEngineResult(): EngineResult {
  return {
    schemaVersion: '1.0',
    applicationShape: 'unknown',
    overview: { project: 'unknown', scannedAt: new Date().toISOString(), depth: 'surface' },
    stack: { language: null, framework: null, database: null, auth: null, testing: [], payments: null, workspace: null, aiSdk: null, uiSystem: null },
    versions: {},
    files: { source: 0, test: 0, config: 0, total: 0 },
    structure: [],
    commands: { build: null, test: null, lint: null, dev: null, packageManager: null, all: {} },
    git: { head: null, branch: null, commitCount: null, lastCommitAt: null, uncommittedChanges: false, contributorCount: null, defaultBranch: null, branches: null, commitFormat: null, branchPatterns: null, hooks: null, mergeStrategy: null, coAuthor: null, recentActivity: null },
    monorepo: { isMonorepo: false, tool: null, packages: [], primaryPackage: null },
    externalServices: [],
    schemas: {},
    secrets: { envFileExists: false, envExampleExists: false, gitignoreCoversEnv: false },
    projectProfile: { type: null, hasExternalAPIs: false, hasDatabase: false, hasBrowserUI: false, hasAuthSystem: false, hasPayments: false, hasFileStorage: false },
    blindSpots: [],
    findings: [],
    deployment: { platform: null, configFile: null, ci: null, ciWorkflowFiles: [] },
    patterns: null,
    conventions: null,
    readme: null,
    documentation: { files: [], docsDirectory: null, landingPage: null },
    secretFindings: null,
    envVarMap: null,
    duplicates: null,
    circularDeps: null,
    orphanFiles: null,
    complexityHotspots: null,
    gitIntelligence: null,
    dependencyIntelligence: null,
    technicalDebtMarkers: null,
    inconsistencies: null,
    conventionBreaks: null,
    aiReadinessScore: null,
  };
}
