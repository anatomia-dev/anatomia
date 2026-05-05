/**
 * Structure analyzer.
 *
 * Analyzes project directory structure to detect:
 * - Entry points (entry-points.ts)
 * - Test locations (test-locations.ts)
 * - Architecture pattern (architecture.ts)
 * - Directory tree (tree-builder.ts)
 * - Config files (config-files.ts)
 *
 * This file owns the DIRECTORY_PURPOSES constant (basename → purpose
 * description) and the mapDirectoriesToPurposes helper because they're
 * only consumed by analyzeStructure at assembly time. The sibling modules
 * don't need them.
 *
 * Re-exports below preserve the old structure.ts public API so tests and
 * engine/index.ts can continue importing by name — imports now resolve
 * through the new folder structure.
 */

import { basename } from 'node:path';
import type { ProjectType } from '../../types/index.js';
import type { StructureAnalysis } from '../../types/structure.js';
import { createEmptyStructureAnalysis } from '../../types/structure.js';
import { walkDirectories } from '../../utils/directory.js';

import { findEntryPoints } from './entry-points.js';
import { findTestLocations } from './test-locations.js';
import { classifyArchitecture } from './architecture.js';
import { buildAsciiTree } from './tree-builder.js';
import { findConfigFiles } from './config-files.js';

/**
 * Directory purpose mapping (basename → purpose description).
 *
 * Must stay in sync with TEST_DIRECTORY_NAMES in src/constants.ts — if
 * you add a test directory there, add the purpose label here so scan
 * output renders it with the correct description.
 */
const DIRECTORY_PURPOSES: Record<string, string> = {
  // Source code
  'src': 'Source code',
  'lib': 'Library code',
  'app': 'Application code',
  'api': 'API endpoints',
  'routes': 'API routes',
  'controllers': 'Request controllers',
  'handlers': 'Request handlers',
  'models': 'Data models',
  'schemas': 'Data schemas',
  'services': 'Service modules',
  'domain': 'Domain logic',
  'core': 'Core modules',
  'utils': 'Utility functions',
  'helpers': 'Helper functions',
  'middleware': 'Request middleware',
  'middlewares': 'Request middleware',
  'config': 'Configuration',
  'engine': 'Engine code',
  'shared': 'Shared utilities',
  'common': 'Common utilities',
  // Tests
  'tests': 'Tests',
  'test': 'Tests',
  '__tests__': 'Jest tests',
  'spec': 'Spec tests',
  'e2e': 'End-to-end tests',
  'integration': 'Integration tests',
  'cypress': 'Cypress tests',
  'playwright': 'Playwright tests',
  'fixtures': 'Test fixtures',
  // Documentation
  'docs': 'Documentation',
  'email-templates': 'Email templates',
  'documentation': 'Documentation',
  // Frontend
  'components': 'UI components',
  'pages': 'Page routes',
  'views': 'View templates',
  'layouts': 'Layout components',
  'styles': 'Stylesheets',
  'css': 'Stylesheets',
  'scss': 'Sass stylesheets',
  'public': 'Public static files',
  'static': 'Static files',
  'assets': 'Assets',
  'web': 'Web assets',
  'hooks': 'React hooks',
  'store': 'State management',
  'stores': 'State management',
  // Backend
  'migrations': 'Database migrations',
  'alembic': 'Database migrations (Python)',
  'schema': 'Database schema',
  'database': 'Database code',
  'db': 'Database code',
  'seeds': 'Database seeds',
  'repositories': 'Data repositories',
  'prisma': 'Prisma schema',
  'supabase': 'Supabase config',
  'drizzle': 'Drizzle config',
  // Features/Modules (DDD)
  'features': 'Feature modules',
  'modules': 'Feature modules',
  'contexts': 'Contexts',
  'domains': 'Domain modules',
  'infrastructure': 'Infrastructure code',
  // Multiple services (Microservices)
  'apps': 'Applications',
  'packages': 'Workspace packages',
  // Go-specific
  'cmd': 'CLI commands',
  'internal': 'Internal packages',
  'pkg': 'Public packages',
  // Build/Generated
  'dist': 'Build output',
  'build': 'Build output',
  'out': 'Build output',
  '.next': 'Next.js build cache',
  '.nuxt': 'Nuxt build cache',
  'target': 'Rust build output',
  // CI/CD and tooling
  '.github': 'GitHub config',
  '.vscode': 'VS Code config',
  '.idea': 'JetBrains config',
  'scripts': 'Build/utility scripts',
  'tools': 'Development tools',
  'deployments': 'Deployment configs',
  'docker': 'Docker configurations',
  'templates': 'Template files',
  'examples': 'Example code',
  'prompts': 'LLM prompts',
  'benchmarks': 'Performance benchmarks',
  // Ruby/Rails
  'concerns': 'Rails concerns',
  'mailers': 'Email mailers',
  'jobs': 'Background jobs',
  'workers': 'Worker processes',
  'tasks': 'Rake tasks',
  // PHP/Laravel
  'resources': 'Application resources',
  'providers': 'Service providers',
  // Misc
  'vendor': 'Third-party dependencies',
  'locales': 'Internationalization',
  'i18n': 'Internationalization',
  'types': 'Type definitions',
  'generated': 'Generated code',
  'protos': 'Protocol buffer definitions',
  'graphql': 'GraphQL schemas',
};

