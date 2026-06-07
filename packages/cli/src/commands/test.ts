/**
 * `ana test` — the default, capture-aware test path.
 *
 * Runs the project's test command through the shell-free capturing runner
 * (array-arg spawn, NO shell), tees the full raw bytes to a per-slug capture
 * file, derives counts + a verdict, DELETES the log, and prints a single COMPACT
 * marker line the agent pastes into the build report. The marker's sha256 is
 * computed over a canonical, deterministic summary of the RESULT
 * (`stage|slug|counts|verdict`) — NOT the raw runner bytes — so the same outcome
 * always seals a byte-identical marker. Nothing is inlined at save; the one-line
 * marker (counts + verdict + sha256) is the whole sealed account, and a
 * present-check is the only save-time gate.
 *
 * `--stage build` resolves the configured command (per-surface when `--surface`
 * is given, else top-level); `--stage verify` always resolves the top-level
 * `commands.test` and runs the full project, ignoring `--surface`.
 *
 * Exit-code contract: 0 = tests ran (verdict pass/abstain); 1 = tests failed
 * (verdict fail); 3 = capture/seal error (resolveCommand refusal, spawnSync
 * result.error including the 64 MiB maxBuffer overflow) — NEVER conflated with
 * "tests failed".
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findProjectRoot } from '../utils/validators.js';
import {
  runCapture,
  resolveCommand,
  deriveCounts,
  deriveVerdict,
  KNOWN_RUNNERS,
  type KnownRunner,
  type ResolvedCommand,
  type TestCounts,
  type CaptureVerdict,
} from '../utils/capture-runner.js';
import { formatMarker, formatCounts, captureSha, type CaptureStage } from '../utils/capture-marker.js';

/** Distinct exit code for a capture/seal failure (never "tests failed"). */
export const CAPTURE_ERROR_EXIT = 3;

interface TestOptions {
  stage?: string;
  slug?: string;
  surface?: string;
  json?: boolean;
}

/** The data outcome of a capture run — no chalk, no process.exit. */
export interface TestRunOutcome {
  /** Process exit code the caller should use. */
  exitCode: number;
  /** A capture/seal error message, when the run failed to capture. */
  captureError?: string | undefined;
  sha256?: string | undefined;
  counts: TestCounts | null;
  verdict?: CaptureVerdict | undefined;
  /** The sealed marker (success only). */
  marker?: string | undefined;
  /**
   * A discoverability hint, set only when the run abstained for lack of a
   * machine-readable reporter AND `test_json` was not the resolved source.
   */
  countHint?: string | undefined;
}

/** Parameters for {@link executeCapture}. */
export interface ExecuteCaptureParams {
  stage: CaptureStage;
  slug: string;
  surface?: string | undefined;
  /** Project root (the directory holding `.ana/`). */
  projectRoot: string;
  /** Epoch seconds for the capture filename (injected for testability). */
  now: number;
}

/** Which configured key a resolved test command came from. */
export type TestCommandSource = 'test' | 'test_json';

/** A resolved test command plus the config key it came from. */
export interface ResolvedTestCommand {
  command: string;
  source: TestCommandSource;
}

/**
 * Resolve the test command from ana.json, preferring the opt-in machine-readable
 * `test_json` over `test` and reporting which key was used.
 *
 * Per-surface (`surfaces[name].commands`) when `--surface` is given; otherwise
 * top-level `commands`. Both levels prefer `test_json` — the structured override
 * that yields a real sealed count — then fall back to `test`. `test_json` is
 * never auto-appended; it is the project's opt-in.
 *
 * @param anaJson - Parsed ana.json
 * @param surface - Surface name, or undefined for top-level
 * @returns The resolved command and its source, or null when none is configured
 */
