/**
 * Capturing test runner — the security boundary.
 *
 * Resolves a project's test command into a program + argv WITHOUT a shell,
 * runs it via an argv-array `spawnSync` (`shell: false`, no appended flags),
 * tees the full raw stdout+stderr bytes to a capture sink with an explicit
 * fsync, and best-effort derives test counts from the captured bytes.
 *
 * SECURITY: this is the hardened inverse of `runBuildCommand` (worktree.ts),
 * which is `shell: true` and discards stdout. A shell-interpolated test command
 * with a hostile project name/path is an injection surface; the argv-array form
 * closes it. `resolveCommand` never falls back to a shell — it parses the two
 * forms we generate (`<program> <args>` and `(cd '<dir>' && <program> <args>)`,
 * with leading `VAR=val` assignments) and REFUSES anything that needs a shell
 * (pipes, chaining, redirection, command substitution, globs) with an error
 * that names the offending construct.
 *
 * Preservation is the spine; count derivation is additive and barred from the
 * preservation path. Unknown/unparseable output → abstain (null), never a
 * fabricated count.
 */

import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Engine-derived test counts, or null when abstaining. */
export interface TestCounts {
  passed: number;
  failed: number;
  skipped: number;
}

/** Trinary capture verdict — `pass` requires positive evidence. */
export type CaptureVerdict = 'pass' | 'fail' | 'abstain';

/** A shell-free resolved command: program + argv + env + working directory. */
export interface ResolvedCommand {
  /** Executable (argv[0]) — never shell-interpreted. */
  program: string;
  /** Argument vector — passed verbatim, never concatenated into a string. */
  args: string[];
  /** Leading `VAR=val` assignments lifted out of the command line. */
  env: Record<string, string>;
  /** Working directory recovered from a `(cd '<dir>' && …)` wrapper. */
  cwd: string;
}

/** Outcome of a captured test run. */
export interface CaptureRunResult {
  /** Full raw stdout+stderr bytes, preserved verbatim. */
  rawBytes: Buffer;
  /** Process exit code (null when the process was killed/timed out). */
  exitCode: number | null;
  /** Absolute path the bytes were tee'd to. */
  sink: string;
  /** Whether a shell was used — always false (the security invariant). */
  usedShell: boolean;
}

/** Options for a captured run. */
export interface CaptureRunOptions {
  /** Program to execute (argv[0]) — never shell-interpreted. */
  program: string;
  /** Argument vector — passed verbatim, never concatenated into a string. */
  args: string[];
  /** Working directory for the spawned process. */
  cwd: string;
  /** Capture file path to tee raw bytes into. */
  sink: string;
  /** Extra environment variables merged over `process.env`. */
  env?: Record<string, string>;
  /** Timeout in milliseconds (default 5 minutes). */
  timeoutMs?: number;
}

/**
 * A capture/seal error — a failure to CAPTURE the tests, distinct from a test
 * failure. The CLI maps this to exit code 3 (never 1).
 */
export class CaptureCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaptureCommandError';
  }
}

const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_BUFFER = 64 * 1024 * 1024; // 64 MiB

/** The known runners whose summary output the engine can parse. */
export const KNOWN_RUNNERS = [
  'vitest',
  'jest',
  'pytest',
  'go',
  'cargo',
  'rspec',
  'junit',
  'dotnet',
] as const;

