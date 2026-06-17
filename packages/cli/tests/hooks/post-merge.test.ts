import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

/**
 * Integration tests for the `.husky/post-merge` hook — the dev-binary auto-rebuild.
 *
 * The hook must: rebuild only when CLI source/deps changed; `pnpm install` BEFORE
 * building when deps changed (the root-cause fix for the anatrace-core staleness);
 * NEVER block the pull (always exit 0); and on any failure leave a LOUD, persistent
 * `dist/.build-stale` marker (cleared by a later success). We drive the real hook
 * against a throwaway git repo with a stubbed `pnpm` whose per-subcommand exit codes
 * we control, and assert behavior + ordering from the marker, exit code, and stderr.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.resolve(HERE, '../../../../.husky/post-merge');
const MARKER_REL = 'packages/cli/dist/.build-stale';

const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
};

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function git(repo: string, args: string[]): string {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf-8', env: { ...process.env, ...GIT_ENV } });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

/** A throwaway git repo shaped like the monorepo, with a stub `pnpm` on PATH. */
function setupRepo(): { repo: string; stubBin: string; pnpmLog: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'post-merge-'));
  tmpDirs.push(repo);
  fs.mkdirSync(path.join(repo, 'packages/cli/src'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'packages/cli/dist'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'packages/cli/package.json'), '{"name":"anatomia-cli"}\n');
  fs.writeFileSync(path.join(repo, 'packages/cli/src/x.ts'), 'export const x = 1;\n');
  fs.writeFileSync(path.join(repo, 'packages/cli/dist/index.js'), '// built\n');
  fs.writeFileSync(path.join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  fs.writeFileSync(path.join(repo, 'README.md'), '# repo\n');

  git(repo, ['init', '-q']);
  git(repo, ['config', 'commit.gpgsign', 'false']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'A']);

  // Stub pnpm: logs every invocation, exits per-subcommand via env.
  const stubBin = fs.mkdtempSync(path.join(os.tmpdir(), 'stub-bin-'));
  tmpDirs.push(stubBin);
  const pnpmLog = path.join(stubBin, 'pnpm.log');
  fs.writeFileSync(
    path.join(stubBin, 'pnpm'),
    `#!/bin/sh\necho "$@" >> "${pnpmLog}"\ncase "$1" in\n  install) exit "\${FAKE_INSTALL_EXIT:-0}" ;;\n  run) exit "\${FAKE_BUILD_EXIT:-0}" ;;\n  *) exit 0 ;;\nesac\n`,
    { mode: 0o755 },
  );
  return { repo, stubBin, pnpmLog };
}

/** Make a second commit touching `files`, then point ORIG_HEAD at the first commit. */
function mergeChanging(repo: string, files: Record<string, string>): void {
  const first = git(repo, ['rev-parse', 'HEAD']);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(repo, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'B']);
  git(repo, ['update-ref', 'ORIG_HEAD', first]); // simulate the pre-merge HEAD
}

function runHook(
  repo: string,
  stubBin: string,
  env: Record<string, string> = {},
): { status: number | null; stderr: string; stdout: string } {
  const r = spawnSync('sh', [HOOK], {
    cwd: repo,
    encoding: 'utf-8',
    env: { ...process.env, ...GIT_ENV, PATH: `${stubBin}:${process.env['PATH']}`, ...env },
  });
  return { status: r.status, stderr: r.stderr ?? '', stdout: r.stdout ?? '' };
}

const markerPath = (repo: string): string => path.join(repo, MARKER_REL);

