/**
 * Python dependency parser (all formats)
 *
 * Tries: requirements.txt, pyproject.toml, Pipfile
 * Returns: Structured dependencies with production and all-deps views
 */

import * as path from 'node:path';
import { readFile, exists } from '../utils/file.js';
import { parseRequirementsTxt } from './python/requirements.js';
import { parsePyprojectToml } from './python/pyproject.js';
import { parsePipfile } from './python/Pipfile.js';

/**
 * Read Python dependencies from all available formats
 *
 * Priority: requirements.txt, pyproject.toml, Pipfile
 * Combines all found dependencies into structured result.
 *
 * @param rootPath - Project root directory path
 * @returns Object with `production` (prod-only deps) and `all` (production ∪ dev)
 */
export async function readPythonDependencies(rootPath: string): Promise<{ production: string[]; all: string[] }> {
  const production = new Set<string>();
  const dev = new Set<string>();

  // Try requirements.txt (most common) — all production
  const reqPath = path.join(rootPath, 'requirements.txt');
  if (await exists(reqPath)) {
    try {
      const content = await readFile(reqPath);
      const reqDeps = parseRequirementsTxt(content);
      reqDeps.forEach((d) => production.add(d));
    } catch {
      // Malformed file — fall through to other formats
    }
  }

  // Try pyproject.toml (modern standard) — structured production/dev
  const pyprojectPath = path.join(rootPath, 'pyproject.toml');
  if (await exists(pyprojectPath)) {
    try {
      const content = await readFile(pyprojectPath);
      const tomlResult = parsePyprojectToml(content);
      tomlResult.production.forEach((d) => production.add(d));
      tomlResult.dev.forEach((d) => dev.add(d));
    } catch {
      // Malformed file — fall through to other formats
    }
  }

  // Try Pipfile (Pipenv) — all to production (deferred split per scope)
  const pipfilePath = path.join(rootPath, 'Pipfile');
  if (await exists(pipfilePath)) {
    try {
      const content = await readFile(pipfilePath);
      const pipDeps = parsePipfile(content);
      pipDeps.forEach((d) => production.add(d));
    } catch {
      // Malformed file — return what we have
    }
  }

  const productionArray = Array.from(production);
  const all = Array.from(new Set([...productionArray, ...dev]));

  return { production: productionArray, all };
}
