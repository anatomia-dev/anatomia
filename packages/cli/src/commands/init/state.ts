/**
 * Runtime utilities + state/display for ana init.
 *
 * confirm lives here (not in preflight.ts) so preflight.ts can import it
 * without a cycle: preflight → state is one-way.
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'node:fs/promises';
import { existsSync, lstatSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import type { EngineResult } from '../../engine/types/engineResult.js';
import { createEmptyEngineResult } from '../../engine/types/engineResult.js';
import { getStackSummary, CONTEXT_FILES, CORE_SKILLS, computeSkillManifest, DOCS_QUICKSTART } from '../../constants.js';
import { matchGotchas } from '../../utils/gotchas.js';
import { buildSymbolIndex } from '../symbol-index.js';
import { AnaJsonSchema } from './anaJsonSchema.js';
import { getCurrentBranch } from '../../utils/git-operations.js';
import { isNonProductPath } from '../../engine/detectors/surfaces.js';
import { getSkillsDirRel, agentCommand } from '../platform.js';

/**
 * Prompt user for confirmation
 *
 * If stdin is not a TTY (CI, piped input, test harness), returns the default
 * without blocking. This prevents hangs in non-interactive environments.
 *
 * @param message - Message to display before the (Y/n) or (y/N) suffix
 * @param defaultYes - If true, empty input means yes; if false, empty means no
 * @returns true if user confirmed
 */