/** A runner name the count-derivation understands. */
export type KnownRunner = (typeof KNOWN_RUNNERS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// resolveCommand — shell-free parser + refusal gate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tokenize a command fragment into argv tokens, honoring single/double quotes
 * and backslash escapes — WITHOUT a shell. Single quotes are literal; double
 * quotes honor `\"`/`\\`; outside quotes `\x` is a literal `x`. This is enough
 * to recover the POSIX `'\''` single-quote idiom (close, escaped-quote, open).
 *
 * @param input - Command fragment to tokenize
 * @returns Argv tokens with quoting removed
 */
export function tokenizeCommand(input: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let has = false;
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quote === "'") {
      if (c === "'") quote = null;
      else { cur += c; has = true; }
      continue;
    }
    if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === '\\' && (input[i + 1] === '"' || input[i + 1] === '\\')) { cur += input[++i]!; has = true; }
      else { cur += c; has = true; }
      continue;
    }
    if (c === "'" || c === '"') { quote = c; has = true; continue; }
    if (c === '\\' && i + 1 < input.length) { cur += input[++i]!; has = true; continue; }
    if (c === ' ' || c === '\t') {
      if (has) { tokens.push(cur); cur = ''; has = false; }
      continue;
    }
    cur += c;
    has = true;
  }
  if (has) tokens.push(cur);
  return tokens;
}

/**
 * Refuse any shell metacharacter that appears OUTSIDE quotes — the constructs
 * that would require a shell. Quoted occurrences are literal argv content (we
 * pass argv verbatim) and are allowed. Throws a {@link CaptureCommandError}
 * naming the first offending construct.
 *
 * @param segment - The raw command fragment (program + args), unwrapped
 */
function refuseShellMetacharacters(segment: string): void {
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i]!;
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; continue; }
    switch (c) {
      case '|':
        throw new CaptureCommandError(
          "test command contains a pipe ('|'), which requires a shell. `ana test` runs commands without a shell.",
        );
      case '&':
        throw new CaptureCommandError(
          segment[i + 1] === '&'
            ? "test command contains command chaining ('&&'), which requires a shell."
            : "test command contains a background operator ('&'), which requires a shell.",
        );
      case ';':
        throw new CaptureCommandError("test command contains a semicolon (';'), which requires a shell.");
      case '>':
      case '<':
        throw new CaptureCommandError(`test command contains a redirection ('${c}'), which requires a shell.`);
      case '`':
        throw new CaptureCommandError('test command contains a backtick (command substitution), which requires a shell.');
      case '$':
        if (segment[i + 1] === '(') {
          throw new CaptureCommandError("test command contains command substitution ('$('), which requires a shell.");
        }
        break;
      case '*':
      case '?':
        throw new CaptureCommandError(`test command contains a glob ('${c}'), which requires a shell.`);
      case '(':
      case ')':
        throw new CaptureCommandError(`test command contains a subshell ('${c}'), which requires a shell.`);
      default:
        break;
    }
  }
}

/**
 * Lift leading `VAR=val` assignments out of a token list into an env map; the
 * first non-assignment token is the executable (so `dotenv`/`cross-env` and
 * inline `CI=1 vitest` both work).
 *
 * @param tokens - Argv tokens (quoting already removed)
 * @returns The program, its args, and the lifted env
 */
function liftEnvAndProgram(tokens: string[]): { program: string; args: string[]; env: Record<string, string> } {
  const env: Record<string, string> = {};
  let i = 0;
  const assignRe = /^[A-Za-z_][A-Za-z0-9_]*=/;
  while (i < tokens.length && assignRe.test(tokens[i]!)) {
    const tok = tokens[i]!;
    const eq = tok.indexOf('=');
    env[tok.slice(0, eq)] = tok.slice(eq + 1);
    i++;
  }
  if (i >= tokens.length) {
    throw new CaptureCommandError('test command has no program — only environment assignments.');
  }
  return { program: tokens[i]!, args: tokens.slice(i + 1), env };
}

/**
 * Parse an ana.json test command string into a shell-free program/args/env/cwd.
 *
 * Accepts `<program> <args>`, a `(cd '<dir>' && <program> <args>)` wrapper
 * (recovering `cwd`), and leading `VAR=val` assignments. REFUSES (throws) any
 * construct that needs a shell — pipes, `&&`-chains, `;`, `||`, redirections,
 * `$()`, backticks, and globs — naming the offending construct. There is no
 * silent shell fallback.
 *
 * @param cmdString - The configured command string
 * @param baseDir - Directory a relative `cd` resolves against (project root)
 * @returns The resolved shell-free command
 */