describe('.husky/post-merge', () => {
  it('writes a loud, persistent marker when the rebuild fails — and never blocks the pull', () => {
    const { repo, stubBin } = setupRepo();
    mergeChanging(repo, { 'packages/cli/src/x.ts': 'export const x = 2;\n' });

    const res = runHook(repo, stubBin, { FAKE_BUILD_EXIT: '1' });

    expect(res.status).toBe(0); // NEVER blocks the pull
    expect(fs.existsSync(markerPath(repo))).toBe(true);
    expect(fs.readFileSync(markerPath(repo), 'utf-8')).toContain('build failed');
    expect(res.stderr).toContain('STALE');
  });

  it('clears a pre-existing marker when the rebuild succeeds', () => {
    const { repo, stubBin } = setupRepo();
    fs.writeFileSync(markerPath(repo), 'stale from a prior failure\n');
    mergeChanging(repo, { 'packages/cli/src/x.ts': 'export const x = 3;\n' });

    const res = runHook(repo, stubBin, { FAKE_BUILD_EXIT: '0' });

    expect(res.status).toBe(0);
    expect(fs.existsSync(markerPath(repo))).toBe(false); // cleared on success
  });

  it('does nothing when no CLI source or deps changed', () => {
    const { repo, stubBin, pnpmLog } = setupRepo();
    mergeChanging(repo, { 'README.md': '# changed\n' });

    const res = runHook(repo, stubBin);

    expect(res.status).toBe(0);
    expect(fs.existsSync(markerPath(repo))).toBe(false);
    expect(fs.existsSync(pnpmLog)).toBe(false); // pnpm never invoked
    expect(res.stdout).not.toContain('refreshing');
  });

  it('installs BEFORE building when deps change, and skips the build if install fails (the root-cause fix)', () => {
    const { repo, stubBin, pnpmLog } = setupRepo();
    mergeChanging(repo, { 'packages/cli/package.json': '{"name":"anatomia-cli","x":1}\n' });

    const res = runHook(repo, stubBin, { FAKE_INSTALL_EXIT: '1' });

    expect(res.status).toBe(0);
    expect(fs.existsSync(markerPath(repo))).toBe(true);
    expect(fs.readFileSync(markerPath(repo), 'utf-8')).toContain('install');
    const log = fs.readFileSync(pnpmLog, 'utf-8');
    expect(log).toContain('install'); // install was attempted
    expect(log).not.toContain('run');  // build was NOT reached after install failed
  });

  it('installs then builds successfully when deps change and both succeed', () => {
    const { repo, stubBin, pnpmLog } = setupRepo();
    mergeChanging(repo, { 'pnpm-lock.yaml': 'lockfileVersion: 9\n# bumped\n' });

    const res = runHook(repo, stubBin, { FAKE_INSTALL_EXIT: '0', FAKE_BUILD_EXIT: '0' });

    expect(res.status).toBe(0);
    expect(fs.existsSync(markerPath(repo))).toBe(false);
    const log = fs.readFileSync(pnpmLog, 'utf-8');
    expect(log).toContain('install');
    expect(log).toContain('run'); // build ran after a successful install
  });

  it('rebuilds when templates/ change — they are copied into dist (closes the templates staleness gap)', () => {
    const { repo, stubBin, pnpmLog } = setupRepo();
    mergeChanging(repo, { 'packages/cli/templates/agent.md': '# changed agent\n' });

    const res = runHook(repo, stubBin, { FAKE_BUILD_EXIT: '0' });

    expect(res.status).toBe(0);
    const log = fs.readFileSync(pnpmLog, 'utf-8');
    expect(log).toContain('run'); // build ran (templates are build-relevant)
    expect(log).not.toContain('install'); // but no install (templates aren't deps)
  });

  it('rebuilds when build config (tsconfig) changes — it shapes the emitted binary', () => {
    const { repo, stubBin, pnpmLog } = setupRepo();
    mergeChanging(repo, { 'packages/cli/tsconfig.json': '{"compilerOptions":{}}\n' });

    const res = runHook(repo, stubBin, { FAKE_BUILD_EXIT: '0' });

    expect(res.status).toBe(0);
    expect(fs.readFileSync(pnpmLog, 'utf-8')).toContain('run');
  });
});