export async function confirm(message: string, defaultYes: boolean): Promise<boolean> {
  // Non-interactive (CI, piped input, test harness): proceed without blocking
  if (!process.stdin.isTTY) {
    return defaultYes;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultYes ? '(Y/n)' : '(y/N)';
  return new Promise((resolve) => {
    rl.question(`${message} ${suffix} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === '') resolve(defaultYes);
      else resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
}

/**
 * Phase 2: Run analyzer
 *
 * Runs analyzer with spinner, displays detection summary.
 * Graceful degradation: if analyzer fails, returns null (empty scaffolds created).
 *
 * @param rootPath - Project root directory
 * @returns EngineResult or null if failed
 */
export async function runAnalyzer(
  rootPath: string
): Promise<EngineResult | null> {
  const spinner = ora('Analyzing project...').start();

  try {
    const { scanProject } = await import('../../engine/scan-engine.js');
    const engineResult = await scanProject(rootPath, { depth: 'deep' });

    // Spinner message depends on blind spot severity
    const hasAnalyzerBlindSpot = engineResult.blindSpots.some(bs => bs.area === 'Analyzer');
    if (hasAnalyzerBlindSpot) {
      spinner.warn('Deep scan incomplete');
    } else if (engineResult.blindSpots.length === 0) {
      spinner.succeed('Deep scan complete — no gaps detected');
    } else {
      spinner.succeed('Analysis complete');
    }

    displayDetectionSummary(engineResult);
    displayBlindSpots(engineResult.blindSpots);

    return engineResult;
  } catch (error) {
    spinner.warn('Analyzer failed — continuing with empty scaffolds');
    console.log(chalk.yellow('  Setup will work but scaffolds will have no pre-populated data'));

    if (error instanceof Error) {
      console.log(chalk.gray(`  Reason: ${error.message}`));
    }
    console.log();

    return null;
  }
}

/**
 * Display scan progress after analysis
 *
 * Shows incremental detection results. Null values skipped.
 *
 * @param result - Engine result from scan
 */
export function displayDetectionSummary(result: EngineResult): void {
  console.log();

  // Stack
  const stackParts = getStackSummary(result);
  if (stackParts.length > 0) {
    console.log(chalk.green('  ✓ Stack: ') + stackParts.join(' · '));
  }

  // Files
  if (result.files.source > 0 || result.files.test > 0) {
    console.log(chalk.green('  ✓ Files: ') + `${result.files.source} source, ${result.files.test} tests`);
  }

  // Git
  const gitParts: string[] = [];
  if (result.git.defaultBranch) gitParts.push(`${result.git.defaultBranch} branch`);
  if (result.git.commitCount !== null) gitParts.push(`${result.git.commitCount} commits`);
  if (result.git.contributorCount !== null) gitParts.push(`${result.git.contributorCount} contributors`);
  if (gitParts.length > 0) {
    console.log(chalk.green('  ✓ Git: ') + gitParts.join(', '));
  }

  // Patterns
  if (result.patterns) {
    const categories = ['errorHandling', 'validation', 'database', 'auth', 'testing'] as const;
    const detected = categories.filter(c => result.patterns?.[c] != null).length;
    const depth = result.overview.depth === 'deep' ? 'deep scan' : 'surface tier';
    console.log(chalk.green('  ✓ Patterns: ') + `${detected} detected (${depth})`);
  }

  // Services (deduped against stack + deployment via annotated stackRoles).
  if (result.externalServices.length > 0) {
    const dedupedSvcs = result.externalServices.filter(svc => svc.stackRoles.length === 0);
    if (dedupedSvcs.length > 0) {
      const MAX_DISPLAY = 4;
      const names = dedupedSvcs.length > MAX_DISPLAY
        ? dedupedSvcs.slice(0, MAX_DISPLAY).map(s => s.name).join(', ') + `, and ${dedupedSvcs.length - MAX_DISPLAY} more`
        : dedupedSvcs.map(s => s.name).join(', ');
      console.log(chalk.green('  ✓ Services: ') + names);
    }
  }

  console.log();
}

/**
 * Display blind spots detected during scan.
 *
 * Translates the Analyzer blind spot's technical message (tree-sitter
 * details) to human-readable terms at display time. Other blind spot
 * types render their fields directly — they're already human-readable.
 *
 * @param blindSpots - Blind spots array from EngineResult
 */
export function displayBlindSpots(blindSpots: Array<{ area: string; issue: string; resolution: string }>): void {
  if (blindSpots.length === 0) return;

  console.log(chalk.yellow('  ⚠ Blind spots:'));
  for (const bs of blindSpots) {
    if (bs.area === 'Analyzer') {
      // Translate technical tree-sitter message to human terms
      console.log(chalk.yellow(`    ${bs.area}`) + ' — code patterns, conventions, and structure analysis skipped');
      console.log(chalk.gray('      Surface-tier detection (dependencies, config files) continues normally.'));
    } else {
      console.log(chalk.yellow(`    ${bs.area}`) + ` — ${bs.issue}`);
      console.log(chalk.gray(`      ${bs.resolution}`));
    }
  }
  console.log();
}

/**
 * Get CLI version from package.json
 * @returns CLI version string
 */
export async function getCliVersion(): Promise<string> {
  try {
    // Detect bundle vs dev context
    const moduleUrl = new URL('.', import.meta.url);
    const isBundle = !moduleUrl.pathname.includes('/src/');
    const pkgPath = isBundle
      ? new URL('../package.json', import.meta.url) // dist/index.js → ../package.json = cli/package.json
      : new URL('../../package.json', import.meta.url); // src/commands/init.ts → ../../package.json = cli/package.json

    const content = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Get templates directory (handles dev vs built contexts)
 *
 * Build structure (verified):
 * - dist/index.js (bundled entry point)
 * - dist/templates/ (copied from templates/)
 *
 * Dev structure:
 * - src/commands/init.ts
 * - templates/ (at project root)
 *
 * @returns Absolute path to templates/ directory
 */
export function getTemplatesDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Check if running from dist/ or src/
  const isCompiled = __dirname.includes('dist');

  return isCompiled
    ? path.join(__dirname, 'templates') // dist/ → dist/templates/
    : path.join(__dirname, '..', '..', 'templates'); // src/commands/ → templates/
}

/**
 * Save scan.json — full EngineResult for agent consumption
 *
 * @param tmpAnaPath - Temp .ana/ path
 * @param engineResult - Engine result or null
 */
export async function saveScanJson(
  tmpAnaPath: string,
  engineResult: EngineResult | null
): Promise<void> {
  if (!engineResult) return;
  const spinner = ora('Saving scan.json...').start();
  const scanPath = path.join(tmpAnaPath, 'scan.json');
  await fs.writeFile(scanPath, JSON.stringify(engineResult, null, 2), 'utf-8');
  spinner.succeed('Saved scan.json');
}

/**
 * Build a direct test runner command for monorepo primary packages.
 *
 * Bypasses the package.json script layer entirely — uses `{pm} exec {runner} {flags}`
 * or `{pm} {runner} {flags}` to invoke the test runner directly. This avoids
 * passthrough composition issues (pnpm run test -- --run doesn't reach vitest).
 *
 * @param frameworks - Detected testing frameworks from stack.testing
 * @param packageManager - Package manager (pnpm, yarn, npm)
 * @returns Direct invocation command, or null if framework is unknown
 */
export function buildDirectTestCommand(
  frameworks: string[],
  packageManager: string,
): string | null {
  // Priority: Vitest > Jest > Mocha > pytest. stack.testing may contain
  // multiple frameworks (e.g. Jest + Playwright). Unit runner wins over E2E.
  const runner = packageManager === 'npm' ? 'npx' : packageManager;
  if (frameworks.includes('Vitest')) {
    return `${runner} vitest run`;
  }
  if (frameworks.includes('Jest')) {
    return `${runner} jest --watchAll=false`;
  }
  if (frameworks.includes('Mocha')) {
    return `${runner} mocha --exit`;
  }
  // pytest, go test, Playwright, Cypress — non-interactive by default
  if (frameworks.includes('pytest')) {
    return 'pytest';
  }
  return null;
}

/**
 * Build native commands for non-Node projects.
 *
 * Returns high-confidence commands only — null for anything uncertain.
 * Called from createAnaJson when language is not TypeScript/Node.js.
 *
 * @param language - Display name from stack.language (e.g. 'Ruby', 'Python', 'Go', 'Rust')
 * @param testing - Detected testing frameworks from stack.testing
 * @param rootPath - Project root (for file existence checks)
 * @returns Commands object with test, build, lint, dev fields
 */
export function buildNonNodeCommands(
  language: string,
  testing: string[],
  rootPath: string,
): { test: string | null; build: string | null; lint: string | null; dev: string | null } {
  const result = { test: null as string | null, build: null as string | null, lint: null as string | null, dev: null as string | null };

  if (language === 'Python') {
    if (testing.includes('pytest')) {
      result.test = 'pytest';
    }
    return result;
  }

  if (language === 'Go') {
    result.test = 'go test ./...';
    result.build = 'go build ./...';
    return result;
  }

  if (language === 'Ruby') {
    if (testing.includes('RSpec')) {
      result.test = existsSync(path.join(rootPath, 'bin', 'rspec'))
        ? 'bin/rspec'
        : 'bundle exec rspec';
    }
    return result;
  }

  if (language === 'Rust') {
    result.test = 'cargo test';
    result.build = 'cargo build';
    result.lint = 'cargo clippy';
    return result;
  }

  return result;
}

/**
 * Make a package.json `test` script safe to run in CI / pipeline contexts.
 *
 * Each framework that has a watch-mode default gets transformed:
 * - Vitest: append `-- --run` if the command doesn't already opt out of
 *   watch (either via the `run` subcommand or an explicit `--run` flag).
 *   The detection is tokenised (not substring) so `npx vitest run`,
 *   `pnpm exec vitest run`, and bare `vitest run` are all recognised as
 *   already non-interactive. There's also a `tokens.includes('--run')`
 *   fallback — this is what lets `pnpm run test -- --run` pass through
 *   unchanged (the tokens don't contain a literal `vitest`, but the
 *   `--run` flag is already there; appending a second `-- --run` would
 *   be wrong).
 * - Jest: check both wrapper and raw script for `--watchAll`/`--watch`,
 *   append `-- --watchAll=false` via passthrough. The wrapper is e.g.
 *   `npm test` but watch flags live in the raw script.
 * - Mocha: same two-source check, appends `-- --watch=false`.
 *
 * Frameworks not in the list pass through unchanged (pytest, go test,
 * Cypress `run`, Playwright `test` are all non-interactive by default).
 *
 * @param testCommand - Raw test command from package.json
 * @param frameworks - Every detected testing framework from
 *   `stack.testing`. Membership is checked by display name.
 * @param rawScript - The underlying script from commands.all.test
 *   (e.g. `jest --watchAll`). Checked alongside testCommand for watch flags.
 * @returns Non-interactive test command, or null if testCommand was null.
 */
export function makeTestCommandNonInteractive(
  testCommand: string | null,
  frameworks: string[],
  rawScript?: string | null,
): string | null {
  if (!testCommand) return null;

  // Vitest: append --run unless already non-interactive
  if (frameworks.includes('Vitest')) {
    const tokens = testCommand.split(/\s+/).filter(Boolean);
    const vitestIdx = tokens.findIndex(t => t === 'vitest' || t.endsWith('/vitest'));
    const afterVitest = vitestIdx >= 0 ? tokens.slice(vitestIdx + 1) : [];
    const alreadyRunning =
      afterVitest.includes('run') ||
      afterVitest.includes('--run') ||
      // Handles `pnpm run test -- --run` where `vitest` isn't in the tokens
      // but the user has already passed --run through the script wrapper.
      // Without this, we'd append a second `-- --run`.
      tokens.includes('--run');
    if (!alreadyRunning) {
      return `${testCommand} -- --run`;
    }
  }

  // Jest: check both wrapper and raw script for watch flags.
  // The wrapper is e.g. `npm test` but --watchAll lives in the raw script
  // (`jest --watchAll` in package.json). Append --watchAll=false via
  // passthrough (same pattern as Vitest's -- --run).
  if (frameworks.includes('Jest')) {
    const checkTarget = testCommand + ' ' + (rawScript || '');
    if (checkTarget.includes('--watchAll') || checkTarget.includes('--watch')) {
      if (!testCommand.includes('--watchAll=false') && !testCommand.includes('--no-watchAll')) {
        return `${testCommand} -- --watchAll=false`;
      }
    }
  }

  // Mocha: same pattern — check both wrapper and raw script.
  if (frameworks.includes('Mocha')) {
    const checkTarget = testCommand + ' ' + (rawScript || '');
    if (checkTarget.includes('--watch')) {
      if (!testCommand.includes('--watch=false') && !testCommand.includes('--no-watch')) {
        return `${testCommand} -- --watch=false`;
      }
    }
  }

  return testCommand;
}

/**
 * Phase 7: Create ana.json (D1 schema)
 *
 * Creates project config with detected data. Every field is a contract
 * consumed by pipeline agents.
 *
 * Returns the in-memory config so preserveUserState can
 * merge it with restored user fields without a redundant read from disk.
 *
 * @param tmpAnaPath - Temp .ana/ path
 * @param engineResult - Engine result or null
 * @param cwd - Project root directory (needed for monorepo build/lint scoping)
 * @returns The ana.json config object that was written
 */
export async function createAnaJson(
  tmpAnaPath: string,
  engineResult: EngineResult | null,
  cwd?: string,
): Promise<Record<string, unknown>> {
  const spinner = ora('Creating ana.json...').start();

  const result = engineResult || createEmptyEngineResult();
  const cliVersion = await getCliVersion();

  // Compute test command — scope to primary package in monorepos so agents
  // don't get interleaved turbo output that hangs when piped through grep/tail.
  //
  // Uses direct runner invocation (pnpm exec vitest run) instead of script
  // passthrough (pnpm run test -- --run) because passthrough composition
  // breaks with pnpm + vitest — the -- --run flag doesn't reach vitest
  // through the script layer.
  /**
   * Detect the best artifact branch. Prefers a pre-production branch
   * (staging, develop, dev, qa) over the default branch (main/master).
   * Planning artifacts belong on the pre-prod branch where work is
   * staged before production, not on the branch that deploys to prod.
   *
   * @param res - Engine scan result containing git branch data
   * @returns The best artifact branch name
   */
  function detectArtifactBranch(res: EngineResult): string {
    const preProdCandidates = ['staging', 'develop', 'dev', 'qa', 'preprod', 'pre-prod'];
    const branches = res.git.branches ?? [];
    for (const candidate of preProdCandidates) {
      if (branches.includes(candidate)) {
        return candidate;
      }
    }
    return res.git.defaultBranch ?? res.git.branch ?? 'main';
  }

  // Root test command: non-interactive, project-wide (no cd scoping).
  const testCmd = makeTestCommandNonInteractive(result.commands.test, result.stack.testing, result.commands.all?.['test']);

  // Root build command: project-wide (no cd scoping).
  // All three (build, test, lint) are project-wide. Per-surface commands provide scoped coverage.
  const buildCmd = result.commands.build || null;
  const lintCmd = result.commands.lint || null;
  const lang = result.stack.language;

  const commands: Record<string, unknown> = {
    build: buildCmd,
    test: testCmd,
    lint: lintCmd,
    dev: result.commands.dev || null,
  };

  // Non-Node native commands — replace engine-detected nulls with
  // high-confidence native commands (pytest, cargo test, go test, etc.)
  if (lang && lang !== 'TypeScript' && lang !== 'Node.js' && cwd) {
    const native = buildNonNodeCommands(lang, result.stack.testing, cwd);
    if (native.test) commands['test'] = native.test;
    if (native.build) commands['build'] = native.build;
    if (native.lint) commands['lint'] = native.lint;
    // dev stays null for non-Node
  }

  // Surface generation — per-surface commands from detected surfaces.
  // Each surface gets scoped build/test/lint/dev commands derived from its
  // package.json scripts. Single-package repos have no surfaces.
  const surfaces: Record<string, unknown> = {};
  if (cwd && result.surfaces && result.surfaces.length > 0) {
    const pm = result.commands.packageManager || 'pnpm';
    const prefix = pm === 'npm' ? 'npm run' : `${pm} run`;

    for (const surface of result.surfaces) {
      const surfaceLang = surface.language;
      // Skip JS command generation for non-Node surfaces
      if (surfaceLang && surfaceLang !== 'TypeScript' && surfaceLang !== 'JavaScript') {
        surfaces[surface.name] = {
          path: surface.path,
          language: surfaceLang,
          framework: surface.framework || null,
          commands: { build: null, test: null, lint: null, dev: null },
        };
        continue;
      }

      let surfaceBuild: string | null = null;
      let surfaceTest: string | null = null;
      let surfaceLint: string | null = null;

      // Read surface package.json for commands
      try {
        const pkgJsonPath = path.join(cwd, surface.path, 'package.json');
        const pkgContent = await fs.readFile(pkgJsonPath, 'utf-8');
        const pkgJson = JSON.parse(pkgContent);
        const scripts = pkgJson.scripts || {};
        const escapedPath = surface.path.replace(/'/g, "'\\''");

        // Build: first match
        for (const key of ['build', 'compile', 'tsc']) {
          if (scripts[key]) {
            surfaceBuild = `(cd '${escapedPath}' && ${prefix} ${key})`;
            break;
          }
        }

        // Test: prefer script passthrough, fall back to direct runner
        if (scripts['test'] !== undefined) {
          surfaceTest = `(cd '${escapedPath}' && ${prefix} test)`;
        } else {
          const directCmd = buildDirectTestCommand(surface.testing || result.stack.testing, pm);
          if (directCmd) {
            surfaceTest = `(cd '${escapedPath}' && ${directCmd})`;
          }
        }

        // Lint: first match
        for (const key of ['lint', 'eslint', 'biome']) {
          if (scripts[key]) {
            surfaceLint = `(cd '${escapedPath}' && ${prefix} ${key})`;
            break;
          }
        }
      } catch {
        // Missing or malformed package.json — null commands
      }

      surfaces[surface.name] = {
        path: surface.path,
        language: surface.language || null,
        framework: surface.framework || null,
        commands: {
          build: surfaceBuild,
          test: surfaceTest,
          lint: surfaceLint,
          dev: null,
        },
      };
    }
  }

  const anaConfig: Record<string, unknown> = {
    anaVersion: cliVersion,
    name: result.overview.project,
    language: result.stack.language || null,
    framework: result.stack.framework || null,
    packageManager: result.commands.packageManager,
    commands,
    ...(Object.keys(surfaces).length > 0 ? { surfaces } : {}),
    platforms: ['claude'],
    platformFlags: {},
    coAuthor: 'Ana <build@anatomia.dev>',
    artifactBranch: detectArtifactBranch(result),
    branchPrefix: 'feature/',
    lastScanAt: result.overview.scannedAt,
    custom: {},
  };

  const anaJsonPath = path.join(tmpAnaPath, 'ana.json');
  await fs.writeFile(anaJsonPath, JSON.stringify(anaConfig, null, 2), 'utf-8');

  spinner.succeed('Created ana.json');
  return anaConfig;
}

/**
 * Surface object as stored in ana.json.
 */
interface SurfaceEntry {
  path: string;
  language: string | null;
  framework: string | null;
  commands: Record<string, string | null>;
}

/**
 * Merge existing user-tuned surfaces with freshly detected surfaces.
 *
 * Match by `path`, not key name — a renamed surface key preserves its tuned
 * commands. Refreshes mechanical fields (path, language, framework) from the
 * new scan. Preserves user-tuned commands. New surfaces get defaults. Removed
 * surfaces stay with a logged warning.
 *
 * @param existing - User's current surfaces from ana.json
 * @param fresh - Freshly detected surfaces from createAnaJson
 * @returns Merged surfaces record
 */
export function mergeSurfaces(
  existing: Record<string, SurfaceEntry>,
  fresh: Record<string, SurfaceEntry>,
): Record<string, SurfaceEntry> {
  const merged: Record<string, SurfaceEntry> = {};

  // Index existing surfaces by path for matching
  const existingByPath = new Map<string, { key: string; entry: SurfaceEntry }>();
  for (const [key, entry] of Object.entries(existing)) {
    if (entry && entry.path) {
      existingByPath.set(entry.path, { key, entry });
    }
  }

  // Process fresh surfaces — match by path to preserve user commands
  for (const [freshKey, freshEntry] of Object.entries(fresh)) {
    const existingMatch = existingByPath.get(freshEntry.path);
    if (existingMatch) {
      // Matched — refresh mechanical fields, preserve user commands
      const mergedCommands = { ...existingMatch.entry.commands };
      // Sanitize blank strings in user commands
      for (const [cmdKey, cmdVal] of Object.entries(mergedCommands)) {
        if (cmdVal === '') {
          mergedCommands[cmdKey] = freshEntry.commands[cmdKey] ?? null;
        }
      }
      // Propagate new command keys from fresh without overwriting
      for (const [cmdKey, cmdVal] of Object.entries(freshEntry.commands)) {
        if (!(cmdKey in mergedCommands) && cmdVal != null && cmdVal !== '') {
          mergedCommands[cmdKey] = cmdVal;
        }
      }
      merged[freshKey] = {
        path: freshEntry.path,
        language: freshEntry.language,
        framework: freshEntry.framework,
        commands: mergedCommands,
      };
      existingByPath.delete(freshEntry.path);
    } else {
      // New surface — use fresh defaults
      merged[freshKey] = { ...freshEntry };
    }
  }

  // Selectively handle orphaned surfaces:
  // - Non-product paths (examples, templates, fixtures, etc.) are silently dropped
  // - Legitimate product paths are kept with a warning
  for (const [, { key, entry }] of existingByPath) {
    if (isNonProductPath(entry.path)) continue;
    console.warn(`Surface '${key}' (${entry.path}) no longer detected — keeping existing configuration.`);
    merged[key] = entry;
  }

  return merged;
}

/**
 * Preserve user state into the tmpDir build.
 *
 * Reads directly from the still-existing `.ana/` (the swap-based rename
 * means the old install is untouched until the atomic swap succeeds).
 * Replaces the backup-then-restore dance that preflight used to run.
 *
 * Policy, explicit:
 *   - context/  → copied wholesale. User-enriched content must survive.
 *   - state/setup-progress.json → copied ONLY if setup is still in
 *     progress (setupPhase !== 'complete'). Post-complete, phase status
 *     is meaningless and ana.json carries the truth.
 *   - state/ (everything else) → NOT copied. symbol-index.json is
 *     rebuilt every init. cache/ is regenerated by ASTCache. No old
 *     state-dir fossils survive.
 *   - ana.json → parsed through AnaJsonSchema (strips orphaned fields
 *     like scanStaleDays, catches invalid enums like setupPhase:"guided"),
 *     merged with the fresh mechanical fields (anaVersion, lastScanAt)
 *     from `newAnaConfig`, written back to tmpAnaPath.
 *   - proof_chain.json + PROOF_CHAIN.md → copied. Pipeline history
 *     must survive re-init.
 *   - plans/completed/ → copied wholesale. Archived pipeline artifacts.
 *   - plans/active/ → copied wholesale. In-flight pipeline work (scopes,
 *     specs, contracts, build reports) must survive re-init. Without this,
 *     the atomic swap replaces active plans with an empty .gitkeep.
 *   - .gitignore → NOT copied. Infrastructure-owned by createDirectoryStructure;
 *     must match current CLI version's expectations (state/, worktrees/).
 *
 * Note on merge semantics: six mechanical fields refresh from the new
 * scan: anaVersion, lastScanAt, name, language, framework, packageManager.
 * Commands preserve from the old ana.json — user tuning must survive.
 *
 * @param existingAnaPath - Path to the still-existing `.ana/` directory
 * @param tmpAnaPath - Path to the tmp build directory
 * @param newAnaConfig - In-memory ana.json config from createAnaJson
 * @returns Merged config if ana.json was merged, null otherwise
 */
export async function preserveUserState(
  existingAnaPath: string,
  tmpAnaPath: string,
  newAnaConfig: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  let mergedConfig: Record<string, unknown> | null = null;

  // 1. Copy context/ wholesale (overwriting the fresh scaffolds)
  const contextSrc = path.join(existingAnaPath, 'context');
  const contextDst = path.join(tmpAnaPath, 'context');
  try {
    const stats = await fs.stat(contextSrc);
    if (stats.isDirectory()) {
      await fs.rm(contextDst, { recursive: true, force: true });
      await fs.cp(contextSrc, contextDst, { recursive: true });
    }
  } catch {
    // context/ missing on the existing install — keep the fresh scaffold
  }

  // 2. Merge ana.json through AnaJsonSchema
  const existingAnaJsonPath = path.join(existingAnaPath, 'ana.json');
  let existingRaw: unknown = {};
  try {
    existingRaw = JSON.parse(await fs.readFile(existingAnaJsonPath, 'utf-8'));
  } catch {
    // Old ana.json missing or malformed — keep the fresh one as-is
  }

  const parsed = AnaJsonSchema.safeParse(existingRaw);
  if (parsed.success && Object.keys(existingRaw as Record<string, unknown>).length > 0) {
    const merged = {
      ...parsed.data,
      anaVersion: newAnaConfig['anaVersion'],
      lastScanAt: newAnaConfig['lastScanAt'],
      name: newAnaConfig['name'],
      language: newAnaConfig['language'],
      framework: newAnaConfig['framework'],
      packageManager: newAnaConfig['packageManager'],
    };

    // Sanitize blank commands — fall through to fresh detection value.
    // null is intentional absence (acceptable). "" is accidental blank (never valid).
    const mergedCommands = merged.commands as Record<string, unknown> | undefined;
    if (mergedCommands) {
      const freshCommands = (newAnaConfig['commands'] ?? {}) as Record<string, unknown>;
      for (const key of ['test', 'build', 'lint', 'buildPackage', 'testPackage']) {
        if (mergedCommands[key] === '') {
          mergedCommands[key] = freshCommands[key] ?? null;
        }
      }

      // Propagate new command keys from fresh detection without overwriting
      // existing user customizations. Additive only — if re-init detects a
      // new key (e.g., buildPackage) that doesn't exist in the old config,
      // copy the fresh value so users get the new field automatically.
      for (const key of Object.keys(freshCommands)) {
        if (!(key in mergedCommands) && freshCommands[key] != null && freshCommands[key] !== '') {
          mergedCommands[key] = freshCommands[key];
        }
      }

      // Clear stale JS commands for non-Node projects. Pre-fix installations
      // may have saved JS commands (pnpm run test, npm run build) that are
      // wrong for Ruby/Python/Go/Rust projects. Conservative regex — native
      // commands like pytest, bundle exec rspec, cargo test never match.
      const mergedLang = newAnaConfig['language'] as string | undefined;
      if (mergedLang && mergedLang !== 'TypeScript' && mergedLang !== 'Node.js') {
        const jsCommandPattern = /(npm|yarn|pnpm|npx|bunx)\s/;
        for (const key of ['test', 'build', 'lint']) {
          const val = mergedCommands[key];
          if (typeof val === 'string' && jsCommandPattern.test(val)) {
            mergedCommands[key] = freshCommands[key] ?? null;
          }
        }
      }
    }

    // Merge surfaces — preserve user-tuned commands, refresh mechanical fields
    const existingSurfaces = ((merged as Record<string, unknown>)['surfaces'] ?? {}) as Record<string, SurfaceEntry>;
    const freshSurfaces = (newAnaConfig['surfaces'] ?? {}) as Record<string, SurfaceEntry>;
    if (Object.keys(freshSurfaces).length > 0 || Object.keys(existingSurfaces).length > 0) {
      const mergedSurfaces = mergeSurfaces(existingSurfaces, freshSurfaces);
      if (Object.keys(mergedSurfaces).length > 0) {
        (merged as Record<string, unknown>)['surfaces'] = mergedSurfaces;
      } else {
        delete (merged as Record<string, unknown>)['surfaces'];
      }
    }

    const newAnaJsonPath = path.join(tmpAnaPath, 'ana.json');
    await fs.writeFile(newAnaJsonPath, JSON.stringify(merged, null, 2), 'utf-8');
    mergedConfig = merged as Record<string, unknown>;
  }

  // 3. Copy setup-progress.json only if setup is still in progress
  const setupPhase = parsed.success ? parsed.data.setupPhase : undefined;
  if (setupPhase !== 'complete') {
    const progressSrc = path.join(existingAnaPath, 'state', 'setup-progress.json');
    const progressDst = path.join(tmpAnaPath, 'state', 'setup-progress.json');
    try {
      await fs.access(progressSrc);
      await fs.mkdir(path.dirname(progressDst), { recursive: true });
      await fs.cp(progressSrc, progressDst);
    } catch {
      // No progress file to copy — nothing to do
    }
  }

  // 4. Copy proof chain files (pipeline history — must survive re-init)
  for (const proofFile of ['proof_chain.json', 'PROOF_CHAIN.md']) {
    const src = path.join(existingAnaPath, proofFile);
    const dst = path.join(tmpAnaPath, proofFile);
    try {
      await fs.access(src);
      await fs.cp(src, dst);
    } catch {
      // No proof chain yet — nothing to copy
    }
  }

  // 5. Copy plans/completed/ (archived pipeline artifacts — user data)
  const completedSrc = path.join(existingAnaPath, 'plans', 'completed');
  const completedDst = path.join(tmpAnaPath, 'plans', 'completed');
  try {
    const stats = await fs.stat(completedSrc);
    if (stats.isDirectory()) {
      await fs.rm(completedDst, { recursive: true, force: true });
      await fs.cp(completedSrc, completedDst, { recursive: true });
    }
  } catch {
    // No completed plans — keep the fresh .gitkeep
  }

  // 6. Copy learn/ directory (session state — must survive re-init)
  const learnSrc = path.join(existingAnaPath, 'learn');
  const learnDst = path.join(tmpAnaPath, 'learn');
  try {
    const stats = await fs.stat(learnSrc);
    if (stats.isDirectory()) {
      await fs.rm(learnDst, { recursive: true, force: true });
      await fs.cp(learnSrc, learnDst, { recursive: true });
    }
  } catch {
    // No learn directory — keep the fresh seed
  }

  // 7. Copy plans/active/ (in-flight pipeline work — scopes, specs, contracts)
  const activeSrc = path.join(existingAnaPath, 'plans', 'active');
  const activeDst = path.join(tmpAnaPath, 'plans', 'active');
  try {
    const stats = await fs.stat(activeSrc);
    if (stats.isDirectory()) {
      await fs.rm(activeDst, { recursive: true, force: true });
      await fs.cp(activeSrc, activeDst, { recursive: true });
    }
  } catch {
    // No active plans — keep the fresh .gitkeep
  }

  // 8. Copy skills/ (user-enriched skills — must survive re-init)
  // Skills now live in .ana/skills/ (canonical location). User enrichments
  // (Rules, Gotchas, Examples) must survive. scaffoldAndSeedSkills will
  // refresh the Detected section post-swap.
  const skillsSrc = path.join(existingAnaPath, 'skills');
  const skillsDst = path.join(tmpAnaPath, 'skills');
  try {
    const stats = await fs.stat(skillsSrc);
    if (stats.isDirectory()) {
      await fs.rm(skillsDst, { recursive: true, force: true });
      await fs.cp(skillsSrc, skillsDst, { recursive: true });
    }
  } catch {
    // No skills directory — scaffoldAndSeedSkills will create fresh
  }

  return mergedConfig;
}

/**
 * Build symbol index with graceful failure handling
 *
 * Symbol index is optional - if it fails, citation verification
 * will fall back to file-only checks.
 *
 * @param cwd - Project root directory
 * @param tmpAnaPath - Temp .ana/ path (writes to state/)
 */
export async function buildSymbolIndexSafe(cwd: string, tmpAnaPath: string): Promise<void> {
  const spinner = ora('Building symbol index...').start();

  try {
    const statePath = path.join(tmpAnaPath, 'state');
    const index = await buildSymbolIndex(cwd, statePath);
    spinner.succeed(`Symbol index built (${index.symbols.length} symbols from ${index.files_parsed} files)`);
  } catch (error) {
    // Symbol index is optional - warn but don't fail init
    spinner.warn('Symbol index generation failed — citation verification will use file-only checks');
    if (error instanceof Error) {
      console.log(chalk.gray(`  Reason: ${error.message}`));
    }
  }
}

/**
 * Phase 9: Atomic rename
 *
 * Moves temp .ana/ to final location atomically.
 * Handles cross-filesystem scenario (EXDEV error).
 *
 * @param tmpAnaPath - Temp .ana/ path
 * @param anaPath - Final .ana/ path
 */
export async function atomicRename(tmpAnaPath: string, anaPath: string): Promise<void> {
  try {
    // Try atomic rename (works if same filesystem)
    await fs.rename(tmpAnaPath, anaPath);
  } catch (error) {
    // Handle cross-filesystem case
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EXDEV') {
      // Rename failed - different filesystems
      // Fallback: recursive copy + delete temp
      await fs.cp(tmpAnaPath, anaPath, { recursive: true });
      await fs.rm(path.dirname(tmpAnaPath), { recursive: true, force: true });
    } else {
      // Other error - rethrow
      throw error;
    }
  }
}

/**
 * Display completion UX after init
 *
 * Dynamic skill counts, conditional callout, two-path next steps.
 * Null values skipped throughout.
 *
 * @param engineResult - Engine result (null if skipped)
 * @param projectName - Project name
 * @param scanTime - Scan duration in seconds
 * @param anaConfig - Written ana.json config (for scoped test command display)
 * @param warnings - Pipeline readiness warnings from preflight (optional)
 */
export function displaySuccessMessage(engineResult: EngineResult | null, projectName: string, scanTime: string, anaConfig?: Record<string, unknown>, warnings?: string[]): void {
  console.log('');

  if (engineResult) {
    console.log(chalk.green(`✓ Scanned ${projectName}`) + chalk.gray(` (${scanTime}s)`));
    console.log('');

    // Stack summary (shared definition in constants.ts)
    const stackParts = getStackSummary(engineResult);
    if (stackParts.length > 0) {
      console.log(`  ${chalk.bold('Stack:')}    ${stackParts.join(' · ')}`);
    }
    if (engineResult.deployment?.platform) {
      console.log(`  ${chalk.bold('Deploy:')}   ${engineResult.deployment.platform}`);
    }
    // Services (deduped via annotated stackRoles).
    if (engineResult.externalServices.length > 0) {
      const uniqueServices = engineResult.externalServices.filter(svc => svc.stackRoles.length === 0);
      if (uniqueServices.length > 0) {
        const MAX_DISPLAY = 4;
        const names = uniqueServices.length > MAX_DISPLAY
          ? uniqueServices.slice(0, MAX_DISPLAY).map((s: { name: string }) => s.name).join(', ') + `, and ${uniqueServices.length - MAX_DISPLAY} more`
          : uniqueServices.map((s: { name: string }) => s.name).join(', ');
        console.log(`  ${chalk.bold('Services:')} ${names}`);
      }
    }
    console.log('');
  }

  // Context files
  console.log(chalk.green(`✓ Context → .ana/context/ (${CONTEXT_FILES.length} files)`));

  // Skills — dynamic count with Core/Detected breakdown
  if (engineResult) {
    const analysis = engineResult;
    const manifest = computeSkillManifest(analysis);
    // Widen coreSkills to string[] so .includes() accepts the any-string
    // manifest entries (CORE_SKILLS is a readonly literal union tuple,
    // .includes() expects its narrow union, manifest is string[]).
    const coreSkills: string[] = [...CORE_SKILLS];
    const conditionalSkills = manifest.filter(s => !coreSkills.includes(s));

    console.log(chalk.green(`✓ Skills → ${getSkillsDirRel()}/ (${manifest.length} skills)`));
    console.log(`    ${chalk.gray('Core:')}      ${coreSkills.join(', ')}`);
    if (conditionalSkills.length > 0) {
      console.log(`    ${chalk.gray('Detected:')}  ${conditionalSkills.join(', ')}`);
    }

    // Gotcha count
    const gotchas = matchGotchas(engineResult);
    const totalGotchas = Array.from(gotchas.values()).reduce((sum, arr) => sum + arr.length, 0);
    if (totalGotchas > 0) {
      console.log(chalk.green(`  ✓ ${totalGotchas} gotcha${totalGotchas > 1 ? 's' : ''} pre-populated`));
    }
  }

  // Cross-tool files
  console.log(chalk.green('  ✓ Cross-tool: CLAUDE.md + AGENTS.md'));

  console.log('');

  // Config values
  if (engineResult) {
    const artifactBranch = anaConfig?.['artifactBranch'] as string ?? engineResult.git.defaultBranch ?? engineResult.git.branch ?? 'main';
    console.log(`  ${chalk.bold('Branch:')}   ${artifactBranch}`);
    // Show the test command from ana.json (scoped for monorepos) if available,
    // otherwise fall back to the raw engine result command.
    const configCmds = anaConfig?.['commands'] as Record<string, string | null> | undefined;
    const displayTest = configCmds?.['test']
      ?? makeTestCommandNonInteractive(engineResult.commands.test, engineResult.stack.testing, engineResult.commands.all?.['test']);
    if (displayTest) {
      console.log(`  ${chalk.bold('Test:')}     ${displayTest}`);
    }
    const displayBuild = configCmds?.['build'] ?? engineResult.commands.build;
    if (displayBuild) {
      console.log(`  ${chalk.bold('Build:')}    ${displayBuild}`);
    }

    // Surfaces display — show per-surface test commands after root commands
    const configSurfaces = anaConfig?.['surfaces'] as Record<string, SurfaceEntry> | undefined;
    if (configSurfaces && Object.keys(configSurfaces).length > 0) {
      console.log('');
      console.log(`  ${chalk.bold('Surfaces:')}`);
      const surfaceEntries = Object.entries(configSurfaces);
      const MAX_SURFACE_DISPLAY = 3;
      const displayEntries = surfaceEntries.slice(0, MAX_SURFACE_DISPLAY);
      for (const [name, surface] of displayEntries) {
        const testCmd2 = surface.commands?.['test'];
        if (testCmd2) {
          console.log(`    ${name.padEnd(9)}${testCmd2}`);
        } else {
          console.log(`    ${name.padEnd(9)}${chalk.yellow('⚠ no test command')}`);
        }
      }
      if (surfaceEntries.length > MAX_SURFACE_DISPLAY) {
        const remaining = surfaceEntries.length - MAX_SURFACE_DISPLAY;
        console.log(chalk.gray(`    +${remaining} more. Run \`ana config show\` for all.`));
      }
    }

    // Suggest manual config when commands are null for non-Node projects
    const displayLang = engineResult.stack.language;
    if (displayLang && displayLang !== 'TypeScript' && displayLang !== 'Node.js') {
      const nullCmds = ['test', 'build', 'lint'].filter(k => !configCmds?.[k]);
      if (nullCmds.length > 0) {
        const example = displayLang === 'Python' ? 'pytest' : displayLang === 'Go' ? 'go test ./...' : 'make test';
        console.log(chalk.blue(`  ℹ No ${nullCmds.join('/')} commands detected. Set them manually:`));
        console.log(chalk.gray(`    ana config set commands.test "${example}"`));
      }
    }
    console.log('');
  }

  // Pipeline readiness — recap warnings from preflight (only when present)
  if (warnings && warnings.length > 0) {
    console.log('  Pipeline readiness:');
    for (const warning of warnings) {
      const lines = warning.split('\n');
      console.log(chalk.yellow(`    ⚠ ${lines[0]}`));
      for (const line of lines.slice(1)) {
        console.log(chalk.gray(`      ${line}`));
      }
    }
    console.log('');
  }

  // Two-path next steps — conditional on language and command detection.
  // Non-Node with null test command: setup first (needs configuration).
  // Non-Node with test populated: ana first, setup optional.
  // TypeScript/Node: ana first, setup optional (original behavior).
  const initLang = engineResult?.stack.language;
  const initTestCmd = (anaConfig?.['commands'] as Record<string, unknown> | undefined)?.['test'];
  const isNonNode = initLang && initLang !== 'TypeScript' && initLang !== 'Node.js';

  console.log('  Next:');
  if (isNonNode && !initTestCmd) {
    console.log(chalk.cyan(`    ${agentCommand('setup')}`) + '       Configure commands + enrich context (~10 min)');
    console.log(chalk.cyan(`    ${agentCommand('')}`) + '             Start working (after setup)');
  } else {
    console.log(chalk.cyan(`    ${agentCommand('')}`) + '             Start working (Ana knows your stack)');
    console.log(chalk.cyan(`    ${agentCommand('setup')}`) + '       Enrich with your team\'s knowledge (optional, ~10 min)');
  }

  // Commit-readiness indicator
  const artifactBranch = anaConfig?.['artifactBranch'] as string ?? 'main';
  const currentBranch = getCurrentBranch();
  if (currentBranch === artifactBranch) {
    console.log(chalk.cyan('    ana init commit') + `             Save to ${artifactBranch} ✓`);
  } else if (currentBranch) {
    console.log(chalk.cyan('    ana init commit') + `             ⚠ you're on ${currentBranch} — switch to ${artifactBranch} first`);
  }
  console.log('');

  // Documentation link
  console.log(`  ${chalk.bold('Quickstart')}  ${chalk.gray(DOCS_QUICKSTART)}`);
  console.log('');
}