export function resolveCommand(cmdString: string, baseDir: string): ResolvedCommand {
  const trimmed = cmdString.trim();
  if (!trimmed) throw new CaptureCommandError('empty test command.');

  // Subshell wrapper: (cd '<dir>' && <program> <args>) — the ONE allowed `&&`.
  const subshell = trimmed.match(/^\(\s*cd\s+(.+?)\s+&&\s+([\s\S]+?)\s*\)\s*$/);
  if (subshell) {
    const pathTokens = tokenizeCommand(subshell[1]!);
    if (pathTokens.length !== 1) {
      throw new CaptureCommandError("unsupported `cd` target in test command — expected a single directory.");
    }
    const cwd = path.resolve(baseDir, pathTokens[0]!);
    const rest = subshell[2]!.trim();
    refuseShellMetacharacters(rest);
    const tokens = tokenizeCommand(rest);
    if (tokens.length === 0) throw new CaptureCommandError('no program inside the `(cd … && …)` wrapper.');
    const { program, args, env } = liftEnvAndProgram(tokens);
    return { program, args, env, cwd };
  }

  if (trimmed.startsWith('(')) {
    throw new CaptureCommandError("unsupported subshell — only `(cd '<dir>' && <cmd>)` is recognized; no shell fallback.");
  }

  refuseShellMetacharacters(trimmed);
  const tokens = tokenizeCommand(trimmed);
  if (tokens.length === 0) throw new CaptureCommandError('no program in test command.');
  const { program, args, env } = liftEnvAndProgram(tokens);
  return { program, args, env, cwd: baseDir };
}

// ─────────────────────────────────────────────────────────────────────────────
// runCapture — fail-closed tee
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the spawn options for a captured run. Exposed so the security invariant
 * (no shell) is mechanically testable: the returned object never sets
 * `shell: true`.
 *
 * @param cwd - Working directory
 * @param timeoutMs - Timeout in milliseconds
 * @param env - Extra environment variables merged over `process.env`
 * @returns spawnSync options with buffer encoding and shell disabled
 */
export function captureSpawnOptions(
  cwd: string,
  timeoutMs: number,
  env?: Record<string, string>,
): SpawnSyncOptions {
  return {
    cwd,
    encoding: 'buffer',
    timeout: timeoutMs,
    maxBuffer: MAX_BUFFER,
    shell: false,
    env: env ? { ...process.env, ...env } : process.env,
  };
}

/**
 * Run a test command and tee its full raw output to the capture sink.
 *
 * Fails CLOSED on a spawn/capture error: if `spawnSync` reports `result.error`
 * (ENOENT, maxBuffer overflow, timeout/kill) the bytes we have are incomplete,
 * so we throw a {@link CaptureCommandError} BEFORE writing any sink — a
 * truncated or empty capture is never sealed.
 *
 * @param opts - Capture run options
 * @returns The captured bytes, exit code, sink path, and shell flag
 */
