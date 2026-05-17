/**
 * Dependency-based stack detection
 *
 * Detects database, auth, testing, and payment tools from package.json dependencies.
 * Primary detection path — tree-sitter enriches but doesn't lead.
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';

/**
 * Database packages for dependency detection
 */
export const DATABASE_PACKAGES: Record<string, string> = {
  // ORMs first — they represent what the code queries through
  'prisma': 'Prisma', '@prisma/client': 'Prisma',
  'drizzle-orm': 'Drizzle',
  'typeorm': 'TypeORM', 'sequelize': 'Sequelize',
  'mongoose': 'Mongoose', 'knex': 'Knex',
  // BaaS / serverless databases
  'convex': 'Convex',
  '@supabase/supabase-js': 'Supabase',
  '@neondatabase/serverless': 'Neon',
  '@planetscale/database': 'PlanetScale',
  'firebase': 'Firebase', 'firebase-admin': 'Firebase',
  // Raw drivers last
  'pg': 'PostgreSQL', 'mysql2': 'MySQL',
  'better-sqlite3': 'SQLite', '@libsql/client': 'Turso',
};

/**
 * Auth packages for dependency detection
 */
export const AUTH_PACKAGES: Record<string, string> = {
  '@clerk/nextjs': 'Clerk', '@clerk/express': 'Clerk', '@clerk/clerk-react': 'Clerk',
  'next-auth': 'NextAuth', '@auth/core': 'Auth.js',
  'better-auth': 'Better Auth',
  '@supabase/ssr': 'Supabase Auth',
  '@supabase/auth-helpers-nextjs': 'Supabase Auth',
  'passport': 'Passport',
  'lucia': 'Lucia', '@lucia-auth/adapter-prisma': 'Lucia',
  '@workos-inc/node': 'WorkOS', '@workos-inc/authkit-nextjs': 'WorkOS',
  '@stytch/nextjs': 'Stytch', '@stytch/node': 'Stytch',
  '@boxyhq/saml-jackson': 'BoxyHQ SAML',
  '@kinde-oss/kinde-auth-nextjs': 'Kinde',
  'jsonwebtoken': 'JWT', 'bcrypt': 'bcrypt', 'bcryptjs': 'bcrypt',
};

/**
 * Testing packages for dependency detection.
 *
 * Order matters for display: the first framework to appear is treated as
 * the "primary" testing framework by any consumer that wants a single name.
 * Unit-test runners come first (Vitest, Jest, Mocha), then E2E runners
 * (Playwright, Cypress), then helpers (Testing Library, Supertest). This
 * matches the user's mental model of "which framework do I run `test` for"
 * — unit runners are the entry point in nearly every multi-framework
 * project.
 *
 * `stack.testing` is `string[]`, so every matched framework is
 * collected (deduplicated by display name via a Set). A project with Jest
 * and Playwright reports both, not just "whichever alphabetised first".
 */
export const TESTING_PACKAGES: Record<string, string> = {
  // Unit runners first — these are the "primary framework" the display
  // layer falls back to when it needs a single name.
  'vitest': 'Vitest',
  'jest': 'Jest', '@jest/globals': 'Jest',
  'mocha': 'Mocha',
  // E2E runners
  'playwright': 'Playwright', '@playwright/test': 'Playwright',
  'cypress': 'Cypress',
  // Helpers / companion libraries
  '@testing-library/react': 'Testing Library',
  '@testing-library/jest-dom': 'Testing Library',
  'supertest': 'Supertest',
};

/**
 * Payment packages for dependency detection
 */
export const PAYMENT_PACKAGES: Record<string, string> = {
  'stripe': 'Stripe', '@stripe/stripe-js': 'Stripe',
  '@lemonsqueezy/lemonsqueezy.js': 'LemonSqueezy',
  '@polar-sh/sdk': 'Polar',
  'paddle-sdk': 'Paddle', '@paddle/paddle-js': 'Paddle',
};

/**
 * AI/LLM packages.
 *
 * Naming convention: the base SDK uses `'Vercel AI'` to match the
 * stack identity in AI_SDK_PACKAGES below. Provider integrations use
 * parenthesized variants (`'Vercel AI (Anthropic)'`, `(OpenAI)`, `(Google)`).
 * This keeps one SDK identity, multiple provider integrations — and lets the
 * B1 filter in injectAiPatterns use a plain `s.name !== sdk` exact match
 * instead of the previous 3-way match covering the `Vercel AI` / `Vercel AI SDK`
 * naming split.
 */
