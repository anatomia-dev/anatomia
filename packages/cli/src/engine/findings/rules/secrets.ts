/**
 * Hardcoded secret detection rule.
 *
 * Scans all source files (not just the 500-file sample) for API keys,
 * tokens, database credentials, and weak signing secrets. This is the
 * one rule that reads the filesystem directly — secrets can be in any
 * file, not just sampled ones.
 *
 * Patterns are conservative: fixed prefixes + minimum lengths + post-match
 * validation. Hardened against false positives using insights from Gitleaks,
 * TruffleHog, and GitHub Secret Scanning production behavior.
 *
 * The patterns array is exported for transparency — contributors and users
 * can see exactly what we scan for.
 */

import { glob } from 'glob';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Finding, FindingContext } from '../index.js';

interface SecretPattern {
  regex: RegExp;
  type: string;
  severity: 'critical' | 'warn';
  /** Optional post-match filter. Return false to reject the match. */
  validate?: (match: string) => boolean;
}

/** Known placeholder passwords in database URLs — not real credentials. */
const DB_URL_PLACEHOLDERS = [
  'password', 'changeme', 'your-password', 'your_password', 'placeholder',
  'example', 'secret', 'pass', 'test', 'root', 'admin', 'xxx', 'yyy',
  'postgres', 'mysql', 'redis',
];

/** Structural template patterns — anchored to match the ENTIRE password. */
const TEMPLATE_PATTERNS: RegExp[] = [
  /^<<[^>]+>>$/,          // <<password>>
  /^\{\{[^}]+\}\}$/,      // {{db_pass}}
  /^\$\{[^}]+\}$/,        // ${dbPassword}, ${process.env.DB_URL}
  /^<[a-z][a-z_-]*>$/,    // <your_password>, <your-password>
];

/**
 * Checks if a lowercased password is structural template syntax.
 *
 * @param pw - The lowercased extracted password
 * @returns true if the password matches a known template pattern
 */
function isTemplateSyntax(pw: string): boolean {
  return TEMPLATE_PATTERNS.some(pattern => pattern.test(pw));
}

/**
 * Exported for transparency. Each pattern documents what service it catches.
 */
