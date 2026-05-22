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
 *   (production extras — what users install with `pip install package[extra]`)
 * - Poetry: [tool.poetry.dependencies] package = "^version"
 * - Poetry: [tool.poetry.group.*.dependencies] package = "^version"
 *
 * Note: Poetry 2.0+ prefers PEP 621 format, but legacy format still common.
 * Modern Python projects increasingly use [project.optional-dependencies] for
 * test/dev deps — without that branch, a project with pytest in
 * `test = [...]` gets zero testing detection and a false missing-tests
 * blind spot.
 *
 * @param content - Raw pyproject.toml file content
 * @returns Object with `production` and `dev` dependency arrays
 */
export function parsePyprojectToml(content: string): { production: string[]; dev: string[] } {
  const production: string[] = [];
  const dev: string[] = [];

  // Helper: extract package names from an array body like
  //   "pytest>=7.0", "httpx[cli] >= 0.25", "fastapi"
  // Returns lowercased package names.
  const extractFromArray = (arrayBody: string): string[] => {
    const names: string[] = [];
    const matches = arrayBody.matchAll(/["']([a-zA-Z0-9][\w.-]*)[\[\]>=<\s"']/g);
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
  // Note: this pattern is not section-scoped — it could match a `dependencies`
  // key inside [dependency-groups]. Dedup via `new Set(deps)` makes this harmless.
  // Use `\]\s*$` to anchor closing bracket at end-of-line, avoiding early
  // termination on mid-line brackets like `[trio]` in `"anyio[trio] >=3.2.1"`.
  // Tradeoff: a proper TOML parser is the right next step if more edge cases surface.
  const pep621Match = content.match(/^\s*dependencies\s*=\s*\[([\s\S]*?)\]\s*$/m);
  if (pep621Match && pep621Match[1]) {
    production.push(...extractFromArray(pep621Match[1]));
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
      /^\s*[a-zA-Z0-9][\w.-]*\s*=\s*\[([\s\S]*?)\]\s*$/gm
    );
    for (const match of groupMatches) {
      if (match[1]) {
        production.push(...extractFromArray(match[1]));
      }
    }
  }

  // Strategy 5: PEP 735 [dependency-groups] (Python 3.12+)
  // Pattern:
  //   [dependency-groups]
  //   test = ["pytest>=7.0", "coverage"]
  //   docs = ["sphinx"]
  // Same structure as Strategy 2 — section body with `group = [...]` entries.
  // Note: `include-group` inline tables (e.g., `{include-group = "tests"}`) will
  // produce harmless phantom dep names that no detector matches.
  const depGroupsSection = content.match(
    /\[dependency-groups\]([\s\S]*?)(?:\n\[|$)/
  );
  if (depGroupsSection && depGroupsSection[1]) {
    const sectionBody = depGroupsSection[1];
    const groupMatches = sectionBody.matchAll(
      /^\s*[a-zA-Z0-9][\w.-]*\s*=\s*\[([\s\S]*?)\]\s*$/gm
    );
    for (const match of groupMatches) {
      if (match[1]) {
        dev.push(...extractFromArray(match[1]));
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
        production.push(pkg);
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
          production.push(pkg);
        }
      }
    }
  }

  return {
    production: Array.from(new Set(production)),
    dev: Array.from(new Set(dev)),
  };
}
