/**
 * File-scoped HTTP method filter integration test.
 *
 * The file-scoped filter replaced the previous global HTTP-method filter (which dropped any
 * function named GET/POST/... from naming stats) with a file-scoped filter
 * that only suppresses those identifiers inside framework route-handler files
 * (app/**\/route.ts, routes/**\/+server.ts). This test exercises the full
 * pipeline — isRouteHandlerFile → analyzeFunctionNaming — on synthetic
 * ParsedFile fixtures to ensure the filter fires ONLY inside route files.
 */

import { describe, it, expect } from 'vitest';
import { analyzeFunctionNaming } from '../../../src/engine/analyzers/conventions/naming.js';
import type { ParsedFile } from '../../../src/engine/types/parsed.js';

function makeParsed(file: string, fnNames: string[]): ParsedFile {
  return {
    file,
    language: 'typescript',
    functions: fnNames.map((name, i) => ({ name, line: i + 1, async: false, decorators: [] })),
    classes: [],
    imports: [],
    parseTime: 0,
    parseMethod: 'cached',
    errors: 0,
  };
}

describe('file-scoped HTTP method filter', () => {
  it('filters GET/POST inside Next.js App Router route handler files', () => {
    const files: ParsedFile[] = [
      makeParsed('app/api/users/route.ts', ['GET', 'POST']),
    ];
    const result = analyzeFunctionNaming(files, 'typescript');
    // Both functions filtered — sample size should be zero.
    expect(result.sampleSize).toBe(0);
  });

  it('filters +server.ts HTTP methods under src/routes/ (SvelteKit)', () => {
    const files: ParsedFile[] = [
      makeParsed('src/routes/api/+server.ts', ['GET', 'POST', 'DELETE']),
    ];
    const result = analyzeFunctionNaming(files, 'typescript');
    expect(result.sampleSize).toBe(0);
  });

  it('does NOT filter a GET function in a plain utility file', () => {
    // This is the bug the file-scoped filter fixed: a user-defined `GET` in utils/http.ts
    // should be counted as SCREAMING_SNAKE_CASE, not silently dropped.
    const files: ParsedFile[] = [
      makeParsed('utils/http.ts', ['GET']),
    ];
    const result = analyzeFunctionNaming(files, 'typescript');
    expect(result.sampleSize).toBe(1);
    expect(result.majority).toBe('SCREAMING_SNAKE_CASE');
  });

  it('filters only the route-file GETs and counts the utility GET normally', () => {
    const files: ParsedFile[] = [
      makeParsed('app/api/users/route.ts', ['GET', 'POST']), // filtered
      makeParsed('utils/http.ts', ['GET']),                   // counted
      makeParsed('src/services/user.ts', ['getUser', 'createUser']), // counted
    ];
    const result = analyzeFunctionNaming(files, 'typescript');
    // Sample size = 3: one GET (utils) + two camelCase (services).
    expect(result.sampleSize).toBe(3);
    // camelCase is majority (2 of 3); SCREAMING_SNAKE_CASE has 1 of 3.
    expect(result.majority).toBe('camelCase');
    expect(result.distribution['SCREAMING_SNAKE_CASE']).toBeGreaterThan(0);
  });

  it('does not match a root-level route.ts file (must live under app/ or src/app/)', () => {
    const files: ParsedFile[] = [
      makeParsed('route.ts', ['GET']),
    ];
    const result = analyzeFunctionNaming(files, 'typescript');
    // Root-level route.ts is not a framework convention file — GET is counted.
    expect(result.sampleSize).toBe(1);
  });

  it('does not match Next.js Pages Router files (pages/api/users.ts)', () => {
    // Pages Router uses default export — GET/POST there would be regular
    // identifiers. The filter MUST NOT suppress them.
    const files: ParsedFile[] = [
      makeParsed('pages/api/users.ts', ['GET', 'POST']),
    ];
    const result = analyzeFunctionNaming(files, 'typescript');
    expect(result.sampleSize).toBe(2);
  });
});