export function resolveTestCommandString(
  anaJson: Record<string, unknown>,
  surface: string | undefined,
): ResolvedTestCommand | null {
  const commands = surface
    ? ((anaJson['surfaces'] as Record<string, unknown> | undefined)?.[surface] as Record<string, unknown> | undefined)?.[
        'commands'
      ]
    : (anaJson['commands'] as Record<string, unknown> | undefined);
  const cmds = commands as Record<string, unknown> | undefined;
  if (!cmds) return null;

  const testJson = cmds['test_json'];
  if (typeof testJson === 'string' && testJson.trim()) return { command: testJson, source: 'test_json' };
  const test = cmds['test'];
  return typeof test === 'string' && test.trim() ? { command: test, source: 'test' } : null;
}

/**
 * Infer a count-derivation runner hint from a command string.
 *
 * @param cmdString - The configured command string
 * @returns A known runner name, or undefined when unrecognized
 */
export function inferRunner(cmdString: string): KnownRunner | undefined {
  const lower = cmdString.toLowerCase();
  if (lower.includes('vitest')) return 'vitest';
  if (lower.includes('jest')) return 'jest';
  if (lower.includes('pytest')) return 'pytest';
  // Check cargo before go: "cargo test" does not contain "go test", but be
  // explicit about precedence anyway.
  if (lower.includes('cargo')) return 'cargo';
  if (lower.includes('go test')) return 'go';
  if (lower.includes('rspec')) return 'rspec';
  if (lower.includes('dotnet')) return 'dotnet';
  return KNOWN_RUNNERS.find((r) => lower.includes(r));
}

/**
 * Map a capture/seal failure to the baseline fail-closed (exit 3) outcome.
 *
 * @param message - The capture/seal error message
 * @returns The fail-closed outcome
 */
function failClosed(message: string): TestRunOutcome {
  return { exitCode: CAPTURE_ERROR_EXIT, counts: null, captureError: message };
}

/**
 * Run the capture flow and return a structured outcome (no chalk, no exit).
 *
 * @param params - Capture parameters
 * @returns The capture outcome and the exit code the caller should use
 */
