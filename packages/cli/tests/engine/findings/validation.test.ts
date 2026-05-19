import { describe, it, expect } from 'vitest';
import { checkApiValidation } from '../../../src/engine/findings/rules/validation.js';
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

function writeRoute(dir: string, filePath: string, content: string): void {
  const full = path.join(dir, filePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe('API validation rule', () => {
  it('returns null when no API routes exist', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'val-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'src', 'utils.ts'), '// utils');
      const result = await checkApiValidation(makeContext(tmpDir));
      expect(result).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('passes when all API routes import validation', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'val-'));
    try {
      writeRoute(tmpDir, 'app/api/users/route.ts', `import { z } from 'zod';\nexport function POST() {}`);
      writeRoute(tmpDir, 'app/api/posts/route.ts', `import { object } from 'yup';\nexport function POST() {}`);

      const result = await checkApiValidation(makeContext(tmpDir));
      expect(result?.severity).toBe('pass');
      expect(result?.title).toContain('All 2 API routes');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('warns when some API routes lack validation', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'val-'));
    try {
      writeRoute(tmpDir, 'app/api/users/route.ts', `import { z } from 'zod';\nexport function POST() {}`);
      for (let i = 0; i < 11; i++) {
        writeRoute(tmpDir, `app/api/r${i}/route.ts`, `export function POST() {}`);
      }

      const result = await checkApiValidation(makeContext(tmpDir));
      expect(result?.severity).toBe('warn');
      expect(result?.title).toContain('11/12');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('detects validation via shared schema imports', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'val-'));
    try {
      writeRoute(tmpDir, 'app/api/users/route.ts', `import { userSchema } from '@/lib/schemas/user';\nexport function POST() {}`);
      writeRoute(tmpDir, 'app/api/posts/route.ts', `import { validate } from '@/features/validation';\nexport function POST() {}`);

      const result = await checkApiValidation(makeContext(tmpDir));
      expect(result?.severity).toBe('pass');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('detects pages/api routes', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'val-'));
    try {
      writeRoute(tmpDir, 'pages/api/webhook.ts', `import type { NextApiRequest } from 'next';\nexport default function handler() {}`);

      const result = await checkApiValidation(makeContext(tmpDir));
      expect(result?.severity).not.toBe('pass');
      expect(result?.title).toContain('1/1');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });
});
