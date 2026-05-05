/**
 * Ruby dependency parser (Gemfile).
 *
 * Low-level parser only — the higher-level reader that wrapped this
 * was deleted as dead code. No production code path consumes Ruby
 * dependency data today; the parser is retained as a tested utility
 * in case Ruby support ships later.
 */

export function parseGemfile(content: string): string[] {
  const deps: string[] = [];

  // Match: gem 'package' or gem "package"
  const matches = content.matchAll(/gem\s+['"]([a-zA-Z0-9][\w-]*)['"]/g);
  for (const match of matches) {
    if (match[1]) {
      deps.push(match[1].toLowerCase());
    }
  }

  return Array.from(new Set(deps));
}
