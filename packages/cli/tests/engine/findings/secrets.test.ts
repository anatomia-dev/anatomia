import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkHardcodedSecrets } from '../../../src/engine/findings/rules/secrets.js';
import type { FindingContext } from '../../../src/engine/findings/index.js';
import type { ProjectCensus } from '../../../src/engine/types/census.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

function makeContext(rootPath: string): FindingContext {
  return {
    census: { allDeps: {}, rootDevDeps: {} } as ProjectCensus,
    stack: { language: 'TypeScript', framework: 'Next.js', database: null, auth: null, testing: [], payments: null, workspace: null, aiSdk: null, uiSystem: null },
    secrets: { envFileExists: false, envExampleExists: false, gitignoreCoversEnv: false },
    rootPath,
    sampledFiles: [],
    parsedFiles: [],
  };
}

describe('Hardcoded secrets rule', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('detects Stripe live key', async () => {
    fs.writeFileSync(path.join(tmpDir, 'stripe.ts'), `
      const key = "sk_live_1234567890abcdefghijk";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical' && f.title.includes('Live secret key'))).toBe(true);
  });

  // @ana A004
  it('detects AWS access key', async () => {
    fs.writeFileSync(path.join(tmpDir, 'aws.ts'), `
      const accessKey = "AKIA1234567890ABCDEF";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical' && f.title.includes('AWS'))).toBe(true);
  });

  it('detects database URL with real credentials', async () => {
    fs.writeFileSync(path.join(tmpDir, 'db.ts'), `
      const url = "postgres://myuser:realP4ssw0rd@prod.db.example.com:5432/mydb";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical' && f.title.includes('Database'))).toBe(true);
  });

  it('filters database URL with placeholder password', async () => {
    fs.writeFileSync(path.join(tmpDir, 'example.ts'), `
      // Example: postgres://user:password@localhost:5432/db
      const url = "postgres://user:password@localhost:5432/mydb";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    // Should be a pass — placeholder password filtered
    expect(findings.some(f => f.severity === 'pass')).toBe(true);
    expect(findings.some(f => f.severity === 'critical')).toBe(false);
  });

  // @ana A001
  it('no longer contains weak signing secret pattern', async () => {
    fs.writeFileSync(path.join(tmpDir, 'auth.ts'), `
      const jwtSecret = "supersecretkey";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.title.includes('Weak signing'))).toBe(false);
  });

  it('returns pass finding when no secrets found', async () => {
    fs.writeFileSync(path.join(tmpDir, 'clean.ts'), `
      const apiKey = process.env.API_KEY;
      export function getData() { return fetch('/api/data'); }
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('pass');
    expect(findings[0]!.detail).toContain('Checked:');
  });

  it('excludes test files', async () => {
    fs.mkdirSync(path.join(tmpDir, '__tests__'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '__tests__', 'stripe.ts'), `
      const key = "sk_live_1234567890abcdefghijk";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical')).toBe(false);
  });

  it('excludes .test. files', async () => {
    fs.writeFileSync(path.join(tmpDir, 'stripe.test.ts'), `
      const key = "sk_live_1234567890abcdefghijk";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical')).toBe(false);
  });

  it('redacts secret values in detail', async () => {
    fs.writeFileSync(path.join(tmpDir, 'key.ts'), `
      const key = "sk_live_1234567890abcdefghijk";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    const critical = findings.find(f => f.severity === 'critical');
    expect(critical?.detail).toContain('****');
    expect(critical?.detail).not.toContain('1234567890abcdefghijk');
  });

  // @ana A001
  it('filters <<password>> template in database URL', async () => {
    fs.writeFileSync(path.join(tmpDir, 'config.ts'), `
      const url = "postgres://user:<<password>>@host:5432/db";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical')).toBe(false);
  });

  // @ana A002
  it('filters {{db_pass}} template in database URL', async () => {
    fs.writeFileSync(path.join(tmpDir, 'config.ts'), `
      const url = "postgres://user:{{db_pass}}@host:5432/db";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical')).toBe(false);
  });

  // @ana A003
  it('filters ${dbPassword} template in database URL', async () => {
    fs.writeFileSync(path.join(tmpDir, 'config.ts'), `
      const url = "postgres://user:\${dbPassword}@host:5432/db";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical')).toBe(false);
  });

  // @ana A004
  it('filters ${process.env.DB_URL} template in database URL', async () => {
    fs.writeFileSync(path.join(tmpDir, 'config.ts'), `
      const url = "postgres://user:\${process.env.DB_URL}@host:5432/db";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical')).toBe(false);
  });

  // @ana A005
  it('filters <your_password> template in database URL', async () => {
    fs.writeFileSync(path.join(tmpDir, 'config.ts'), `
      const url = "postgres://user:<YOUR_PASSWORD>@host:5432/db";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical')).toBe(false);
  });

  // @ana A006
  it('detects real credentials in database URL', async () => {
    fs.writeFileSync(path.join(tmpDir, 'config.ts'), `
      const url = "postgres://user:realPassword123@prod.example.com:5432/db";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical')).toBe(true);
  });

  // @ana A007
  it('does not suppress passwords with partial template characters', async () => {
    fs.writeFileSync(path.join(tmpDir, 'config.ts'), `
      const url1 = "postgres://user:p@ss<w0rd@host:5432/db";
      const url2 = "postgres://user:my{secret}123@host:5432/db";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical')).toBe(true);
  });

  it('detects Resend API key', async () => {
    fs.writeFileSync(path.join(tmpDir, 'email.ts'), `
      const key = "re_abc123def456ghi789jkl0";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.title.includes('Resend'))).toBe(true);
  });

  it('detects SendGrid API key', async () => {
    fs.writeFileSync(path.join(tmpDir, 'email.ts'), `
      const key = "SG.abcdef1234567890abcdef.abcdef1234567890abcdef";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.title.includes('SendGrid'))).toBe(true);
  });

  it('filters placeholder GitHub token with repeated characters', async () => {
    fs.writeFileSync(path.join(tmpDir, 'config.ts'), `
      placeholder: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical' && f.title.includes('GitHub'))).toBe(false);
  });

  it('detects real GitHub token with high entropy', async () => {
    fs.writeFileSync(path.join(tmpDir, 'config.ts'), `
      const token = "ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical' && f.title.includes('GitHub'))).toBe(true);
  });

  // @ana A003
  it('does not flag AWS documented example key', async () => {
    fs.writeFileSync(path.join(tmpDir, 'docs.ts'), `
      const exampleKey = "AKIAIOSFODNN7EXAMPLE";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical' && f.title.includes('AWS'))).toBe(false);
  });

  // @ana A002
  it('no longer flags PostHog public analytics keys', async () => {
    fs.writeFileSync(path.join(tmpDir, 'analytics.ts'), `
      const key = "phc_abc123def456ghi789jkl0";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.title.includes('PostHog'))).toBe(false);
  });

  // @ana A005
  it('filters [password] bracket template in database URL', async () => {
    fs.writeFileSync(path.join(tmpDir, 'config.ts'), `
      const url = "postgres://user:[password]@host:5432/db";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical')).toBe(false);
  });

  // @ana A006
  it('filters pw placeholder in database URL', async () => {
    fs.writeFileSync(path.join(tmpDir, 'config.ts'), `
      const url = "postgres://user:pw@localhost:5432/db";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical')).toBe(false);
  });

  // @ana A012
  it('filters pwd placeholder in database URL', async () => {
    fs.writeFileSync(path.join(tmpDir, 'config.ts'), `
      const url = "postgres://user:pwd@localhost:5432/db";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical')).toBe(false);
  });

  // @ana A008
  it('does not flag enum-style secret assignments', async () => {
    fs.writeFileSync(path.join(tmpDir, 'enum.ts'), `
      export enum AuthType {
        SECRET = "secret",
        TOKEN = "token",
      }
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical')).toBe(false);
  });

  // @ana A009
  it('still detects Stripe live key', async () => {
    fs.writeFileSync(path.join(tmpDir, 'pay.ts'), `
      const key = "sk_live_abcdefghij1234567890";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical' && f.title.includes('Live secret key'))).toBe(true);
  });

  // @ana A007
  it('still detects real credentials in database URL', async () => {
    fs.writeFileSync(path.join(tmpDir, 'prod.ts'), `
      const url = "postgres://deploy:s3cureP@ss!@prod.db.example.com:5432/app";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    expect(findings.some(f => f.severity === 'critical' && f.title.includes('Database'))).toBe(true);
  });
});
