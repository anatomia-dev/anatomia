/**
 * Unit tests for route-handler file detection.
 *
 * The function answers: "is this file path one where HTTP method identifiers
 * (GET, POST, ...) are framework convention rather than user naming choices?"
 * Getting this wrong has two failure modes:
 *   1. Matching utility files — silently filters real identifiers from naming stats.
 *   2. Missing a real route file — classifies `GET` as SCREAMING_SNAKE_CASE and
 *      skews function naming confidence downward.
 */

import { describe, it, expect } from 'vitest';
import { isRouteHandlerFile, isHttpMethodName } from '../../../src/engine/utils/routeHandlers.js';

describe('isRouteHandlerFile', () => {
  it('matches Next.js App Router route at project root', () => {
    expect(isRouteHandlerFile('app/api/users/route.ts')).toBe(true);
  });

  it('matches Next.js App Router route inside src/', () => {
    expect(isRouteHandlerFile('src/app/api/users/route.ts')).toBe(true);
  });

  it('matches SvelteKit +server route inside src/routes/', () => {
    expect(isRouteHandlerFile('src/routes/api/+server.ts')).toBe(true);
  });

  it('matches SvelteKit +server route at routes/ root', () => {
    expect(isRouteHandlerFile('routes/api/+server.ts')).toBe(true);
  });

  it('does not match arbitrary utility files', () => {
    expect(isRouteHandlerFile('utils/helpers.ts')).toBe(false);
    expect(isRouteHandlerFile('src/lib/http-client.ts')).toBe(false);
  });

  it('does not match root-level route.ts (must live under app/ or src/app/)', () => {
    expect(isRouteHandlerFile('route.ts')).toBe(false);
  });

  it('does not match Next.js Pages Router API files', () => {
    // Pages Router uses a default export, not named HTTP method exports —
    // the identifiers there are not framework convention.
    expect(isRouteHandlerFile('pages/api/users.ts')).toBe(false);
    expect(isRouteHandlerFile('src/pages/api/users.ts')).toBe(false);
  });

  it('matches tsx/jsx variants of App Router routes', () => {
    expect(isRouteHandlerFile('app/api/users/route.tsx')).toBe(true);
    expect(isRouteHandlerFile('app/api/users/route.js')).toBe(true);
    expect(isRouteHandlerFile('app/api/users/route.jsx')).toBe(true);
  });

  it('matches +server.js variant for SvelteKit', () => {
    expect(isRouteHandlerFile('src/routes/api/+server.js')).toBe(true);
  });
});

describe('isHttpMethodName', () => {
  it('matches uppercase HTTP method names', () => {
    for (const name of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
      expect(isHttpMethodName(name)).toBe(true);
    }
  });

  it('rejects lowercase variants (route handlers export uppercase by convention)', () => {
    expect(isHttpMethodName('get')).toBe(false);
    expect(isHttpMethodName('post')).toBe(false);
  });

  it('rejects non-HTTP names', () => {
    expect(isHttpMethodName('fetch')).toBe(false);
    expect(isHttpMethodName('MAX_RETRIES')).toBe(false);
    expect(isHttpMethodName('')).toBe(false);
  });
});
