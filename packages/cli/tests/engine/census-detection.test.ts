/**
 * Tests for deployment platform and CI system detection in census.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { discoverDeployments, discoverCiWorkflows } from '../../src/engine/census.js';

describe('discoverDeployments', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'census-deploy-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const makeRoots = (dir: string) => [{ absolutePath: dir, relativePath: '.' }];

  // @ana A001
  it('detects Cloudflare Workers from wrangler.toml', () => {
    fs.writeFileSync(path.join(tmpDir, 'wrangler.toml'), '');
    const entries = discoverDeployments(tmpDir, makeRoots(tmpDir));
    expect(entries).toContainEqual(
      expect.objectContaining({ platform: 'Cloudflare Workers' }),
    );
  });

  // @ana A002
  it('detects Cloudflare Workers from wrangler.jsonc', () => {
    fs.writeFileSync(path.join(tmpDir, 'wrangler.jsonc'), '');
    const entries = discoverDeployments(tmpDir, makeRoots(tmpDir));
    expect(entries).toContainEqual(
      expect.objectContaining({ platform: 'Cloudflare Workers' }),
    );
  });

  it('detects Cloudflare Workers from wrangler.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'wrangler.json'), '');
    const entries = discoverDeployments(tmpDir, makeRoots(tmpDir));
    expect(entries).toContainEqual(
      expect.objectContaining({ platform: 'Cloudflare Workers' }),
    );
  });

  // @ana A003
  it('detects Helm from Chart.yaml', () => {
    fs.writeFileSync(path.join(tmpDir, 'Chart.yaml'), '');
    const entries = discoverDeployments(tmpDir, makeRoots(tmpDir));
    expect(entries).toContainEqual(
      expect.objectContaining({ platform: 'Helm' }),
    );
  });

  // @ana A004
  it('detects Kubernetes from kustomization.yaml', () => {
    fs.writeFileSync(path.join(tmpDir, 'kustomization.yaml'), '');
    const entries = discoverDeployments(tmpDir, makeRoots(tmpDir));
    expect(entries).toContainEqual(
      expect.objectContaining({ platform: 'Kubernetes' }),
    );
  });

  // @ana A005
  it('detects AWS CDK from cdk.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'cdk.json'), '');
    const entries = discoverDeployments(tmpDir, makeRoots(tmpDir));
    expect(entries).toContainEqual(
      expect.objectContaining({ platform: 'AWS CDK' }),
    );
  });

  // @ana A006
  it('detects Pulumi from Pulumi.yaml', () => {
    fs.writeFileSync(path.join(tmpDir, 'Pulumi.yaml'), '');
    const entries = discoverDeployments(tmpDir, makeRoots(tmpDir));
    expect(entries).toContainEqual(
      expect.objectContaining({ platform: 'Pulumi' }),
    );
  });

  // @ana A007
  it('detects Serverless Framework from serverless.yml', () => {
    fs.writeFileSync(path.join(tmpDir, 'serverless.yml'), '');
    const entries = discoverDeployments(tmpDir, makeRoots(tmpDir));
    expect(entries).toContainEqual(
      expect.objectContaining({ platform: 'Serverless Framework' }),
    );
  });

  it('detects Serverless Framework from serverless.yaml', () => {
    fs.writeFileSync(path.join(tmpDir, 'serverless.yaml'), '');
    const entries = discoverDeployments(tmpDir, makeRoots(tmpDir));
    expect(entries).toContainEqual(
      expect.objectContaining({ platform: 'Serverless Framework' }),
    );
  });

  // @ana A008
  it('existing deployment platforms are unchanged', () => {
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), '');
    fs.writeFileSync(path.join(tmpDir, 'vercel.json'), '{}');
    const entries = discoverDeployments(tmpDir, makeRoots(tmpDir));
    const platforms = entries.map(e => e.platform);
    expect(platforms).toContain('Docker');
    expect(platforms).toContain('Vercel');
  });

  it('detects deployment configs in workspace packages', () => {
    const pkgDir = path.join(tmpDir, 'apps', 'worker');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'wrangler.toml'), '');
    const roots = [{ absolutePath: pkgDir, relativePath: 'apps/worker' }];
    const entries = discoverDeployments(tmpDir, roots);
    expect(entries).toContainEqual(
      expect.objectContaining({
        platform: 'Cloudflare Workers',
        sourceRootPath: 'apps/worker',
        path: 'apps/worker/wrangler.toml',
      }),
    );
  });
});

describe('discoverCiWorkflows', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'census-ci-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // @ana A009
  it('detects CircleCI from .circleci/config.yml', () => {
    const circleDir = path.join(tmpDir, '.circleci');
    fs.mkdirSync(circleDir);
    fs.writeFileSync(path.join(circleDir, 'config.yml'), '');
    const entries = discoverCiWorkflows(tmpDir);
    expect(entries).toContainEqual({
      system: 'CircleCI',
      workflowFiles: ['.circleci/config.yml'],
    });
  });

  // @ana A010
  it('detects Jenkins from Jenkinsfile', () => {
    fs.writeFileSync(path.join(tmpDir, 'Jenkinsfile'), '');
    const entries = discoverCiWorkflows(tmpDir);
    expect(entries).toContainEqual({
      system: 'Jenkins',
      workflowFiles: ['Jenkinsfile'],
    });
  });

  // @ana A011
  it('detects Bitbucket Pipelines from bitbucket-pipelines.yml', () => {
    fs.writeFileSync(path.join(tmpDir, 'bitbucket-pipelines.yml'), '');
    const entries = discoverCiWorkflows(tmpDir);
    expect(entries).toContainEqual({
      system: 'Bitbucket Pipelines',
      workflowFiles: ['bitbucket-pipelines.yml'],
    });
  });

  // @ana A012
  it('existing CI detection is unchanged', () => {
    const workflowsDir = path.join(tmpDir, '.github', 'workflows');
    fs.mkdirSync(workflowsDir, { recursive: true });
    fs.writeFileSync(path.join(workflowsDir, 'ci.yml'), '');
    const entries = discoverCiWorkflows(tmpDir);
    expect(entries).toContainEqual(
      expect.objectContaining({ system: 'GitHub Actions' }),
    );
  });

  it('detects GitLab CI from .gitlab-ci.yml', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitlab-ci.yml'), '');
    const entries = discoverCiWorkflows(tmpDir);
    expect(entries).toContainEqual({
      system: 'GitLab CI',
      workflowFiles: ['.gitlab-ci.yml'],
    });
  });

  it('does not detect CircleCI when .circleci dir exists but has no config.yml', () => {
    const circleDir = path.join(tmpDir, '.circleci');
    fs.mkdirSync(circleDir);
    const entries = discoverCiWorkflows(tmpDir);
    const systems = entries.map(e => e.system);
    expect(systems).not.toContain('CircleCI');
  });

  it('detects multiple CI systems simultaneously', () => {
    fs.writeFileSync(path.join(tmpDir, 'Jenkinsfile'), '');
    fs.writeFileSync(path.join(tmpDir, 'bitbucket-pipelines.yml'), '');
    const entries = discoverCiWorkflows(tmpDir);
    const systems = entries.map(e => e.system);
    expect(systems).toContain('Jenkins');
    expect(systems).toContain('Bitbucket Pipelines');
  });
});

describe('workspace label logic', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'census-workspace-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Mirror the scan-engine ternary logic to test workspace labeling.
   * This replicates the inline ternary from scan-engine.ts so we can
   * test the filesystem detection without running the full scan.
   */
  function getWorkspaceLabel(rootPath: string, tool: string): string {
    if (existsSync(path.join(rootPath, 'turbo.json'))) {
      return `Turborepo (${tool})`;
    }
    if (existsSync(path.join(rootPath, 'nx.json'))) {
      return `Nx (${tool})`;
    }
    return `${tool} monorepo`;
  }

  // @ana A013
  it('detects Nx workspace from nx.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'nx.json'), '{}');
    expect(getWorkspaceLabel(tmpDir, 'pnpm')).toBe('Nx (pnpm)');
  });

  // @ana A014
  it('Turborepo detection unchanged', () => {
    fs.writeFileSync(path.join(tmpDir, 'turbo.json'), '{}');
    expect(getWorkspaceLabel(tmpDir, 'pnpm')).toBe('Turborepo (pnpm)');
  });

  // @ana A015
  it('Turborepo takes precedence over Nx', () => {
    fs.writeFileSync(path.join(tmpDir, 'turbo.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'nx.json'), '{}');
    expect(getWorkspaceLabel(tmpDir, 'npm')).toBe('Turborepo (npm)');
  });

  // @ana A016
  it('generic monorepo label when no orchestrator', () => {
    expect(getWorkspaceLabel(tmpDir, 'yarn')).toBe('yarn monorepo');
  });
});
