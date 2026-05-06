/**
 * Architecture classification.
 *
 * Heuristic classifiers that inspect directory names + entry points to
 * detect layered, domain-driven, or microservices architecture patterns.
 * Each helper returns match + confidence + indicators; classifyArchitecture
 * picks the highest-confidence match.
 */

import { basename } from 'node:path';
import type { ArchitectureResult } from '../../types/structure.js';

/**
 * Detect layered architecture pattern
 * @param directories
 */
function isLayeredArchitecture(directories: string[]): {
  match: boolean;
  confidence: number;
  indicators: string[];
} {
  const indicators: string[] = [];

  const hasModels = directories.some(d => d.includes('models'));
  if (hasModels) indicators.push('models/');

  const hasServices = directories.some(d =>
    d.includes('services') || d.includes('domain') || d.includes('business')
  );
  if (hasServices) indicators.push('services/ or domain/');

  const hasApi = directories.some(d =>
    d.includes('api') || d.includes('routes') || d.includes('controllers') || d.includes('handlers')
  );
  if (hasApi) indicators.push('api/ or routes/ or controllers/');

  if (hasModels && hasServices && hasApi) {
    return { match: true, confidence: 0.95, indicators };
  }
  if ((hasModels && hasServices) || (hasServices && hasApi) || (hasModels && hasApi)) {
    return { match: true, confidence: 0.85, indicators };
  }
  if (hasModels || hasServices || hasApi) {
    return { match: true, confidence: 0.70, indicators };
  }
  return { match: false, confidence: 0.0, indicators: [] };
}

/**
 * Detect domain-driven design pattern
 * @param directories
 * @param framework
 */
function isDomainDriven(directories: string[], framework: string | null): {
  match: boolean;
  confidence: number;
  indicators: string[];
} {
  const featurePattern = /^(features|modules|contexts|domains)\/\w+/;
  const domainDirs = directories.filter(d => featurePattern.test(d));

  if (domainDirs.length >= 3) {
    return { match: true, confidence: 0.90, indicators: domainDirs.slice(0, 5) };
  }
  if (domainDirs.length === 2) {
    return { match: true, confidence: 0.80, indicators: domainDirs };
  }

  // NestJS special case
  if (framework?.toLowerCase() === 'nestjs') {
    const nestModulePattern = /^src\/modules\/\w+/;
    const nestModules = directories.filter(d => nestModulePattern.test(d));
    if (nestModules.length >= 2) {
      return { match: true, confidence: 0.85, indicators: ['NestJS modules/', ...nestModules.slice(0, 3)] };
    }
  }

  return { match: false, confidence: 0.0, indicators: [] };
}

/**
 * Detect microservices architecture
 * @param directories
 * @param projectType
 */
function isMicroservices(directories: string[], projectType: string): {
  match: boolean;
  confidence: number;
  indicators: string[];
} {
  const servicePattern = /^services\/\w+/;
  const services = directories.filter(d => servicePattern.test(d));
  if (services.length >= 2) {
    return { match: true, confidence: 0.90, indicators: services.slice(0, 5) };
  }

  const appPattern = /^apps\/\w+/;
  const apps = directories.filter(d => appPattern.test(d));
  if (apps.length >= 2) {
    return { match: true, confidence: 0.90, indicators: apps.slice(0, 5) };
  }

  if (projectType === 'go') {
    const cmdPattern = /^cmd\/\w+/;
    const cmds = directories.filter(d => cmdPattern.test(d));
    if (cmds.length >= 2) {
      return { match: true, confidence: 0.85, indicators: cmds.slice(0, 5) };
    }
  }

  return { match: false, confidence: 0.0, indicators: [] };
}
/**
 * Classify project architecture pattern
 *
 * Uses directory structure heuristics to identify:
 * - Layered (models/, services/, api/)
 * - Domain-driven (features/*, modules/*)
 * - Microservices (apps/*, services/*, cmd/* with ≥2)
 * - Monolith (default/fallback)
 * - Library (no entry point)
 *
 * @param directories - List of directories in project
 * @param entryPoints - Detected entry points (empty for libraries)
 * @param framework - Framework (affects classification - NestJS modules/ = DDD)
 * @param projectType
 * @returns Architecture classification result
 *
 */
export function classifyArchitecture(
  directories: string[],
  entryPoints: string[],
  framework: string | null,
  projectType: string = 'unknown'
): ArchitectureResult {
  // Normalize to forward slashes so regex patterns match on all platforms
  const normalized = directories.map(d => d.replace(/\\/g, '/'));

  // 1. Check microservices (highest specificity)
  const microservices = isMicroservices(normalized, projectType);
  if (microservices.match) {
    return {
      architecture: 'microservices',
      confidence: microservices.confidence,
      indicators: microservices.indicators,
    };
  }

  // 2. Check domain-driven (features/*, modules/*)
  const ddd = isDomainDriven(normalized, framework);
  if (ddd.match) {
    return {
      architecture: 'domain-driven',
      confidence: ddd.confidence,
      indicators: ddd.indicators,
    };
  }

  // 3. Check layered (models + services + api)
  const layered = isLayeredArchitecture(normalized);
  if (layered.match) {
    return {
      architecture: 'layered',
      confidence: layered.confidence,
      indicators: layered.indicators,
    };
  }

  // 4. Check library (no entry point + lib/ or pkg/)
  if (entryPoints.length === 0) {
    const hasLib = normalized.some(d => {
      const base = basename(d);
      // Check if directory is lib/ or pkg/ or starts with them
      return base === 'lib' || base === 'pkg' || d.startsWith('lib/') || d.startsWith('pkg/');
    });
    if (hasLib) {
      return {
        architecture: 'library',
        confidence: 0.90,
        indicators: ['no entry point', 'lib/ or pkg/ directory present'],
      };
    }
  }

  // 5. Default: Monolith (no clear pattern)
  return {
    architecture: 'monolith',
    confidence: 0.70,
    indicators: ['no clear architectural pattern'],
  };
}
