/**
 * Test directory detection.
 *
 * Per-language helpers + the public findTestLocations orchestrator. Each
 * helper returns a TestLocationResult describing where tests live for a
 * given framework. The orchestrator picks the right helper based on
 * projectType.
 */

import { exists, isDirectory, joinPath, readFile } from '../../utils/file.js';
import type { ProjectType } from '../../types/index.js';
import type { TestLocationResult } from '../../types/structure.js';

/**
 * Find pytest test location (Python)
 * @param rootPath
 */
async function findPytestLocation(rootPath: string): Promise<TestLocationResult> {
  const testsDir = joinPath(rootPath, 'tests');
  if (await exists(testsDir) && await isDirectory(testsDir)) {
    return { testLocations: ['tests/'], confidence: 1.0, framework: 'pytest' };
  }

  const testDir = joinPath(rootPath, 'test');
  if (await exists(testDir) && await isDirectory(testDir)) {
    return { testLocations: ['test/'], confidence: 1.0, framework: 'pytest' };
  }

  const pytestIni = joinPath(rootPath, 'pytest.ini');
  const pyprojectToml = joinPath(rootPath, 'pyproject.toml');
  if (await exists(pytestIni) || await exists(pyprojectToml)) {
    return { testLocations: ['test_*.py', '*_test.py'], confidence: 0.80, framework: 'pytest' };
  }

  return { testLocations: [], confidence: 0.0, framework: 'unknown' };
}

/**
 * Find Jest/Vitest test location (Node)
 * @param rootPath
 */
async function findJestVitestLocation(rootPath: string): Promise<TestLocationResult> {
  const jestTestsDir = joinPath(rootPath, '__tests__');
  if (await exists(jestTestsDir) && await isDirectory(jestTestsDir)) {
    return { testLocations: ['__tests__/'], confidence: 1.0, framework: 'jest' };
  }

  const testsDir = joinPath(rootPath, 'tests');
  if (await exists(testsDir) && await isDirectory(testsDir)) {
    return { testLocations: ['tests/'], confidence: 1.0, framework: 'jest' };
  }

  const testDir = joinPath(rootPath, 'test');
  if (await exists(testDir) && await isDirectory(testDir)) {
    return { testLocations: ['test/'], confidence: 1.0, framework: 'jest' };
  }

  const vitestConfig = joinPath(rootPath, 'vitest.config.ts');
  if (await exists(vitestConfig)) {
    return { testLocations: ['*.test.ts', '*.spec.ts'], confidence: 0.85, framework: 'vitest' };
  }

  const jestConfig = joinPath(rootPath, 'jest.config.js');
  if (await exists(jestConfig)) {
    return { testLocations: ['*.test.ts', '*.spec.ts', '*.test.js', '*.spec.js'], confidence: 0.85, framework: 'jest' };
  }

  const pkgPath = joinPath(rootPath, 'package.json');
  if (await exists(pkgPath)) {
    try {
      const content = await readFile(pkgPath);
      const pkg = JSON.parse(content);
      if (pkg.jest) {
        return { testLocations: ['*.test.ts', '*.spec.ts'], confidence: 0.85, framework: 'jest' };
      }
    } catch {
      // Ignore parse errors
    }
  }

  return { testLocations: [], confidence: 0.0, framework: 'unknown' };
}

/**
 * Find go test location (Go)
 */
function findGoTestLocation(): TestLocationResult {
  return {
    testLocations: ['*_test.go'],
    confidence: 1.0,
    framework: 'go-test',
  };
}

/**
 * Find Rust test location
 * @param rootPath
 */
async function findRustTestLocation(rootPath: string): Promise<TestLocationResult> {
  const testsDir = joinPath(rootPath, 'tests');
  if (await exists(testsDir) && await isDirectory(testsDir)) {
    return { testLocations: ['tests/'], confidence: 1.0, framework: 'cargo-test' };
  }
  return { testLocations: [], confidence: 0.0, framework: 'unknown' };
}

/**
 * Find test locations (where tests live)
 *
 * Detects test framework and locations using:
 * - pytest: tests/ directory + test_*.py pattern
 * - Jest/Vitest: __tests__/ or *.test.ts pattern
 * - go test: *_test.go colocated with source
 *
 * @param rootPath - Absolute path to project root
 * @param projectType - Project type
 * @param framework - Framework (null if unknown)
 * @returns Test location detection result
 *
 */
export async function findTestLocations(
  rootPath: string,
  projectType: ProjectType,
  _framework: string | null
): Promise<TestLocationResult> {
  if (projectType === 'python') {
    return await findPytestLocation(rootPath);
  }

  if (projectType === 'node') {
    return await findJestVitestLocation(rootPath);
  }

  if (projectType === 'go') {
    return findGoTestLocation();
  }

  if (projectType === 'rust') {
    return await findRustTestLocation(rootPath);
  }

  return { testLocations: [], confidence: 0.0, framework: 'unknown' };
}
