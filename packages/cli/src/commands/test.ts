/**
 * `ana test` — the default, capture-aware test path.
 *
 * Runs the project's test command through the shell-free capturing runner
 * (array-arg spawn, NO shell), tees the full raw bytes to a per-slug capture
 * file, hashes + counts them, DELETES the log, and prints a single COMPACT
 * marker line the agent pastes into the build report. Nothing is inlined at
 * save; the one-line marker (counts + verdict + sha256 + byte/line totals) is
 * the whole sealed account, and a present-check is the only save-time gate.
 *
 *   - Baseline (no `-- <command>`): runs the configured command, emits the
 *     SEALED marker. Capture/seal failures exit with a distinct code 3.
 *   - Checkpoint (`-- <command...>`): captures an arbitrary Plan-authored
 *     command, but DEGRADES to raw on any capture bug and never blocks — it
 *     exits with the underlying test status and emits no sealed marker.
 *
 * Exit-code contract: 0 = tests ran (verdict pass/abstain); 1 = tests failed
 * (verdict fail); 3 = capture/seal error (resolveCommand refusal, spawnSync
 * result.error including the 64 MiB maxBuffer overflow) — NEVER conflated with
 * "tests failed".
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
import { formatMarker, formatCounts, countLines, type CaptureStage } from '../utils/capture-marker.js';

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
  /** Count of newline bytes in the captured output. */
  lines?: number | undefined;
  sha256?: string | undefined;
  counts: TestCounts | null;
  verdict?: CaptureVerdict | undefined;
  /** The sealed marker (baseline success only). */
  marker?: string | undefined;
  /**
   * A discoverability hint, set only when the baseline abstained for lack of a
   * machine-readable reporter AND `test_json` was not the resolved source.
   */
  countHint?: string | undefined;
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
  // Check cargo before go: "cargo test" contains the substring "go test"… not,
  // but be explicit about precedence anyway.
  if (lower.includes('cargo')) return 'cargo';
  if (lower.includes('go test')) return 'go';
  if (lower.includes('rspec')) return 'rspec';
  if (lower.includes('dotnet')) return 'dotnet';
  return KNOWN_RUNNERS.find((r) => lower.includes(r));
}

/** The pipeline stages whose baseline form seals evidence into a report. */
const SEALING_STAGES = new Set<CaptureStage>(['build', 'verify']);

/**
 * Detect the always-wrong combination of an explicitly-named sealing stage and
 * the checkpoint passthrough form.
 *
 * `--stage build`/`--stage verify` signal "seal a result", but a `-- <command>`
 * passthrough runs the checkpoint path, which by design NEVER seals. The two
 * together can only mislead — the engine emits no marker and the operator is
 * left to reconcile a sealing intent with a non-sealing run. That gap is exactly
 * how a hand-fabricated seal slipped in. We refuse the input outright rather
 * than warn, because the missing-marker signal is the very thing that was
 * rationalized past.
 *
 * Fires ONLY when the stage was given on the CLI (source is neither the default
 * nor unknown); a bare `ana test -- <cmd>` is a legitimate checkpoint and must
 * not trip the guard. Keyed off {@link SEALING_STAGES} so a future non-sealing
 * stage is excluded automatically.
 *
 * @param stage - The normalized capture stage
 * @param stageSource - commander's `getOptionValueSource('stage')` ('default' | 'cli' | …)
 * @param passthrough - The `-- <command...>` tokens
 * @returns True when the run should be refused
 */
