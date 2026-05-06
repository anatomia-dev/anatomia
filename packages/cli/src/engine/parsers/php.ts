/**
 * PHP dependency parser (composer.json).
 *
 * Low-level parser only — the higher-level reader that wrapped this
 * was deleted as dead code. No production code path consumes PHP
 * dependency data today; the parser is retained as a tested utility
 * in case PHP support ships later.
 */

export function parseComposerJson(content: string): string[] {
  try {
     
    const composer = JSON.parse(content);

    if (!composer || typeof composer !== 'object') {
      return [];
    }

    const deps = new Set<string>();

    if (
      composer.require &&
      typeof composer.require === 'object' &&
      !Array.isArray(composer.require)
    ) {
      Object.keys(composer.require).forEach((d) => {
        // Filter out PHP version and extensions
        if (d !== 'php' && !d.startsWith('ext-') && !d.startsWith('lib-')) {
          deps.add(d.toLowerCase());
        }
      });
    }

    if (
      composer['require-dev'] &&
      typeof composer['require-dev'] === 'object' &&
      !Array.isArray(composer['require-dev'])
    ) {
      Object.keys(composer['require-dev']).forEach((d) =>
        deps.add(d.toLowerCase())
      );
    }

    return Array.from(deps);
  } catch {
    return [];
  }
}
