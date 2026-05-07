import { describe, it, expect, beforeAll } from 'vitest';
import { performance } from 'node:perf_hooks';
import { parseFile, detectLanguage, ParserManager } from '../../../src/engine/parsers/treeSitter.js';
import { ASTCache } from '../../../src/engine/cache/astCache.js';
import { joinPath } from '../../../src/engine/utils/file.js';
import { skipIfNoWasm } from '../fixtures.js';
import { glob } from 'glob';

const wasmAvailable = await skipIfNoWasm();

/** Sample source files directly via glob — no analyze() dependency. */
async function sampleSourceFiles(projectRoot: string, maxFiles: number): Promise<string[]> {
  const files = await glob('**/*.{ts,tsx}', {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/*.d.ts', '**/*.test.*', '**/*.spec.*'],
    absolute: false,
  });
  return files.sort().slice(0, maxFiles);
}

describe.skipIf(!wasmAvailable)('Tree-sitter performance', () => {
  beforeAll(async () => {
    await ParserManager.getInstance().initialize();
  });

  it('parses 20 files in ≤5 seconds', async () => {
    const projectRoot = process.cwd();
    const files = await sampleSourceFiles(projectRoot, 20);

    if (files.length === 0) {
      return;
    }

    const startTime = performance.now();
    for (const file of files) {
      const absolutePath = joinPath(projectRoot, file);
      const language = detectLanguage(absolutePath);
      if (language) {
        try { await parseFile(absolutePath, language); } catch { continue; }
      }
    }
    const elapsed = performance.now() - startTime;

    expect(elapsed).toBeLessThan(5000);
  }, 10000);

  it('achieves ≥80% cache speedup on second run', async () => {
    const projectRoot = process.cwd();
    const cache = new ASTCache(projectRoot);
    await cache.clear();

    const files = await sampleSourceFiles(projectRoot, 20);
    if (files.length === 0) return;

    // Run 1: Cold
    const start1 = performance.now();
    for (const file of files) {
      const absolutePath = joinPath(projectRoot, file);
      const language = detectLanguage(absolutePath);
      if (language) {
        try { await parseFile(absolutePath, language, cache); } catch { continue; }
      }
    }
    const run1Time = performance.now() - start1;

    // Run 2: Warm
    const start2 = performance.now();
    for (const file of files) {
      const absolutePath = joinPath(projectRoot, file);
      const language = detectLanguage(absolutePath);
      if (language) {
        try { await parseFile(absolutePath, language, cache); } catch { continue; }
      }
    }
    const run2Time = performance.now() - start2;

    const speedup = run1Time > 0 ? (run1Time - run2Time) / run1Time : 0;
    expect(speedup).toBeGreaterThanOrEqual(0.80);
  }, 15000);

  it('memory usage stays ≤500MB during parsing', async () => {
    const projectRoot = process.cwd();
    const files = await sampleSourceFiles(projectRoot, 20);
    if (files.length === 0) return;

    if (global.gc) global.gc();
    const memBefore = process.memoryUsage().heapUsed;

    for (const file of files) {
      const absolutePath = joinPath(projectRoot, file);
      const language = detectLanguage(absolutePath);
      if (language) {
        try { await parseFile(absolutePath, language); } catch { continue; }
      }
    }

    const memAfter = process.memoryUsage().heapUsed;
    const memUsedMB = (memAfter - memBefore) / 1024 / 1024;
    expect(memUsedMB).toBeLessThan(500);
  }, 10000);
});
