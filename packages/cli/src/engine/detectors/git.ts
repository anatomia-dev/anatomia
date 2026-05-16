/**
 * Git repository detection
 *
 * Detects git metadata: HEAD, branch, commit count, contributors, etc.
 * Gracefully returns nulls if not a git repo.
 */

import { execSync } from 'node:child_process';

export interface GitInfo {
  head: string | null;
  branch: string | null;
  commitCount: number | null;
  lastCommitAt: string | null;
  uncommittedChanges: boolean;
  contributorCount: number | null;
  defaultBranch: string | null;
  branches: string[] | null;
  // Workflow pattern detection
  commitFormat: {
    conventional: boolean;
    confidence: number;
    sampleSize: number;
  } | null;
  branchPatterns: {
    prefixes: Record<string, number>;
    primary: string | null;
  } | null;
  hooks: {
    preCommit: {
      exists: boolean;
      runsTests: boolean;
      runsLint: boolean;
      runsTypecheck: boolean;
    };
  } | null;
  mergeStrategy: {
    strategy: 'merge' | 'squash' | 'rebase' | 'mixed';
    confidence: number;
  } | null;
  coAuthor: {
    detected: boolean;
    pattern: string | null;
  } | null;
  // Project activity signals
  recentActivity: {
    windowDays: number;
    highChurnFiles: Array<{ path: string; commits: number }>;
    activeContributors: number;
    weeklyCommits: number[];
  } | null;
}

