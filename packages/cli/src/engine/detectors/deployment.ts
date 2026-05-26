/**
 * Deployment platform and CI detection from census config entries.
 *
 * Receives pre-discovered config entries from census instead of
 * walking the filesystem via rootPath.
 */

import type { DeploymentEntry, CiWorkflowEntry } from '../types/census.js';

/**
 * Detected deployment platform metadata. Both fields null when no platform
 * detected — a single always-populated shape instead of `{...} | null`
 * simplifies composition at the consumer.
 */
export interface DetectedDeployment {
  platform: string | null;
  configFile: string | null;
}

/**
 * Detected CI system metadata.
 */
export interface DetectedCI {
  ci: string | null;
  ciWorkflowFiles: string[];
}

/**
 * Detect deployment platform from census deployment entries.
 * When `primaryPath` is provided, prefers a deployment whose `sourceRootPath`
 * matches the primary source root. Falls back to `deployments[0]` when no
 * primary match exists or `primaryPath` is omitted.
 *
 * @param deployments - Census deployment entries discovered during scan.
 * @param primaryPath - Optional primary source root path (e.g. `'apps/web'` or `'.'`).
 * @returns Detected deployment platform and config file, or nulls if none found.
 */
export function detectDeployment(
  deployments: DeploymentEntry[],
  primaryPath?: string,
): DetectedDeployment {
  if (deployments.length === 0) {
    return { platform: null, configFile: null };
  }

  if (primaryPath !== undefined) {
    const primary = deployments.find(d => d.sourceRootPath === primaryPath);
    if (primary) {
      return { platform: primary.platform, configFile: primary.path };
    }
  }

  const first = deployments[0]!;
  return { platform: first.platform, configFile: first.path };
}

/**
 * Detect CI system from census CI workflow entries.
 */
export function detectCI(ciWorkflows: CiWorkflowEntry[]): DetectedCI {
  if (ciWorkflows.length > 0) {
    return { ci: ciWorkflows[0]!.system, ciWorkflowFiles: ciWorkflows[0]!.workflowFiles };
  }
  return { ci: null, ciWorkflowFiles: [] };
}
