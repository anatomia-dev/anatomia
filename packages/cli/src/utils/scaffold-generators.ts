/**
 * Scaffold generators for context files
 *
 * Two generators:
 * - generateProjectContextScaffold: scan-seeded format with 6 sections
 * - generateDesignPrinciplesTemplate: static human-content template
 *
 * @module scaffold-generators
 */

import type { EngineResult } from '../engine/types/engineResult.js';
import { SCAFFOLD_MARKER } from '../constants.js';

/**
 * Select the primary schema across all detected ORMs by highest modelCount.
 * When all modelCount are null, falls back to first-found (insertion order).
 *
 * @param schemas - EngineResult.schemas record
 * @returns The best schema entry, or null if none found
 */
export function selectPrimarySchema(
  schemas: EngineResult['schemas'],
): { found: boolean; path: string | null; modelCount: number | null; provider?: string | null } | null {
  return Object.values(schemas || {})
    .filter(sc => sc?.found)
    .sort((a, b) => {
      const aCount = a?.modelCount;
      const bCount = b?.modelCount;
      if (aCount == null && bCount == null) return 0;
      if (aCount == null) return 1;
      if (bCount == null) return -1;
      return bCount - aCount;
    })[0] ?? null;
}

/**
 * Render the "Start Here" reading-order block for the project-context scaffold.
 *
 * This is the agent-facing form of the `ana scan` "Start here" card (Slice 3):
 * the top of the fused, token-budgeted reading list — the files import
 * centrality, proven rework risk, and co-change agree are the highest-leverage
 * to read before making a change. Each line carries its measured reasons so the
 * ranking is explainable, never asserted.
 *
 * @param readingOrder - The EngineResult `readingOrder` (null below the edge
 *   threshold or at surface tier — yields an empty string, no header).
 * @returns A markdown section (with trailing blank line), or `''` when there is
 *   no reading order to show.
 */
export function generateReadingOrderBlock(
  readingOrder: EngineResult['readingOrder'],
): string {
  if (!readingOrder || readingOrder.entries.length === 0) return '';

  const MAX_ENTRIES = 7;
  const scoped = readingOrder.personalizedTo
    ? ` (scoped to \`${readingOrder.personalizedTo}\`)`
    : '';
  let block = `## Start Here${scoped}\n\n`;
  block += `*Fused from import centrality, proven rework risk, and co-change — read these first.*\n\n`;
  for (const entry of readingOrder.entries.slice(0, MAX_ENTRIES)) {
    const reasons = entry.reasons.length > 0 ? ` — ${entry.reasons.join('; ')}` : '';
    block += `- \`${entry.file}\`${reasons}\n`;
  }
  if (readingOrder.entries.length > MAX_ENTRIES) {
    block += `- *(+${readingOrder.entries.length - MAX_ENTRIES} more in \`.ana/scan.json\`)*\n`;
  }
  block += '\n';
  return block;
}

/**
 * Generate project-context.md scaffold
 *
 * Produces 6 sections with scan-seeded **Detected:** lines.
 * Machine sections show detected data; human sections show section-specific placeholders.
 *
 * @param result - Engine result
 * @returns Markdown scaffold string
 */