function gitExec(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

/**
 * Detect the default branch via 4-step priority:
 * 1. symbolic-ref (fastest, most reliable)
 * 2. remote show (slower, contacts remote)
 * 3. common names (check local refs)
 * 4. fallback to current branch
 */
function detectDefaultBranch(cwd: string, currentBranch: string | null): string | null {
  // Step 1: symbolic-ref refs/remotes/origin/HEAD
  const symbolicRef = gitExec('git symbolic-ref refs/remotes/origin/HEAD', cwd);
  if (symbolicRef) {
    // "refs/remotes/origin/main" → "main"
    const parts = symbolicRef.split('/');
    return parts[parts.length - 1] ?? null;
  }

  // Step 2: remote show origin → parse "HEAD branch:" line
  const remoteShow = gitExec('git remote show origin', cwd);
  if (remoteShow) {
    const match = remoteShow.match(/HEAD branch:\s*(.+)/);
    if (match && match[1] && match[1].trim() !== '(unknown)') {
      return match[1].trim();
    }
  }

  // Step 3: check common branch names that exist locally
  for (const name of ['main', 'master', 'develop', 'dev']) {
    const exists = gitExec(`git rev-parse --verify ${name}`, cwd);
    if (exists) return name;
  }

  // Step 4: fallback to current branch
  return currentBranch;
}

/** Known bot branch prefixes to exclude from shared intelligence. */
const BOT_BRANCH_PREFIXES = new Set([
  'dependabot/',
  'renovate/',
  'snyk-',
  'greenkeeper/',
  'imgbot/',
]);

/**
 * Check if a branch name starts with any known bot prefix.
 */
function isBotBranch(name: string): boolean {
  for (const prefix of BOT_BRANCH_PREFIXES) {
    if (name.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Detect branches visible on the remote (shared state only).
 * Falls back to local branches when no remote is configured.
 */
function detectBranches(cwd: string): string[] | null {
  // Check if any remote exists
  const remotes = gitExec('git remote', cwd);

  if (!remotes) {
    // No remote — fall back to local branches
    const output = gitExec('git branch', cwd);
    if (!output) return null;

    const seen = new Set<string>();
    for (const line of output.split('\n')) {
      let name = line.trim();
      if (!name) continue;
      name = name.replace(/^[*+] /, '');
      if (name.includes(' -> ')) continue;
      seen.add(name);
    }
    return [...seen].sort();
  }

  // Remote exists — use only remote-tracking branches
  const output = gitExec('git branch -r', cwd);
  if (!output) return [];

  const seen = new Set<string>();
  for (const line of output.split('\n')) {
    const name = line.trim().replace(/^origin\//, '');
    if (!name || name.includes(' -> ') || name === 'HEAD') continue;
    if (isBotBranch(name)) continue;
    seen.add(name);
  }

  return [...seen].sort();
}

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Detect commit format from recent commit messages.
 */
function detectCommitFormat(cwd: string): GitInfo['commitFormat'] {
  const output = gitExec('git log --format=%s -50', cwd);
  if (!output) return null;

  const messages = output.split('\n').filter(Boolean);
  if (messages.length === 0) return null;

  // Conventional commits: feat:, fix:, chore:, docs:, refactor:, test:, ci:, style:, perf:, build:
  const conventionalPattern = /^(feat|fix|chore|docs|refactor|test|ci|style|perf|build)(\(.+\))?(!)?:/;
  const matchCount = messages.filter(m => conventionalPattern.test(m)).length;
  const confidence = matchCount / messages.length;

  return {
    conventional: confidence > 0.5,
    confidence: Math.round(confidence * 100) / 100,
    sampleSize: messages.length,
  };
}

/**
 * Detect branch naming patterns from remote branches.
 */
function detectBranchPatterns(cwd: string): GitInfo['branchPatterns'] {
  const output = gitExec('git branch -r', cwd);
  if (!output) return { prefixes: {}, primary: null };

  const prefixes: Record<string, number> = {};
  for (const line of output.split('\n')) {
    const name = line.trim().replace(/^origin\//, '');
    if (!name || name.includes(' -> ') || name === 'HEAD') continue;
    if (isBotBranch(name)) continue;
    // Extract prefix: feature/foo → feature/, fix/bar → fix/
    const slashIdx = name.indexOf('/');
    if (slashIdx > 0) {
      const prefix = name.slice(0, slashIdx + 1);
      prefixes[prefix] = (prefixes[prefix] || 0) + 1;
    }
  }

  // Primary = most frequent prefix
  let primary: string | null = null;
  let maxCount = 0;
  for (const [prefix, count] of Object.entries(prefixes)) {
    if (count > maxCount) {
      primary = prefix;
      maxCount = count;
    }
  }

  return { prefixes, primary };
}

/**
 * Detect pre-commit hook existence and what it runs.
 */
function detectHooks(cwd: string): GitInfo['hooks'] {
  // Check Husky first (most common), then bare git hooks
  const huskyPath = join(cwd, '.husky', 'pre-commit');
  const gitHookPath = join(cwd, '.git', 'hooks', 'pre-commit');

  let hookContent: string | null = null;
  if (existsSync(huskyPath)) {
    try { hookContent = readFileSync(huskyPath, 'utf-8'); } catch { /* */ }
  } else if (existsSync(gitHookPath)) {
    try { hookContent = readFileSync(gitHookPath, 'utf-8'); } catch { /* */ }
  }

  if (!hookContent) {
    return { preCommit: { exists: false, runsTests: false, runsLint: false, runsTypecheck: false } };
  }

  const lower = hookContent.toLowerCase();
  return {
    preCommit: {
      exists: true,
      runsTests: /\btest\b|\bvitest\b|\bjest\b|\bmocha\b|\bpytest\b/.test(lower),
      runsLint: /\blint\b|\beslint\b|\bbiome\b|\bprettier\b/.test(lower),
      runsTypecheck: /\btypecheck\b|\btsc\b/.test(lower),
    },
  };
}

/**
 * Detect merge strategy from commit history.
 */
function detectMergeStrategy(cwd: string, defaultBranch: string | null): GitInfo['mergeStrategy'] {
  if (!defaultBranch) return null;
  const output = gitExec(`git log --merges --oneline -20 ${defaultBranch}`, cwd);
  if (output === null) return null;

  const mergeCount = output ? output.split('\n').filter(Boolean).length : 0;

  let strategy: 'merge' | 'squash' | 'rebase' | 'mixed';
  let confidence: number;

  if (mergeCount >= 15) {
    strategy = 'merge';
    confidence = Math.min(1, mergeCount / 20);
  } else if (mergeCount === 0) {
    strategy = 'squash'; // or rebase — can't distinguish without more analysis
    confidence = 0.7;
  } else {
    strategy = 'mixed';
    confidence = 0.5;
  }

  return { strategy, confidence: Math.round(confidence * 100) / 100 };
}

/**
 * Detect co-author trailer usage.
 */
function detectCoAuthor(cwd: string): GitInfo['coAuthor'] {
  const output = gitExec('git log --format=%b -20', cwd);
  if (!output) return { detected: false, pattern: null };

  const trailers = output.match(/Co-authored-by:\s*(.+)/g);
  if (!trailers || trailers.length === 0) return { detected: false, pattern: null };

  // Extract the most common co-author
  const counts: Record<string, number> = {};
  for (const t of trailers) {
    counts[t] = (counts[t] || 0) + 1;
  }
  const primary = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return {
    detected: true,
    pattern: primary ? primary[0].replace('Co-authored-by: ', '') : null,
  };
}

/** Source file extensions for high-churn filtering. */
const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.rb', '.swift', '.kt',
]);

/**
 * Detect recent project activity signals.
 * Returns null for shallow clones. Returns empty data for zero-activity repos.
 */
function detectRecentActivity(cwd: string): GitInfo['recentActivity'] {
  // Check for shallow clone
  const isShallow = gitExec('git rev-parse --is-shallow-repository', cwd);
  if (isShallow === 'true') return null;

  // Adaptive window: narrow to 14 days if >300 commits in 30 days
  const countStr = gitExec('git rev-list --count --since="30 days ago" HEAD', cwd);
  const count30d = countStr ? parseInt(countStr, 10) : 0;
  const windowDays = count30d > 300 ? 14 : 30;

  // High-churn files
  const churnOutput = gitExec(`git log --since="${windowDays} days ago" --name-only --format=""`, cwd);
  const fileCounts = new Map<string, number>();
  if (churnOutput) {
    for (const line of churnOutput.split('\n')) {
      const file = line.trim();
      if (!file) continue;
      // Filter to source extensions + src/ markdown
      const ext = file.substring(file.lastIndexOf('.'));
      const isSourceExt = SOURCE_EXTENSIONS.has(ext);
      const isSrcMarkdown = ext === '.md' && (file.startsWith('src/') || file.includes('/src/'));
      if (!isSourceExt && !isSrcMarkdown) continue;
      fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
    }
  }
  const highChurnFiles = [...fileCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, commits]) => ({ path, commits }));

  // Active contributors
  const contribOutput = gitExec(`git shortlog -sn --since="${windowDays} days ago" HEAD`, cwd);
  const activeContributors = contribOutput
    ? contribOutput.split('\n').filter(l => l.trim().length > 0).length
    : 0;

  // Weekly commit tempo (4 weeks, newest first)
  const tempoOutput = gitExec('git log --format="%ct" --since="28 days ago"', cwd);
  const weeklyCommits = [0, 0, 0, 0];
  if (tempoOutput) {
    const now = Date.now() / 1000;
    const weekSeconds = 7 * 24 * 3600;
    for (const line of tempoOutput.split('\n')) {
      const ts = parseInt(line.trim(), 10);
      if (isNaN(ts)) continue;
      const age = now - ts;
      const bucket = Math.min(Math.floor(age / weekSeconds), 3) as 0 | 1 | 2 | 3;
      weeklyCommits[bucket] = (weeklyCommits[bucket] ?? 0) + 1;
    }
  }

  return { windowDays, highChurnFiles, activeContributors, weeklyCommits };
}

/**
 * Detect git repository information.
 * Returns nulls for all fields if not a git repo or git is unavailable.
 */
export async function detectGitInfo(cwd: string): Promise<GitInfo> {
  // Check if this is a git repo
  const head = gitExec('git rev-parse --short HEAD', cwd);
  if (!head) {
    // Might still be a git repo with no commits
    const isGitRepo = gitExec('git rev-parse --git-dir', cwd);
    if (!isGitRepo) {
      return {
        head: null,
        branch: null,
        commitCount: null,
        lastCommitAt: null,
        uncommittedChanges: false,
        contributorCount: null,
        defaultBranch: null,
        branches: null,
        commitFormat: null,
        branchPatterns: null,
        hooks: null,
        mergeStrategy: null,
        coAuthor: null,
        recentActivity: null,
      };
    }
    // Git repo with no commits — use symbolic-ref to get branch name
    const branch = gitExec('git symbolic-ref --short HEAD', cwd);
    return {
      head: null,
      branch,
      commitCount: 0,
      lastCommitAt: null,
      uncommittedChanges: false,
      contributorCount: null,
      defaultBranch: branch,
      branches: branch ? [branch] : [],
      commitFormat: null,
      branchPatterns: null,
      hooks: detectHooks(cwd),
      mergeStrategy: null,
      coAuthor: null,
      recentActivity: null,
    };
  }

  const branch = gitExec('git rev-parse --abbrev-ref HEAD', cwd);

  const commitCountStr = gitExec('git rev-list --count HEAD', cwd);
  const commitCount = commitCountStr ? parseInt(commitCountStr, 10) : null;

  const lastCommitAt = gitExec('git log -1 --format=%aI', cwd);

  const statusOutput = gitExec('git status --porcelain', cwd);
  const uncommittedChanges = statusOutput !== null && statusOutput.length > 0;

  const contributorStr = gitExec('git shortlog -sn --all', cwd);
  const contributorCount = contributorStr
    ? contributorStr.split('\n').filter(l => l.trim().length > 0).length
    : null;

  const defaultBranch = detectDefaultBranch(cwd, branch);
  const branches = detectBranches(cwd);

  return {
    head,
    branch,
    commitCount,
    lastCommitAt,
    uncommittedChanges,
    contributorCount,
    defaultBranch,
    branches,
    commitFormat: detectCommitFormat(cwd),
    branchPatterns: detectBranchPatterns(cwd),
    hooks: detectHooks(cwd),
    mergeStrategy: detectMergeStrategy(cwd, defaultBranch),
    coAuthor: detectCoAuthor(cwd),
    recentActivity: detectRecentActivity(cwd),
  };
}
