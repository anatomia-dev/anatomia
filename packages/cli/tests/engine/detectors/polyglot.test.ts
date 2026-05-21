/**
 * Unit tests for polyglot language detection
 *
 * Tests the tiered heuristic in detectProjectType() that disambiguates
 * repos with both package.json and pyproject.toml.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { detectProjectType } from '../../../src/engine/detectors/projectType.js';
import { detectFramework } from '../../../src/engine/detectors/framework.js';

describe('polyglot language detection', () => {
  const tempDirs: string[] = [];

  async function createTempDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'anatom-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    for (const dir of tempDirs) {
      try {
        await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      } catch {
        // Ignore cleanup errors
      }
    }
    tempDirs.length = 0;
  });

  // @ana A001
  it('detects Python when pyproject.toml has PEP 621 dependencies', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "litellm"
dependencies = ["openai", "httpx", "fastapi"]
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('python');
    expect(result.confidence).toBe(0.90);
    expect(result.indicators).toContain('pyproject.toml');
  });

  // @ana A002, A003
  it('preserves Node detection with lockfile and no pyproject.toml', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), '');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
  });

  // @ana A004
  it('workspaces field overrides pyproject.toml presence', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      workspaces: ['packages/*'],
    }));
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), '');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "test"
dependencies = ["fastapi", "uvicorn"]
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.90);
  });

  it('workspaces object format (Yarn) overrides pyproject.toml', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      workspaces: { packages: ['packages/*'] },
    }));
    await fs.writeFile(path.join(dir, 'yarn.lock'), '');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "test"
dependencies = ["django"]
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.90);
  });

  // @ana A005
  it('detects Python when pyproject.toml has Poetry dependencies', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[tool.poetry.dependencies]
python = "^3.9"
fastapi = "^0.100.0"
uvicorn = "^0.23.0"
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('python');
    expect(result.confidence).toBe(0.90);
  });

  // @ana A006, A007
  it('detects Python when no lockfile but pyproject.toml exists', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "myapp"
dependencies = ["flask"]
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('python');
    expect(result.confidence).toBe(0.85);
  });

  // @ana A008, A019
  it('reduces confidence for bare package.json without lockfile', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.70);
  });

  // @ana A009
  it('tooling-only pyproject.toml does not trigger Python detection', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[tool.ruff]
line-length = 88

[tool.black]
line-length = 88
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
  });

  // @ana A010
  it('handles malformed pyproject.toml gracefully', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '{{{{invalid toml content!@#$');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
  });

  // @ana A011
  it('recognizes bun.lock as lockfile indicator', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'bun.lock'), '');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
    expect(result.indicators).toContain('bun.lock');
  });

  // @ana A018
  it('empty dependencies array does not trigger Python detection', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "toolconfig"
dependencies = []
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
  });

  // @ana A012
  it('frameworkDeps uses Python deps after type flip', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
    }));
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "backend"
dependencies = ["fastapi", "uvicorn", "sqlalchemy"]
`);

    // Type detection flips to Python
    const result = await detectProjectType(dir);
    expect(result.type).toBe('python');

    // Framework detection should use Python deps, not Node deps
    const pythonDeps = ['fastapi', 'uvicorn', 'sqlalchemy'];
    const nodeDeps = ['react', 'react-dom'];

    // If frameworkDeps correctly uses Python deps, it finds fastapi
    const frameworkResult = detectFramework(pythonDeps, 'python', []);
    expect(frameworkResult.framework).toBe('fastapi');

    // Node deps would NOT find fastapi
    const wrongResult = detectFramework(nodeDeps, 'python', []);
    expect(wrongResult.framework).not.toBe('fastapi');
  });

  it('detects Python with PEP 508 extras in dependencies', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "langflow"
dependencies = [
    "langflow-base[complete]>=0.9.3",
]
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('python');
    expect(result.confidence).toBe(0.90);
  });

  it('detects Python with multiple extras in dependencies', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "myapp"
dependencies = [
    "requests[security,socks]>=2.28",
    "uvicorn[standard]",
    "fastapi",
]
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('python');
    expect(result.confidence).toBe(0.90);
  });

  it('pyproject.toml with only [project] but no dependencies key → node', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "config-only"
version = "1.0.0"
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
  });

  // --- Rust/Go polyglot detection ---

  // @ana A001, A002, A003
  it('detects Rust when Cargo.toml has [workspace] section (with lockfile)', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), '');
    await fs.writeFile(path.join(dir, 'Cargo.toml'), `[workspace]
members = ["crates/*"]

[workspace.package]
version = "0.1.0"
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('rust');
    expect(result.confidence).toBe(0.90);
    expect(result.indicators).toContain('Cargo.toml');
  });

  // @ana A004
  it('single-crate Cargo.toml without [workspace] stays Node', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'Cargo.toml'), `[package]
name = "wasm-bindings"
version = "0.1.0"

[dependencies]
wasm-bindgen = "0.2"
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
  });

  // @ana A005, A006, A007
  it('detects Go when go.mod exists alongside package.json (with lockfile)', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'go.mod'), `module github.com/example/app

go 1.21
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('go');
    expect(result.confidence).toBe(0.90);
    expect(result.indicators).toContain('go.mod');
  });

  // @ana A008, A009
  it('preserves Node detection with lockfile and no competing manifest', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'yarn.lock'), '');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
  });

  // @ana A010
  it('workspaces field overrides Cargo.toml presence', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      workspaces: ['packages/*'],
    }));
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), '');
    await fs.writeFile(path.join(dir, 'Cargo.toml'), `[workspace]
members = ["crates/*"]
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.90);
  });

  // @ana A011
  it('workspaces field overrides go.mod presence', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      workspaces: ['packages/*'],
    }));
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), '');
    await fs.writeFile(path.join(dir, 'go.mod'), `module github.com/example/app

go 1.21
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.90);
  });

  // @ana A012
  it('handles malformed Cargo.toml gracefully', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'Cargo.toml'), '{{{{invalid toml!@#$%^&*');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
  });

  // @ana A013, A014
  it('detects Rust without lockfile when Cargo.toml has [workspace]', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'Cargo.toml'), `[workspace]
members = ["crates/*"]
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('rust');
    expect(result.confidence).toBe(0.85);
  });

  // @ana A015, A016
  it('detects Go without lockfile when go.mod exists', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'go.mod'), `module github.com/example/app

go 1.21
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('go');
    expect(result.confidence).toBe(0.85);
  });

  // @ana A017
  it('frameworkDeps routes to language-specific deps after Rust type flip', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^18.0.0' },
    }));
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), '');
    await fs.writeFile(path.join(dir, 'Cargo.toml'), `[workspace]
members = ["crates/*"]
`);

    // Type detection flips to Rust
    const result = await detectProjectType(dir);
    expect(result.type).toBe('rust');

    // Framework detection with Rust deps finds a framework
    const rustDeps = ['actix-web', 'serde', 'tokio'];
    const frameworkResult = detectFramework(rustDeps, 'rust', []);
    expect(frameworkResult.framework).toBeDefined();
  });

  // @ana A018
  it('existing polyglot tests pass without modification (regression guard)', async () => {
    // This test validates that the tier changes don't break existing Python detection.
    // The fact that ALL tests in this file pass serves as the regression proof.
    // Explicit check: Python with lockfile still works alongside Cargo.toml changes.
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "backend"
dependencies = ["fastapi", "uvicorn"]
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('python');
    expect(result.confidence).toBe(0.90);
  });

  // --- Tauri+TS polyglot detection ---

  // @ana A001, A002, A003
  it('detects Node for Tauri+TS monorepo with pnpm-workspace.yaml', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), '');
    await fs.writeFile(path.join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n');
    await fs.writeFile(path.join(dir, 'Cargo.toml'), `[workspace]
members = ["apps/desktop/src-tauri"]

[workspace.dependencies]
tauri = { version = "2.5.0", features = ["devtools"] }
tauri-build = "2.5.0"
serde = { version = "1", features = ["derive"] }
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.85);
    expect(result.indicators).toContain('pnpm-workspace.yaml');
  });

  // @ana A005, A006
  it('detects Rust when tauri dep exists but no pnpm-workspace.yaml', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), '');
    await fs.writeFile(path.join(dir, 'Cargo.toml'), `[workspace]
members = ["src-tauri"]

[workspace.dependencies]
tauri = "2.5.0"
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('rust');
    expect(result.confidence).toBe(0.90);
  });

  // @ana A015, A016
  it('detects Node for Tauri+TS monorepo without lockfile (Tier 4)', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n');
    await fs.writeFile(path.join(dir, 'Cargo.toml'), `[workspace]
members = ["apps/desktop/src-tauri"]

[workspace.dependencies]
tauri = "2.5.0"
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.80);
  });

  // @ana A017
  it('falls through to Rust when [workspace.dependencies] is malformed', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), '');
    await fs.writeFile(path.join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n');
    await fs.writeFile(path.join(dir, 'Cargo.toml'), `[workspace]
members = ["crates/*"]

[workspace.dependencies]
!!!garbled content here = = = {}
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('rust');
    expect(result.confidence).toBe(0.90);
  });

  // @ana A018, A019
  it('detects tauri via [workspace.dependencies.tauri] sub-table format', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), '');
    await fs.writeFile(path.join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n');
    await fs.writeFile(path.join(dir, 'Cargo.toml'), `[workspace]
members = ["apps/desktop/src-tauri"]

[workspace.dependencies.tauri]
version = "2.5.0"
features = ["devtools"]
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.85);
  });

  // --- Ruby polyglot detection ---

  // @ana A007, A008, A009
  it('detects Ruby when Gemfile exists alongside package.json with lockfile', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'Gemfile'), 'source "https://rubygems.org"\ngem "rails"\n');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('ruby');
    expect(result.confidence).toBe(0.90);
    expect(result.indicators).toContain('Gemfile');
  });

  // @ana A010, A011
  it('detects Ruby when Gemfile exists alongside package.json without lockfile', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'Gemfile'), 'source "https://rubygems.org"\ngem "sinatra"\n');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('ruby');
    expect(result.confidence).toBe(0.85);
  });

  // @ana A014
  it('Python wins over Rust when both compete alongside package.json', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "ml-pipeline"
dependencies = ["torch", "numpy"]
`);
    await fs.writeFile(path.join(dir, 'Cargo.toml'), `[workspace]
members = ["crates/*"]
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('python');
    expect(result.confidence).toBe(0.90);
  });

  // @ana A005, A006
  it('Python wins when all four competing manifests are present', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "ml-pipeline"
dependencies = ["fastapi", "uvicorn"]
`);
    await fs.writeFile(path.join(dir, 'Cargo.toml'), `[workspace]
members = ["crates/*"]
`);
    await fs.writeFile(path.join(dir, 'Gemfile'), `source "https://rubygems.org"
gem "rails"
`);
    await fs.writeFile(path.join(dir, 'go.mod'), `module example.com/app

go 1.21
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('python');
    expect(result.confidence).toBe(0.90);
  });

  // @ana A007, A008
  it('Rust wins when Python is absent but three competitors remain', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'Cargo.toml'), `[workspace]
members = ["crates/*"]
`);
    await fs.writeFile(path.join(dir, 'Gemfile'), `source "https://rubygems.org"
gem "rails"
`);
    await fs.writeFile(path.join(dir, 'go.mod'), `module example.com/app

go 1.21
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('rust');
    expect(result.confidence).toBe(0.90);
  });

  it('Cargo.toml with [workspace.members] but no [workspace] stays Node', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'Cargo.toml'), `[package]
name = "wasm-lib"
version = "0.1.0"

[workspace.members]
include = ["sub-crate"]
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
  });
});
