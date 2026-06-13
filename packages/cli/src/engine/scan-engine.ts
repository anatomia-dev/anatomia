/**
 * scanProject() — top-level engine function
 *
 * Composes EngineResult from multiple detection sources:
 * 1. Dependency detection (primary — always runs)
 * 2. Structure/file analysis (always runs)
 * 3. Git detection (always runs)
 * 4. Command detection (always runs)
 * 5. External services, schemas, secrets (always runs)
 * 6. Tree-sitter deep analysis (only when depth === 'deep')
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { glob } from 'glob';

/** Normalize a path to forward slashes for cross-platform consistency. */
const toPosix = (p: string): string => p.replace(/\\/g, '/');
import type { EngineResult, EnrichedPackage } from './types/engineResult.js';
import { getPatternLibrary } from './types/patterns.js';
import { detectFromDeps, detectServiceDeps, detectAiSdk, detectNonNodeAiSdk, findStackProvenance, TESTING_PACKAGES, ORM_PACKAGES } from './detectors/dependencies.js';
import type { DependencyDetectionResult } from './detectors/dependencies.js';
import type { ProjectCensus } from './types/census.js';
import { readPythonDependencies } from './parsers/python.js';
import { readGoDependencies } from './parsers/go.js';
import { detectPackageManager } from './detectors/packageManager.js';
import { detectGitInfo } from './detectors/git.js';
import { detectCommands } from './detectors/commands.js';
import { detectReadme } from './detectors/readme.js';
import { detectDocumentation } from './detectors/documentation.js';
import { detectDeployment, detectCI } from './detectors/deployment.js';
import { detectProjectType } from './detectors/projectType.js';
import { detectFramework } from './detectors/framework.js';
import { detectApplicationShape } from './detectors/applicationShape.js';
import { analyzeStructure } from './analyzers/structure/index.js';
import { readProofHistory, toBugMagnetFiles } from './analyzers/proof-history/index.js';
import { annotateServiceRoles } from './utils/serviceAnnotation.js';
import { countFiles } from '../utils/fileCounts.js';
import { buildCensus } from './census.js';
import { generateFindings } from './findings/index.js';
import { detectSurfaces, enrichPackages, isNonProductFilePath } from './detectors/surfaces.js';

import { getLanguageDisplayName, getFrameworkDisplayName, getPatternDisplayName } from '../utils/displayNames.js';
import { getProjectName } from '../utils/validators.js';

interface MonorepoInfo {
  isMonorepo: boolean;
  tool: string | null;
  packages: EnrichedPackage[];
  primaryPackage: { name: string; path: string } | null;
}

/**
 * Detect testing frameworks for non-Node projects at surface tier.
 *
 * The main dependency-detection path (`detectFromDeps`) only inspects
 * `package.json`. Python projects keep their deps in pyproject.toml /
 * requirements.txt / Pipfile; Go projects use go.mod. Without an explicit
 * read, pytest and Go's built-in `testing` package never surface on surface-
 * tier scans — so the missing-tests blind spot fires even when tests
 * exist and the framework is obvious from the dep file.
 *
 * Deep tier catches these via the pattern analyzer (inferPatterns); this
 * helper covers the surface-tier hole without requiring tree-sitter parsing.
 *
 * Ruby: detect RSpec (`.rspec` file) and Minitest (`test/` directory).
 * Both can coexist — return all detected.
 *
 * Rust: the standard library ships `cargo test` as built-in — always
 * return `['Cargo test']` since every Rust project has it.
 */
async function detectNonNodeTesting(
  rootPath: string,
  projectType: string
): Promise<string[]> {
  try {
    if (projectType === 'python') {
      const pythonResult = await readPythonDependencies(rootPath);
      const detected: string[] = [];
      if (pythonResult.all.includes('pytest')) detected.push('pytest');
      if (pythonResult.all.includes('unittest')) detected.push('unittest');
      return detected;
    }
    if (projectType === 'go') {
      // Go's standard library `testing` package is built-in; presence of
      // `require` lines alone doesn't tell us much. Treat any detectable
      // Go project as having testing if go.mod was readable — matches the
      // convention that every Go project uses `go test`.
      const deps = await readGoDependencies(rootPath);
      return deps.length >= 0 ? ['Go testing'] : [];
    }
    if (projectType === 'ruby') {
      const detected: string[] = [];
      if (existsSync(path.join(rootPath, '.rspec'))) detected.push('RSpec');
      if (existsSync(path.join(rootPath, 'test'))) detected.push('Minitest');
      return detected;
    }
    if (projectType === 'rust') {
      return ['Cargo test'];
    }
  } catch {
    // Parser failure — fall through silently. The blind spot still fires
    // as informational, which is the correct behavior for genuinely
    // unreadable dep files.
  }
  return [];
}

/**
 * Detect UI system from dependency signature.
 *
 * shadcn/ui: tailwindcss + class-variance-authority + tailwind-merge + any @radix-ui/*
 * Tailwind only: tailwindcss without the shadcn signature
 */
function detectUiSystem(allDeps: Record<string, string>): string | null {
  const hasTailwind = allDeps['tailwindcss'] !== undefined;
  if (!hasTailwind) return null;

  // shadcn/ui signature: cva + tw-merge + radix
  const hasCva = allDeps['class-variance-authority'] !== undefined;
  const hasTwMerge = allDeps['tailwind-merge'] !== undefined;
  const hasRadix = Object.keys(allDeps).some(k => k.startsWith('@radix-ui/'));

  if (hasCva && hasTwMerge && hasRadix) {
    return 'shadcn/ui (Tailwind)';
  }

  return 'Tailwind CSS';
}

/**
 * Check if a package exists in any of the three dependency tiers.
 * Used by schema triggers — boolean presence, not identity detection.
 */
function hasDep(pkg: string, census: ProjectCensus): boolean {
  return !!(census.primaryDeps[pkg] || census.allDeps[pkg] || census.rootDeps[pkg]);
}

// Census (via @manypkg/get-packages) is the single source for monorepo
// detection, workspace packages, and aggregated dependencies. Covers pnpm,
// yarn, npm, lerna, bolt, bun, and rush workspace types.

// --- External services detection ---

