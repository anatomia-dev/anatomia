/**
 * buildCensus() — gather project-wide facts into a single value object.
 *
 * Uses @manypkg/get-packages to discover workspace packages, then walks
 * each source root for config files, framework hints, schemas, deployments,
 * and CI workflows. The resulting ProjectCensus is immutable and passed to
 * every detector as pure function input — curing Disease A (Monorepo Blindness).
 */

import * as path from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { getPackages } from '@manypkg/get-packages';

/** Normalize a relative path to forward slashes (posix style) for cross-platform consistency. */
const toPosix = (p: string): string => p.replace(/\\/g, '/');
import { getTsconfig } from 'get-tsconfig';
import type {
  ProjectCensus,
  SourceRoot,
  FrameworkHintEntry,
  TsconfigEntry,
  SchemaFileEntry,
  DeploymentEntry,
  CiWorkflowEntry,
} from './types/census.js';

// ── Config file patterns ───────────────────────────────────────────────

/** Files that hint at a framework being present in a source root. */
const FRAMEWORK_HINTS: Array<{ pattern: string; framework: string; check: 'file' | 'dir' }> = [
  // Next.js
  { pattern: 'next.config.ts', framework: 'nextjs', check: 'file' },
  { pattern: 'next.config.js', framework: 'nextjs', check: 'file' },
  { pattern: 'next.config.mjs', framework: 'nextjs', check: 'file' },
  { pattern: 'app', framework: 'nextjs-app-dir', check: 'dir' },
  { pattern: 'pages', framework: 'nextjs', check: 'dir' },
  // Remix / React Router v7
  { pattern: 'remix.config.js', framework: 'remix', check: 'file' },
  { pattern: 'remix.config.ts', framework: 'remix', check: 'file' },
  { pattern: 'react-router.config.ts', framework: 'react-router', check: 'file' },
  // Astro
  { pattern: 'astro.config.mjs', framework: 'astro', check: 'file' },
  { pattern: 'astro.config.ts', framework: 'astro', check: 'file' },
  // NestJS
  { pattern: 'src/main.ts', framework: 'nestjs', check: 'file' },
  // Express (entry points that signal Express usage)
  { pattern: 'server.js', framework: 'express', check: 'file' },
  { pattern: 'src/server.js', framework: 'express', check: 'file' },
  { pattern: 'app.js', framework: 'express', check: 'file' },
  { pattern: 'src/app.js', framework: 'express', check: 'file' },
  // React (standalone, not via Next.js/Remix)
  { pattern: 'src/App.tsx', framework: 'react', check: 'file' },
  { pattern: 'src/App.jsx', framework: 'react', check: 'file' },
  // Python
  { pattern: 'manage.py', framework: 'django', check: 'file' },
  { pattern: 'app.py', framework: 'flask', check: 'file' },
];

/** Deployment config file → platform name. */
const DEPLOYMENT_CONFIGS: Record<string, string> = {
  'vercel.json': 'Vercel',
  'Dockerfile': 'Docker',
  'docker-compose.yml': 'Docker Compose',
  'docker-compose.yaml': 'Docker Compose',
  'compose.yml': 'Docker Compose',
  'compose.yaml': 'Docker Compose',
  'railway.toml': 'Railway',
  'fly.toml': 'Fly.io',
  'render.yaml': 'Render',
  'Procfile': 'Heroku',
  'netlify.toml': 'Netlify',
  'app.yaml': 'Google Cloud',
  'firebase.json': 'Firebase',
  'wrangler.toml': 'Cloudflare Workers',
  'wrangler.json': 'Cloudflare Workers',
  'wrangler.jsonc': 'Cloudflare Workers',
  'Chart.yaml': 'Helm',
  'kustomization.yaml': 'Kubernetes',
  'cdk.json': 'AWS CDK',
  'Pulumi.yaml': 'Pulumi',
  'serverless.yml': 'Serverless Framework',
  'serverless.yaml': 'Serverless Framework',
};

