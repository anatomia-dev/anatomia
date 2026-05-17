/**
 * Application shape detection — classifies Node projects by interpreting
 * signals from census and framework detection.
 *
 * Pure function: receives data, returns classification. No filesystem reads.
 *
 * Priority chain (most specific wins):
 *   1. mcp-server    — @modelcontextprotocol/sdk in deps
 *   2. ai-agent      — Agent framework (langchain, crewai, claude-agent-sdk) in deps
 *   3. mobile-app    — react-native or expo in deps
 *   4. worker        — Job framework WITHOUT web framework
 *   5. bin field      → cli
 *   6. CLI dependency → cli
 *   7. Browser UI framework → web-app
 *   8. Server framework without browser UI deps → api-server
 *   9. Server framework WITH browser UI deps → full-stack
 *  10. Library markers (main/module/exports) → library
 *  11. None → unknown
 */

/** Closed set of application shapes. */
export type ApplicationShape =
  | 'mcp-server'
  | 'ai-agent'
  | 'mobile-app'
  | 'worker'
  | 'cli'
  | 'library'
  | 'web-app'
  | 'api-server'
  | 'full-stack'
  | 'unknown';

/** Input signals for application shape detection. */
export interface ApplicationShapeInput {
  hasBin: boolean;
  hasMain: boolean;
  hasExports: boolean;
  frameworkName: string | null;
  projectType: string | null;
  deps: string[];
}

/** Detection result. */
export interface ApplicationShapeResult {
  shape: ApplicationShape;
}

/** MCP server detection — @modelcontextprotocol packages. */
const MCP_DEPS = new Set([
  '@modelcontextprotocol/sdk',
]);

/** Agent framework detection — distinguishes autonomous agents from apps that call LLMs. */
const AGENT_FRAMEWORK_DEPS = new Set([
  'langchain',
  '@langchain/core',
  'crewai',
  '@anthropic-ai/claude-agent-sdk',
  'autogen',
]);

/** Mobile app detection. */
const MOBILE_DEPS = new Set([
  'react-native',
  'expo',
]);

/** Job/worker framework detection — presence WITHOUT web framework implies worker. */
const JOB_FRAMEWORK_DEPS = new Set([
  'inngest',
  'bullmq',
  '@trigger.dev/sdk',
  'bee-queue',
  'agenda',
]);

/** CLI-specific dependencies — presence of any implies a CLI tool. */
const CLI_DEPS = new Set([
  'commander',
  'yargs',
  'meow',
  'cac',
  'clipanion',
  'oclif',
  'vorpal',
  'caporal',
  'args',
  'minimist',
  'arg',
  'citty',
]);

/** Browser UI frameworks — internal keys as returned by framework detectors. */
const BROWSER_FRAMEWORKS = new Set([
  'nextjs',
  'remix',
  'react-router',
  'react',
  'vue',
  'angular',
  'svelte',
  'nuxt',
  'astro',
  'sveltekit',
  'solid',
]);

/** Server frameworks — internal keys as returned by framework detectors. */
const SERVER_FRAMEWORKS = new Set([
  'express',
  'fastify',
  'koa',
  'hono',
  'nestjs',
  'adonis',
]);

/**
 * Classify a project by its signals.
 *
 * @param input - Detection signals from census and framework detection
 * @returns The most specific matching application shape
 */
// Framework-to-shape mapping for non-Node projects.
// Source files: python/framework-registry.ts, go.ts, rust.ts
const FRAMEWORK_TO_SHAPE: Record<string, ApplicationShape> = {
  'fastapi': 'api-server',
  'django': 'full-stack',
  'django-drf': 'api-server',
  'flask': 'api-server',
  'typer': 'cli',
  'click': 'cli',
  'gin': 'api-server',
  'echo': 'api-server',
  'chi': 'api-server',
  'cobra-cli': 'cli',
  'fiber': 'api-server',
  'axum': 'api-server',
  'actix-web': 'api-server',
  'rocket': 'api-server',
  'clap-cli': 'cli',
};

export function detectApplicationShape(input: ApplicationShapeInput): ApplicationShapeResult {
  // Non-Node projects: use the framework lookup table
  if (input.projectType !== null && input.projectType !== 'node') {
    const shape = input.frameworkName ? FRAMEWORK_TO_SHAPE[input.frameworkName] : undefined;
    return { shape: shape ?? 'unknown' };
  }

  // 1. MCP server (most specific — dedicated protocol server)
  // BUT: if a browser framework is also present, this is a web app with an
  // MCP feature, not a dedicated MCP server. Let it fall through to web-app.
  if (input.deps.some(d => MCP_DEPS.has(d))) {
    const hasBrowserFramework = input.frameworkName !== null && BROWSER_FRAMEWORKS.has(input.frameworkName);
    if (!hasBrowserFramework) {
      return { shape: 'mcp-server' };
    }
  }

  // 2. AI agent (agent FRAMEWORK, not just AI SDK)
  if (input.deps.some(d => AGENT_FRAMEWORK_DEPS.has(d))) {
    return { shape: 'ai-agent' };
  }

  // 3. Mobile app
  if (input.deps.some(d => MOBILE_DEPS.has(d))) {
    return { shape: 'mobile-app' };
  }

  // 4. Worker (job framework WITHOUT web framework)
  const hasJobFramework = input.deps.some(d => JOB_FRAMEWORK_DEPS.has(d));
  const hasWebFramework = input.frameworkName !== null && (
    BROWSER_FRAMEWORKS.has(input.frameworkName) || SERVER_FRAMEWORKS.has(input.frameworkName)
  );
  if (hasJobFramework && !hasWebFramework) {
    return { shape: 'worker' };
  }

  // 5. bin field → cli
  if (input.hasBin) {
    return { shape: 'cli' };
  }

  // 6. CLI dependency → cli
  if (input.deps.some(d => CLI_DEPS.has(d))) {
    return { shape: 'cli' };
  }

  // 7-9. Framework-based classification
  if (input.frameworkName !== null) {
    const isBrowser = BROWSER_FRAMEWORKS.has(input.frameworkName);
    const isServer = SERVER_FRAMEWORKS.has(input.frameworkName);

    if (isBrowser) {
      return { shape: 'web-app' };
    }

    if (isServer) {
      // Check if browser UI deps also present → full-stack.
      // BROWSER_FRAMEWORKS uses internal keys (react, vue, svelte, etc.) which
      // match most package names directly. The inline array covers package names
      // that differ from internal keys (next→nextjs, @angular/core→angular, etc.).
      const hasBrowserDep = input.deps.some(d => BROWSER_FRAMEWORKS.has(d) || [
        'next', '@angular/core', 'solid-js',
      ].includes(d));
      return { shape: hasBrowserDep ? 'full-stack' : 'api-server' };
    }
  }

  // 10. Library markers
  if (input.hasMain || input.hasExports) {
    return { shape: 'library' };
  }

  // 11. Unknown
  return { shape: 'unknown' };
}