export const AI_PACKAGES: Record<string, string> = {
  // Core SDKs
  '@anthropic-ai/sdk': 'Anthropic',
  'openai': 'OpenAI',
  '@google/generative-ai': 'Google AI',
  'ai': 'Vercel AI',
  // Vercel AI provider integrations
  '@ai-sdk/anthropic': 'Vercel AI (Anthropic)',
  '@ai-sdk/openai': 'Vercel AI (OpenAI)',
  '@ai-sdk/google': 'Vercel AI (Google)',
  '@ai-sdk/google-vertex': 'Vercel AI (Google Vertex)',
  '@ai-sdk/amazon-bedrock': 'Vercel AI (Bedrock)',
  '@ai-sdk/azure': 'Vercel AI (Azure)',
  '@ai-sdk/mistral': 'Vercel AI (Mistral)',
  '@ai-sdk/cohere': 'Vercel AI (Cohere)',
  '@ai-sdk/togetherai': 'Vercel AI (Together)',
  '@ai-sdk/fireworks': 'Vercel AI (Fireworks)',
  '@openrouter/ai-sdk-provider': 'Vercel AI (OpenRouter)',
  // Direct provider SDKs
  '@mistralai/mistralai': 'Mistral',
  'groq-sdk': 'Groq',
  'cohere-ai': 'Cohere', '@cohere-ai/cohere-v2': 'Cohere',
  'together-ai': 'Together AI',
  'ollama': 'Ollama',
  'replicate': 'Replicate',
  '@azure/openai': 'Azure OpenAI',
  // Frameworks
  'langchain': 'LangChain', '@langchain/core': 'LangChain',
  'llamaindex': 'LlamaIndex',
  'mastra': 'Mastra',
};

/**
 * Email packages
 */
export const EMAIL_PACKAGES: Record<string, string> = {
  'resend': 'Resend',
  '@sendgrid/mail': 'SendGrid',
  'postmark': 'Postmark',
  'nodemailer': 'Nodemailer',
  '@react-email/components': 'React Email',
  'mailgun.js': 'Mailgun',
  '@loops-so/node': 'Loops',
  'plunk-node': 'Plunk',
};

/**
 * Monitoring packages.
 *
 * PostHog deliberately NOT listed here — it lives in EXTERNAL_SERVICE_PACKAGES
 * (scan-engine.ts) with category 'analytics'. Previously duplicated here as
 * 'monitoring', which meant whichever detection loop ran first "won" the
 * category. Latent drift trap — if detection order changed, PostHog
 * would flip from 'analytics' to 'monitoring' without anyone noticing.
 * Single source of truth now.
 */
export const MONITORING_PACKAGES: Record<string, string> = {
  '@sentry/nextjs': 'Sentry', '@sentry/node': 'Sentry', '@sentry/react': 'Sentry',
  'logrocket': 'LogRocket',
  '@amplitude/analytics-browser': 'Amplitude',
  'pino': 'Pino', 'winston': 'Winston',
  '@axiomhq/winston': 'Axiom', '@axiomhq/pino': 'Axiom',
  '@opentelemetry/api': 'OpenTelemetry',
  'dd-trace': 'Datadog',
};

/**
 * Cache/KV store packages. Redis, ioredis, and @upstash/redis are
 * general-purpose infrastructure (caching, sessions, rate limiting).
 * Previously lumped into JOBS_PACKAGES because BullMQ uses Redis,
 * but standalone Redis clients are not job queues.
 */
export const CACHE_PACKAGES: Record<string, string> = {
  'redis': 'Redis',
  'ioredis': 'Redis',
  '@upstash/redis': 'Upstash Redis',
};

/**
 * Background jobs/queue packages
 */
export const JOBS_PACKAGES: Record<string, string> = {
  'inngest': 'Inngest',
  '@trigger.dev/sdk': 'Trigger.dev',
  '@upstash/qstash': 'Upstash QStash',
  'bullmq': 'BullMQ',
  '@temporalio/client': 'Temporal',
  '@hatchet-dev/typescript-sdk': 'Hatchet',
};

/**
 * AI SDK detection — branded case values for stack.aiSdk
 * Order defines precedence when multiple SDKs detected.
 */
const AI_SDK_PACKAGES: Array<[string, string]> = [
  ['@anthropic-ai/sdk', 'Anthropic'],
  ['openai', 'OpenAI'],
  ['@ai-sdk/core', 'Vercel AI'],
  ['ai', 'Vercel AI'],
  ['@google/generative-ai', 'Google AI'],
  ['langchain', 'LangChain'],
  ['@langchain/core', 'LangChain'],
  ['@ai-sdk/anthropic', 'Vercel AI'],
  ['@ai-sdk/openai', 'Vercel AI'],
  ['@ai-sdk/google', 'Vercel AI'],
  ['@ai-sdk/mistral', 'Vercel AI'],
];

/**
 * Detect the primary AI SDK from dependencies.
 * Returns branded name of the first/primary match, or null.
 */
