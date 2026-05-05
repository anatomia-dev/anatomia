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
 * Returns the first match (primary source root's deployment in a monorepo).
 */
export function detectDeployment(deployments: DeploymentEntry[]): DetectedDeployment {
  if (deployments.length > 0) {
    const first = deployments[0]!;
    return { platform: first.platform, configFile: first.path };
  }
  return { platform: null, configFile: null };
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