/** Source file extensions to count. */
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs']);
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.next', 'build', '.git', '__pycache__', '.turbo']);

// ── Primary source root selection ──────────────────────────────────────

/**
 * Select the primary source root using the locked policy:
 * 1. First root under `apps/` with framework evidence
 * 2. First root with the most files
 * 3. rootPath itself (fallback)
 */
function selectPrimary(
  roots: SourceRoot[],
  frameworkHints: FrameworkHintEntry[],
): string {
  // Policy 1: largest apps/ root with framework evidence (by file count).
  // Sort descending so the biggest app wins, not the first alphabetically.
  // Cal.com: apps/web (1646 files) beats apps/docs (7 files).
  const hintPaths = new Set(frameworkHints.map(h => h.sourceRootPath));
  const appsWithFramework = roots
    .filter(r => r.relativePath.startsWith('apps/') && hintPaths.has(r.relativePath))
    .sort((a, b) => b.fileCount - a.fileCount);
  if (appsWithFramework.length > 0) return appsWithFramework[0]!.relativePath;

  // Policy 2: root with most files
  const sorted = [...roots].sort((a, b) => b.fileCount - a.fileCount);
  if (sorted.length > 0) return sorted[0]!.relativePath;

  // Fallback
  return '.';
}

// ── File counting ──────────────────────────────────────────────────────

function countSourceFiles(dir: string): number {
  let count = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        count += countSourceFiles(full);
      } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        count++;
      }
    }
  } catch {
    // Permission error or similar — return what we have
  }
  return count;
}

// ── Config discovery ───────────────────────────────────────────────────

function discoverFrameworkHints(
  rootPath: string,
  roots: Array<{ absolutePath: string; relativePath: string }>,
): FrameworkHintEntry[] {
  const hints: FrameworkHintEntry[] = [];
  for (const root of roots) {
    for (const { pattern, framework, check } of FRAMEWORK_HINTS) {
      const full = path.join(root.absolutePath, pattern);
      if (existsSync(full)) {
        try {
          const isDir = check === 'dir';
          // For directories, verify non-empty (empty dirs aren't evidence)
          if (isDir && readdirSync(full).length === 0) continue;
          hints.push({
            framework,
            sourceRootPath: root.relativePath,
            path: toPosix(path.relative(rootPath, full)),
          });
        } catch {
          // Skip inaccessible entries
        }
      }
    }
  }
  return hints;
}

function discoverTsconfigs(
  rootPath: string,
  roots: Array<{ absolutePath: string; relativePath: string }>,
): TsconfigEntry[] {
  const entries: TsconfigEntry[] = [];
  for (const root of roots) {
    const tsconfigPath = path.join(root.absolutePath, 'tsconfig.json');
    if (existsSync(tsconfigPath)) {
      let paths: Record<string, string[]> | null = null;
      let baseUrl: string | null = null;
      try {
        // get-tsconfig handles JSONC (comments, trailing commas) and
        // resolves `extends` chains — a tsconfig that inherits paths from
        // a shared config package gets the resolved result.
        const result = getTsconfig(root.absolutePath);
        if (result) {
          const opts = result.config.compilerOptions;
          if (opts?.paths) paths = opts.paths as Record<string, string[]>;
          if (opts?.baseUrl) baseUrl = opts.baseUrl as string;
        }
      } catch {
        // Malformed or unresolvable tsconfig — record it exists but skip paths
      }
      entries.push({
        sourceRootPath: root.relativePath,
        path: toPosix(path.relative(rootPath, tsconfigPath)),
        paths,
        baseUrl,
      });
    }
  }
  return entries;
}