export function generateProjectContextScaffold(result: EngineResult): string {
  let s = `${SCAFFOLD_MARKER}\n\n`;
  s += `# Project Context\n\n`;

  // Section 1: What This Project Does — synthesized description
  s += `## What This Project Does\n\n`;
  const descParts: string[] = [];
  if (result.monorepo.isMonorepo) {
    const tool = result.monorepo.tool || 'monorepo';
    descParts.push(`${tool} monorepo`);
  } else if (result.applicationShape && result.applicationShape !== 'unknown') {
    const shapeLabels: Record<string, string> = {
      'mcp-server': 'MCP server',
      'ai-agent': 'AI agent',
      'mobile-app': 'mobile application',
      'worker': 'background worker',
      'cli': 'CLI tool',
      'library': 'library',
      'web-app': 'web application',
      'api-server': 'API server',
      'full-stack': 'full-stack application',
    };
    const label = shapeLabels[result.applicationShape] ?? 'project';
    const prefix = result.stack.framework ?? result.stack.language;
    descParts.push(prefix ? `${prefix} ${label}` : label);
  } else if (result.projectProfile?.hasBrowserUI && result.stack.framework) {
    descParts.push(`${result.stack.framework} web application`);
  } else if (result.stack.framework) {
    descParts.push(`${result.stack.framework} application`);
  } else if (result.stack.language) {
    descParts.push(`${result.stack.language} project`);
  }
  if (result.stack.auth) descParts.push(`with authentication (${result.stack.auth})`);
  if (result.stack.database) {
    const schema = selectPrimarySchema(result.schemas);
    const provider = schema?.provider ? ` → ${schema.provider}` : '';
    const models = schema?.modelCount ? `, ${schema.modelCount} models` : '';
    descParts.push(`database (${result.stack.database}${provider}${models})`);
  }
  if (result.stack.aiSdk) descParts.push(`and AI integration (${result.stack.aiSdk})`);
  const fileCountPart = `${result.files?.source || 0} source files, ${result.files?.test || 0} test files`;
  if (descParts.length > 0) {
    s += `**Detected:** ${descParts.join(', ')}. ${fileCountPart}.\n`;
  } else {
    s += `**Detected:** ${fileCountPart}.\n`;
  }
  // Findings summary (Change 4) — suppress entirely for clean projects
  if (result.findings?.length > 0) {
    const critical = result.findings.filter(f => f.severity === 'critical').length;
    const warn = result.findings.filter(f => f.severity === 'warn').length;
    if (critical > 0 || warn > 0) {
      const parts: string[] = [];
      if (critical > 0) parts.push(`${critical} critical`);
      if (warn > 0) parts.push(`${warn} warning${warn > 1 ? 's' : ''}`);
      s += `**Detected issues:** ${parts.join(', ')} — run \`ana scan\` for details\n`;
    }
  }
  // README description — inline after Detected line
  if (result.readme?.description) {
    s += `\n${result.readme.description}\n`;
  }
  s += `\n*What does this product do? Who uses it? What problem does it solve?*\n\n`;

  // Section 2: Architecture
  s += `## Architecture\n\n`;
  if (result.monorepo.isMonorepo) {
    const tool = result.monorepo.tool || 'monorepo';
    s += `**Detected:** ${tool} · ${result.monorepo.packages.length} packages`;
    if (result.monorepo.packages.length > 0) {
      const pkgNames = result.monorepo.packages.slice(0, 5).map(p => p.name).join(', ');
      s += ` (${pkgNames})`;
    }
    s += '\n';
  }
  if (result.surfaces?.length > 0) {
    const surfaceList = result.surfaces.map(sf => {
      const parts = [sf.path];
      if (sf.language) parts.push(sf.language);
      if (sf.framework) parts.push(sf.framework);
      return `${sf.name} (${parts.join(', ')})`;
    }).join(', ');
    s += `**Detected surfaces:** ${surfaceList}\n`;
  }
  if (result.structure.length > 0) {
    const dirCount = result.structure.length;
    const topDirs = result.structure.slice(0, 8).map(e => e.path).join(', ');
    s += `**Detected:** ${dirCount} directories mapped: ${topDirs}\n`;
  }
  // Change 3: deployment context
  if (result.deployment?.platform || result.deployment?.ci) {
    const deployParts = [];
    if (result.deployment.platform) deployParts.push(result.deployment.platform);
    if (result.deployment.ci) deployParts.push(result.deployment.ci);
    s += `**Detected deployment:** ${deployParts.join(', ')}\n`;
  }
  // README architecture only (setup instructions don't belong in project-context)
  if (result.readme?.architecture) {
    s += `\n${result.readme.architecture}\n`;
  }
  s += `\n*How is the codebase organized and why? What are the layer boundaries?*\n\n`;

  // Section: Where to Make Changes
  s += `## Where to Make Changes\n\n`;
  s += `*Common tasks and where to find the relevant code. What files are entry points for what kind of work?*\n\n`;

  // Section 3: Key Decisions
  s += `## Key Decisions\n\n`;
  s += `*Technology choices and patterns that look wrong but are intentional. What was tried and rejected?*\n\n`;

  // Section 4: Key Files (partially seeded from scan)
  s += `## Key Files\n\n`;
  const keyFiles: string[] = [];
  for (const [, schema] of Object.entries(result.schemas)) {
    if (schema.found && schema.path) keyFiles.push(`- Database schema: \`${schema.path}\``);
  }
  if (result.deployment.configFile) keyFiles.push(`- Deployment config: \`${result.deployment.configFile}\``);
  // CI in Key Files — use actual workflow filenames from census, not hardcoded names
  if (result.deployment?.ci && result.deployment.ciWorkflowFiles?.length > 0) {
    const files = result.deployment.ciWorkflowFiles;
    const displayed = files.slice(0, 3);
    const paths = displayed.map(f => `.github/workflows/${f}`).join('`, `');
    const overflow = files.length > 3 ? ` + ${files.length - 3} more` : '';
    keyFiles.push(`- CI pipeline: \`${paths}\`${overflow}`);
  } else if (result.deployment?.ci === 'GitLab CI') {
    keyFiles.push(`- CI pipeline: \`.gitlab-ci.yml\``);
  }
  if (keyFiles.length > 0) {
    s += keyFiles.join('\n') + '\n';
    s += `\n*Add: database client location, auth config, AI wrapper, shared types, test helpers.*\n\n`;
  } else {
    s += `*Add: entry points, shared types, config files, test helpers.*\n\n`;
  }

  // Section: Start Here — fused reading list (Slice 3), injected only when the
  // deep scan produced a non-empty reading order. This is the agent-facing
  // version of the "Start here" scan card: the files import centrality, proven
  // rework risk, and co-change agree are highest-leverage to read first, each
  // with its measured basis. Omitted entirely when null so a sparse repo's
  // scaffold isn't padded with an empty header.
  s += generateReadingOrderBlock(result.readingOrder);

  // Section: What Looks Wrong But Is Intentional
  s += `## What Looks Wrong But Is Intentional\n\n`;
  s += `*Patterns that seem wrong for this stack but are deliberate. Anti-intuitive decisions with rationale.*\n\n`;

  // Section: Active Constraints
  s += `## Active Constraints\n\n`;
  s += `*Current priorities. Areas under active refactoring. Features not to touch right now.*\n\n`;

  // Section 6: Domain Vocabulary
  s += `## Domain Vocabulary\n\n`;
  s += `*Terms with project-specific meaning. E.g., "workspace" = pnpm workspace package, not Slack workspace.*\n`;

  return s;
}

