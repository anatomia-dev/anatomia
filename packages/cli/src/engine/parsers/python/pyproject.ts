/**
 * Parse Python pyproject.toml file content
 * Supports: PEP 621 (standard) and Poetry format
 *
 * Based on: PEP 621, Poetry dependency specification
 */

/**
 * Parse pyproject.toml dependencies
 *
 * Handles:
 * - PEP 621: [project] dependencies = ["package>=version"]
 * - PEP 621: [project.optional-dependencies] <group> = ["package>=version"]
 *   (dev/test/docs dependency groups — Python's equivalent of devDependencies)
 * - Poetry: [tool.poetry.dependencies] package = "^version"
 * - Poetry: [tool.poetry.group.*.dependencies] package = "^version"
 *
 * Note: Poetry 2.0+ prefers PEP 621 format, but legacy format still common.
 * Modern Python projects increasingly use [project.optional-dependencies] for
 * test/dev deps — without that branch, a project with pytest in
 * `test = [...]` gets zero testing detection and a false missing-tests
 * blind spot.
 *
 * @param content
 */
export function parsePyprojectToml(content: string): string[] {
  const deps: string[] = [];

  // Helper: extract package names from an array body like
  //   "pytest>=7.0", "httpx[cli] >= 0.25", "fastapi"
  // Returns lowercased package names.
  const extractFromArray = (arrayBody: string): string[] => {
    const names: string[] = [];
    const matches = arrayBody.matchAll(/"([a-zA-Z0-9][\w.-]*)[\[\]>=<\s"]/g);
    for (const match of matches) {
      if (match[1]) {
        names.push(match[1].toLowerCase());
      }
    }
    return names;
  };

  // Strategy 1: PEP 621 top-level [project] dependencies array
  // Pattern: dependencies = ["package>=version", "package2"]
  // Anchor on a line-leading `dependencies = [` to avoid accidentally matching
  // the sub-table key in `[project.optional-dependencies]`.
  const pep621Match = content.match(/^\s*dependencies\s*=\s*\[([\s\S]*?)\]/m);
  if (pep621Match && pep621Match[1]) {
    deps.push(...extractFromArray(pep621Match[1]));
  }

  // Strategy 2: PEP 621 [project.optional-dependencies]
  // Pattern:
  //   [project.optional-dependencies]
  //   test = ["pytest", "pytest-asyncio"]
  //   dev  = ["black", "mypy"]
  // Each group key maps to an array; we collect every package from every group.
  // Section body runs until the next `[section]` header or end of file.
  const optionalDepsSection = content.match(
    /\[project\.optional-dependencies\]([\s\S]*?)(?:\n\[|$)/
  );
  if (optionalDepsSection && optionalDepsSection[1]) {
    const sectionBody = optionalDepsSection[1];
    // Match `group = [ ... ]` entries, allowing multi-line arrays.
    const groupMatches = sectionBody.matchAll(
      /^\s*[a-zA-Z0-9][\w.-]*\s*=\s*\[([\s\S]*?)\]/gm
    );
    for (const match of groupMatches) {
      if (match[1]) {
        deps.push(...extractFromArray(match[1]));
      }
    }
  }

  // Strategy 3: Poetry dependencies table
  // Pattern: package = "^version" or package = {version = "^version"}
  const poetrySection = content.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(?=\[|$)/);
  if (poetrySection && poetrySection[1]) {
    const tableContent = poetrySection[1];
    const pkgMatches = tableContent.matchAll(/^([a-zA-Z0-9][\w.-]*)\s*=/gm);
    for (const match of pkgMatches) {
      const pkg = match[1]?.toLowerCase();
      // Skip Python version line
      if (pkg && pkg !== 'python') {
        deps.push(pkg);
      }
    }
  }

  // Strategy 4: Poetry [tool.poetry.group.*.dependencies] (Poetry 1.2+)
  // Match any group, not just `dev`, so `group.test.dependencies`,
  // `group.docs.dependencies`, etc. all flow through.
  const poetryGroupSections = content.matchAll(
    /\[tool\.poetry\.group\.[\w.-]+\.dependencies\]([\s\S]*?)(?=\[|$)/g
  );
  for (const groupSection of poetryGroupSections) {
    if (groupSection[1]) {
      const tableContent = groupSection[1];
      const pkgMatches = tableContent.matchAll(/^([a-zA-Z0-9][\w.-]*)\s*=/gm);
      for (const match of pkgMatches) {
        const pkg = match[1]?.toLowerCase();
        if (pkg) {
          deps.push(pkg);
        }
      }
    }
  }

  return Array.from(new Set(deps));
}