/**
 * Map directory paths to purpose descriptions.
 *
 * @param directories - Directory paths from walkDirectories
 * @returns Mapping of directory path → purpose label
 */
function mapDirectoriesToPurposes(directories: string[]): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const dir of directories) {
    const base = basename(dir);
    mapped[dir] = DIRECTORY_PURPOSES[base] || 'Unknown';
  }
  return mapped;
}

/**
 * Analyze project directory structure.
 *
 * Orchestrates all structure sub-analyzers and computes overall confidence.
 *
 * @param rootPath - Absolute path to project root
 * @param projectType - Detected project type
 * @param framework - Detected framework (can be null)
 * @returns Complete structure analysis
 */
export async function analyzeStructure(
  rootPath: string,
  projectType: ProjectType,
  framework: string | null
): Promise<StructureAnalysis> {
  try {
    // Step 1: Find entry points
    const entryPointResult = await findEntryPoints(rootPath, projectType, framework);

    // Step 2: Find test locations
    const testLocationResult = await findTestLocations(rootPath, projectType, framework);

    // Step 3: Walk directories
    const directories = await walkDirectories(rootPath, 4);

    // Step 4: Classify architecture
    const architectureResult = classifyArchitecture(
      directories,
      entryPointResult.entryPoints,
      framework,
      projectType
    );

    // Step 5: Build ASCII tree
    const directoryTree = await buildAsciiTree(rootPath, 4, 40);

    // Step 6: Find config files
    const configFiles = await findConfigFiles(rootPath, projectType);

    // Step 7: Map directories to purposes
    const directoryPurposes = mapDirectoriesToPurposes(directories);

    // Step 8: Calculate overall confidence (weighted)
    const overallConfidence = (
      entryPointResult.confidence * 0.50 +
      testLocationResult.confidence * 0.25 +
      architectureResult.confidence * 0.25
    );

    return {
      directories: directoryPurposes,
      entryPoints: entryPointResult.entryPoints,
      testLocation: testLocationResult.testLocations[0] || null,
      architecture: architectureResult.architecture,
      directoryTree,
      configFiles,
      confidence: {
        entryPoints: entryPointResult.confidence,
        testLocation: testLocationResult.confidence,
        architecture: architectureResult.confidence,
        overall: overallConfidence,
      },
    };
  } catch (_error) {
    return createEmptyStructureAnalysis();
  }
}

// Re-export the public API so tests and engine/index.ts can continue
// importing by name through the folder. Removed two dead
// re-exports (buildAsciiTree, findConfigFiles) that had zero external
// consumers — `analyzeStructure` above uses the direct imports at the
// top of the file. If a consumer outside this folder needs either
// helper again, re-add the re-export with a matching test-surface
// consumer, not as speculative exposure.
export { findEntryPoints } from './entry-points.js';
export { findTestLocations } from './test-locations.js';
export { classifyArchitecture } from './architecture.js';