/**
 * Generate design-principles.md template (static, no scan data)
 *
 * Returns a 100% human content placeholder template.
 * No EngineResult data injected.
 *
 * @returns Markdown template string
 */
export function generateDesignPrinciplesTemplate(): string {
  return `# Design Principles

<!-- Starting principles for AI-augmented development.
     Edit to match your team's philosophy, or replace entirely.
     Ana reads this to understand HOW your team thinks. -->

## Name the disease, not the symptom

Before fixing something, state the root cause in one sentence. A fix that addresses the cause is one fix forever. A fix that addresses the symptom is the first of many.

## Surface tradeoffs before committing

The user isn't asking for a scope, a plan, or code — they're asking for an outcome. Every approach has costs; if the obvious path undermines that outcome, say so before building. Show them the paths, not just the fastest one.

## Every change should be foundation, not scaffolding

Foundation is code you build on top of. Scaffolding is code you tear down later. The test: would a senior engineer approve this — not just for correctness, but for craft? If the answer is "this works, but it's not how we'd do it if we had time" — you don't have time NOT to do it right.

<!-- Add your team's principles below. What tradeoffs do you consistently make?
     What quality bar do you hold? What does "good" mean here?

     A principle changes decisions. "Write clean code" is a platitude.
     "We prefer Result<T,E> over thrown errors" is a principle. -->
`;
}