function discoverSchemas(
  rootPath: string,
  roots: Array<{ absolutePath: string; relativePath: string }>,
): SchemaFileEntry[] {
  const entries: SchemaFileEntry[] = [];
  for (const root of roots) {
    // Prisma — check both conventional locations:
    // - {root}/prisma/schema.prisma (monolith, most monorepos)
    // - {root}/schema.prisma (prisma package root, e.g., cal.com's @calcom/prisma)
    // Report ALL candidates found — scan-engine's scorer picks the best one.
    let foundPrismaFile = false;
    for (const candidate of ['prisma/schema.prisma', 'schema.prisma']) {
      const prismaPath = path.join(root.absolutePath, candidate);
      if (existsSync(prismaPath)) {
        entries.push({
          orm: 'prisma',
          sourceRootPath: root.relativePath,
          path: toPosix(path.relative(rootPath, prismaPath)),
        });
        foundPrismaFile = true;
      }
    }
    // Directory-only fallback: if no file candidate was found, check whether
    // prisma/ exists and contains .prisma files (multi-file schema without
    // a traditional schema.prisma anchor).
    if (!foundPrismaFile) {
      const prismaDir = path.join(root.absolutePath, 'prisma');
      if (existsSync(prismaDir)) {
        try {
          const dirFiles = readdirSync(prismaDir);
          const hasPrismaFiles = dirFiles.some(f => f.endsWith('.prisma'));
          if (hasPrismaFiles) {
            entries.push({
              orm: 'prisma',
              sourceRootPath: root.relativePath,
              path: toPosix(path.relative(rootPath, prismaDir)) + '/',
            });
          }
        } catch {
          // Permission error — skip
        }
      }
    }
    // Drizzle — read drizzle.config.{ts,js,mjs} to extract the schema path.
    // Config lives at the project root (not per source root), so check rootPath
    // first. Avoid duplicates if the root IS a source root.
    const drizzleConfigCandidates = ['drizzle.config.ts', 'drizzle.config.js', 'drizzle.config.mjs'];
    const searchRoots: string[] = [];
    // Always check the project root
    searchRoots.push(rootPath);
    // Add source root if it differs from rootPath
    if (root.absolutePath !== rootPath) {
      searchRoots.push(root.absolutePath);
    }
    for (const searchRoot of searchRoots) {
      for (const configName of drizzleConfigCandidates) {
        const configPath = path.join(searchRoot, configName);
        if (!existsSync(configPath)) continue;
        try {
          const configContent = readFileSync(configPath, 'utf-8');
          // Extract schema field: schema: "./src/db/schema" or schema: './src/db/schema.ts'
          const schemaMatch = configContent.match(/schema\s*:\s*["']([^"']+)["']/);
          if (schemaMatch?.[1]) {
            let schemaPath = schemaMatch[1];
            // Strip leading ./ for consistency with other census paths
            if (schemaPath.startsWith('./')) schemaPath = schemaPath.slice(2);
            // Path is relative to the config file location (searchRoot)
            const absoluteSchemaPath = path.join(searchRoot, schemaPath);
            entries.push({
              orm: 'drizzle',
              sourceRootPath: root.relativePath,
              path: toPosix(path.relative(rootPath, absoluteSchemaPath)),
            });
          }
          // Dialect extraction moved to scan-engine — it reads the config
          // file directly during scoring, keeping census as pure location discovery.
        } catch {
          // Config file unreadable — skip
        }
        // Found a config in this search root — don't check other extensions
        break;
      }
    }
  }
  return entries;
}

/**
 * Discover deployment platform configs across all source roots.
 * @param rootPath - Absolute path to the project root
 * @param roots - Source root descriptors with absolute and relative paths
 * @returns Array of deployment entries found
 */
export function discoverDeployments(
  rootPath: string,
  roots: Array<{ absolutePath: string; relativePath: string }>,
): DeploymentEntry[] {
  const entries: DeploymentEntry[] = [];
  for (const root of roots) {
    for (const [file, platform] of Object.entries(DEPLOYMENT_CONFIGS)) {
      const full = path.join(root.absolutePath, file);
      if (existsSync(full)) {
        entries.push({
          platform,
          sourceRootPath: root.relativePath,
          path: toPosix(path.relative(rootPath, full)),
        });
      }
    }
  }
  return entries;
}

