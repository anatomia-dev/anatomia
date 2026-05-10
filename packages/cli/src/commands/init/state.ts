/**
 * Runtime utilities + state/display for ana init.
 *
 * confirm lives here (not in preflight.ts) so preflight.ts can import it
 * without a cycle: preflight → state is one-way.
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import type { EngineResult } from '../../engine/types/engineResult.js';
import { createEmptyEngineResult } from '../../engine/types/engineResult.js';
import { getStackSummary, CONTEXT_FILES, CORE_SKILLS, computeSkillManifest } from '../../constants.js';
import { matchGotchas } from '../../utils/gotchas.js';
import { buildSymbolIndex } from '../symbol-index.js';
import { AnaJsonSchema } from './anaJsonSchema.js';

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
  if (frameworks.includes('Vitest')) {
    return `${packageManager} vitest run`;
  }
  if (frameworks.includes('Jest')) {
    return `${packageManager} jest --watchAll=false`;
  }
  if (frameworks.includes('Mocha')) {
    return `${packageManager} mocha --exit`;
  }
  // pytest, go test, Playwright, Cypress — non-interactive by default
  if (frameworks.includes('pytest')) {
    return 'pytest';
  }
  return null;
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
 * @returns The ana.json config object that was written
 */
export async function createAnaJson(
  tmpAnaPath: string,
  engineResult: EngineResult | null,
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

  let testCmd = makeTestCommandNonInteractive(result.commands.test, result.stack.testing, result.commands.all?.['test']);
  if (testCmd && result.monorepo.isMonorepo && result.monorepo.primaryPackage) {
    const pkg = result.monorepo.primaryPackage;
    const pm = result.commands.packageManager || 'pnpm';

    // Map detected testing framework to direct runner invocation
    const directCmd = buildDirectTestCommand(result.stack.testing, pm);
    if (directCmd) {
      testCmd = `(cd ${pkg.path} && ${directCmd})`;
    } else {
      // Unknown framework — cd with root-derived command as fallback
      testCmd = `(cd ${pkg.path} && ${testCmd})`;
    }
  }

  const anaConfig: Record<string, unknown> = {
    anaVersion: cliVersion,
    name: result.overview.project,
    language: result.stack.language || null,
    framework: result.stack.framework || null,
    packageManager: result.commands.packageManager,
    commands: {
      build: result.commands.build || null,
      test: testCmd,
      lint: result.commands.lint || null,
      dev: result.commands.dev || null,
    },
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
 *
 * Note on merge semantics: only anaVersion and lastScanAt refresh from
 * the new scan. language/framework/packageManager/commands preserve
 * from the old ana.json — pre-existing behavior. Full mechanical-field
 * refresh is a separate design decision for a later sprint.
 *
 * @param existingAnaPath - Path to the still-existing `.ana/` directory
 * @param tmpAnaPath - Path to the tmp build directory
 * @param newAnaConfig - In-memory ana.json config from createAnaJson
 */
export async function preserveUserState(
  existingAnaPath: string,
  tmpAnaPath: string,
  newAnaConfig: Record<string, unknown>
): Promise<void> {
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
    };
    const newAnaJsonPath = path.join(tmpAnaPath, 'ana.json');
    await fs.writeFile(newAnaJsonPath, JSON.stringify(merged, null, 2), 'utf-8');
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

    console.log(chalk.green(`✓ Skills → .claude/skills/ (${manifest.length} skills)`));
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
    if (engineResult.commands.build) {
      console.log(`  ${chalk.bold('Build:')}    ${engineResult.commands.build}`);
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

  // Two-path next steps
  console.log('  Next:');
  console.log(chalk.cyan('    claude --agent ana') + '          Start working (Ana knows your stack)');
  console.log(chalk.cyan('    claude --agent ana-setup') + '    Enrich with your team\'s knowledge (optional, ~10 min)');
  console.log('');
}
