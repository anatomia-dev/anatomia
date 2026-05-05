/**
 * Parse Python Pipfile (Pipenv format)
 *
 * Based on: Pipfile specification
 */

/**
 * Parse Pipfile dependencies
 *
 * Handles [packages] and [dev-packages] sections
 * @param content
 */
export function parsePipfile(content: string): string[] {
  const deps: string[] = [];

  // Find [packages] section (production dependencies)
  const packagesSection = content.match(/\[packages\]([\s\S]*?)(?=\[|$)/);
  if (packagesSection && packagesSection[1]) {
    const tableContent = packagesSection[1];
    const pkgMatches = tableContent.matchAll(/^([a-zA-Z0-9][\w.-]*)\s*=/gm);
    for (const match of pkgMatches) {
      if (match[1]) {
        deps.push(match[1].toLowerCase());
      }
    }
  }

  // Find [dev-packages] section
  const devSection = content.match(/\[dev-packages\]([\s\S]*?)(?=\[|$)/);
  if (devSection && devSection[1]) {
    const tableContent = devSection[1];
    const pkgMatches = tableContent.matchAll(/^([a-zA-Z0-9][\w.-]*)\s*=/gm);
    for (const match of pkgMatches) {
      if (match[1]) {
        deps.push(match[1].toLowerCase());
      }
    }
  }

  return Array.from(new Set(deps));
}
