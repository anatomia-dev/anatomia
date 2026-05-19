import { describe, it, expect } from 'vitest';
import { checkErrorBoundaries } from '../../../src/engine/findings/rules/errorBoundaries.js';
import type { FindingContext } from '../../../src/engine/findings/index.js';
import type { ProjectCensus } from '../../../src/engine/types/census.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

function makeContext(rootPath: string, framework: string | null = 'Next.js'): FindingContext {
  return {
    census: { allDeps: {}, rootDevDeps: {} } as ProjectCensus,
    stack: { language: 'TypeScript', framework, database: null, auth: null, testing: [], payments: null, workspace: null, aiSdk: null, uiSystem: null },
    secrets: { envFileExists: false, envExampleExists: false, gitignoreCoversEnv: false },
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

describe('Error boundaries rule', () => {
  it('returns null when not Next.js', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'err-'));
    try {
      writeFile(tmpDir, 'app/page.tsx', `export default function Home() {}`);
      const result = await checkErrorBoundaries(makeContext(tmpDir, 'Express'));
      expect(result).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('returns null when no pages exist', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'err-'));
    try {
      writeFile(tmpDir, 'src/utils.ts', '// utils');
      const result = await checkErrorBoundaries(makeContext(tmpDir));
      expect(result).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('passes when error.tsx exists', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'err-'));
    try {
      writeFile(tmpDir, 'app/page.tsx', `export default function Home() {}`);
      writeFile(tmpDir, 'app/dashboard/page.tsx', `export default function Dash() {}`);
      writeFile(tmpDir, 'app/error.tsx', `'use client';\nexport default function Error() {}`);

      const result = await checkErrorBoundaries(makeContext(tmpDir));
      expect(result?.severity).toBe('pass');
      expect(result?.title).toBe('Error boundary detected');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('shows info when no error boundaries', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'err-'));
    try {
      writeFile(tmpDir, 'app/page.tsx', `export default function Home() {}`);
      writeFile(tmpDir, 'app/dashboard/page.tsx', `export default function Dash() {}`);
      writeFile(tmpDir, 'app/settings/page.tsx', `export default function Settings() {}`);

      const result = await checkErrorBoundaries(makeContext(tmpDir));
      expect(result?.severity).toBe('info');
      expect(result?.title).toContain('3 pages, no error boundaries');
      expect(result?.detail).toContain('app/error.tsx');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });
});