export function executeCapture(params: ExecuteCaptureParams): TestRunOutcome {
  // 1. Read ana.json and resolve the command shell-free.
  const anaJsonPath = path.join(params.projectRoot, '.ana', 'ana.json');
  let anaJson: Record<string, unknown>;
  try {
    anaJson = JSON.parse(fs.readFileSync(anaJsonPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return failClosed('could not read .ana/ana.json.');
  }

  // Verify runs the FULL project: it always resolves the top-level command and
  // ignores `--surface` (no caller scopes a verify re-run to one surface, and a
  // guard would be surface for nothing). Build honors `--surface`.
  const effectiveSurface = params.stage === 'verify' ? undefined : params.surface;
  const resolvedCmd = resolveTestCommandString(anaJson, effectiveSurface);
  if (!resolvedCmd) {
    const where = effectiveSurface ? `surface "${effectiveSurface}"` : 'top-level commands.test';
    return failClosed(`no test command configured for ${where}.`);
  }
  const runnerSource = resolvedCmd.command;
  const commandSource = resolvedCmd.source;

  let resolved: ResolvedCommand;
  try {
    resolved = resolveCommand(resolvedCmd.command, params.projectRoot);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failClosed(message);
  }

  // Identify the runner from the command — drives count derivation. Unknown
  // runners abstain (deriveCounts is hint-only).
  const runner = inferRunner(runnerSource);

  // 2. Prepare the sink and run the capture (throws on spawn/maxBuffer/timeout).
  const slugDir = path.join(params.projectRoot, '.ana', 'plans', 'active', params.slug);
  const capturesDir = path.join(slugDir, '.captures');
  fs.mkdirSync(capturesDir, { recursive: true });
  const relFile = path.join('.captures', `test-${params.stage}-${params.now}.log`);
  const sink = path.join(slugDir, relFile);

  let result;
  try {
    result = runCapture({ program: resolved.program, args: resolved.args, cwd: resolved.cwd, env: resolved.env, sink });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failClosed(message);
  }

  // 3. Derive counts + verdict from the captured bytes (in memory).
  const counts = deriveCounts(result.rawBytes, runner);
  const verdict = deriveVerdict(counts, result.exitCode);
  const testExit = verdict === 'fail' ? 1 : 0;

  // 4. Delete the .log now — counts are derived from memory and the seal is over
  // the canonical result summary, so the on-disk log is scratch with nothing
  // left to do. Deleting here (not at save) is self-cleaning: an unsaved or
  // abandoned run never orphans a log.
  try {
    fs.rmSync(sink, { force: true });
  } catch {
    // Best-effort — the `.captures/` gitignore rule is the backstop.
  }

  // 5. Seal the COMPACT marker. The sha256 is computed over the canonical RESULT
  // summary (stage|slug|counts|verdict) via the shared `captureSha`, so the same
  // outcome always seals a byte-identical marker.
  const countsStr = formatCounts(counts);
  const sha = captureSha({ stage: params.stage, slug: params.slug, counts: countsStr, verdict });
  const marker = formatMarker({
    stage: params.stage,
    slug: params.slug,
    counts: countsStr,
    verdict,
    sha256: sha,
  });

  // Discoverability hint: we abstained on the count AND the command did not come
  // from `test_json`. Without this, an opt-in project abstains forever and never
  // learns the fix. Narrow trigger — a `test_json`-sourced abstain says nothing.
  const countHint =
    counts === null && commandSource !== 'test_json'
      ? 'No machine-readable count: set `commands.test_json` in .ana/ana.json for a real sealed count.'
      : undefined;

  return {
    exitCode: testExit,
    counts,
    verdict,
    sha256: sha,
    marker,
    countHint,
  };
}

/**
 * Print a capture outcome to the console (the CLI/chalk boundary lives here).
 *
 * @param outcome - The capture outcome
 * @param json - Whether to print JSON
 */
function printOutcome(outcome: TestRunOutcome, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(outcome, null, 2));
    return;
  }

  if (outcome.captureError) {
    console.error(chalk.red(`✗ CAPTURE error: ${outcome.captureError}`));
    if (outcome.exitCode === CAPTURE_ERROR_EXIT) {
      console.error(chalk.gray('  (exit 3 — a capture/seal error, NOT a test failure)'));
    }
    return;
  }

  const countsLabel = outcome.counts
    ? `${outcome.counts.passed} passed, ${outcome.counts.failed} failed, ${outcome.counts.skipped} skipped`
    : 'abstain';

  console.log(chalk.green(`✓ captured  counts: ${countsLabel}  (verdict: ${outcome.verdict})`));
  if (outcome.countHint) console.log(chalk.cyan(`  ℹ ${outcome.countHint}`));
  console.log('');
  console.log('  Paste this marker into build_report.md:');
  console.log(`  ${outcome.marker}`);
}

/**
 * The `ana test` action.
 *
 * @param options - Parsed flags
 */
function runTest(options: TestOptions): void {
  if (!options.slug) {
    console.error(chalk.red('Error: --slug <slug> is required.'));
    console.error(chalk.gray('Run: ana test --stage build --slug <slug>'));
    process.exit(1);
    return;
  }
  const stage: CaptureStage = options.stage === 'verify' ? 'verify' : 'build';

  let projectRoot: string;
  try {
    projectRoot = findProjectRoot();
  } catch {
    console.error(chalk.red('Error: not inside an Anatomia project (no .ana/ found).'));
    process.exit(1);
    return;
  }

  const outcome = executeCapture({
    stage,
    slug: options.slug,
    surface: options.surface,
    projectRoot,
    now: Math.floor(Date.now() / 1000),
  });

  printOutcome(outcome, options.json ?? false);
  process.exit(outcome.exitCode);
}

/**
 * Register the `test` command.
 *
 * @param program - Commander program instance
 */
export function registerTestCommand(program: Command): void {
  program
    .command('test')
    .description('Run tests with engine-captured, seal-gated evidence')
    .option('--stage <stage>', 'Pipeline stage: build or verify', 'build')
    .option('--slug <slug>', 'Work item slug (required)')
    .option('--surface <name>', 'Resolve the per-surface test command (build stage only)')
    .option('--json', 'Output JSON for programmatic consumption')
    .action((options: TestOptions) => {
      runTest(options);
    });
}
