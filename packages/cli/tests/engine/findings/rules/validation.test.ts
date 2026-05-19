import { describe, it, expect } from 'vitest';
import { checkApiValidation } from '../../../../src/engine/findings/rules/validation.js';
import type { FindingContext } from '../../../../src/engine/findings/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

function makeCtx(rootPath: string): FindingContext {
  return {
    census: {} as FindingContext['census'],
    stack: { language: 'TypeScript', framework: 'Next.js' } as FindingContext['stack'],
    secrets: {} as FindingContext['secrets'],
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

describe('checkApiValidation', () => {
  // @ana A001
  it('finds all API routes via glob, not just sampled ones', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'val-'));
    try {
      // Create 15 routes at varying depths — 5 shallow, 10 deep
      for (let i = 0; i < 5; i++) {
        writeRoute(tmpDir, `app/api/shallow${i}/route.ts`, `// no validation`);
      }
      for (let i = 0; i < 10; i++) {
        writeRoute(tmpDir, `app/api/deep/nested/level${i}/route.ts`, `// no validation`);
      }

      const finding = await checkApiValidation(makeCtx(tmpDir));
      expect(finding).not.toBeNull();
      expect(finding!.title).toContain('/15');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A002
  it('detects validation imports and returns pass', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'val-'));
    try {
      writeRoute(tmpDir, 'app/api/users/route.ts', `import { z } from 'zod';\nexport function POST() {}`);
      writeRoute(tmpDir, 'app/api/items/route.ts', `import { object } from 'yup';\nexport function POST() {}`);

      const finding = await checkApiValidation(makeCtx(tmpDir));
      expect(finding).not.toBeNull();
      expect(finding!.severity).toBe('pass');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A003
  it('discovers both App Router and Pages Router routes', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'val-'));
    try {
      // 2 App Router routes
      writeRoute(tmpDir, 'app/api/users/route.ts', `import { z } from 'zod';\nexport function POST() {}`);
      writeRoute(tmpDir, 'app/api/items/route.ts', `import { z } from 'zod';\nexport function POST() {}`);
      // 1 Pages Router route
      writeRoute(tmpDir, 'pages/api/legacy.ts', `import { z } from 'zod';\nexport default function handler() {}`);

      const finding = await checkApiValidation(makeCtx(tmpDir));
      expect(finding).not.toBeNull();
      expect(finding!.severity).toBe('pass');
      // All 3 routes found (2 App Router + 1 Pages Router)
      expect(finding!.title).toContain('3');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A004
  it('caps severity at info for small projects (<10 routes)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'val-'));
    try {
      for (let i = 0; i < 5; i++) {
        writeRoute(tmpDir, `app/api/route${i}/route.ts`, `// no validation`);
      }

      const finding = await checkApiValidation(makeCtx(tmpDir));
      expect(finding).not.toBeNull();
      expect(finding!.severity).toBe('info');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A005
  it('returns null when no API routes exist', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'val-'));
    try {
      writeRoute(tmpDir, 'app/page.tsx', `export default function Home() {}`);

      const finding = await checkApiValidation(makeCtx(tmpDir));
      expect(finding).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A006
  it('title uses actual counts, not "sampled"', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'val-'));
    try {
      for (let i = 0; i < 12; i++) {
        writeRoute(tmpDir, `app/api/r${i}/route.ts`, `// no validation`);
      }

      const finding = await checkApiValidation(makeCtx(tmpDir));
      expect(finding).not.toBeNull();
      expect(finding!.title).not.toContain('sampled');
      expect(finding!.title).toContain('12/12');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A007
  it('includes limitation note about wrapper-based validation', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'val-'));
    try {
      writeRoute(tmpDir, 'app/api/validated/route.ts', `import { z } from 'zod';\nexport function POST() {}`);
      writeRoute(tmpDir, 'app/api/unvalidated/route.ts', `export function POST() {}`);

      const finding = await checkApiValidation(makeCtx(tmpDir));
      expect(finding).not.toBeNull();
      expect(finding!.detail).toContain('wrapper-based');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A008
  it('detects validation via schema path patterns', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'val-'));
    try {
      writeRoute(tmpDir, 'app/api/users/route.ts', `import { userSchema } from '@/schemas/user';\nexport function POST() {}`);
      writeRoute(tmpDir, 'app/api/items/route.ts', `import { validateItem } from '@/validation/items';\nexport function POST() {}`);

      const finding = await checkApiValidation(makeCtx(tmpDir));
      expect(finding).not.toBeNull();
      expect(finding!.severity).toBe('pass');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('returns warn for large projects with unvalidated routes', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'val-'));
    try {
      for (let i = 0; i < 12; i++) {
        writeRoute(tmpDir, `app/api/r${i}/route.ts`, `// no validation`);
      }

      const finding = await checkApiValidation(makeCtx(tmpDir));
      expect(finding).not.toBeNull();
      expect(finding!.severity).toBe('warn');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });
});