export function detectAiSdk(allDeps: Record<string, string>): string | null {
  for (const [pkg, name] of AI_SDK_PACKAGES) {
    if (allDeps[pkg]) return name;
  }
  return null;
}

/**
 * Python AI SDK detection — priority-ordered list of Python AI packages.
 * Meta-frameworks listed before providers so they win when both are present.
 */
const PYTHON_AI_SDK_PACKAGES: Array<[string, string]> = [
  ['langchain', 'LangChain'],
  ['crewai', 'CrewAI'],
  ['autogen', 'AutoGen'],
  ['anthropic', 'Anthropic'],
  ['openai', 'OpenAI'],
  ['google-generativeai', 'Google AI'],
  ['cohere', 'Cohere'],
];

/**
 * Detect the primary AI SDK from a list of bare Python/Go/Rust package names.
 * Returns branded name of the first/primary match, or null.
 *
 * @param deps - Array of bare package names (lowercase, version-stripped)
 * @returns Display name of the detected AI SDK, or null if none found
 */
export function detectNonNodeAiSdk(deps: string[]): string | null {
  for (const [pkg, name] of PYTHON_AI_SDK_PACKAGES) {
    if (deps.includes(pkg)) return name;
  }
  return null;
}

export interface DependencyDetectionResult {
  database: string | null;
  auth: string | null;
  /**
   * Every testing framework detected in the dependency map, deduplicated
   * by display name. Empty array means no testing framework detected.
   * Was `string | null` (only the first match), which silently
   * dropped every secondary framework in multi-framework projects.
   */
  testing: string[];
  payments: string | null;
}

/**
 * Read and merge dependencies from a package.json file
 */
export async function readDependencies(
  packageJsonPath: string
): Promise<Record<string, string>> {
  try {
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);
    return {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
  } catch {
    return {};
  }
}

/**
 * Detect stack categories from a merged dependency map
 */
export function detectFromDeps(
  allDeps: Record<string, string>
): DependencyDetectionResult {
  const result: DependencyDetectionResult = {
    database: null,
    auth: null,
    testing: [],
    payments: null,
  };

  for (const [pkg, name] of Object.entries(DATABASE_PACKAGES)) {
    if (allDeps[pkg]) { result.database = name; break; }
  }
  for (const [pkg, name] of Object.entries(AUTH_PACKAGES)) {
    if (allDeps[pkg]) { result.auth = name; break; }
  }
  // Testing: collect every match, dedup by display name via Set. The order
  // of TESTING_PACKAGES decides iteration order; the Set preserves insertion
  // order so the first matched framework ends up at index 0 (the "primary"
  // for display consumers that want a single name).
  const testingSeen = new Set<string>();
  for (const [pkg, name] of Object.entries(TESTING_PACKAGES)) {
    if (allDeps[pkg] && !testingSeen.has(name)) {
      testingSeen.add(name);
    }
  }
  result.testing = Array.from(testingSeen);
  for (const [pkg, name] of Object.entries(PAYMENT_PACKAGES)) {
    if (allDeps[pkg]) { result.payments = name; break; }
  }

  return result;
}


/**
 * Detect services from new category maps.
 * Returns entries for externalServices in EngineResult.
 */
export function detectServiceDeps(
  allDeps: Record<string, string>
): Array<{ name: string; category: string }> {
  const services: Array<{ name: string; category: string }> = [];
  const seen = new Set<string>();

  const maps: Array<[Record<string, string>, string]> = [
    [AI_PACKAGES, 'ai'],
    [EMAIL_PACKAGES, 'email'],
    [MONITORING_PACKAGES, 'monitoring'],
    [JOBS_PACKAGES, 'jobs'],
    [CACHE_PACKAGES, 'cache'],
  ];

  for (const [map, category] of maps) {
    for (const [pkg, name] of Object.entries(map)) {
      if (allDeps[pkg] && !seen.has(name)) {
        seen.add(name);
        services.push({ name, category });
      }
    }
  }

  return services;
}

/**
 * Aggregate dependencies from all workspace packages in a monorepo
 */
export async function aggregateMonorepoDependencies(
  rootDir: string,
  workspacePackagePaths: string[]
): Promise<Record<string, string>> {
  const rootDeps = await readDependencies(path.join(rootDir, 'package.json'));
  const aggregated = { ...rootDeps };

  for (const pkgPath of workspacePackagePaths) {
    const absPath = path.isAbsolute(pkgPath)
      ? path.join(pkgPath, 'package.json')
      : path.join(rootDir, pkgPath, 'package.json');
    const deps = await readDependencies(absPath);
    Object.assign(aggregated, deps);
  }

  return aggregated;
}
