/**
 * Go dependency parser (go.mod)
 *
 * Based on: Go modules reference
 */

import * as path from 'node:path';
import { readFile, exists } from '../utils/file.js';

/**
 * Parse go.mod dependencies
 *
 * Handles:
 * - require ( ... ) blocks
 * - Single-line require statements
 * - Indirect dependencies (// indirect)
 * - Version suffixes (/v2, /v3)
 * - Pseudo-versions (v0.0.0-20231024153337-abc)
 * @param content
 */
export function parseGoMod(content: string): string[] {
  const deps: string[] = [];

  // Extract from require blocks: require ( ... )
  const requireBlock = content.match(/require\s+\(([\s\S]*?)\)/);
  if (requireBlock && requireBlock[1]) {
    const blockContent = requireBlock[1];
    // Pattern: github.com/gin-gonic/gin v1.9.1
    // Captures full module path including /v2 suffixes
    const matches = blockContent.matchAll(/^\s*([\w./-]+)\s+v[\w.-]+/gm);
    for (const match of matches) {
      if (match[1]) {
        deps.push(match[1].toLowerCase());
      }
    }
  }

  // Extract single-line requires: require github.com/package v1.0
  const singleRequires = content.matchAll(/^require\s+([\w./-]+)\s+v[\w.-]+/gm);
  for (const match of singleRequires) {
    if (match[1]) {
      deps.push(match[1].toLowerCase());
    }
  }

  return Array.from(new Set(deps));
}

/**
 * Read Go dependencies from go.mod
 * @param rootPath
 */
export async function readGoDependencies(rootPath: string): Promise<string[]> {
  const goModPath = path.join(rootPath, 'go.mod');

  if (await exists(goModPath)) {
    const content = await readFile(goModPath);
    return parseGoMod(content);
  }

  return [];
}