const EXTERNAL_SERVICE_PACKAGES: Record<string, { name: string; category: string }> = {
  'stripe': { name: 'Stripe', category: 'payments' },
  '@stripe/stripe-js': { name: 'Stripe', category: 'payments' },
  '@supabase/supabase-js': { name: 'Supabase', category: 'backend' },
  'firebase': { name: 'Firebase', category: 'backend' },
  'firebase-admin': { name: 'Firebase', category: 'backend' },
  '@sendgrid/mail': { name: 'SendGrid', category: 'email' },
  'aws-sdk': { name: 'AWS', category: 'cloud' },
  '@aws-sdk/client-s3': { name: 'AWS S3', category: 'storage' },
  'nodemailer': { name: 'Nodemailer', category: 'email' },
  '@vercel/analytics': { name: 'Vercel', category: 'hosting' },
  'resend': { name: 'Resend', category: 'email' },
  '@sentry/node': { name: 'Sentry', category: 'monitoring' },
  '@sentry/nextjs': { name: 'Sentry', category: 'monitoring' },
  'posthog-js': { name: 'PostHog', category: 'analytics' },
  '@lemonsqueezy/lemonsqueezy.js': { name: 'Lemon Squeezy', category: 'payments' },
  'openai': { name: 'OpenAI', category: 'ai' },
  '@anthropic-ai/sdk': { name: 'Anthropic', category: 'ai' },
  '@modelcontextprotocol/sdk': { name: 'MCP Server', category: 'ai' },
  '@trpc/server': { name: 'tRPC', category: 'api' },
  '@trpc/client': { name: 'tRPC', category: 'api' },
  // Vercel platform
  '@vercel/blob': { name: 'Vercel Blob', category: 'storage' },
  '@vercel/edge-config': { name: 'Vercel Edge Config', category: 'config' },
  // Analytics
  'mixpanel': { name: 'Mixpanel', category: 'analytics' },
  '@segment/analytics-next': { name: 'Segment', category: 'analytics' },
  'plausible-tracker': { name: 'Plausible', category: 'analytics' },
  // Realtime
  'socket.io': { name: 'Socket.IO', category: 'realtime' },
  'pusher': { name: 'Pusher', category: 'realtime' },
  '@pusher/push-notifications-web': { name: 'Pusher', category: 'realtime' },
  'ably': { name: 'Ably', category: 'realtime' },
  '@liveblocks/client': { name: 'Liveblocks', category: 'realtime' },
  'livekit-server-sdk': { name: 'LiveKit', category: 'realtime' },
  '@partykit/client': { name: 'PartyKit', category: 'realtime' },
  // Upstash
  '@upstash/ratelimit': { name: 'Upstash Ratelimit', category: 'cache' },
  '@upstash/vector': { name: 'Upstash Vector', category: 'vector-db' },
  '@upstash/workflow': { name: 'Upstash Workflow', category: 'queue' },
  // Vector databases
  '@pinecone-database/pinecone': { name: 'Pinecone', category: 'vector-db' },
  'chromadb': { name: 'ChromaDB', category: 'vector-db' },
  '@qdrant/js-client-rest': { name: 'Qdrant', category: 'vector-db' },
  '@qdrant/qdrant-js': { name: 'Qdrant', category: 'vector-db' },
  'weaviate-ts-client': { name: 'Weaviate', category: 'vector-db' },
  'weaviate-client': { name: 'Weaviate', category: 'vector-db' },
  '@zilliz/milvus2-sdk-node': { name: 'Milvus', category: 'vector-db' },
  // CMS
  '@sanity/client': { name: 'Sanity', category: 'cms' },
  'next-sanity': { name: 'Sanity', category: 'cms' },
  'contentful': { name: 'Contentful', category: 'cms' },
  'payload': { name: 'Payload CMS', category: 'cms' },
  '@keystatic/core': { name: 'Keystatic', category: 'cms' },
  // Analytics (posthog-node for server-side)
  'posthog-node': { name: 'PostHog', category: 'analytics' },
  '@vercel/speed-insights': { name: 'Vercel Speed Insights', category: 'analytics' },
  // i18n
  'i18next': { name: 'i18next', category: 'i18n' },
  'next-intl': { name: 'next-intl', category: 'i18n' },
};

const SERVICE_CONFIG_CHECKS: Record<string, string[]> = {
  'Stripe': ['STRIPE_'],
  'Supabase': ['supabase/config.toml', 'SUPABASE_URL'],
  'Firebase': ['.firebaserc', 'firebase.json'],
  'AWS': ['.aws/', 'AWS_'],
  'AWS S3': ['AWS_'],
  'Vercel': ['vercel.json'],
  'Sentry': ['.sentryclirc', 'SENTRY_DSN'],
};

async function detectExternalServices(
  allDeps: Record<string, string>,
  rootPath: string
): Promise<EngineResult['externalServices']> {
  const services: EngineResult['externalServices'] = [];
  const seen = new Set<string>();

  for (const [pkg, info] of Object.entries(EXTERNAL_SERVICE_PACKAGES)) {
    if (allDeps[pkg] && !seen.has(info.name)) {
      seen.add(info.name);
      const configPatterns = SERVICE_CONFIG_CHECKS[info.name] || [];
      let configFound = false;
      for (const pattern of configPatterns) {
        if (pattern.endsWith('_')) {
          // Check .env files for prefix
          try {
            const envContent = await fs.readFile(path.join(rootPath, '.env'), 'utf-8');
            if (envContent.includes(pattern)) { configFound = true; break; }
          } catch { /* no .env */ }
          try {
            const envContent = await fs.readFile(path.join(rootPath, '.env.local'), 'utf-8');
            if (envContent.includes(pattern)) { configFound = true; break; }
          } catch { /* no .env.local */ }
        } else {
          try {
            await fs.access(path.join(rootPath, pattern));
            configFound = true;
            break;
          } catch { /* not found */ }
        }
      }
      services.push({ name: info.name, category: info.category, source: 'dependency', configFound, stackRoles: [] });
    }
  }

  return services;
}

// --- Schema detection ---

/**
 * Count surviving table names from SQL files via narrow CREATE/DROP TABLE heuristics.
 */
async function countUniqueTables(rootPath: string, sqlFiles: string[]): Promise<number> {
  const survivingTables = new Set<string>();
  const tableStatementRegex = /\b(CREATE|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+EXISTS|EXISTS)\s+)?((?:"\w+"|\w+)(?:\s*\.\s*(?:"\w+"|\w+))?)/gi;
  const tableNameRegex = /^"?(?<name>\w+)"?$/;

  for (const f of [...sqlFiles].sort()) {
    try {
      const content = await fs.readFile(path.join(rootPath, f), 'utf-8');
      for (const match of content.matchAll(tableStatementRegex)) {
        const action = match[1]?.toUpperCase();
        const identifier = match[2];
        if (!action || !identifier) continue;

        const finalIdentifier = identifier.split('.').at(-1)?.trim();
        const tableName = finalIdentifier?.match(tableNameRegex)?.groups?.['name']?.toLowerCase();
        if (!tableName) continue;

        if (action === 'CREATE') {
          survivingTables.add(tableName);
        } else {
          survivingTables.delete(tableName);
        }
      }
    } catch { /* skip unreadable files */ }
  }
  return survivingTables.size;
}

