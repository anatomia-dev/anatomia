/**
 * ProjectCensus — shared project model for Disease A cure.
 *
 * Gathered once at pipeline top by buildCensus(), passed to every detector
 * as pure function input. Replaces scattered rootPath-anchored filesystem
 * reads across 9 files with a single value object.
 *
 * Every field is JSON-serializable. No closures, no WASM handles.
 * Detectors read the census; they never mutate it.
 */

// ── Sub-types ──────────────────────────────────────────────────────────

export interface SourceRoot {
  absolutePath: string;
  relativePath: string;                // relative to rootPath
  packageName: string | null;          // from package.json name field
  fileCount: number;                   // post-filter source files
  isPrimary: boolean;
  deps: Record<string, string>;        // this root's own deps (not merged)
  devDeps: Record<string, string>;     // this root's own devDeps
  hasBin: boolean;                     // true when package.json declares a bin field
  scripts: string[];                   // script keys from package.json (e.g., ["build", "dev", "test"])
}

export interface FrameworkHintEntry {
  framework: string;                   // 'nextjs' | 'nextjs-app-dir' | 'react' | 'remix' | 'nestjs' | 'express' | 'django' | 'flask' | 'astro'
  sourceRootPath: string;              // foreign key → SourceRoot.relativePath
  path: string;                        // relative to rootPath (e.g. 'apps/web/next.config.ts')
}

export interface TsconfigEntry {
  sourceRootPath: string;
  path: string;                        // relative to rootPath
  paths: Record<string, string[]> | null;   // compilerOptions.paths if present
  baseUrl: string | null;
}

export interface SchemaFileEntry {
  orm: string;                         // 'prisma' | 'drizzle' | 'typeorm' | 'sequelize'
  sourceRootPath: string;
  path: string;
}

export interface DeploymentEntry {
  platform: string;                    // 'Vercel' | 'Docker' | 'Docker Compose' | 'Railway' | 'Fly.io' | ...
  sourceRootPath: string;
  path: string;
}

export interface CiWorkflowEntry {
  system: string;                      // 'GitHub Actions' | 'GitLab CI' | ...
  workflowFiles: string[];             // ALL workflow files, not files[0]
}

// ── Census ─────────────────────────────────────────────────────────────

export interface ProjectCensus {
  rootPath: string;                    // normalized absolute, no trailing slash
  projectName: string;                 // from root package.json name

  layout: 'single-repo' | 'monorepo';
  monorepoTool: string | null;         // 'pnpm' | 'yarn' | 'npm' | 'turbo' | 'nx' | 'lerna' | null

  // INVARIANT: exactly one SourceRoot has isPrimary=true,
  // and its relativePath equals census.primarySourceRoot.
  sourceRoots: SourceRoot[];           // ordered: primary first. Single-repo = [rootAsSourceRoot]
  primarySourceRoot: string;           // relativePath of the primary source root

  allDeps: Record<string, string>;     // flat merge of deps+devDeps across all source roots
  deps: Record<string, string>;        // production deps only, merged across roots
  devDeps: Record<string, string>;     // dev deps only, merged across roots
  rootDevDeps: Record<string, string>; // root package.json devDeps (toolchain — testing, linting)
  rootDeps: Record<string, string>;    // root package.json production deps (for hoisted monorepo fallback)
  primaryDeps: Record<string, string>; // primary root's deps+devDeps (for identity-scoped detection)

  configs: {
    frameworkHints: FrameworkHintEntry[];
    tsconfigs: TsconfigEntry[];
    schemas: SchemaFileEntry[];
    deployments: DeploymentEntry[];
    ciWorkflows: CiWorkflowEntry[];
  };

  builtAt: string;                     // ISO timestamp
  buildDurationMs: number;
}
