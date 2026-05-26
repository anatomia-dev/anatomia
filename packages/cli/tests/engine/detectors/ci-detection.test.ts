/**
 * Tests for CI and deployment detection from census entries.
 */

import { describe, it, expect } from 'vitest';
import { detectCI, detectDeployment } from '../../../src/engine/detectors/deployment.js';
import type { CiWorkflowEntry, DeploymentEntry } from '../../../src/engine/types/census.js';

describe('CI detection', () => {
  it('detects GitHub Actions from census workflows', () => {
    const workflows: CiWorkflowEntry[] = [
      { system: 'GitHub Actions', workflowFiles: ['ci.yml', 'release.yml'] },
    ];
    const result = detectCI(workflows);
    expect(result.ci).toBe('GitHub Actions');
  });

  it('detects GitLab CI from census workflows', () => {
    const result = detectCI([{ system: 'GitLab CI', workflowFiles: ['.gitlab-ci.yml'] }]);
    expect(result.ci).toBe('GitLab CI');
  });

  it('returns null when no CI workflows in census', () => {
    const result = detectCI([]);
    expect(result.ci).toBeNull();
  });

  it('returns first CI system when multiple present', () => {
    const result = detectCI([
      { system: 'GitHub Actions', workflowFiles: ['ci.yml'] },
      { system: 'GitLab CI', workflowFiles: ['.gitlab-ci.yml'] },
    ]);
    expect(result.ci).toBe('GitHub Actions');
  });
});

describe('Deployment detection', () => {
  it('detects Vercel from census deployments', () => {
    const deployments: DeploymentEntry[] = [
      { platform: 'Vercel', sourceRootPath: '.', path: 'vercel.json' },
    ];
    const result = detectDeployment(deployments);
    expect(result.platform).toBe('Vercel');
    expect(result.configFile).toBe('vercel.json');
  });

  // @ana A006
  it('returns null when no deployments in census', () => {
    const result = detectDeployment([]);
    expect(result.platform).toBeNull();
    expect(result.configFile).toBeNull();
  });

  // @ana A005
  it('returns first deployment when multiple present', () => {
    const result = detectDeployment([
      { platform: 'Docker', sourceRootPath: '.', path: 'Dockerfile' },
      { platform: 'Vercel', sourceRootPath: '.', path: 'vercel.json' },
    ]);
    expect(result.platform).toBe('Docker');
  });

  // @ana A001, A002
  it('prefers primary source root deployment over first entry', () => {
    const result = detectDeployment(
      [
        { platform: 'Cloudflare Workers', sourceRootPath: 'apps/image-proxy', path: 'apps/image-proxy/wrangler.toml' },
        { platform: 'Vercel', sourceRootPath: 'apps/web', path: 'apps/web/vercel.json' },
      ],
      'apps/web',
    );
    expect(result.platform).toBe('Vercel');
    expect(result.configFile).toBe('apps/web/vercel.json');
  });

  // @ana A003
  it('falls back to first entry when primary has no deployment', () => {
    const result = detectDeployment(
      [
        { platform: 'Docker', sourceRootPath: 'apps/worker', path: 'apps/worker/Dockerfile' },
      ],
      'apps/web',
    );
    expect(result.platform).toBe('Docker');
  });

  // @ana A004
  it('single-repo primaryPath matches all entries', () => {
    const result = detectDeployment(
      [
        { platform: 'Vercel', sourceRootPath: '.', path: 'vercel.json' },
      ],
      '.',
    );
    expect(result.platform).toBe('Vercel');
  });

  // @ana A007
  it('returns null when no deployments even with primaryPath', () => {
    const result = detectDeployment([], 'apps/web');
    expect(result.platform).toBeNull();
    expect(result.configFile).toBeNull();
  });
});
