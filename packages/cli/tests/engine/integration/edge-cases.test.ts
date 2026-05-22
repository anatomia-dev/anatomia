/**
 * Integration tests for framework detection + performance edge cases.
 *
 * Real file operations in temp directories. Tests the pipeline:
 * dep file → dep parser → framework detector.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { readPythonDependencies } from '../../../src/engine/parsers/python.js';
import { detectFramework } from '../../../src/engine/detectors/framework.js';
import type { FrameworkHintEntry } from '../../../src/engine/types/census.js';

function hint(framework: string, filePath: string): FrameworkHintEntry {
  return { framework, sourceRootPath: '.', path: filePath };
}

describe('Edge Case Integration Tests', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anatomia-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  describe('Framework Detection Edge Cases', () => {
    it('handles library project with no web framework', async () => {
      const projectDir = path.join(tempDir, 'library-project');
      await fs.mkdir(projectDir);
      await fs.writeFile(path.join(projectDir, 'requirements.txt'), 'pytest==7.4.0\nblack==23.0.0\nmypy==1.5.0\n');

      const pythonDeps = await readPythonDependencies(projectDir);
      const result = detectFramework(pythonDeps.production, 'python');

      expect(result.framework).toBe(null);
      expect(result.confidence).toBe(0.0);
      expect(result.indicators).toEqual([]);
    });

    it('handles multiple frameworks in dependencies', async () => {
      const projectDir = path.join(tempDir, 'multi-framework-project');
      await fs.mkdir(projectDir);
      await fs.writeFile(path.join(projectDir, 'requirements.txt'), 'flask==2.3.0\nfastapi==0.100.0\nuvicorn==0.23.0\n');

      const pythonDeps = await readPythonDependencies(projectDir);
      const result = detectFramework(pythonDeps.production, 'python');

      // FastAPI has higher priority in detection order
      expect(result.framework).toBe('fastapi');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('disambiguates Django vs Django REST Framework', async () => {
      const projectDir = path.join(tempDir, 'django-drf-project');
      await fs.mkdir(projectDir);
      await fs.writeFile(path.join(projectDir, 'requirements.txt'), 'django==4.2.0\ndjangorestframework==3.14.0\n');
      await fs.writeFile(path.join(projectDir, 'manage.py'), '#!/usr/bin/env python\nimport os\nimport sys\n');

      const pythonDeps = await readPythonDependencies(projectDir);
      const hints: FrameworkHintEntry[] = [hint('django', 'manage.py')];
      const result = detectFramework(pythonDeps.production, 'python', hints);

      expect(result.framework).toBe('django-drf');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.indicators).toContain('djangorestframework detected (API framework)');
    });
  });

  describe('Performance and Cross-Platform Edge Cases', () => {
    it('handles large project with many files (sampling works)', async () => {
      const projectDir = path.join(tempDir, 'large-project');
      await fs.mkdir(projectDir);
      await fs.writeFile(path.join(projectDir, 'requirements.txt'), 'fastapi==0.100.0');

      const srcDir = path.join(projectDir, 'src');
      await fs.mkdir(srcDir);
      for (let i = 0; i < 100; i++) {
        await fs.writeFile(path.join(srcDir, `module_${i}.py`), '# module\n');
      }

      const pythonDeps = await readPythonDependencies(projectDir);
      const startTime = Date.now();
      const result = detectFramework(pythonDeps.production, 'python');
      const duration = Date.now() - startTime;

      expect(result.framework).toBe('fastapi');
      expect(duration).toBeLessThan(5000);
    });

    it('handles paths with spaces in directory names', async () => {
      const spacedDir = path.join(tempDir, 'project with spaces');
      await fs.mkdir(spacedDir);
      await fs.writeFile(path.join(spacedDir, 'requirements.txt'), 'flask==2.3.0\nsqlalchemy==2.0.0\n');

      const pythonDeps = await readPythonDependencies(spacedDir);
      expect(pythonDeps.production).toContain('flask');
      expect(pythonDeps.production).toContain('sqlalchemy');

      const result = detectFramework(pythonDeps.production, 'python');
      expect(result.framework).toBe('flask');
    });
  });
});
