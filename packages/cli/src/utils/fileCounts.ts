/**
 * File counting utility for ana scan
 *
 * Counts source, test, and config files using glob patterns.
 * Fast filesystem traversal - no tree-sitter required.
 */

import { glob } from 'glob';

/**
 * File count results
 */
export interface FileCounts {
  source: number;
  test: number;
  config: number;
  total: number;
}

/**
 * Source file extensions (all major languages)
 */
const SOURCE_EXTENSIONS = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'py',
  'go',
  'rs',
  'rb',
  'php',
  'java',
  'kt',
  'swift',
  'c',
  'cpp',
  'h',
  'cs',
];

/**
 * Known config file patterns
 */
const CONFIG_FILES = [
  'package.json',
  'tsconfig.json',
  'tsconfig.*.json',
  'pyproject.toml',
  'setup.py',
  'setup.cfg',
  'requirements.txt',
  'Pipfile',
  'go.mod',
  'go.sum',
  'Cargo.toml',
  'Cargo.lock',
  'Gemfile',
  'composer.json',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Makefile',
  'CMakeLists.txt',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.json',
  '.eslintrc.cjs',
  'eslint.config.js',
  'eslint.config.mjs',
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.json',
  'prettier.config.js',
  'vitest.config.ts',
  'vitest.config.js',
  'jest.config.js',
  'jest.config.ts',
  'webpack.config.js',
  'vite.config.ts',
  'vite.config.js',
  'rollup.config.js',
  'next.config.js',
  'next.config.mjs',
  'tailwind.config.js',
  'tailwind.config.ts',
  'postcss.config.js',
  '.babelrc',
  'babel.config.js',
  '.env',
  '.env.*',
  'docker-compose.yml',
  'docker-compose.yaml',
  'Dockerfile',
  '.dockerignore',
  '.gitignore',
  '.editorconfig',
  'turbo.json',
  'turbo.jsonc',
  'nx.json',
  'lerna.json',
  'pnpm-workspace.yaml',
];

/**
 * Directories to exclude from all counts
 */
const EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '__pycache__',
  '.pytest_cache',
  'venv',
  '.venv',
  'vendor',
  'target',
  'coverage',
  '.coverage',
  '.nyc_output',
];

/**
 * Count files in a directory by category
 *
 * @param rootPath - Directory to scan
 * @returns File counts by category
 */
export async function countFiles(rootPath: string): Promise<FileCounts> {
  const ignorePatterns = EXCLUDE_DIRS.map((dir) => `**/${dir}/**`);

  // Count source files (excluding test files)
  const sourcePatterns = SOURCE_EXTENSIONS.map((ext) => `**/*.${ext}`);
  const testExcludePatterns = [
    '**/*.test.*',
    '**/*.spec.*',
    '**/test_*',
    '**/*_test.*',
    '**/tests/**',
    '**/test/**',
    '**/__tests__/**',
    '**/spec/**',
  ];

  let sourceCount = 0;
  for (const pattern of sourcePatterns) {
    const matches = await glob(pattern, {
      cwd: rootPath,
      ignore: [...ignorePatterns, ...testExcludePatterns],
      nodir: true,
    });
    sourceCount += matches.length;
  }

  // Count test files
  const testPatterns = [
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.test.js',
    '**/*.test.jsx',
    '**/*.spec.ts',
    '**/*.spec.tsx',
    '**/*.spec.js',
    '**/*.spec.jsx',
    '**/test_*.py',
    '**/*_test.py',
    '**/*_test.go',
    '**/tests/**/*.ts',
    '**/tests/**/*.tsx',
    '**/tests/**/*.js',
    '**/tests/**/*.jsx',
    '**/tests/**/*.py',
    '**/test/**/*.ts',
    '**/test/**/*.tsx',
    '**/test/**/*.js',
    '**/test/**/*.jsx',
    '**/test/**/*.py',
    '**/__tests__/**/*.ts',
    '**/__tests__/**/*.tsx',
    '**/__tests__/**/*.js',
    '**/__tests__/**/*.jsx',
    '**/spec/**/*.rb',
  ];

  const testFiles = new Set<string>();
  for (const pattern of testPatterns) {
    const matches = await glob(pattern, {
      cwd: rootPath,
      ignore: ignorePatterns,
      nodir: true,
    });
    matches.forEach((m) => testFiles.add(m));
  }
  const testCount = testFiles.size;

  // Count config files
  let configCount = 0;
  for (const pattern of CONFIG_FILES) {
    const matches = await glob(pattern.includes('/') ? pattern : `**/${pattern}`, {
      cwd: rootPath,
      ignore: ignorePatterns,
      nodir: true,
    });
    configCount += matches.length;
  }

  return {
    source: sourceCount,
    test: testCount,
    config: configCount,
    total: sourceCount + testCount + configCount,
  };
}

/**
 * Format a number with commas for display
 *
 * @param n - Number to format
 * @returns Formatted string
 */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}