export function isCheckpointSealConflict(
  stage: CaptureStage,
  stageSource: string | undefined,
  passthrough: string[],
): boolean {
  return (
    passthrough.length > 0 &&
    !!stageSource &&
    stageSource !== 'default' &&
    SEALING_STAGES.has(stage)
  );
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
  // Which config key the baseline command came from — null for a checkpoint.
  // Drives the abstain discoverability hint (fires only when NOT 'test_json').
  let commandSource: TestCommandSource | null = null;
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
    const resolvedCmd = resolveTestCommandString(anaJson, params.surface);
    if (!resolvedCmd) {
      const where = params.surface ? `surface "${params.surface}"` : 'top-level commands.test';
      return { mode, exitCode: CAPTURE_ERROR_EXIT, degradedToRaw: false, counts: null, captureError: `no test command configured for ${where}.` };
    }
    runnerSource = resolvedCmd.command;
    commandSource = resolvedCmd.source;
    // Resolve shell-free (throws CaptureCommandError on a refusal).
    try {
      resolved = resolveCommand(resolvedCmd.command, params.projectRoot);
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

  // 4. Derive counts + verdict from the captured bytes (in memory).
  const counts = deriveCounts(result.rawBytes, runner);
  const verdict = deriveVerdict(counts, result.exitCode);
  const testExit = verdict === 'fail' ? 1 : 0;
  const lines = countLines(result.rawBytes);

  // 5. Delete the .log now — the bytes are hashed + counted from memory, so the
  // on-disk log is scratch with nothing left to do. Deleting here (not at save)
  // is self-cleaning: an unsaved or abandoned run never orphans a log. The
  // `.captures/` gitignore only backs up the brief in-run window + a crash here.
  // No size ceiling: the seal is one line regardless of output size, and
  // runCapture's 64 MiB maxBuffer is the sole (fail-closed) size guard.
  try {
    fs.rmSync(sink, { force: true });
  } catch {
    // Best-effort — the gitignore rule is the backstop for a failed unlink.
  }

  if (mode === 'checkpoint') {
    // Checkpoints never seal — they degrade to raw by design and exit with the
    // underlying test status. rawText stays in memory for the display.
    return {
      mode,
      exitCode: testExit,
      degradedToRaw: false,
      counts,
      verdict,
      bytes: result.bytes,
      lines,
      rawText: result.rawBytes.toString('utf8'),
    };
  }

  // 6. Baseline — seal the COMPACT marker (no inlined block, no file path).
  const sha = createHash('sha256').update(result.rawBytes).digest('hex');
  const marker = formatMarker({
    stage: params.stage,
    slug: params.slug,
    counts: formatCounts(counts),
    verdict,
    sha256: sha,
    bytes: result.bytes,
    lines,
  });

  // Discoverability hint: we abstained on the count AND the command did not come
  // from `test_json`. Without this, an opt-in project abstains forever and never
  // learns the fix. Narrow trigger — a `test_json`-sourced abstain says nothing.
  const countHint =
    counts === null && commandSource !== 'test_json'
      ? 'No machine-readable count: set `commands.test_json` in .ana/ana.json for a real sealed count.'
      : undefined;

  return {
    mode,
    exitCode: testExit,
    degradedToRaw: false,
    counts,
    verdict,
    bytes: result.bytes,
    lines,
    sha256: sha,
    marker,
    countHint,
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
  partial: { counts: TestCounts | null; rawText?: string; bytes?: number } | null,
): TestRunOutcome {
  if (mode === 'baseline') {
    return {
      mode,
      exitCode: CAPTURE_ERROR_EXIT,
      degradedToRaw: false,
      counts: partial?.counts ?? null,
      captureError: message,
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
    bytes: partial?.bytes,
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
    console.log(chalk.gray(`  ${outcome.bytes} bytes / ${outcome.lines} lines captured (log deleted after sealing)`));
    return;
  }

  // Baseline success.
  console.log(chalk.green(`✓ captured  counts: ${countsLabel}  (verdict: ${outcome.verdict})`));
  console.log(chalk.gray(`  ${outcome.bytes} bytes / ${outcome.lines} lines captured (log deleted after sealing)`));
  if (outcome.countHint) console.log(chalk.cyan(`  ℹ ${outcome.countHint}`));
  console.log('');
  console.log('  Paste this marker into build_report.md:');
  console.log(`  ${outcome.marker}`);
}

/**
 * The `ana test` action.
 *
 * @param passthrough - Tokens after `--` (checkpoint command)
 * @param options - Parsed flags
 * @param stageSource - commander's `getOptionValueSource('stage')`, to tell an explicit `--stage` from the default
 */
function runTest(passthrough: string[], options: TestOptions, stageSource?: string): void {
  if (!options.slug) {
    console.error(chalk.red('Error: --slug <slug> is required.'));
    console.error(chalk.gray('Run: ana test --stage build --slug <slug>'));
    process.exit(1);
    return;
  }
  const stage: CaptureStage = options.stage === 'verify' ? 'verify' : 'build';

  // Refuse an explicit sealing stage run through the non-sealing checkpoint
  // form — an always-wrong combination that can only mislead.
  if (isCheckpointSealConflict(stage, stageSource, passthrough)) {
    console.error(
      chalk.red(`✗ Refusing: \`--stage ${stage}\` seals evidence, but the \`-- <command>\` checkpoint form never seals.`),
    );
    console.error(chalk.gray('  This combination produces no seal — run one of the two correct forms instead:'));
    console.error(chalk.gray(`    Sealed ${stage} result:  ana test --stage ${stage} --slug ${options.slug}   (no \`-- ...\`)`));
    console.error(chalk.gray(`    Checkpoint:           ana test --slug ${options.slug} -- ${passthrough.join(' ')}   (drop --stage ${stage})`));
    process.exit(1);
    return;
  }

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
    .option('--surface <name>', 'Resolve the per-surface test command')
    .option('--json', 'Output JSON for programmatic consumption')
    .argument('[command...]', 'Optional checkpoint command after `--` (captured, never blocks)')
    .action((command: string[], options: TestOptions, cmd: Command) => {
      runTest(command ?? [], options, cmd.getOptionValueSource('stage'));
    });
}