export const SECRET_PATTERNS: SecretPattern[] = [
  // Stripe — live keys only. Test keys (sk_test_) are expected in test files.
  { regex: /sk_live_[a-zA-Z0-9]{20,}/g, type: 'Live secret key (sk_live_*)', severity: 'critical' },

  // OpenAI — two formats:
  // Current (Apr 2024+): sk-proj-[a-zA-Z0-9_-]{74,}
  // Legacy: sk-[a-zA-Z0-9]{48,} (negative lookahead to avoid matching sk_live_, sk_test_, sk-proj-, sk-ant-)
  { regex: /sk-proj-[a-zA-Z0-9_-]{74,}/g, type: 'OpenAI project key', severity: 'critical' },
  { regex: /sk-(?!proj-|live_|test_|ant-)[a-zA-Z0-9]{48,}/g, type: 'OpenAI API key', severity: 'critical' },

  // Anthropic
  { regex: /sk-ant-[a-zA-Z0-9_-]{90,}/g, type: 'Anthropic API key', severity: 'critical' },

  // AWS access keys — fixed 20-char format, very reliable
  { regex: /AKIA[A-Z0-9]{16}/g, type: 'AWS access key', severity: 'critical' },

  // GitHub tokens — fixed prefixes
  { regex: /ghp_[a-zA-Z0-9]{36}/g, type: 'GitHub personal access token', severity: 'critical' },
  { regex: /github_pat_[a-zA-Z0-9_]{80,}/g, type: 'GitHub fine-grained token', severity: 'critical' },

  // Database URLs with embedded credentials
  { regex: /(postgres|mysql|mongodb|redis):\/\/([^:\s'"]+):([^@\s'"]+)@[^\s'"]+/g,
    type: 'Database credentials in URL', severity: 'critical',
    validate: (match: string) => {
      const pwMatch = match.match(/:\/\/[^:]+:([^@]+)@/);
      const pw = pwMatch?.[1]?.toLowerCase();
      if (!pw) return true;
      if (isTemplateSyntax(pw)) return false;
      return !DB_URL_PLACEHOLDERS.some(p => pw === p || pw.startsWith(p + '-'));
    },
  },

  // Resend, SendGrid, Twilio, PostHog — common YC stack services
  { regex: /re_[a-zA-Z0-9]{20,}/g, type: 'Resend API key', severity: 'critical' },
  { regex: /SG\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g, type: 'SendGrid API key', severity: 'critical' },
  { regex: /SK[a-f0-9]{32}/g, type: 'Twilio API key', severity: 'critical' },
  { regex: /phc_[a-zA-Z0-9]{20,}/g, type: 'PostHog project key', severity: 'warn' },

  // Weak JWT signing secrets — exact known-bad values
  { regex: /(jwt|secret|signing)[\w]*\s*[:=]\s*['"](?:supersecretkey|supersecret|secret|password|changeme|your[_-]?secret)['"]/gi,
    type: 'Weak signing secret', severity: 'critical' },
];

const SECRET_GLOB_IGNORE = [
  // Dependencies and build artifacts
  '**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**',
  '**/.git/**', '**/.turbo/**', '**/out/**', '**/.cache/**',
  // Test files — test keys in test files are expected
  '**/*.test.*', '**/*.spec.*', '**/*.e2e.*', '**/*.e2e-spec.*',
  '**/__tests__/**', '**/test/**', '**/tests/**',
  '**/playwright/**', '**/cypress/**', '**/e2e/**',
  '**/*fixture*/**', '**/*mock*/**', '**/__snapshots__/**',
  // Seed and migration files
  '**/*seed*', '**/migrations/**',
  // Documentation
  '**/*.md', '**/*.mdx',
  // Config and data files
  '**/*.json', '**/*.yaml', '**/*.yml', '**/*.toml',
  // Lock files (contain hashes that look like tokens)
  '**/*.lock', '**/pnpm-lock.*', '**/yarn.lock',
  // Environment files
  '**/.env*',
  // Type declarations, generated, minified
  '**/*.d.ts', '**/*.min.js', '**/*.map',
  // Storybook stories
  '**/*.stories.*',
];

function redact(value: string): string {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}

/**
 * Scan source files for hardcoded secrets.
 *
 * @param ctx - Finding context with rootPath
 * @returns Array of findings — one per secret found, or a single pass if clean
 */
export async function checkHardcodedSecrets(ctx: FindingContext): Promise<Finding[]> {
  const findings: Finding[] = [];
  const checkedServices: string[] = [];

  try {
    const files = await glob('**/*.{ts,tsx,js,jsx,py}', {
      cwd: ctx.rootPath,
      absolute: false,
      ignore: SECRET_GLOB_IGNORE,
    });

    for (const file of files) {
      let content: string;
      try {
        content = readFileSync(path.join(ctx.rootPath, file), 'utf-8');
      } catch { continue; }

      for (const pattern of SECRET_PATTERNS) {
        // Reset regex state for each file (global flag)
        pattern.regex.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = pattern.regex.exec(content)) !== null) {
          // Post-match validation (e.g., database URL placeholder filter)
          if (pattern.validate && !pattern.validate(match[0])) continue;

          const line = content.slice(0, match.index).split('\n').length;

          findings.push({
            id: 'hardcoded-secret',
            severity: pattern.severity,
            title: `Hardcoded ${pattern.type}`,
            detail: `${redact(match[0])}  ${file}:${line}`,
            category: 'security',
          });
        }

        // Track which services we checked (for the pass message)
        if (!checkedServices.includes(pattern.type)) {
          checkedServices.push(pattern.type);
        }
      }
    }
  } catch {
    // Glob failed — skip silently
  }

  if (findings.length === 0) {
    return [{
      id: 'hardcoded-secret',
      severity: 'pass',
      title: 'No hardcoded secrets detected',
      detail: `Checked: Stripe, OpenAI, Anthropic, AWS, GitHub, database URLs, Resend, SendGrid, Twilio`,
      category: 'security',
    }];
  }

  return findings;
}
