/**
 * Display name maps for scan output formatting.
 * Single source of truth — imported by scan-engine.ts and scan.ts.
 */

const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  node: 'Node.js', python: 'Python', go: 'Go', rust: 'Rust',
  ruby: 'Ruby', php: 'PHP', java: 'Java', kotlin: 'Kotlin',
  swift: 'Swift', csharp: 'C#', cpp: 'C++', c: 'C',
  typescript: 'TypeScript', unknown: 'Unknown',
};

const FRAMEWORK_DISPLAY_NAMES: Record<string, string> = {
  nextjs: 'Next.js', react: 'React', vue: 'Vue', angular: 'Angular',
  svelte: 'Svelte', express: 'Express', fastify: 'Fastify', nestjs: 'NestJS',
  // 'react-router' is React Router v7 (merged successor of Remix);
  // 'remix' is legacy Remix installations. Same framework going forward;
  // we report the name that matches the installed packages.
  'react-router': 'React Router', remix: 'Remix',
  nuxt: 'Nuxt', astro: 'Astro', hono: 'Hono',
  fastapi: 'FastAPI', django: 'Django', flask: 'Flask', rails: 'Rails',
  sinatra: 'Sinatra', gin: 'Gin', echo: 'Echo', fiber: 'Fiber',
  actix: 'Actix', rocket: 'Rocket', spring: 'Spring',
  laravel: 'Laravel', symfony: 'Symfony',
};

const PATTERN_DISPLAY_NAMES: Record<string, string> = {
  prisma: 'Prisma', drizzle: 'Drizzle', typeorm: 'TypeORM',
  sequelize: 'Sequelize', mongoose: 'Mongoose', sqlalchemy: 'SQLAlchemy',
  django_orm: 'Django ORM', activerecord: 'ActiveRecord', gorm: 'GORM',
  diesel: 'Diesel', nextauth: 'NextAuth', 'next-auth': 'NextAuth',
  passport: 'Passport', clerk: 'Clerk', auth0: 'Auth0',
  firebase_auth: 'Firebase Auth', supabase_auth: 'Supabase Auth',
  jwt: 'JWT', oauth: 'OAuth', vitest: 'Vitest', jest: 'Jest',
  mocha: 'Mocha', pytest: 'pytest', unittest: 'unittest',
  rspec: 'RSpec', minitest: 'Minitest', go_testing: 'Go testing',
  cargo_test: 'Cargo test', junit: 'JUnit', phpunit: 'PHPUnit',
};

function displayName(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return '';
  return map[key.toLowerCase()] || key;
}

/**
 * Get human-readable display name for a language/project type
 * @param key - Internal language identifier
 * @returns Human-readable display name
 */
export function getLanguageDisplayName(key: string | null | undefined): string {
  return displayName(LANGUAGE_DISPLAY_NAMES, key);
}

/**
 * Get human-readable display name for a framework
 * @param key - Internal framework identifier
 * @returns Human-readable display name
 */
export function getFrameworkDisplayName(key: string | null | undefined): string {
  return displayName(FRAMEWORK_DISPLAY_NAMES, key);
}

/**
 * Get human-readable display name for a pattern (database, auth, testing library)
 * @param key - Internal pattern identifier
 * @returns Human-readable display name
 */
export function getPatternDisplayName(key: string | null | undefined): string {
  return displayName(PATTERN_DISPLAY_NAMES, key);
}
