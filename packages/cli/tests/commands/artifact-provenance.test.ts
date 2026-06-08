/**
 * Integration tests for provenance-at-save (capture v2).
 *
 * `ana artifact save` / `save-all` derive the live session's provenance and
 * commit `provenance/{role}-{session_id}.json` in the SAME commit as the artifact
 * (no extra commit, no git in the hook). A true no-work re-validation (artifact
 * byte-identical) must still print "No changes to save" and exit 0, with NO
 * provenance file left staged — the no-changes guard checks artifact paths only,
 * so the always-growing transcript can never force a spurious commit.
 *
 * Real temp git repo (`git init -b main`); provenance is seeded via a pending
 * pointer under a temp HOME plus the injected `ANA_*` env.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { saveArtifact, saveAllArtifacts } from '../../src/commands/artifact.js';
import { writePendingPointer } from '../../src/utils/forensics.js';

/** Thrown by the mocked process.exit so a test can observe the exit code. */
class ExitError extends Error {
  constructor(public code: number) {
    super(`exit ${code}`);
  }
}

describe('provenance at artifact save', () => {
  let tempDir: string;
  let tempHome: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let savedEnv: Record<string, string | undefined>;

  const ENV_KEYS = ['ANA_HARNESS', 'ANA_ROLE', 'ANA_CLI_VERSION', 'ANA_AGENT_DEF_HASH', 'ANA_RUN_ID', 'CLAUDE_CODE_SESSION_ID'];

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env['HOME'];
    savedEnv = {};
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provsave-'));
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'provsave-home-'));
    process.env['HOME'] = tempHome;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = originalHome;
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  /** Run a git command in the temp repo. */
  function git(cmd: string): string {
    return execSync(`git ${cmd}`, { cwd: tempDir, encoding: 'utf-8' });
  }

  /** Write a file (creating parent dirs) relative to the repo root. */
  function writeFile(rel: string, content: string): void {
    const abs = path.join(tempDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
  }

  /** Initialize a repo with a baseline commit on main, then a feature branch. */
  function initRepo(): void {
    git('init -b main');
    git('config user.email "test@test.com"');
    git('config user.name "Test"');
    fs.mkdirSync(path.join(tempDir, '.ana'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.ana', 'ana.json'),
      JSON.stringify({ artifactBranch: 'main', processCapture: 'on' }),
      'utf-8',
    );
    writeFile('README.md', 'base\n');
    git('add -A');
    git('commit -q -m init');
    git('checkout -q -b feature/test-slug');
    // Some feature work so the build report has churn to capture.
    writeFile('packages/cli/src/commands/run.ts', 'one\ntwo\nthree\n');
    git('add -A');
    git('commit -q -m "feature work"');
  }

  /** Create a valid build report + companion under the active plan dir. */
  function createBuildReport(slug: string): void {
    const dir = path.join(tempDir, '.ana', 'plans', 'active', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'build_report.md'),
      '# Build Report\n\n## Deviations\nNone.\n\n## Open Issues\nNone.\n\n## Acceptance Criteria\nAll met.\n\n## PR Summary\nReady.',
      'utf-8',
    );
    fs.writeFileSync(
      path.join(dir, 'build_data.yaml'),
      'schema: 1\nconcerns:\n  - summary: "x"\n    severity: debt\n    suggested_action: monitor\n',
      'utf-8',
    );
  }

  /** Write a tiny Claude transcript with known token counts; returns its path. */
  function writeTranscript(): string {
    const p = path.join(tempDir, 'transcript.jsonl');
    fs.writeFileSync(
      p,
      JSON.stringify({
        type: 'assistant',
        requestId: 'req_1',
        timestamp: '2026-06-01T00:00:00.000Z',
        message: {
          model: 'claude-opus-4-6',
          usage: { input_tokens: 700, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          content: [],
        },
      }) + '\n',
      'utf-8',
    );
    return p;
  }

  /** Set the injected capture env for a build session with a run id. */
  function setBuildEnv(runId: string): void {
    process.env['ANA_HARNESS'] = 'claude';
    process.env['ANA_ROLE'] = 'build';
    process.env['ANA_CLI_VERSION'] = '1.2.2';
    process.env['ANA_AGENT_DEF_HASH'] = 'sha256:abc';
    process.env['ANA_RUN_ID'] = runId;
    delete process.env['CLAUDE_CODE_SESSION_ID'];
  }

  /** Relative provenance path for the build session. */
  function provRel(slug: string, sessionId: string): string {
    return `.ana/plans/active/${slug}/provenance/build-${sessionId}.json`;
  }

  // @ana A009
  it('commits the provenance file in the SAME commit as the artifact (saveArtifact)', () => {
    initRepo();
    createBuildReport('test-slug');
    const transcript = writeTranscript();
    setBuildEnv('run-1');
    writePendingPointer('run-1', {
      session_id: 'sess-1',
      transcript_path: transcript,
      model: 'claude-opus-4-6',
      source: 'startup',
      captured_at: '2026-06-07T22:00:00.000Z',
    });

    const before = git('rev-list --count HEAD').trim();
    process.chdir(tempDir);
    saveArtifact('build-report', 'test-slug');

    // Exactly ONE new commit.
    const after = git('rev-list --count HEAD').trim();
    expect(Number(after) - Number(before)).toBe(1);

    // That commit lists BOTH the artifact and the provenance file.
    const names = git('show --name-only --format= HEAD').split('\n').map((s) => s.trim()).filter(Boolean);
    expect(names).toContain('.ana/plans/active/test-slug/build_report.md');
    expect(names).toContain(provRel('test-slug', 'sess-1'));

    // The committed provenance carries derived counts and no cost_usd.
    const provContent = git(`show HEAD:${provRel('test-slug', 'sess-1')}`);
    const prov = JSON.parse(provContent);
    expect(prov.session_id).toBe('sess-1');
    expect(prov.role).toBe('build');
    expect(prov.captured_at).toBe('2026-06-07T22:00:00.000Z');
    expect(prov.derived.tokens.input).toBe(700);
    expect(provContent).not.toContain('cost_usd');

    // Pointer was consumed.
    expect(fs.existsSync(path.join(tempHome, '.ana', 'forensics', 'pending', 'run-1.json'))).toBe(false);
  });

  // @ana A010
  it('commits the provenance file in the SAME commit as the artifact (saveAllArtifacts)', () => {
    initRepo();
    createBuildReport('test-slug');
    const transcript = writeTranscript();
    setBuildEnv('run-2');
    writePendingPointer('run-2', {
      session_id: 'sess-2',
      transcript_path: transcript,
      model: 'claude-opus-4-6',
      source: 'startup',
      captured_at: '2026-06-07T23:00:00.000Z',
    });

    const before = git('rev-list --count HEAD').trim();
    process.chdir(tempDir);
    saveAllArtifacts('test-slug');

    const after = git('rev-list --count HEAD').trim();
    expect(Number(after) - Number(before)).toBe(1);

    const names = git('show --name-only --format= HEAD').split('\n').map((s) => s.trim()).filter(Boolean);
    expect(names).toContain('.ana/plans/active/test-slug/build_report.md');
    expect(names).toContain(provRel('test-slug', 'sess-2'));
  });

  // @ana A013, A014
  it('a no-work re-validation prints "No changes to save", exits 0, stages no provenance', () => {
    initRepo();
    createBuildReport('test-slug');
    const transcript = writeTranscript();
    setBuildEnv('run-3');
    writePendingPointer('run-3', {
      session_id: 'sess-3',
      transcript_path: transcript,
      model: 'claude-opus-4-6',
      source: 'startup',
      captured_at: '2026-06-07T22:00:00.000Z',
    });

    process.chdir(tempDir);
    // First save commits the artifact + provenance.
    saveArtifact('build-report', 'test-slug');
    const afterFirst = git('rev-list --count HEAD').trim();

    // Second save: same artifact (byte-identical). Force provenance to be produced
    // again via the Claude session fallback, to prove the guard ignores it.
    delete process.env['ANA_RUN_ID'];
    process.env['CLAUDE_CODE_SESSION_ID'] = 'sess-3';

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ExitError(code ?? 0);
    }) as never);

    let exitCode: number | undefined;
    try {
      saveArtifact('build-report', 'test-slug');
    } catch (e) {
      if (e instanceof ExitError) exitCode = e.code;
      else throw e;
    }

    const stdout = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    exitSpy.mockRestore();
    logSpy.mockRestore();

    // A013: exit 0. A014: the up-to-date message.
    expect(exitCode).toBe(0);
    expect(stdout).toContain('No changes to save');

    // No new commit was created.
    expect(git('rev-list --count HEAD').trim()).toBe(afterFirst);

    // Nothing is left staged (the provenance we re-wrote was reset).
    const stagedStatus = execSync('git diff --staged --quiet', { cwd: tempDir }).toString();
    // (exit 0 means clean — execSync throws on non-zero, so reaching here is clean)
    expect(stagedStatus).toBe('');
  });
});
