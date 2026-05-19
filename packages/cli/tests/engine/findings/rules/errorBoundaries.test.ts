import { describe, it, expect } from 'vitest';
import { checkErrorBoundaries } from '../../../../src/engine/findings/rules/errorBoundaries.js';
import type { FindingContext } from '../../../../src/engine/findings/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

function makeCtx(rootPath: string, framework: string | null = 'Next.js'): FindingContext {
  return {
    census: {} as FindingContext['census'],
    stack: { language: 'TypeScript', framework } as FindingContext['stack'],
    secrets: {} as FindingContext['secrets'],
    rootPath,
    sampledFiles: [],
    parsedFiles: [],
  };
}

function writeFile(dir: string, filePath: string, content: string): void {
  const full = path.join(dir, filePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe('checkErrorBoundaries', () => {
  // @ana A009
  it('detects deeply nested error.tsx', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'err-'));
    try {
      writeFile(tmpDir, 'app/page.tsx', `export default function Home() {}`);
      writeFile(tmpDir, 'app/deep/nested/level/error.tsx', `'use client';\nexport default function Error() {}`);

      const finding = await checkErrorBoundaries(makeCtx(tmpDir));
      expect(finding).not.toBeNull();
      expect(finding!.severity).toBe('pass');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A010
  it('counts pages accurately when no error boundaries exist', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'err-'));
    try {
      for (let i = 0; i < 5; i++) {
        writeFile(tmpDir, `app/route${i}/page.tsx`, `export default function Page${i}() {}`);
      }

      const finding = await checkErrorBoundaries(makeCtx(tmpDir));
      expect(finding).not.toBeNull();
      expect(finding!.title).toContain('5 pages');
      expect(finding!.severity).toBe('info');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A011
  it('returns null for non-Next.js projects', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'err-'));
    try {
      writeFile(tmpDir, 'src/app.tsx', `export default function App() {}`);

      const finding = await checkErrorBoundaries(makeCtx(tmpDir, null));
      expect(finding).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('returns null when no pages exist', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'err-'));
    try {
      writeFile(tmpDir, 'app/layout.tsx', `export default function Layout() {}`);

      const finding = await checkErrorBoundaries(makeCtx(tmpDir));
      expect(finding).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });
});