export function runCapture(opts: CaptureRunOptions): CaptureRunResult {
  const spawnOpts = captureSpawnOptions(opts.cwd, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.env);
  const result = spawnSync(opts.program, opts.args, spawnOpts);

  // GATE — fail CLOSED on any spawn/capture error, BEFORE writing the sink.
  // A non-null result.error means the child could not be spawned (ENOENT),
  // output exceeded maxBuffer and was TRUNCATED, or the run timed out / was
  // killed. Sealing the bytes we have in any of these cases would be a silent
  // preservation lie. We refuse to produce a capture rather than seal it.
  if (result.error) {
    const err = result.error as NodeJS.ErrnoException;
    const detail =
      err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
        ? `test output exceeded the ${MAX_BUFFER}-byte capture limit and was truncated`
        : err.message || String(err.code);
    throw new CaptureCommandError(`refusing to seal an incomplete capture: ${detail}`);
  }

  const stdout = toBuffer(result.stdout);
  const stderr = toBuffer(result.stderr);
  const rawBytes = Buffer.concat([stdout, stderr]);

  // Preservation is fatal-if-unwritable: fsync the sink before returning.
  const fd = fs.openSync(opts.sink, 'w');
  try {
    fs.writeSync(fd, rawBytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  return {
    rawBytes,
    exitCode: result.status,
    sink: opts.sink,
    usedShell: spawnOpts.shell === true,
  };
}

/**
 * Normalize a spawnSync output field to a Buffer.
 *
 * @param value - stdout/stderr from spawnSync (Buffer | string | null)
 * @returns A Buffer (empty when null)
 */
function toBuffer(value: Buffer | string | null | undefined): Buffer {
  if (value == null) return Buffer.alloc(0);
  return Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
// deriveCounts / deriveVerdict — additive, fail-open, no-false-green
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive test counts from captured output — only when the runner is known.
 *
 * ABSTAIN-ON-UNKNOWN is load-bearing: the count is the whole deliverable, and
 * once the gate is armed a fabricated `passed>0` at exit 0 would seal a number
 * that was never real. So we NEVER guess by running every parser against
 * unidentified output — a loose summary regex (e.g. rspec's `N examples, N
 * failures`) can coincidentally match unrelated prose and invent a count. We
 * parse ONLY with the hinted runner's parser; unhinted output abstains (null).
 *
 * Fail-open still holds downstream: null counts never block the seal — they
 * surface as an `abstain` verdict with the raw bytes preserved verbatim.
 *
 * @param raw - Captured output bytes (or string)
 * @param hint - The identified runner whose parser to apply
 * @returns Derived counts, or null when abstaining (no hint, or no match)
 */
export function deriveCounts(raw: Buffer | string, hint?: KnownRunner): TestCounts | null {
  if (!hint || !PARSERS[hint]) return null;
  const text = typeof raw === 'string' ? raw : raw.toString('utf8');
  return PARSERS[hint](text);
}

/**
 * Derive a verdict from counts and exit code.
 *
 * NO-FALSE-GREEN: a `pass` is reported only with positive evidence — at least
 * one actually-passed test, no failures, and a clean exit. Every other shape
 * abstains (preservation still holds; the count is simply unconfirmed):
 *   - any recorded failure                  → fail
 *   - non-zero exit (collection/compile error, killed/timed-out) → fail
 *   - unrecognized output (counts null)     → abstain
 *   - zero passed (empty suite OR all-skipped) → abstain — a vacuous green is
 *     never certified.
 *
 * @param counts - Derived counts, or null
 * @param exitCode - Process exit code (null = killed/timed out)
 * @returns The trinary verdict
 */
export function deriveVerdict(counts: TestCounts | null, exitCode: number | null): CaptureVerdict {
  if (counts && counts.failed > 0) return 'fail';
  // A non-zero / unknown exit is a real failure signal — collection error,
  // compile error, crash, killed/timed-out — fail, never a soft abstain.
  if (exitCode !== 0) return 'fail';
  if (counts === null) return 'abstain';
  // A pass requires positive evidence. Zero passed — whether the suite was
  // empty {0,0,0} or entirely skipped {0,0,N} — verified nothing.
  if (counts.passed === 0) return 'abstain';
  return 'pass';
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-runner summary parsers
// ─────────────────────────────────────────────────────────────────────────────

/** A summary parser for one runner: text → counts, or null when unrecognized. */
type Parser = (text: string) => TestCounts | null;

/**
 * Extract the first integer following a labeled token (e.g. "3 passed").
 *
 * @param text - Text to search
 * @param re - Regex with the integer in capture group 1
 * @returns The parsed integer, or 0 when absent
 */
function intFrom(text: string, re: RegExp): number {
  const m = text.match(re);
  return m && m[1] ? parseInt(m[1], 10) : 0;
}

/**
 * Vitest `--reporter=json`: the machine-readable summary object carrying
 * `numPassedTests` / `numFailedTests` / `numPendingTests` / `numTodoTests`.
 *
 * This is the structural analog of {@link parseGo}: shape-gate on the reporter's
 * distinctive keys, then read the counts mechanically. Preferred over the human
 * summary because it is immune to a turbo/pnpm wrapper mangling the console
 * output (the abstain `ana test` hits on our own monorepo). The capture
 * concatenates stdout+stderr, so the JSON object may be embedded in surrounding
 * noise — fields are read by key, never via a whole-blob `JSON.parse`.
 *
 * @param text - Captured output (vitest JSON possibly interleaved with stderr)
 * @returns Counts, or null when no vitest JSON summary is present
 */
const parseVitestJson: Parser = (text) => {
  if (!/"numTotalTests":/.test(text) || !/"testResults":/.test(text)) return null;
  const num = (key: string): number => {
    const m = text.match(new RegExp(`"${key}":\\s*(\\d+)`));
    return m && m[1] ? parseInt(m[1], 10) : 0;
  };
  return {
    passed: num('numPassedTests'),
    failed: num('numFailedTests'),
    // Vitest reports `.skip` as pending and `.todo` separately; the human
    // summary folds both into "skipped", so we sum them to match.
    skipped: num('numPendingTests') + num('numTodoTests'),
  };
};

/**
 * Vitest human summary: `Tests  3234 passed | 2 skipped (3236)`.
 * @param text - Captured output
 * @returns Counts, or null when no vitest summary is present
 */
const parseVitestHuman: Parser = (text) => {
  const line = text.match(/^\s*Tests\s+\d.*$/m);
  if (!line) return null;
  const s = line[0];
  return {
    passed: intFrom(s, /(\d+) passed/),
    failed: intFrom(s, /(\d+) failed/),
    skipped: intFrom(s, /(\d+) skipped/),
  };
};

/**
 * Vitest: prefer the machine-readable `--reporter=json` summary, falling back to
 * the human summary line. Reached only via the `vitest` hint (no fallthrough),
 * so this never fabricates a count for an unknown runner.
 * @param text - Captured output
 * @returns Counts, or null when neither shape is present
 */
const parseVitest: Parser = (text) => parseVitestJson(text) ?? parseVitestHuman(text);

/**
 * Jest: `Tests:       1 failed, 2 skipped, 3 passed, 6 total`.
 * @param text - Captured output
 * @returns Counts, or null when no jest summary is present
 */
const parseJest: Parser = (text) => {
  const line = text.match(/^Tests:\s+.*$/m);
  if (!line) return null;
  const s = line[0];
  return {
    passed: intFrom(s, /(\d+) passed/),
    failed: intFrom(s, /(\d+) failed/),
    skipped: intFrom(s, /(\d+) skipped/),
  };
};

/**
 * Pytest: `===== 3 passed, 1 failed, 2 skipped in 0.50s =====`.
 * @param text - Captured output
 * @returns Counts, or null when no pytest summary is present
 */
const parsePytest: Parser = (text) => {
  const line = text.match(/^=+ .*\b\d+ (?:passed|failed|error|skipped).* in [\d.]+s.*=+$/m);
  if (!line) return null;
  const s = line[0];
  const failed = intFrom(s, /(\d+) failed/) + intFrom(s, /(\d+) errors?/);
  return {
    passed: intFrom(s, /(\d+) passed/),
    failed,
    skipped: intFrom(s, /(\d+) skipped/),
  };
};

/**
 * Go: `go test -json` event stream — count per-test pass/fail/skip actions.
 * @param text - Captured output
 * @returns Counts, or null when no go -json events are present
 */
const parseGo: Parser = (text) => {
  if (!/"Action":/.test(text) || !/"Test":/.test(text)) return null;
  const count = (action: string): number => {
    const re = new RegExp(`"Action":"${action}"[^}]*"Test":|"Test":[^}]*"Action":"${action}"`, 'g');
    return (text.match(re) || []).length;
  };
  return { passed: count('pass'), failed: count('fail'), skipped: count('skip') };
};

/**
 * Cargo: `test result: ok. 3 passed; 0 failed; 1 ignored;` (summed per binary).
 * @param text - Captured output
 * @returns Counts, or null when no cargo result line is present
 */
const parseCargo: Parser = (text) => {
  const re = /test result:[^\n]*?(\d+) passed;\s*(\d+) failed;[^\n]*?(\d+) ignored/g;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matched = true;
    passed += parseInt(m[1]!, 10);
    failed += parseInt(m[2]!, 10);
    skipped += parseInt(m[3]!, 10);
  }
  return matched ? { passed, failed, skipped } : null;
};

/**
 * RSpec: `5 examples, 1 failure, 2 pending`.
 * @param text - Captured output
 * @returns Counts, or null when no rspec summary is present
 */
const parseRspec: Parser = (text) => {
  // Anchored to the start of rspec's standalone summary line — a bare
  // `N examples, N failures` embedded mid-prose must not fabricate a count.
  const m = text.match(/^\s*(\d+) examples?, (\d+) failures?(?:, (\d+) pending)?/m);
  if (!m) return null;
  const examples = parseInt(m[1]!, 10);
  const failed = parseInt(m[2]!, 10);
  const skipped = m[3] ? parseInt(m[3], 10) : 0;
  return { passed: Math.max(0, examples - failed - skipped), failed, skipped };
};

/**
 * JUnit XML: sum leaf `<testsuite tests=.. failures=.. errors=.. skipped=..>`.
 * @param text - Captured output
 * @returns Counts, or null when no junit testsuite is present
 */
const parseJunit: Parser = (text) => {
  if (!/<testsuite\s[^>]*\btests=/.test(text)) return null;
  const suiteRe = /<testsuite\s[^>]*>/g;
  let tests = 0;
  let failures = 0;
  let errors = 0;
  let skipped = 0;
  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = suiteRe.exec(text)) !== null) {
    const tag = m[0];
    if (!/\btests=/.test(tag)) continue;
    matched = true;
    tests += intFrom(tag, /\btests="(\d+)"/);
    failures += intFrom(tag, /\bfailures="(\d+)"/);
    errors += intFrom(tag, /\berrors="(\d+)"/);
    skipped += intFrom(tag, /\bskipped="(\d+)"/);
  }
  if (!matched) return null;
  return {
    passed: Math.max(0, tests - failures - errors - skipped),
    failed: failures + errors,
    skipped,
  };
};

/**
 * .NET: `Failed: 0, Passed: 3, Skipped: 1` or TRX `<Counters .../>`.
 * @param text - Captured output
 * @returns Counts, or null when no dotnet summary is present
 */
const parseDotnet: Parser = (text) => {
  const summary = text.match(/Failed:\s*(\d+),\s*Passed:\s*(\d+),\s*Skipped:\s*(\d+)/);
  if (summary) {
    return {
      failed: parseInt(summary[1]!, 10),
      passed: parseInt(summary[2]!, 10),
      skipped: parseInt(summary[3]!, 10),
    };
  }
  const counters = text.match(/<Counters\b[^>]*>/);
  if (counters) {
    const tag = counters[0];
    const total = intFrom(tag, /\btotal="(\d+)"/);
    const passed = intFrom(tag, /\bpassed="(\d+)"/);
    const failed = intFrom(tag, /\bfailed="(\d+)"/);
    return { passed, failed, skipped: Math.max(0, total - passed - failed) };
  }
  return null;
};

const PARSERS: Record<KnownRunner, Parser> = {
  vitest: parseVitest,
  jest: parseJest,
  pytest: parsePytest,
  go: parseGo,
  cargo: parseCargo,
  rspec: parseRspec,
  junit: parseJunit,
  dotnet: parseDotnet,
};
