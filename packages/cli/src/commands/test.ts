/**
 * `ana test` — the default, capture-aware test path.
 *
 * Runs the project's test command through the shell-free capturing runner
 * (array-arg spawn, NO shell), tees the full raw bytes to a per-slug capture
 * file, derives counts best-effort, and prints a single marker line the agent
 * pastes into the build report. At save the marker expands into a verbatim
 * block and three validators gate the seal.
 *
 *   - Baseline (no `-- <command>`): runs the configured command, emits the
 *     SEALED marker. Capture/seal failures exit with a distinct code 3.
 *   - Checkpoint (`-- <command...>`): captures an arbitrary Plan-authored
 *     command, but DEGRADES to raw on any capture bug and never blocks — it
 *     exits with the underlying test status and emits no sealed marker.
 *
 * Exit-code contract: 0 = tests ran (verdict pass/abstain); 1 = tests failed
 * (verdict fail); 3 = capture/seal error (over-ceiling, resolveCommand refusal,
 * spawnSync result.error) — NEVER conflated with "tests failed".
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createHash } from 'node:crypto';
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
import { formatMarker, formatCounts, type CaptureStage } from '../utils/capture-marker.js';

/** The 8 MiB interim inline ceiling — over this, a baseline fails CLOSED. */
export const INLINE_CEILING_BYTES = 8 * 1024 * 1024;

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
  mode: 'baseline' | 'checkpoint';
  /** Process exit code the caller should use. */
  exitCode: number;
  /** A capture bug forced a fall back to raw output (checkpoint only). */
  degradedToRaw: boolean;
  /** A capture/seal error message, when the run failed to capture. */
  captureError?: string | undefined;
  bytes?: number | undefined;
  sha256?: string | undefined;
  counts: TestCounts | null;
  verdict?: CaptureVerdict | undefined;
  /** The sealed marker (baseline success only). */
  marker?: string | undefined;
  /** Capture file path, relative to the slug directory. */
  file?: string | undefined;
  /** Raw captured text, for checkpoint/degrade display. */
  rawText?: string | undefined;
}

/** Parameters for {@link executeCapture}. */
export interface ExecuteCaptureParams {
  stage: CaptureStage;
  slug: string;
  surface?: string | undefined;
  /** The `-- <command...>` tokens; presence selects checkpoint mode. */
  passthrough?: string[] | undefined;
  /** Project root (the directory holding `.ana/`). */
  projectRoot: string;
  /** Epoch seconds for the capture filename (injected for testability). */
  now: number;
}

/**
 * Resolve the test command string from ana.json.
 *
 * Per-surface (`surfaces[name].commands.test_json` when present, else
 * `.test`) when `--surface` is given; otherwise top-level `commands.test`.
 * `test_json` is the opt-in structured override — never auto-appended.
 *
 * @param anaJson - Parsed ana.json
 * @param surface - Surface name, or undefined for top-level
 * @returns The command string, or null when none is configured
 */
export function resolveTestCommandString(
  anaJson: Record<string, unknown>,
  surface: string | undefined,
): string | null {
  if (surface) {
    const surfaces = anaJson['surfaces'] as Record<string, unknown> | undefined;
    const surfaceObj = surfaces?.[surface] as Record<string, unknown> | undefined;
    if (!surfaceObj) return null;
    const commands = surfaceObj['commands'] as Record<string, unknown> | undefined;
    const testJson = commands?.['test_json'];
    if (typeof testJson === 'string' && testJson.trim()) return testJson;
    const test = commands?.['test'];
    return typeof test === 'string' && test.trim() ? test : null;
  }

  const commands = anaJson['commands'] as Record<string, unknown> | undefined;
  const test = commands?.['test'];
  return typeof test === 'string' && test.trim() ? test : null;
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
  // Check cargo before go: "cargo test" contains the substring "go test"… not,
  // but be explicit about precedence anyway.
  if (lower.includes('cargo')) return 'cargo';
  if (lower.includes('go test')) return 'go';
  if (lower.includes('rspec')) return 'rspec';
  if (lower.includes('dotnet')) return 'dotnet';
  return KNOWN_RUNNERS.find((r) => lower.includes(r));
}

