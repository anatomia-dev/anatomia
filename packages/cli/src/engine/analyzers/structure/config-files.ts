/**
 * Config file discovery.
 */

import { exists, joinPath } from '../../utils/file.js';
import type { ProjectType } from '../../types/index.js';


/**
 * Find config files (.env, tsconfig.json, settings.py, etc.)
 *
 * @param rootPath - Absolute path to project root
 * @param projectType - Project type (affects which configs to look for)
 * @returns Array of config file paths found
 *
 */
export async function findConfigFiles(
  rootPath: string,
  projectType: ProjectType
): Promise<string[]> {
  const configs: string[] = [];

  const commonConfigs = [
    '.env',
    '.env.local',
    '.env.example',
    '.gitignore',
    'README.md',
    'LICENSE',
  ];

  const jsConfigs = [
    'tsconfig.json',
    'jsconfig.json',
    'package.json',
    'eslint.config.mjs',
    '.eslintrc.js',
    '.prettierrc',
    'vite.config.ts',
    'vitest.config.ts',
    'jest.config.js',
    'next.config.js',
    'nest-cli.json',
  ];

  const pythonConfigs = [
    'pyproject.toml',
    'setup.py',
    'requirements.txt',
    'Pipfile',
    'pytest.ini',
    'setup.cfg',
    '.flake8',
    'mypy.ini',
  ];

  const goConfigs = [
    'go.mod',
    'go.sum',
    '.golangci.yml',
  ];

  const rustConfigs = [
    'Cargo.toml',
    'Cargo.lock',
    'rust-toolchain.toml',
  ];

  let configsToCheck = commonConfigs;

  if (projectType === 'node') {
    configsToCheck = [...commonConfigs, ...jsConfigs];
  } else if (projectType === 'python') {
    configsToCheck = [...commonConfigs, ...pythonConfigs];
  } else if (projectType === 'go') {
    configsToCheck = [...commonConfigs, ...goConfigs];
  } else if (projectType === 'rust') {
    configsToCheck = [...commonConfigs, ...rustConfigs];
  }

  for (const configFile of configsToCheck) {
    const configPath = joinPath(rootPath, configFile);
    if (await exists(configPath)) {
      configs.push(configFile);
    }
  }

  return configs;
}
