/**
 * Documentation inventory detector tests
 *
 * Tests targeted path checks, category assignment, metadata collection,
 * monorepo package docs, docs directory handling, and landing page detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectDocumentation } from '../../../src/engine/detectors/documentation.js';
import type { SourceRoot } from '../../../src/engine/types/census.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

let tmpDir: string;

function writeFile(relativePath: string, content: string = 'content') {
  const fullPath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function makeSourceRoot(relativePath: string): SourceRoot {
  return {
    absolutePath: path.join(tmpDir, relativePath),
    relativePath,
    packageName: relativePath.split('/').pop() || 'root',
    fileCount: 1,
    isPrimary: relativePath === '.',
    deps: {},
    devDeps: {},
    hasBin: false,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-inventory-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
});

describe('documentation inventory', () => {
  describe('root-level file detection', () => {
    it('detects README.md at project root', () => {
      writeFile('README.md', '# My Project');
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], null, {});
      expect(result.files.some(f => f.path === 'README.md')).toBe(true);
      expect(result.files.find(f => f.path === 'README.md')?.category).toBe('project-docs');
    });

    it('detects multiple root-level docs with correct categories', () => {
      writeFile('README.md');
      writeFile('CONTRIBUTING.md');
      writeFile('CHANGELOG.md');
      writeFile('ARCHITECTURE.md');
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], null, {});
      expect(result.files.length).toBeGreaterThanOrEqual(4);
      expect(result.files.find(f => f.path === 'README.md')?.category).toBe('project-docs');
      expect(result.files.find(f => f.path === 'CONTRIBUTING.md')?.category).toBe('guides');
      expect(result.files.find(f => f.path === 'CHANGELOG.md')?.category).toBe('changelog');
      expect(result.files.find(f => f.path === 'ARCHITECTURE.md')?.category).toBe('guides');
    });

    it('detects .env.example', () => {
      writeFile('.env.example', 'DATABASE_URL=');
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], null, {});
      expect(result.files.find(f => f.path === '.env.example')?.category).toBe('config-examples');
    });

    it('detects troubleshooting docs', () => {
      writeFile('FAQ.md');
      writeFile('TROUBLESHOOTING.md');
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], null, {});
      expect(result.files.filter(f => f.category === 'troubleshooting')).toHaveLength(2);
    });
  });

  describe('GitHub templates', () => {
    it('detects .github/PULL_REQUEST_TEMPLATE.md', () => {
      writeFile('.github/PULL_REQUEST_TEMPLATE.md');
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], null, {});
      expect(result.files.find(f => f.path === '.github/PULL_REQUEST_TEMPLATE.md')?.category).toBe('templates');
    });

    it('detects .github/ISSUE_TEMPLATE directory', () => {
      fs.mkdirSync(path.join(tmpDir, '.github', 'ISSUE_TEMPLATE'), { recursive: true });
      writeFile('.github/ISSUE_TEMPLATE/bug.md');
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], null, {});
      expect(result.files.some(f => f.path === '.github/ISSUE_TEMPLATE')).toBe(true);
    });
  });

  describe('API specs', () => {
    it('detects openapi.json at root', () => {
      writeFile('openapi.json', '{}');
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], null, {});
      expect(result.files.find(f => f.path === 'openapi.json')?.category).toBe('api-specs');
    });

    it('detects swagger.yaml at root', () => {
      writeFile('swagger.yaml', 'openapi: 3.0');
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], null, {});
      expect(result.files.find(f => f.path === 'swagger.yaml')?.category).toBe('api-specs');
    });
  });

  describe('monorepo package docs', () => {
    it('detects README.md in package subdirectories', () => {
      writeFile('packages/api/README.md');
      writeFile('packages/web/README.md');
      const roots = [
        makeSourceRoot('.'),
        makeSourceRoot('packages/api'),
        makeSourceRoot('packages/web'),
      ];
      const result = detectDocumentation(tmpDir, roots, null, {});
      expect(result.files.some(f => f.path === 'packages/api/README.md')).toBe(true);
      expect(result.files.some(f => f.path === 'packages/web/README.md')).toBe(true);
    });

    it('detects ARCHITECTURE.md in packages', () => {
      writeFile('packages/cli/ARCHITECTURE.md');
      const roots = [makeSourceRoot('.'), makeSourceRoot('packages/cli')];
      const result = detectDocumentation(tmpDir, roots, null, {});
      const arch = result.files.find(f => f.path === 'packages/cli/ARCHITECTURE.md');
      expect(arch).toBeDefined();
      expect(arch?.category).toBe('guides');
    });

    it('does not duplicate root README when sourceRoots includes root', () => {
      writeFile('README.md');
      const roots = [makeSourceRoot('.')];
      const result = detectDocumentation(tmpDir, roots, null, {});
      const readmes = result.files.filter(f => f.path === 'README.md');
      expect(readmes).toHaveLength(1);
    });
  });

  describe('docs directory', () => {
    it('detects docs/ directory with file count and formats', () => {
      writeFile('docs/intro.md');
      writeFile('docs/guide.mdx');
      writeFile('docs/api/routes.md');
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], null, {});
      expect(result.docsDirectory).not.toBeNull();
      expect(result.docsDirectory!.path).toBe('docs/');
      expect(result.docsDirectory!.fileCount).toBe(3);
      expect(result.docsDirectory!.formats).toContain('md');
      expect(result.docsDirectory!.formats).toContain('mdx');
    });

    it('finds index file in docs/', () => {
      writeFile('docs/index.mdx');
      writeFile('docs/page.md');
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], null, {});
      expect(result.docsDirectory!.indexFile).toBe('docs/index.mdx');
    });

    it('returns null docsDirectory when docs/ does not exist', () => {
      writeFile('README.md');
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], null, {});
      expect(result.docsDirectory).toBeNull();
    });

    it('detects docs framework from deps', () => {
      writeFile('docs/intro.md');
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], null, {
        '@docusaurus/core': '3.0.0',
      });
      expect(result.docsDirectory!.framework).toBe('docusaurus');
    });
  });

  describe('landing page', () => {
    it('detects app/page.tsx for Next.js', () => {
      writeFile('app/page.tsx', 'export default function Page() {}');
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], 'Next.js', {});
      expect(result.landingPage).toBe('app/page.tsx');
    });

    it('detects pages/index.tsx for Next.js Pages Router', () => {
      writeFile('pages/index.tsx', 'export default function Home() {}');
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], 'Next.js', {});
      expect(result.landingPage).toBe('pages/index.tsx');
    });

    it('prefers App Router over Pages Router', () => {
      writeFile('app/page.tsx');
      writeFile('pages/index.tsx');
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], 'Next.js', {});
      expect(result.landingPage).toBe('app/page.tsx');
    });

    it('detects src/App.tsx for plain React', () => {
      writeFile('src/App.tsx');
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], 'React', {});
      expect(result.landingPage).toBe('src/App.tsx');
    });

    it('returns null for CLI tool (no web framework)', () => {
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], null, {});
      expect(result.landingPage).toBeNull();
    });

    it('returns null when landing page file does not exist', () => {
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], 'Next.js', {});
      expect(result.landingPage).toBeNull();
    });
  });

  describe('metadata', () => {
    it('reports correct sizeBytes', () => {
      writeFile('README.md', 'Hello world!'); // 12 bytes
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], null, {});
      expect(result.files[0]?.sizeBytes).toBe(12);
    });

    it('reports sizeBytes: 0 for empty files', () => {
      writeFile('CONTRIBUTING.md', '');
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], null, {});
      expect(result.files.find(f => f.path === 'CONTRIBUTING.md')?.sizeBytes).toBe(0);
    });

    it('reports lastModifiedDays from git', () => {
      // Create a git repo with a README committed
      execSync('git init -b main', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });
      writeFile('README.md', 'content');
      execSync('git add . && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });

      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], null, {});
      // Committed just now → 0 days
      expect(result.files[0]?.lastModifiedDays).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('returns empty files array when no documentation found', () => {
      // Empty directory, no docs
      const result = detectDocumentation(tmpDir, [makeSourceRoot('.')], null, {});
      expect(result.files).toHaveLength(0);
      expect(result.docsDirectory).toBeNull();
      expect(result.landingPage).toBeNull();
    });

    it('does not produce duplicate entries', () => {
      writeFile('README.md');
      const roots = [makeSourceRoot('.')];
      const result = detectDocumentation(tmpDir, roots, null, {});
      const paths = result.files.map(f => f.path);
      expect(new Set(paths).size).toBe(paths.length);
    });
  });
});

describe('documentation inventory — dogfood', () => {
  const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

  it('produces expected output for Anatomia repo', () => {
    const roots: SourceRoot[] = [
      { absolutePath: REPO_ROOT, relativePath: '.', packageName: 'anatomia', fileCount: 10, isPrimary: false, deps: {}, devDeps: {}, hasBin: false },
      { absolutePath: path.join(REPO_ROOT, 'packages/cli'), relativePath: 'packages/cli', packageName: 'cli', fileCount: 100, isPrimary: true, deps: {}, devDeps: {}, hasBin: true },
      { absolutePath: path.join(REPO_ROOT, 'website'), relativePath: 'website', packageName: 'website', fileCount: 10, isPrimary: false, deps: {}, devDeps: {}, hasBin: false },
    ];
    const result = detectDocumentation(REPO_ROOT, roots, null, {});

    // Root docs
    expect(result.files.some(f => f.path === 'README.md')).toBe(true);
    expect(result.files.some(f => f.path === 'CONTRIBUTING.md')).toBe(true);
    expect(result.files.some(f => f.path === 'CHANGELOG.md')).toBe(true);

    // Package docs (README.md is a prepublishOnly artifact, not tracked in git)
    expect(result.files.some(f => f.path === 'packages/cli/ARCHITECTURE.md')).toBe(true);
    expect(result.files.some(f => f.path === 'packages/cli/CONTRIBUTING.md')).toBe(true);

    // website has no README (production prototype replaced demo-site)
    expect(result.files.some(f => f.path === 'website/README.md')).toBe(false);

    // No docs directory, no landing page (CLI tool)
    expect(result.docsDirectory).toBeNull();
    expect(result.landingPage).toBeNull();
  });
});