/**
 * Run the capture flow and return a structured outcome (no chalk, no exit).
 *
 * @param params - Capture parameters
 * @returns The capture outcome and the exit code the caller should use
 */
export function executeCapture(params: ExecuteCaptureParams): TestRunOutcome {
  const mode: TestRunOutcome['mode'] = params.passthrough && params.passthrough.length > 0 ? 'checkpoint' : 'baseline';

  // 1. Resolve the command shell-free; keep a string for runner inference.
  let resolved: ResolvedCommand;
  let runnerSource: string;
  if (mode === 'checkpoint') {
    const argv = params.passthrough!;
    runnerSource = argv.join(' ');
    if (argv.length === 1) {
      // A single passthrough token may be a config-style command — including a
      // `(cd '<dir>' && <cmd>)` wrapper — so parse it shell-free.
      try {
        resolved = resolveCommand(argv[0]!, params.projectRoot);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return failOrDegrade(mode, message, null);
      }
    } else {
      // Already-tokenized argv from the invoking shell. Use it VERBATIM — never
      // re-join + re-parse. The string parser is for ana.json's config string;
      // re-tokenizing real argv silently loses quoting on args like
      // `-k "a or b"`, which would split into separate tokens and change which
      // tests run (and thus the sealed count).
      resolved = { program: argv[0]!, args: argv.slice(1), env: {}, cwd: params.projectRoot };
    }
  } else {
    const anaJsonPath = path.join(params.projectRoot, '.ana', 'ana.json');
    let anaJson: Record<string, unknown>;
    try {
      anaJson = JSON.parse(fs.readFileSync(anaJsonPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      return { mode, exitCode: CAPTURE_ERROR_EXIT, degradedToRaw: false, counts: null, captureError: 'could not read .ana/ana.json.' };
    }
    const cmdString = resolveTestCommandString(anaJson, params.surface);
    if (!cmdString) {
      const where = params.surface ? `surface "${params.surface}"` : 'top-level commands.test';
      return { mode, exitCode: CAPTURE_ERROR_EXIT, degradedToRaw: false, counts: null, captureError: `no test command configured for ${where}.` };
    }
    runnerSource = cmdString;
    // Resolve shell-free (throws CaptureCommandError on a refusal).
    try {
      resolved = resolveCommand(cmdString, params.projectRoot);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return failOrDegrade(mode, message, null);
    }
  }

  // Identify the runner once, from the command — used for count derivation in
  // BOTH modes. Checkpoints get counts too (they previously abstained because
  // no hint was inferred); unknown runners still abstain (deriveCounts is
  // hint-only).
  const runner = inferRunner(runnerSource);

  // 3. Prepare the sink and run the capture (throws on spawn/maxBuffer/timeout).
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
    return failOrDegrade(mode, message, null);
  }

  // 4. Inline ceiling — fail CLOSED on a baseline; degrade on a checkpoint.
  if (result.bytes >= INLINE_CEILING_BYTES) {
    const mib = (result.bytes / (1024 * 1024)).toFixed(1);
    const message =
      `capture too large to seal — ${mib} MiB exceeds the 8 MiB inline ceiling. ` +
      `The full output is on disk at ${relFile} but cannot be sealed into the build report. ` +
      'Reduce test output (less verbose reporter) or split the suite.';
    const counts = deriveCounts(result.rawBytes, runner);
    return failOrDegrade(mode, message, { counts, rawText: result.rawBytes.toString('utf8'), file: relFile, bytes: result.bytes });
  }

  // 5. Derive counts + verdict from the captured bytes.
  const counts = deriveCounts(result.rawBytes, runner);
  const verdict = deriveVerdict(counts, result.exitCode);
  const testExit = verdict === 'fail' ? 1 : 0;

  if (mode === 'checkpoint') {
    // Checkpoints never seal — they degrade to raw by design and exit with the
    // underlying test status.
    return {
      mode,
      exitCode: testExit,
      degradedToRaw: false,
      counts,
      verdict,
      bytes: result.bytes,
      file: relFile,
      rawText: result.rawBytes.toString('utf8'),
    };
  }

  // 6. Baseline — seal the marker.
  const sha = createHash('sha256').update(result.rawBytes).digest('hex');
  const marker = formatMarker({
    stage: params.stage,
    slug: params.slug,
    bytes: result.bytes,
    sha256: sha,
    file: relFile,
    counts: formatCounts(counts),
    verdict,
  });

  return {
    mode,
    exitCode: testExit,
    degradedToRaw: false,
    counts,
    verdict,
    bytes: result.bytes,
    sha256: sha,
    marker,
    file: relFile,
  };
}

/**
 * Map a capture/seal failure to a baseline fail-closed (exit 3) or a checkpoint
 * degrade-to-raw (never blocks).
 *
 * @param mode - baseline or checkpoint
 * @param message - The capture/seal error message
 * @param partial - Optional captured data to carry into a degrade
 * @returns The outcome
 */
function failOrDegrade(
  mode: TestRunOutcome['mode'],
  message: string,
  partial: { counts: TestCounts | null; rawText?: string; file?: string; bytes?: number } | null,
): TestRunOutcome {
  if (mode === 'baseline') {
    return {
      mode,
      exitCode: CAPTURE_ERROR_EXIT,
      degradedToRaw: false,
      counts: partial?.counts ?? null,
      captureError: message,
      file: partial?.file,
      bytes: partial?.bytes,
    };
  }
  // Checkpoint: degrade to raw, never block. Exit with the underlying status
  // (we have no clean verdict here, so a capture problem reads as a failure).
  return {
    mode,
    exitCode: 1,
    degradedToRaw: true,
    counts: partial?.counts ?? null,
    captureError: message,
    rawText: partial?.rawText,
    file: partial?.file,
    bytes: partial?.bytes,
  };
}

/**
 * Print a capture outcome to the console (the CLI/chalk boundary lives here).
 *
 * @param outcome - The capture outcome
 * @param slug - Work item slug (for the on-disk path)
 * @param json - Whether to print JSON
 */
function printOutcome(outcome: TestRunOutcome, slug: string, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(outcome, null, 2));
    return;
  }

  if (outcome.captureError && !outcome.degradedToRaw) {
    console.error(chalk.red(`✗ CAPTURE error: ${outcome.captureError}`));
    if (outcome.exitCode === CAPTURE_ERROR_EXIT) {
      console.error(chalk.gray('  (exit 3 — a capture/seal error, NOT a test failure)'));
    }
    return;
  }

  const countsLabel = outcome.counts
    ? `${outcome.counts.passed} passed, ${outcome.counts.failed} failed, ${outcome.counts.skipped} skipped`
    : 'abstain';

  if (outcome.degradedToRaw) {
    console.warn(chalk.yellow(`⚠ checkpoint capture degraded to raw — ${outcome.captureError ?? 'capture problem'}`));
    if (outcome.rawText) console.log(outcome.rawText);
    return;
  }

  if (outcome.mode === 'checkpoint') {
    console.log(chalk.green(`✓ checkpoint  counts: ${countsLabel}  (verdict: ${outcome.verdict})`));
    if (outcome.file) console.log(chalk.gray(`  ${outcome.bytes} bytes → ${path.join('.ana', 'plans', 'active', slug, outcome.file)}`));
    return;
  }

  // Baseline success.
  console.log(chalk.green(`✓ captured  counts: ${countsLabel}  (verdict: ${outcome.verdict})`));
  console.log(chalk.gray(`  ${outcome.bytes} bytes → ${path.join('.ana', 'plans', 'active', slug, outcome.file ?? '')}`));
  console.log('');
  console.log('  Paste this marker into build_report.md:');
  console.log(`  ${outcome.marker}`);
}

/**
 * The `ana test` action.
 *
 * @param passthrough - Tokens after `--` (checkpoint command)
 * @param options - Parsed flags
 */
function runTest(passthrough: string[], options: TestOptions): void {
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
    passthrough,
    projectRoot,
    now: Math.floor(Date.now() / 1000),
  });

  printOutcome(outcome, options.slug, options.json ?? false);
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
    .option('--surface <name>', 'Resolve the per-surface test command')
    .option('--json', 'Output JSON for programmatic consumption')
    .argument('[command...]', 'Optional checkpoint command after `--` (captured, never blocks)')
    .action((command: string[], options: TestOptions) => {
      runTest(command ?? [], options);
    });
}