/**
 * Discover CI/CD workflow configurations at the project root.
 * @param rootPath - Absolute path to the project root
 * @returns Array of CI workflow entries found
 */
export function discoverCiWorkflows(rootPath: string): CiWorkflowEntry[] {
  const entries: CiWorkflowEntry[] = [];

  // GitHub Actions — at repo root, not per source root
  const workflowsDir = path.join(rootPath, '.github', 'workflows');
  if (existsSync(workflowsDir)) {
    try {
      const files = readdirSync(workflowsDir).filter(
        f => f.endsWith('.yml') || f.endsWith('.yaml'),
      );
      if (files.length > 0) {
        entries.push({ system: 'GitHub Actions', workflowFiles: files });
      }
    } catch {
      // Permission error
    }
  }

  // GitLab CI
  if (existsSync(path.join(rootPath, '.gitlab-ci.yml'))) {
    entries.push({ system: 'GitLab CI', workflowFiles: ['.gitlab-ci.yml'] });
  }

  // CircleCI
  if (existsSync(path.join(rootPath, '.circleci/config.yml'))) {
    entries.push({ system: 'CircleCI', workflowFiles: ['.circleci/config.yml'] });
  }

  // Jenkins
  if (existsSync(path.join(rootPath, 'Jenkinsfile'))) {
    entries.push({ system: 'Jenkins', workflowFiles: ['Jenkinsfile'] });
  }

  // Bitbucket Pipelines
  if (existsSync(path.join(rootPath, 'bitbucket-pipelines.yml'))) {
    entries.push({ system: 'Bitbucket Pipelines', workflowFiles: ['bitbucket-pipelines.yml'] });
  }

  return entries;
}

// ── Main ───────────────────────────────────────────────────────────────

