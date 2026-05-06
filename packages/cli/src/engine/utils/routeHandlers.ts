/**
 * Route-handler file detection + HTTP method name filtering.
 *
 * Framework route handlers export functions named after HTTP methods
 * (GET, POST, etc.). In those files, the names are framework convention,
 * not user naming choices — they should be excluded from naming-convention
 * statistics. In any other file, a function named `GET` is a regular
 * identifier and should be classified normally (it would read as
 * SCREAMING_SNAKE_CASE).
 *
 * The previous implementation filtered HTTP method names globally, which
 * was wrong for projects that happened to have a `GET` helper outside a
 * route handler file. File-scoped detection fixes that class of bug.
 *
 * Patterns currently covered:
 *   - Next.js App Router:  app/**\/route.{ts,tsx,js,jsx}
 *                          src/app/**\/route.{ts,tsx,js,jsx}
 *   - SvelteKit:           src/routes/**\/+server.{ts,js}
 *                          routes/**\/+server.{ts,js}
 *
 * Not covered (deliberate):
 *   - Next.js Pages Router (pages/api/*.ts) — HTTP methods are not exported
 *     as top-level functions there; they're properties on a default export.
 *   - Hono, Nuxt server, Worker routes — add when the frameworks gain
 *     explicit support in the detector registry.
 *
 * To add a new route-handler framework: append a RegExp to
 * ROUTE_HANDLER_PATTERNS. The regexes test against the relative file path
 * stored in `ParsedFile.file` (always forward-slash on the platforms we
 * support).
 */

const ROUTE_HANDLER_PATTERNS: RegExp[] = [
  // Next.js App Router: `app/**/route.{ts,tsx,js,jsx}` or `src/app/**/route.{ts,tsx,js,jsx}`
  /(^|\/)(?:src\/)?app\/.*\/route\.(?:ts|tsx|js|jsx)$/,
  // SvelteKit: `src/routes/**/+server.{ts,js}` or `routes/**/+server.{ts,js}`
  /(^|\/)(?:src\/)?routes\/.*\/\+server\.(?:ts|js)$/,
];

const HTTP_METHOD_NAMES: ReadonlySet<string> = new Set([
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'HEAD',
  'OPTIONS',
]);

/**
 * True if the given relative file path looks like a framework route-handler
 * file where HTTP method exports are convention, not naming choices.
 */
export function isRouteHandlerFile(filePath: string): boolean {
  return ROUTE_HANDLER_PATTERNS.some(re => re.test(filePath));
}

/**
 * True if the given identifier is an HTTP method name.
 */
export function isHttpMethodName(name: string): boolean {
  return HTTP_METHOD_NAMES.has(name);
}