/**
 * Detect available AI coding platforms from the system PATH.
 *
 * Checks for `claude` and `codex` executables. Returns at least
 * `['claude']` as a default if nothing is detected (safe fallback).
 *
 * @returns Array of detected platform names
 */
export function detectPlatforms(): string[] {
  const platforms: string[] = [];
  const cmd = process.platform === 'win32' ? 'where' : 'which';

  for (const name of ['claude', 'codex']) {
    const result = spawnSync(cmd, [name], { encoding: 'utf-8', stdio: 'pipe' });
    if (result.status === 0) {
      platforms.push(name);
    }
  }

  // Default to claude if nothing detected
  return platforms.length > 0 ? platforms : ['claude'];
}

/**
 * Migrate enriched skills from .claude/skills/ to .ana/skills/.
 *
 * On re-init, if `.claude/skills/` is a real directory (not a symlink),
 * moves its content to `.ana/skills/` and replaces the real directory
 * with a symlink. Conflict resolution uses mtime — newer file wins.
 *
 * @param cwd - Project root directory
 */
export async function migrateSkillsToCanonical(cwd: string): Promise<void> {
  const claudeSkillsPath = path.join(cwd, '.claude', 'skills');
  const canonicalPath = path.join(cwd, '.ana', 'skills');

  try {
    const stats = lstatSync(claudeSkillsPath);
    // If it's already a symlink, skip migration
    if (stats.isSymbolicLink()) return;
    if (!stats.isDirectory()) return;
  } catch {
    // .claude/skills/ doesn't exist — nothing to migrate
    return;
  }

  // Ensure canonical destination exists
  await fs.mkdir(canonicalPath, { recursive: true });

  // Copy contents, resolve conflicts by mtime
  const entries = await fs.readdir(claudeSkillsPath, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(claudeSkillsPath, entry.name);
    const dstPath = path.join(canonicalPath, entry.name);

    if (entry.isDirectory()) {
      // Recurse into skill directories
      const subEntries = await fs.readdir(srcPath);
      await fs.mkdir(dstPath, { recursive: true });
      for (const subEntry of subEntries) {
        const subSrc = path.join(srcPath, subEntry);
        const subDst = path.join(dstPath, subEntry);
        await copyIfNewer(subSrc, subDst);
      }
    } else {
      await copyIfNewer(srcPath, dstPath);
    }
  }

  // Replace real directory with symlink
  await fs.rm(claudeSkillsPath, { recursive: true, force: true });
  await fs.symlink(path.join('..', '.ana', 'skills'), claudeSkillsPath);
}

/**
 * Copy file if source is newer than destination (or destination doesn't exist).
 *
 * @param src - Source file path
 * @param dst - Destination file path
 */
async function copyIfNewer(src: string, dst: string): Promise<void> {
  try {
    const srcStat = await fs.stat(src);
    try {
      const dstStat = await fs.stat(dst);
      // Both exist — copy only if source is newer
      if (srcStat.mtimeMs > dstStat.mtimeMs) {
        await fs.copyFile(src, dst);
      }
    } catch {
      // Destination doesn't exist — copy
      await fs.copyFile(src, dst);
    }
  } catch {
    // Source doesn't exist — skip
  }
}