export async function buildCensus(rootPath: string): Promise<ProjectCensus> {
  const start = Date.now();
  const normalizedRoot = path.resolve(rootPath).replace(/\/+$/, '');

  // @manypkg/get-packages throws if no package.json exists (Python, Go, Rust,
  // empty directories). Fall back to a single source root with no deps.
  let result: Awaited<ReturnType<typeof getPackages>> | null = null;
  try {
    result = await getPackages(normalizedRoot);
  } catch {
    // Non-Node project or empty directory — continue with fallback
    // Future target: non-Node monorepo support (Python workspaces, Go modules)
  }

  // @manypkg returns tool.type 'root' when it can't determine the package manager.
  // packages[] always includes the root package itself, so check for non-root packages.
  const nonRootPackages = result?.packages.filter(p => p.relativeDir !== '.') ?? [];
  const isSingleRepo = !result || (result.tool.type === 'root' && nonRootPackages.length === 0);

  // Project name from root package.json or directory name
  const projectName = result?.rootPackage?.packageJson?.name ?? path.basename(normalizedRoot);

  // Build source roots
  let sourceRoots: SourceRoot[];
  if (!result) {
    // No package.json — single root with no deps
    sourceRoots = [{
      absolutePath: normalizedRoot,
      relativePath: '.',
      packageName: null,
      fileCount: countSourceFiles(normalizedRoot),
      isPrimary: true,
      deps: {},
      devDeps: {},
      hasBin: false,
    }];
  } else if (isSingleRepo) {
    const pkg = result.rootPackage!;
    sourceRoots = [{
      absolutePath: normalizedRoot,
      relativePath: '.',
      packageName: pkg.packageJson.name ?? null,
      fileCount: countSourceFiles(normalizedRoot),
      isPrimary: true,
      deps: (pkg.packageJson.dependencies ?? {}) as Record<string, string>,
      devDeps: (pkg.packageJson.devDependencies ?? {}) as Record<string, string>,
      hasBin: !!((pkg.packageJson as unknown as Record<string, unknown>)['bin']),
    }];
  } else {
    sourceRoots = result.packages.map(pkg => {
      const abs = pkg.dir;
      const rel = toPosix(path.relative(normalizedRoot, abs));
      return {
        absolutePath: abs,
        relativePath: rel,
        packageName: pkg.packageJson.name ?? null,
        fileCount: countSourceFiles(abs),
        isPrimary: false, // set below after primary selection
        deps: (pkg.packageJson.dependencies ?? {}) as Record<string, string>,
        devDeps: (pkg.packageJson.devDependencies ?? {}) as Record<string, string>,
        hasBin: !!((pkg.packageJson as unknown as Record<string, unknown>)['bin']),
      };
    });
  }

  // Build deps maps
  const allDeps: Record<string, string> = {};
  const deps: Record<string, string> = {};
  const devDeps: Record<string, string> = {};
  for (const root of sourceRoots) {
    Object.assign(deps, root.deps);
    Object.assign(devDeps, root.devDeps);
  }
  Object.assign(allDeps, deps, devDeps);

  // Root devDeps — toolchain deps (testing, linting) that live in the root
  // package.json but not in any workspace package. Separated from allDeps
  // because root deps are toolchain, not stack — but testing frameworks
  // in root devDeps (like @playwright/test) should still be detected.
  const rootDevDeps = (result?.rootPackage?.packageJson?.devDependencies ?? {}) as Record<string, string>;

  // Discover configs (pass all roots for per-root discovery)
  const rootDescriptors = sourceRoots.map(r => ({
    absolutePath: r.absolutePath,
    relativePath: r.relativePath,
  }));
  const frameworkHints = discoverFrameworkHints(normalizedRoot, rootDescriptors);
  const tsconfigs = discoverTsconfigs(normalizedRoot, rootDescriptors);
  const schemas = discoverSchemas(normalizedRoot, rootDescriptors);
  const deployments = discoverDeployments(normalizedRoot, rootDescriptors);
  const ciWorkflows = discoverCiWorkflows(normalizedRoot);

  // Select primary source root (monorepo only — single-repo already has isPrimary=true)
  let primarySourceRoot: string;
  if (isSingleRepo) {
    primarySourceRoot = '.';
  } else {
    primarySourceRoot = selectPrimary(sourceRoots, frameworkHints);
    // Set isPrimary on the selected root
    for (const root of sourceRoots) {
      root.isPrimary = root.relativePath === primarySourceRoot;
    }
    // Sort: primary first
    sourceRoots.sort((a, b) => (a.isPrimary ? -1 : 0) - (b.isPrimary ? -1 : 0));
  }

  // Map tool.type to monorepoTool. 'root' means @manypkg couldn't detect the
  // package manager (no lockfile) — use 'npm' as fallback for monorepos.
  const monorepoTool = (isSingleRepo || !result) ? null
    : (result.tool.type === 'root' ? 'npm' : result.tool.type);

  // Primary root deps — for identity-scoped detection (framework, uiSystem).
  // In monorepos, the primary package's deps define the project identity.
  // In single-repos, primaryDeps === allDeps (no distinction needed).
  const primaryRoot = sourceRoots.find(r => r.isPrimary)!;
  const primaryDeps: Record<string, string> = { ...primaryRoot.deps, ...primaryRoot.devDeps };

  return {
    rootPath: normalizedRoot,
    projectName,
    layout: isSingleRepo ? 'single-repo' : 'monorepo',
    monorepoTool,
    sourceRoots,
    primarySourceRoot,
    allDeps,
    deps,
    devDeps,
    rootDevDeps,
    primaryDeps,
    configs: {
      frameworkHints,
      tsconfigs,
      schemas,
      deployments,
      ciWorkflows,
    },
    builtAt: new Date().toISOString(),
    buildDurationMs: Date.now() - start,
  };
}