async function detectSchemas(
  allDeps: Record<string, string>,
  rootPath: string,
  censusSchemas: import('./types/census.js').SchemaFileEntry[] = [],
  census: ProjectCensus,
): Promise<{ schemas: EngineResult['schemas']; blindSpots: EngineResult['blindSpots'] }> {
  const schemas: EngineResult['schemas'] = {};
  const blindSpots: EngineResult['blindSpots'] = [];

  // Schemas live in many places in real projects:
  // - monolith: prisma/schema.prisma at root
  // - monorepo with shared db: packages/db/prisma/schema.prisma
  // - monorepo per-app: apps/api/prisma/schema.prisma
  // 5 of 22 tested projects had Prisma in a sub-package — the old root-only
  // globs missed them and fired a misleading "no schema" blind spot. Replace
  // with ** globs bounded by maxDepth: 6 and ignoring build artifacts.
  // Benchmark against Anatomia: avg 2.6ms, max 7.3ms — well under the 300ms
  // threshold that would force the explicit-pattern fallback.
  const SCHEMA_GLOB_OPTS = {
    cwd: rootPath,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    maxDepth: 6,
  };

  // Prisma — collect ALL census entries, fall back to glob. When multiple
  // schema.prisma files exist (monorepo with example schemas), pick the one
  // with the most models — production schemas are always larger than examples.
  // Multi-file schemas (prismaSchemaFolder): count models across all sibling
  // .prisma files in the same directory, not just schema.prisma.
  // Directory entries (path ending with /): read all .prisma files in the dir.
  const hasPrisma = hasDep('prisma', census) || hasDep('@prisma/client', census);
  if (hasPrisma) {
    try {
      const censusPrisma = censusSchemas.filter(s => s.orm === 'prisma').map(s => s.path);
      let matches = censusPrisma.length > 0
        ? censusPrisma
        : (await glob('**/schema.prisma', SCHEMA_GLOB_OPTS)).map(toPosix);
      // Second fallback: if no schema.prisma found anywhere, try multi-file
      // layouts where .prisma files live in prisma/ directories without an anchor.
      if (matches.length === 0) {
        const prismaGlob = (await glob('**/prisma/*.prisma', SCHEMA_GLOB_OPTS)).map(toPosix);
        // Deduplicate by directory — one entry per unique prisma/ directory
        const dirs = new Set(prismaGlob.map(f => toPosix(path.dirname(f as string)) + '/'));
        matches = [...dirs];
      }
      // Filter out non-product paths (e2e/, examples/, fixtures/, etc.)
      matches = matches.filter(m => !isNonProductFilePath(m));
      if (matches.length > 0) {
        // Score each candidate by model count (including sibling .prisma files)
        let best: { path: string; modelCount: number; provider: string | null } | null = null;
        for (const relativePath of matches) {
          const relStr = relativePath as string;
          const isDirectory = relStr.endsWith('/');

          let modelCount = 0;
          let provider: string | null = null;

          if (isDirectory) {
            // Directory entry: read all .prisma files in the directory
            const absDir = path.join(rootPath, relStr);
            try {
              const dirFiles = await fs.readdir(absDir);
              const prismaFiles = dirFiles.filter(f => f.endsWith('.prisma'));
              for (const pf of prismaFiles) {
                const pfContent = await fs.readFile(path.join(absDir, pf), 'utf-8');
                modelCount += (pfContent.match(/^model\s+/gm) || []).length;
                if (!provider) {
                  const pm = pfContent.match(/datasource\s+\w+\s*\{[^}]*provider\s*=\s*"(\w+)"/s);
                  if (pm) provider = pm[1] || null;
                }
              }
            } catch { /* directory read failed — skip candidate */ }
          } else {
            // File entry: read the anchor file
            const absPath = path.join(rootPath, relStr);
            const content = await fs.readFile(absPath, 'utf-8');
            modelCount = (content.match(/^model\s+/gm) || []).length;
            // Extract provider from anchor file
            const providerMatch = content.match(/datasource\s+\w+\s*\{[^}]*provider\s*=\s*"(\w+)"/s);
            provider = providerMatch?.[1] || null;
            // Multi-file schema: count models + extract provider from siblings
            const schemaDir = path.dirname(absPath);
            try {
              const siblings = await fs.readdir(schemaDir);
              const prismaFiles = siblings.filter(f => f.endsWith('.prisma') && f !== path.basename(absPath));
              for (const sibling of prismaFiles) {
                const sibContent = await fs.readFile(path.join(schemaDir, sibling), 'utf-8');
                modelCount += (sibContent.match(/^model\s+/gm) || []).length;
                // Provider fallback: if anchor didn't have it, check siblings
                if (!provider) {
                  const pm = sibContent.match(/datasource\s+\w+\s*\{[^}]*provider\s*=\s*"(\w+)"/s);
                  if (pm) provider = pm[1] || null;
                }
              }
            } catch { /* directory read failed — use single-file count */ }
          }

          if (!best || modelCount > best.modelCount) {
            best = { path: relStr, modelCount, provider };
          }
        }
        schemas['prisma'] = { found: true, path: best!.path, modelCount: best!.modelCount, provider: best!.provider };
      } else {
        schemas['prisma'] = { found: false, path: null, modelCount: null };
        blindSpots.push({ area: 'Database', issue: 'Prisma dependency found but no schema.prisma', resolution: 'Create prisma/schema.prisma (or packages/<pkg>/prisma/schema.prisma in a monorepo)' });
      }
    } catch {
      schemas['prisma'] = { found: false, path: null, modelCount: null };
      blindSpots.push({ area: 'Database', issue: 'Prisma dependency found but no schema.prisma', resolution: 'Create prisma/schema.prisma (or packages/<pkg>/prisma/schema.prisma in a monorepo)' });
    }
  }

  // Drizzle — census-first discovery, glob fallback, multi-candidate scoring.
  // Mirrors the Prisma block above: census provides config-extracted paths,
  // glob catches projects without a drizzle.config file, scorer picks the
  // candidate with the most table definitions.
  if (hasDep('drizzle-orm', census)) {
    try {
      const censusDrizzle = censusSchemas.filter(s => s.orm === 'drizzle').map(s => s.path);
      // Read dialect directly from config file (census no longer passes it via sentinel)
      let configDialect: string | null = null;
      for (const ext of ['ts', 'js', 'mjs', 'cjs']) {
        const configPath = path.join(rootPath, `drizzle.config.${ext}`);
        try {
          const configContent = await fs.readFile(configPath, 'utf-8');
          const dialectMatch = configContent.match(/dialect\s*:\s*["'](\w+)["']/);
          if (dialectMatch?.[1]) { configDialect = dialectMatch[1]; break; }
        } catch { /* not found, try next */ }
      }

      let matches: string[] = [];
      let fromCensus = false;
      if (censusDrizzle.length > 0) {
        // Census found schema paths from config — resolve to actual files.
        // A census path may be a file or a directory (glob pattern).
        for (const p of censusDrizzle) {
          const absPath = path.join(rootPath, p);
          if (existsSync(absPath)) {
            try {
              const stat = await fs.stat(absPath);
              if (stat.isDirectory()) {
                // Directory: find all .ts files inside
                const dirFiles = (await glob(`${p}/**/*.ts`, SCHEMA_GLOB_OPTS)).map(toPosix);
                matches.push(...dirFiles);
              } else {
                matches.push(p);
              }
            } catch {
              matches.push(p);
            }
          } else {
            // Path doesn't exist as-is — try as glob pattern
            const globbed = (await glob(`${p}*.ts`, SCHEMA_GLOB_OPTS)).map(toPosix);
            matches.push(...globbed);
          }
        }
        if (matches.length > 0) fromCensus = true;
      }

      // Glob fallback: broad patterns filtered by content (must contain Table( call)
      if (matches.length === 0) {
        const globPatterns = ['**/schema.ts', '**/schema/*.ts', '**/db/schema*.ts'];
        const rawMatches: string[] = [];
        for (const pattern of globPatterns) {
          const found = (await glob(pattern, SCHEMA_GLOB_OPTS)).map(toPosix);
          rawMatches.push(...found);
        }
        // Deduplicate and filter out non-product paths (e2e/, examples/, fixtures/, etc.)
        const unique = [...new Set(rawMatches)].filter(m => !isNonProductFilePath(m));
        // Content filter: file must contain a Drizzle table helper call
        for (const f of unique) {
          try {
            const content = await fs.readFile(path.join(rootPath, f), 'utf-8');
            if (content.includes('Table(')) {
              matches.push(f);
            }
          } catch { /* skip unreadable files */ }
        }
      }

      if (matches.length > 0) {
        // Score each candidate by model count (pgTable + mysqlTable + sqliteTable calls)
        let best: { path: string; modelCount: number; provider: string | null } | null = null;
        for (const relPath of matches) {
          try {
            const content = await fs.readFile(path.join(rootPath, relPath), 'utf-8');
            const pgCount = (content.match(/pgTable\s*\(/g) || []).length;
            const mysqlCount = (content.match(/mysqlTable\s*\(/g) || []).length;
            const sqliteCount = (content.match(/sqliteTable\s*\(/g) || []).length;
            const modelCount = pgCount + mysqlCount + sqliteCount;

            // Provider from table helper names (most common helper wins)
            let provider: string | null = null;
            const counts = [
              { name: 'postgresql', count: pgCount },
              { name: 'mysql', count: mysqlCount },
              { name: 'sqlite', count: sqliteCount },
            ].sort((a, b) => b.count - a.count);
            if (counts[0]!.count > 0) {
              provider = counts[0]!.name;
            }

            if (!best || modelCount > best.modelCount) {
              best = { path: relPath, modelCount, provider };
            }
          } catch { /* skip unreadable files */ }
        }

        if (best) {
          // Barrel fallback: when census resolved to a barrel index with 0 direct
          // tables, expand the directory and aggregate table counts from siblings.
          if (best.modelCount === 0 && fromCensus) {
            const dir = path.dirname(best.path);
            try {
              const dirFiles = (await glob(`${dir}/**/*.ts`, SCHEMA_GLOB_OPTS)).map(toPosix);
              let totalPg = 0, totalMysql = 0, totalSqlite = 0;
              for (const f of dirFiles) {
                try {
                  const content = await fs.readFile(path.join(rootPath, f), 'utf-8');
                  totalPg += (content.match(/pgTable\s*\(/g) || []).length;
                  totalMysql += (content.match(/mysqlTable\s*\(/g) || []).length;
                  totalSqlite += (content.match(/sqliteTable\s*\(/g) || []).length;
                } catch { /* skip unreadable */ }
              }
              const totalModels = totalPg + totalMysql + totalSqlite;
              if (totalModels > 0) {
                best.modelCount = totalModels;
                const providerCounts = [
                  { name: 'postgresql', count: totalPg },
                  { name: 'mysql', count: totalMysql },
                  { name: 'sqlite', count: totalSqlite },
                ].sort((a, b) => b.count - a.count);
                best.provider = providerCounts[0]!.count > 0 ? providerCounts[0]!.name : null;
              }
            } catch { /* directory expansion failed — keep original counts */ }
          }

          // Dialect fallback: when table helpers didn't reveal a provider
          if (!best.provider && configDialect) {
            best.provider = configDialect;
          }
          schemas['drizzle'] = { found: true, path: best.path, modelCount: best.modelCount, provider: best.provider };
        } else {
          schemas['drizzle'] = { found: false, path: null, modelCount: null };
        }
      } else {
        schemas['drizzle'] = { found: false, path: null, modelCount: null };
        blindSpots.push({
          area: 'Database',
          issue: 'drizzle-orm found but no schema files detected',
          resolution: 'Create a drizzle.config.ts pointing to your schema directory',
        });
      }
    } catch {
      schemas['drizzle'] = { found: false, path: null, modelCount: null };
      blindSpots.push({
        area: 'Database',
        issue: 'drizzle-orm found but no schema files detected',
        resolution: 'Create a drizzle.config.ts pointing to your schema directory',
      });
    }
  }

  // Supabase migrations — count unique tables, not files
  if (hasDep('@supabase/supabase-js', census)) {
    try {
      // Filter out non-product paths (e2e/, examples/, fixtures/, etc.)
      const migrationFiles = (await glob('**/supabase/migrations/*.sql', SCHEMA_GLOB_OPTS).catch(() => [] as string[]))
        .filter(m => !isNonProductFilePath(m));
      const schemaFiles = (await glob('**/schema/**/*.sql', SCHEMA_GLOB_OPTS).catch(() => [] as string[]))
        .filter(m => !isNonProductFilePath(m));
      const files = [...migrationFiles, ...schemaFiles];
      if (files.length > 0) {
        const modelCount = await countUniqueTables(rootPath, files);
        // Record the directory that actually matched. In monorepo sub-packages
        // this surfaces as e.g. `apps/api/supabase/migrations/` instead of the
        // legacy hard-coded `supabase/migrations/` root.
        const firstPath = migrationFiles[0] ?? schemaFiles[0] ?? null;
        const schemaDir = firstPath ? `${toPosix(path.dirname(firstPath))}/` : null;
        schemas['supabase'] = { found: true, path: schemaDir, modelCount };
      } else {
        schemas['supabase'] = { found: false, path: null, modelCount: null };
      }
    } catch {
      schemas['supabase'] = { found: false, path: null, modelCount: null };
    }
  }

  // Fallback: check common SQL directories for projects without standard ORM
  if (!schemas['supabase']?.found && !schemas['prisma']?.found && !schemas['drizzle']?.found) {
    for (const dir of ['database', 'db', 'migrations', 'sql', 'schema']) {
      try {
        const sqlFiles = await glob(`${dir}/**/*.sql`, { cwd: rootPath });
        if (sqlFiles.length > 0) {
          const modelCount = await countUniqueTables(rootPath, sqlFiles);
          if (modelCount > 0) {
            schemas['sql'] = { found: true, path: `${dir}/`, modelCount };
            break;
          }
        }
      } catch { /* skip */ }
    }
  }

  return { schemas, blindSpots };
}

// --- Secrets detection ---

/**
 * Detect environment file presence and gitignore coverage.
 * @param rootPath - The root directory of the project to scan
 * @returns Secret detection results including env file and gitignore status
 */
export async function detectSecrets(rootPath: string): Promise<EngineResult['secrets']> {
  let envFileExists = false;
  let envExampleExists = false;
  let gitignoreCoversEnv = false;

  for (const f of ['.env', '.env.local', '.env.production']) {
    try { await fs.access(path.join(rootPath, f)); envFileExists = true; break; } catch { /* nope */ }
  }
  try {
    const rootFiles = await fs.readdir(rootPath);
    envExampleExists = rootFiles.some(f =>
      (f.startsWith('.env') && f.endsWith('.example')) || f === '.env.template'
    );
  } catch { /* readdir failed */ }
  try {
    execSync('git check-ignore --no-index .env', { cwd: rootPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    gitignoreCoversEnv = true;
  } catch {
    // Exit 1 = not ignored, exit 128 = not a git repo — both mean "not covered"
    gitignoreCoversEnv = false;
  }

  return { envFileExists, envExampleExists, gitignoreCoversEnv };
}

// --- Structure extraction from AnalysisResult ---

function extractStructureFromDirect(
  structureResult: Awaited<ReturnType<typeof analyzeStructure>> | undefined
): Array<{ path: string; purpose: string }> {
  if (!structureResult?.directories) return [];
  const directories = structureResult.directories;
  // Return every depth-1 directory with a non-"Unknown" purpose. Those two
  // filters ARE the quality gate — nothing noisy survives them, so there's
  // nothing an arbitrary cap would usefully truncate. Empirically the
  // post-filter count tops out in single digits, which is why this is safe
  // to return unbounded.
  return Object.entries(directories)
    .filter(([dirPath, purpose]) => {
      const depth = dirPath.split('/').filter(Boolean).length;
      return depth === 1 && purpose && purpose !== 'Unknown';
    })
    .map(([dirPath, purpose]) => ({
      path: dirPath.endsWith('/') ? dirPath : `${dirPath}/`,
      purpose,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}


// --- Main function ---

/**
 * Scan a project directory and return the unified scan result.
 *
 * This is the **public entry point** for `ana scan`. It composes 11 detection
 * phases (monorepo, package manager, dependencies, engine analysis, stack
 * construction, file counts, structure, commands, git, external services +
 * schemas + secrets + deployment, service-role annotation) into a single
 * strongly-typed `EngineResult`. Every display surface in the CLI —
 * `ana scan` terminal output, `ana init` success message, `CLAUDE.md`,
 * `AGENTS.md`, skill Detected sections — reads from this one return value,
 * so adding a field to `EngineResult` propagates everywhere automatically.
 *
 * Depth modes:
 * - `deep` (default): runs tree-sitter parsing, pattern inference, and
 *   convention detection. Used by `ana scan` without `--quick` and by
 *   `ana init`. Sub-5s for typical projects; sub-15s for 10K-file monorepos.
 * - `surface`: skips tree-sitter parsing entirely (no patterns, no
 *   conventions). Used by `ana scan --quick` for fast stack-only
 *   detection. Sub-1s even on large projects.
 *
 * Failure modes: the engine phases are fail-soft. If a detection phase
 * throws, `scanProject` continues with dependency-only detection and a
 * truncated stack. If an optional detector (patterns, git, schemas) fails,
 * the corresponding `EngineResult` field is `null` or empty. The function
 * does NOT throw for normal project-shape variations (missing `package.json`,
 * non-git directory, empty project) — it returns a well-formed
 * `EngineResult` with the absent data reported as blind spots.
 *
 * @param rootPath - Absolute path to the project root (the directory
 *   containing `package.json`, `go.mod`, etc.). Must exist and be a
 *   directory; the caller is responsible for that precondition.
 * @param options - Scan options.
 * @param options.depth - `'deep'` (default) for full analysis including
 *   patterns and conventions; `'surface'` to skip tree-sitter entirely.
 * @param options.persistGraphTo - OPT-IN write hook (Slice 2). When set to a
 *   `.ana/state` directory, the deep-tier import graph is persisted there as
 *   `code-graph.json`. Omit it (the default) to keep `scanProject` read-only —
 *   `ana scan` relies on this for its no-files-written contract. Only write
 *   contexts (init, the completeWork rescan) should pass it.
 * @returns A `Promise<EngineResult>` containing the unified scan output.
 *   The result is always well-formed — check `stack.language` and the
 *   `blindSpots` array to determine what was successfully detected.
 *
 * @example Deep scan (default)
 * ```typescript
 * import { scanProject } from './engine/scan-engine.js';
 * const result = await scanProject('/path/to/my-project');
 * console.log(result.stack.language);  // 'TypeScript'
 * console.log(result.stack.framework); // 'Next.js'
 * console.log(result.patterns?.database?.library); // 'prisma' (deep only)
 * ```
 *
 * @example Surface scan (fast, no tree-sitter)
 * ```typescript
 * const result = await scanProject('/path/to/my-project', { depth: 'surface' });
 * // result.patterns === null, result.conventions === null
 * // stack fields populated from dependency detection + analyzer basics
 * ```
 */
export async function scanProject(
  rootPath: string,
  options: { depth: 'surface' | 'deep'; persistGraphTo?: string } = { depth: 'deep' }
): Promise<EngineResult> {
  const projectName = await getProjectName(rootPath);
  const now = new Date().toISOString();

  // 0. Census — shared project model. Detectors receive census data instead of rootPath.
  const census = await buildCensus(rootPath);

  // 1. Monorepo info from census (single source of truth)
  const primaryRoot = census.sourceRoots.find(r => r.isPrimary);
  const mono: MonorepoInfo = {
    isMonorepo: census.layout === 'monorepo',
    tool: census.monorepoTool,
    packages: enrichPackages(census, census.rootDevDeps),
    primaryPackage: primaryRoot && primaryRoot.relativePath !== '.' && primaryRoot.relativePath !== ''
      ? { name: primaryRoot.packageName ?? primaryRoot.relativePath, path: primaryRoot.relativePath }
      : null,
  };

  // 2. Package manager
  const packageManager = await detectPackageManager(rootPath);

  // 3. Dependencies from census (single source of truth)
  const allDeps = census.allDeps;

  // Three-tier identity detection: primaryDeps → allDeps → rootDeps.
  // In monorepos, each tier carries a different slice of the dependency graph.
  // In single-repos, primaryDeps ≈ allDeps and rootDeps is empty/identical,
  // so the chain degrades gracefully (tier 1 finds everything).
  const tier1 = detectFromDeps(census.primaryDeps);
  const tier2 = census.layout === 'monorepo' ? detectFromDeps(census.allDeps) : tier1;
  const tier3 = census.layout === 'monorepo' ? detectFromDeps(census.rootDeps) : tier1;

  // ORM-beats-driver merge for database: if any tier found an ORM,
  // that tier wins regardless of tier priority. This handles dub-shaped
  // projects where tier 1 has @planetscale/database but tier 2 has prisma.
  const tiers = [tier1, tier2, tier3] as const;
  const ormTier = tiers.find(t => t.databasePkg !== null && ORM_PACKAGES.has(t.databasePkg));
  const winningDbTier = ormTier ?? tiers.find(t => t.database !== null) ?? tier1;

  // Resolve identity fields: ORM merge for database, ?? chain for the rest.
  const depResult: DependencyDetectionResult = {
    database: winningDbTier.database,
    databasePkg: winningDbTier.databasePkg,
    auth: tier1.auth ?? tier2.auth ?? tier3.auth ?? null,
    authPkg: tier1.authPkg ?? tier2.authPkg ?? tier3.authPkg ?? null,
    testing: tier1.testing.length > 0 ? tier1.testing : tier2.testing.length > 0 ? tier2.testing : tier3.testing,
    payments: tier1.payments ?? tier2.payments ?? tier3.payments ?? null,
    paymentsPkg: tier1.paymentsPkg ?? tier2.paymentsPkg ?? tier3.paymentsPkg ?? null,
  };

  // 4. Direct detection phases — project type, framework, structure, and
  //    deep-tier analysis (tree-sitter parsing, patterns, conventions).
  const projectTypeResult = await detectProjectType(rootPath);

  // Read language-specific deps. Census allDeps covers Node (package.json);
  // Python/Go/Rust have their own dep files that census v1 doesn't parse.
  let deps = Object.keys(census.allDeps);
  try {
    const pt = projectTypeResult.type;
    if (pt === 'python') {
      const pythonDeps = await readPythonDependencies(rootPath);
      deps = pythonDeps.production;
    }
    else if (pt === 'go') deps = await readGoDependencies(rootPath);
    else if (pt === 'rust') {
      const { readRustDependencies } = await import('./parsers/rust.js');
      deps = await readRustDependencies(rootPath);
    }
  } catch { /* dep reading failed — continue with census deps */ }

  // In monorepos, framework detection uses primary root deps
  // only. A demo site's Next.js shouldn't define the project identity when
  // the primary product is a CLI. Detection fields (database, auth, testing,
  // payments, aiSdk) use three-tier resolution: primary → workspace → allDeps.
  const frameworkDeps = census.layout === 'monorepo' && projectTypeResult.type === 'node'
    ? Object.keys(census.primaryDeps)
    : deps;
  const frameworkResult = detectFramework(frameworkDeps, projectTypeResult.type, census.configs.frameworkHints);

  // Project kind detection — uses primary source root signals + framework result.
  // Read main/module/exports from primary root's package.json (census doesn't
  // expose raw packageJson — these fields only matter for applicationShape).
  // primaryRoot was resolved above (line ~659) for monorepo info.
  let hasMain = false;
  let hasExports = false;
  if (primaryRoot) {
    try {
      const pkgPath = path.join(primaryRoot.absolutePath, 'package.json');
      const pkgRaw = JSON.parse(await fs.readFile(pkgPath, 'utf-8')) as Record<string, unknown>;
      hasMain = !!pkgRaw['main'] || !!pkgRaw['module'];
      hasExports = !!pkgRaw['exports'];
    } catch { /* no package.json or unreadable — defaults stay false */ }
  }
  const shapeResult = detectApplicationShape({
    hasBin: primaryRoot?.hasBin ?? false,
    hasMain,
    hasExports,
    frameworkName: frameworkResult.framework ?? null,
    projectType: projectTypeResult.type,
    deps: Object.keys(census.primaryDeps),
  });

  let structure: Awaited<ReturnType<typeof analyzeStructure>> | undefined;
  try {
    structure = await analyzeStructure(rootPath, projectTypeResult.type, frameworkResult.framework);
  } catch { /* structure analysis failed — continue without */ }

  // Deep tier: tree-sitter parsing, patterns, conventions
  let patterns: import('./types/patterns.js').PatternAnalysis | undefined;
  let conventions: import('./types/conventions.js').ConventionAnalysis | undefined;
  let analyzerFailure: string | null = null;
  let sampledFiles: string[] = [];  // hoisted for findings access
  let parsed: import('./types/parsed.js').ParsedAnalysis | undefined;

  if (options.depth === 'deep') {
    try {
      // Sample files ONCE with proportional sampler (Disease B cure), thread to both consumers.
      const { sampleFilesProportional } = await import('./sampling/proportionalSampler.js');
      sampledFiles = await sampleFilesProportional(census, 750);

      // Dynamic imports — tree-sitter loads WASM at module-evaluation time.
      const { parseProjectFiles } = await import('./parsers/treeSitter.js');
      // DeepTierInput — no type cast needed (Disease E fix)
      const deepInput: import('./types/index.js').DeepTierInput = {
        projectType: projectTypeResult.type,
        framework: frameworkResult.framework,
        structure,
      };

      parsed = await parseProjectFiles(
        rootPath,
        deepInput,
        { preSampledFiles: sampledFiles },
      );

      if (parsed) {
        const withParsed: import('./types/index.js').DeepTierInput = { ...deepInput, parsed };
        const { inferPatterns } = await import('./analyzers/patterns/index.js');
        patterns = await inferPatterns(rootPath, withParsed, {
          deps,
          devDeps: Object.keys(census.devDeps),
        });

        const { detectConventions } = await import('./analyzers/conventions/index.js');
        conventions = await detectConventions(rootPath, { ...withParsed, patterns }, {
          preSampledFiles: sampledFiles,
          tsconfigEntries: census.configs.tsconfigs,
        });

        // Slice 2 — import-graph primitive. Deep-tier only and over the same
        // 750-capped sample as the parse; builds a deterministic file→file
        // digraph (unresolved specifiers → no edge) and persists it under the
        // caller-supplied state dir. Persistence is OPT-IN via `persistGraphTo`
        // so `scanProject` itself stays read-only — `ana scan` (which passes no
        // dir) writes nothing and keeps its byte-parity contract; write
        // contexts (init, completeWork rescan) pass their state dir. Wrapped in
        // its own try so a graph failure never invalidates the analysis above.
        if (options.persistGraphTo) {
          try {
            const { buildImportGraph, persistCodeGraph } = await import('./analyzers/graph/buildGraph.js');
            const graph = buildImportGraph(parsed, census.configs.tsconfigs, rootPath);
            await persistCodeGraph(options.persistGraphTo, graph);
          } catch {
            // Best-effort: the import graph is a derived artifact, never a gate.
          }
        }
      }
    } catch (err) {
      analyzerFailure = err instanceof Error ? err.message : 'unknown error';
    }
  }

  // 5. Build stack (dependency primary, analyzer enriches).
  // All 8 fields assigned at construction time — detectAiSdk is a pure
  // function over allDeps, so inlining it here is equivalent to a later
  // assignment but keeps construction and population in one expression.
  const stack: EngineResult['stack'] = {
    language: null,
    framework: null,
    database: depResult.database,
    auth: depResult.auth,
    testing: depResult.testing,
    payments: depResult.payments,
    workspace: mono.isMonorepo
      ? (existsSync(path.join(rootPath, 'turbo.json')) || existsSync(path.join(rootPath, 'turbo.jsonc'))
        ? `Turborepo (${mono.tool})`
        : existsSync(path.join(rootPath, 'nx.json'))
          ? `Nx (${mono.tool})`
          : `${mono.tool} monorepo`)
      : null,
    // Three-tier aiSdk: primary wins, then allDeps, then rootDeps.
    // Single call chain eliminates the duplicate detectAiSdk(allDeps) that
    // previously existed at line 798 for provenance.
    aiSdk: detectAiSdk(census.primaryDeps) ?? detectAiSdk(census.allDeps) ?? detectAiSdk(census.rootDeps),
    // uiSystem uses allDeps for monorepos — the shadcn/ui 3-dep signature
    // (cva + tw-merge + radix) is commonly split across workspace packages
    // (e.g., dub: cva in packages/ui, tw-merge in packages/utils, radix in
    // apps/web). Only allDeps merges them. rootDeps fallback for hoisted.
    uiSystem: census.layout === 'monorepo'
      ? detectUiSystem(census.allDeps) ?? detectUiSystem(census.rootDeps)
      : detectUiSystem(allDeps),
  };

  // Provenance: determine which source root contributed each detection.
  // Uses the three-tier aiSdk value (already resolved above).
  const stackProvenance = findStackProvenance(census, depResult, stack.aiSdk);

  // Enrich from direct detection results (replaces analysis.* references)
  if (projectTypeResult.type !== 'unknown') {
    stack.language = getLanguageDisplayName(projectTypeResult.type);
  }
  if (frameworkResult.framework) {
    stack.framework = getFrameworkDisplayName(frameworkResult.framework);
  }
  // Pattern-based enrichment (deep tier only)
  if (patterns) {
    const dbLib = getPatternLibrary(patterns.database);
    if (!stack.database && dbLib) {
      stack.database = getPatternDisplayName(dbLib);
    }
    const authLib = getPatternLibrary(patterns.auth);
    if (!stack.auth && authLib) {
      stack.auth = getPatternDisplayName(authLib);
    }
    const testLib = getPatternLibrary(patterns.testing);
    if (stack.testing.length === 0 && testLib) {
      stack.testing = [getPatternDisplayName(testLib)];
    }
  }

  // Surface-tier non-Node testing enrichment. The dependency-detection path
  // (detectFromDeps) only sees `package.json` — Python/Go/Rust projects have
  // their own dep files that never reach allDeps, so pytest in pyproject.toml
  // or testify in go.mod flow nowhere at surface tier. Read the project-type's
  // own dep file here and surface any recognized testing framework so the
  // missing-tests blind spot doesn't fire on modern Python projects. Deep tier
  // handles this via patterns; surface tier needs an explicit read.
  if (stack.testing.length === 0 && projectTypeResult.type !== 'unknown') {
    const nonNodeTesting = await detectNonNodeTesting(rootPath, projectTypeResult.type);
    if (nonNodeTesting.length > 0) {
      stack.testing = nonNodeTesting;
    }
  }

  // Non-Node AI SDK enrichment. Python/Go/Rust deps are in `deps` (overwritten
  // at line 663) as bare package names — use the string[] variant.
  if (!stack.aiSdk && projectTypeResult.type !== 'node') {
    const nonNodeAiSdk = detectNonNodeAiSdk(deps);
    if (nonNodeAiSdk) {
      stack.aiSdk = nonNodeAiSdk;
    }
  }

  // Root devDeps testing enrichment: testing frameworks in root package.json
  // (like @playwright/test) aren't in census.allDeps but should be detected.
  for (const [pkg, name] of Object.entries(TESTING_PACKAGES)) {
    if (census.rootDevDeps[pkg] && !stack.testing.includes(name)) {
      stack.testing.push(name);
    }
  }

  // Clear-and-rebuild stack.testing for non-Node projects. JS testing
  // frameworks contaminate through multiple paths (detectFromDeps merges
  // allDeps including JS workspace packages, rootDevDeps loop adds more).
  // A single clear-and-rebuild after all enrichment covers all contamination.
  if (projectTypeResult.type !== 'node' && projectTypeResult.type !== 'unknown') {
    const freshTesting = await detectNonNodeTesting(rootPath, projectTypeResult.type);
    stack.testing = freshTesting;
  }

  // TypeScript override: ONLY upgrade Node.js → TypeScript
  // Don't override null (could be Python/Go project with tsconfig for tooling)
  if (stack.language === 'Node.js') {
    const hasTsConfig = existsSync(path.join(rootPath, 'tsconfig.json'));
    const hasTsDep = allDeps['typescript'] !== undefined || census.rootDevDeps['typescript'] !== undefined;
    if (hasTsConfig || hasTsDep) {
      stack.language = 'TypeScript';
    }

    // Tier 3: subdirectory tsconfig — covers projects like infisical, tooljet
    // where tsconfig.json lives in frontend/, backend/, server/, or web/
    if (!hasTsConfig && !hasTsDep) {
      const tsSubdirs = ['frontend', 'backend', 'server', 'web'];
      const hasSubdirTsConfig = tsSubdirs.some(dir =>
        existsSync(path.join(rootPath, dir, 'tsconfig.json'))
      );
      if (hasSubdirTsConfig) {
        stack.language = 'TypeScript';
      }
    }
  }

  // 5b. Version detection — store declared version strings for deps.
  // allDeps values ARE version strings (e.g., "^7.2.0"). Uses primary package for monorepos.
  const versionSourceDeps = census.layout === 'monorepo' ? census.primaryDeps : allDeps;
  const versions: Record<string, string> = {};
  for (const [dep, version] of Object.entries(versionSourceDeps)) {
    if (version && typeof version === 'string') {
      versions[dep] = version;
    }
  }

  // 6. File counts
  const files = await countFiles(rootPath);

  // 7. Structure — extract from direct analyzeStructure result
  const structureForOutput = extractStructureFromDirect(structure);

  // 8. Commands
  const commands = await detectCommands(rootPath, packageManager, projectTypeResult.type);

  // 8b. README extraction
  const readme = await detectReadme(rootPath);

  // 8c. Documentation inventory
  const documentation = detectDocumentation(rootPath, census.sourceRoots, stack.framework, allDeps);

  // 9. Git
  const git = await detectGitInfo(rootPath);

  // 10. External services (existing + new categories), schemas, secrets, deployment
  const externalServices = await detectExternalServices(allDeps, rootPath);
  // Add services from new category maps (AI, email, monitoring, jobs)
  for (const svc of detectServiceDeps(allDeps)) {
    if (!externalServices.some(s => s.name === svc.name)) {
      externalServices.push({ name: svc.name, category: svc.category, source: 'dependency', configFound: false, stackRoles: [] });
    }
  }
  const { schemas, blindSpots } = await detectSchemas(allDeps, rootPath, census.configs.schemas, census);
  const secrets = await detectSecrets(rootPath);

  // Env enrichment: in monorepos, .env.example may live in the primary
  // source root rather than the repo root. Re-check if root didn't find one.
  if (!secrets.envExampleExists && census.primarySourceRoot !== '.') {
    try {
      const primaryDir = path.join(rootPath, census.primarySourceRoot);
      const primaryFiles = await fs.readdir(primaryDir);
      secrets.envExampleExists = primaryFiles.some(f =>
        (f.startsWith('.env') && f.endsWith('.example')) || f === '.env.template'
      );
    } catch { /* primary dir unreadable */ }
  }

  const deployment = detectDeployment(census.configs.deployments, census.primarySourceRoot);
  const ci = detectCI(census.configs.ciWorkflows);

  // Annotate services with the stack roles they fulfill. Display code uses
  // `stackRoles.length === 0` to filter standalone services, replacing fragile
  // substring dedup.
  const annotatedServices = annotateServiceRoles(
    externalServices,
    stack,
    deployment.platform
  );

  // 11. Project profile
  const browserFrameworks = ['Next.js', 'React', 'Vue', 'Angular', 'Svelte', 'Nuxt', 'Remix', 'SvelteKit', 'Astro', 'Solid'];
  const storagePackages = ['@aws-sdk/client-s3', 'aws-sdk', '@google-cloud/storage', 'cloudinary'];
  const projectProfile: EngineResult['projectProfile'] = {
    type: frameworkResult.framework || projectTypeResult.type || null,
    hasExternalAPIs: externalServices.length > 0,
    hasDatabase: stack.database !== null,
    hasBrowserUI: stack.framework !== null && browserFrameworks.includes(stack.framework),
    hasAuthSystem: stack.auth !== null,
    hasPayments: stack.payments !== null,
    hasFileStorage: storagePackages.some(p => allDeps[p]),
  };

  // 12. Additional blind spots
  if (analyzerFailure) {
    blindSpots.push({
      area: 'Analyzer',
      issue: `Tree-sitter analysis unavailable: ${analyzerFailure}`,
      resolution: 'Patterns and conventions detection skipped. Dependency-based stack detection continues.',
    });
  }
  if (!git.head) {
    blindSpots.push({ area: 'Git', issue: 'No git repository detected', resolution: 'Run git init' });
  }
  if (secrets.envFileExists && !secrets.gitignoreCoversEnv) {
    blindSpots.push({ area: 'Secrets', issue: '.env file exists but .gitignore may not cover it', resolution: 'Add .env to .gitignore' });
  }
  // Flag missing test coverage. Two-state model lets us
  // distinguish "no testing at all" (actionable) from "tests exist but
  // framework unrecognized" (informational — common for Go's built-in
  // `go test` and lesser-known frameworks).
  if (stack.testing.length === 0 && files.test === 0) {
    blindSpots.push({
      area: 'Testing',
      issue: 'No test framework or test files detected',
      resolution: 'Add a test framework (vitest, jest, pytest) and write tests, or confirm tests live elsewhere.',
    });
  } else if (stack.testing.length === 0 && files.test > 0) {
    blindSpots.push({
      area: 'Testing',
      issue: `${files.test} test files found but test framework not identified in dependencies`,
      resolution: 'Scanner may not recognize your test framework. Informational — your tests still work.',
    });
  }

  // Findings — deterministic checks surfacing what AI got wrong
  const findings = await generateFindings({
    census,
    stack,
    secrets,
    rootPath,
    sampledFiles,
    parsedFiles: parsed?.files ?? [],
  });

  // Slice 1: Proof-history risk map. Runs at every tier (surface + deep) — it
  // reads the proof-chain ledger, not the symbol graph, so it has no
  // tree-sitter dependency. `null` when there is no usable proof chain, in
  // which case gitIntelligence stays null (the shape-frozen default). When
  // present, it populates ONLY the proof-chain fields of bugMagnetFiles; the
  // other gitIntelligence sub-fields (churn/busFactor/co-change) belong to the
  // git-churn path and remain null here.
  const proofHistory = await readProofHistory(rootPath);
  const gitIntelligence: EngineResult['gitIntelligence'] = proofHistory
    ? {
        churnHotspots: null,
        busFactor: null,
        coChangeCoupling: null,
        bugMagnetFiles: toBugMagnetFiles(proofHistory),
      }
    : null;

  return {
    schemaVersion: '1.0',
    applicationShape: shapeResult.shape,
    // indexedCommit is shape-frozen here at `null` (Phase 0). Slice 5
    // (context-never-rots) stamps it with the git HEAD at scan time.
    overview: { project: projectName, scannedAt: now, depth: options.depth, indexedCommit: null },
    stack,
    stackProvenance,
    versions,
    files,
    structure: structureForOutput,
    commands: { ...commands, packageManager },
    git,
    monorepo: mono,
    surfaces: detectSurfaces(census, census.rootDevDeps),
    externalServices: annotatedServices,
    schemas,
    secrets,
    projectProfile,
    blindSpots,
    findings,
    // detectDeployment always returns a DetectedDeployment shape now (null
    // fields for "no deployment"), so the construction is a clean spread.
    deployment: { ...deployment, ...ci },
    patterns: patterns ?? null,
    conventions: conventions ?? null,
    readme,
    documentation,
    // Phase 1+ stubs
    secretFindings: null,
    envVarMap: null,
    duplicates: null,
    circularDeps: null,
    orphanFiles: null,
    complexityHotspots: null,
    // Slice 1: proof-history risk map populates bugMagnetFiles' proof-chain
    // fields; null when no proof chain (see above).
    gitIntelligence,
    dependencyIntelligence: null,
    technicalDebtMarkers: null,
    inconsistencies: null,
    conventionBreaks: null,
    aiReadinessScore: null,
    // Phase 0 shape-freeze: Slice 3 (fused reading list) populates this.
    readingOrder: null,
  };
}
