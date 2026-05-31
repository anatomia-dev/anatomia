/**
 * Skill scaffolding and Detected-section injection.
 *
 * The .claude/skills/ pipeline: copies SKILL.md templates from the CLI's
 * bundled templates into the user's project, and replaces the ## Detected
 * section of each skill with live scan data. On fresh install, also
 * pre-populates the ## Gotchas section with stack-specific warnings
 * matched via src/utils/gotchas.ts. On re-init, gotchas are deliberately
 * NOT touched so user customizations in the Gotchas section survive.
 *
 * The `scaffoldAndSeedSkills` orchestrator exports the one public entry
 * point. Internal helpers (inject* per-skill Detected generators, the
 * SKILL_INJECTORS map that wires them up, and replaceDetectedSection)
 * stay private — they're consumed only through SKILL_INJECTORS inside
 * this file. Declaration order relies on function hoisting: SKILL_INJECTORS
 * is defined before the inject* functions it references.
 *
 * Path protection semantic: re-init AND partial install (fresh
 * init where skill file already exists from manual creation or prior
 * install with deleted .ana/) both refresh Detected but skip gotcha
 * injection. The `allowGotchaInjection` flag makes this explicit rather
 * than relying on a load-bearing `continue`.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { EngineResult } from '../../engine/types/engineResult.js';
import { createEmptyEngineResult } from '../../engine/types/engineResult.js';
import { getPatternLibrary, isMultiPattern } from '../../engine/types/patterns.js';
import { matchGotchas, matchTriggers } from '../../utils/gotchas.js';
import { RULES } from '../../data/rules-library.js';
import { COMMON_ISSUES } from '../../data/troubleshooting-library.js';
import { agentCommand } from '../platform.js';
import { TEST_DIRECTORY_NAMES, computeSkillManifest } from '../../constants.js';
import type { InitState } from './types.js';
import { fileExists } from './preflight.js';
import { makeTestCommandNonInteractive } from './state.js';

import type { PatternConfidence, MultiPattern } from '../../engine/types/patterns.js';

type DetectedInjector = (result: EngineResult) => string;

/**
 * Extract dominance classification from pattern evidence strings.
 *
 * Looks for "(dominant)", "(present)", or "(incidental)" in evidence.
 * Returns formatted suffix like " (dominant)" for display.
 *
 * @param pattern - Pattern to extract dominance from
 * @returns Formatted dominance suffix or empty string
 */
function extractDominanceFromEvidence(
  pattern: PatternConfidence | MultiPattern,
): string {
  const evidence = isMultiPattern(pattern)
    ? pattern.primary.evidence
    : pattern.evidence;

  for (const e of evidence) {
    if (e.includes('(dominant)')) return ' (dominant)';
    if (e.includes('(present)')) return ' (present)';
    if (e.includes('(incidental)')) return ' (incidental)';
  }
  return '';
}

/**
 * Scaffold and seed skill files using dynamic manifest.
 *
 * Uses computeSkillManifest() to determine which skills to scaffold.
 * Fresh init: copy template + inject Detected.
 * Re-init: read existing file, REPLACE ## Detected section, preserve human content.
 * Custom user skills (not in manifest) are never touched.
 *
 * @param skillsPath - Path to .claude/skills/ directory
 * @param templatesDir - Path to CLI templates directory
 * @param engineResult - Engine result for skill seeding (null if skipped)
 * @param initState - Installation state (fresh/reinit/upgrade/corrupted)
 */
/**
 * Inject the Detected section into a skill's content if an injector exists
 * for that skill and engineResult is available. Returns content unchanged
 * otherwise.
 *
 * Extracted helper so the old 2-copies-of-Detected-injection
 * (Path B inline + Paths A/C shared) collapse to a single call site.
 *
 * @param content - Skill file content (SKILL.md)
 * @param skillName - Skill name used to look up its Detected injector
 * @param engineResult - Scan result, or null when no scan data is available
 * @returns Content with Detected section refreshed (or unchanged if no injector)
 */
function injectDetectedIfAvailable(
  content: string,
  skillName: string,
  engineResult: EngineResult | null
): string {
  if (!engineResult) return content;
  const injector = SKILL_INJECTORS[skillName];
  if (!injector) return content;
  const detectedContent = injector(engineResult);
  return replaceDetectedSection(content, detectedContent);
}

/**
 * Scaffold and seed skill files using dynamic manifest.
 *
 * Uses computeSkillManifest() to determine which skills to scaffold.
 * Fresh init: copy template + inject Detected + optional gotchas.
 * Re-init: read existing file, REPLACE ## Detected section, preserve
 * human content (and skip gotcha injection).
 *
 * @param skillsPath - Path to .claude/skills/ directory
 * @param templatesDir - Path to CLI templates directory
 * @param engineResult - Engine result for skill seeding (null if skipped)
 * @param initState - Installation state (fresh/reinit/upgrade/corrupted)
 */
export async function scaffoldAndSeedSkills(
  skillsPath: string,
  templatesDir: string,
  engineResult: EngineResult | null,
  initState: InitState
): Promise<void> {
  const analysis = engineResult || createEmptyEngineResult();
  const skillsToScaffold = computeSkillManifest(analysis);
  const isReinit = initState === 'reinit' || initState === 'upgrade';

  for (const skillName of skillsToScaffold) {
    const destDir = path.join(skillsPath, skillName);
    const destPath = path.join(destDir, 'SKILL.md');
    const sourcePath = path.join(templatesDir, '.claude/skills', skillName, 'SKILL.md');

    if (!(await fileExists(sourcePath))) continue;

    const existingSkill = await fileExists(destPath);
    let content: string;
    let allowGotchaInjection: boolean;

    if (existingSkill) {
      // Paths A + B collapsed: an existing SKILL.md may have human edits
      // in ## Rules or ## Gotchas. Refresh the ## Detected section but
      // DO NOT touch gotchas — this protects user customization both on
      // re-init (Path A: .ana/ present + skill exists) and on partial
      // install (Path B: .ana/ missing but skill file exists, e.g. manually
      // created before running init, or .ana/ deleted after a prior init).
      // The old code split these two cases into separate branches with an
      // inline write + `continue` in Path B; the `allowGotchaInjection`
      // flag + single shared write at the bottom of the loop makes the
      // semantic explicit instead of control-flow-implicit.
      content = await fs.readFile(destPath, 'utf-8');
      allowGotchaInjection = false;
    } else {
      // Path C: no existing file — copy template, allow gotcha injection
      // only on a fresh install (not re-init/upgrade where pre-populated
      // gotchas would be noise on top of already-confirmed user content).
      await fs.mkdir(destDir, { recursive: true });
      content = await fs.readFile(sourcePath, 'utf-8');
      allowGotchaInjection = !isReinit;

      // Language gate: current templates have TypeScript/Node.js-specific
      // Rules. Non-Node projects get a placeholder instead of wrong-language
      // advice. Only fires on Path C (fresh install of new skills), never on
      // re-init where user may have customized Rules.
      if (engineResult) {
        const lang = engineResult.stack.language;
        if (lang !== 'TypeScript' && lang !== 'Node.js') {
          content = replaceRulesSection(content,
            `*Rules not yet configured for this stack. Run \`${agentCommand('setup')}\` to add conventions for your project.*\n`);
        }
      }
    }

    // Shared: inject Detected across all paths (single helper, no duplication)
    content = injectDetectedIfAvailable(content, skillName, engineResult);

    // Inject library rules into ## Detected under ### Library Rules
    if (engineResult) {
      const matchedRules = RULES.filter(r =>
        r.skill === skillName && matchTriggers(r.triggers, engineResult)
      );
      if (matchedRules.length > 0) {
        const ruleLines = matchedRules.map(r => `- ${r.rule}`).join('\n');
        const librarySection = `\n### Library Rules\n${ruleLines}\n`;
        // Insert before the next ## heading (end of Detected section)
        const nextHeading = content.indexOf('\n## ', content.indexOf('## Detected') + 1);
        if (nextHeading > 0) {
          content = content.slice(0, nextHeading) + librarySection + content.slice(nextHeading);
        }
      }
    }

    // Inject common issues into ## Detected under ### Common Issues
    if (engineResult && skillName === 'troubleshooting') {
      const matchedIssues = COMMON_ISSUES.filter(e =>
        matchTriggers(e.triggers, engineResult)
      );
      if (matchedIssues.length > 0) {
        const issueLines = matchedIssues.map(e => {
          const prevention = e.prevention ? ` Prevention: ${e.prevention}` : '';
          return `- **${e.symptom}** — ${e.fix}${prevention}`;
        }).join('\n');
        const issuesSection = `\n### Common Issues\n${issueLines}\n`;
        const nextHeading = content.indexOf('\n## ', content.indexOf('## Detected') + 1);
        if (nextHeading > 0) {
          content = content.slice(0, nextHeading) + issuesSection + content.slice(nextHeading);
        }
      }
    }

    // Shared: pre-populate gotchas on fresh install new-skill path only
    if (allowGotchaInjection && engineResult) {
      const gotchas = matchGotchas(engineResult);
      const skillGotchas = gotchas.get(skillName);
      if (skillGotchas && skillGotchas.length > 0) {
        const gotchaLines = skillGotchas.map(g => `- ${g}`).join('\n');
        content = content.replace(
          /^(## Gotchas)\n\*Not yet captured[^*]*\*/m,
          `$1\n${gotchaLines}`
        );
      }
    }

    await fs.writeFile(destPath, content, 'utf-8');

    // Copy ENRICHMENT.md if it exists in the template (setup agent reads these)
    const enrichmentSource = path.join(templatesDir, '.claude/skills', skillName, 'ENRICHMENT.md');
    const enrichmentDest = path.join(destDir, 'ENRICHMENT.md');
    if (await fileExists(enrichmentSource)) {
      await fs.copyFile(enrichmentSource, enrichmentDest);
    }
  }
}

const SKILL_INJECTORS: Record<string, DetectedInjector> = {
  'coding-standards': injectCodingStandards,
  'testing-standards': injectTestingStandards,
  'git-workflow': injectGitWorkflow,
  'deployment': injectDeployment,
  'troubleshooting': () => '',
  'ai-patterns': injectAiPatterns,
  'api-patterns': injectApiPatterns,
  'data-access': injectDataAccess,
};

function injectCodingStandards(result: EngineResult): string {
  const lines: string[] = [];
  if (result.stack.language) {
    const fileSuffix = result.files.source > 0 ? ` (${result.files.source} source files)` : '';
    lines.push(`- Language: ${result.stack.language}${result.stack.framework ? ` with ${result.stack.framework}` : ''}${fileSuffix}`);
  }
  if (result.conventions) {
    const naming = result.conventions.naming;
    const fn = naming?.functions;
    if (fn && fn.confidence > 0) {
      const sample = fn.sampleSize > 0 ? `, ${fn.sampleSize} sampled` : '';
      lines.push(`- Functions: ${fn.majority} (${Math.round(fn.confidence * 100)}%${sample})`);
    }
    const cls = naming?.classes;
    if (cls && cls.confidence > 0) {
      lines.push(`- Classes: ${cls.majority} (${Math.round(cls.confidence * 100)}%)`);
    }
    const fl = naming?.files;
    if (fl && fl.confidence > 0) {
      const sample = fl.sampleSize > 0 ? `, ${fl.sampleSize} sampled` : '';
      lines.push(`- Files: ${fl.majority} (${Math.round(fl.confidence * 100)}%${sample})`);
    }
    const imp = result.conventions.imports;
    if (imp) {
      const importStyle = (imp.style === 'absolute' && imp.aliasPattern)
        ? `path aliases (${imp.aliasPattern})`
        : imp.style;
      lines.push(`- Imports: ${importStyle} (${Math.round(imp.confidence * 100)}%)`);
    }
    const indent = result.conventions.indentation;
    if (indent) {
      lines.push(`- Indentation: ${indent.style === 'tabs' ? 'tabs' : `${indent.style}, ${indent.width} wide`}`);
    }
  }
  // Pattern display — handles PatternConfidence | MultiPattern union via
  // getPatternLibrary helper. MultiPattern cases show the primary
  // library name; variant is looked up from the single-pattern case only
  // (MultiPattern's primary already represents the chosen variant).
  const ehLib = getPatternLibrary(result.patterns?.errorHandling);
  if (ehLib) {
    const eh = result.patterns?.errorHandling;
    const variant = eh && !isMultiPattern(eh) && eh.variant ? ` (${eh.variant})` : '';
    lines.push(`- Error handling: ${ehLib}${variant}`);
  }
  // Deep-tier hook/composable patterns — display with dominance classification
  const dfLib = getPatternLibrary(result.patterns?.dataFetching);
  if (dfLib) {
    const df = result.patterns?.dataFetching;
    const variant = df && !isMultiPattern(df) && df.variant ? ` (${df.variant})` : '';
    const dominance = df ? extractDominanceFromEvidence(df) : '';
    lines.push(`- Data fetching: ${dfLib}${variant}${dominance}`);
  }
  const smLib = getPatternLibrary(result.patterns?.stateManagement);
  if (smLib) {
    const sm = result.patterns?.stateManagement;
    const variant = sm && !isMultiPattern(sm) && sm.variant ? ` (${sm.variant})` : '';
    const dominance = sm ? extractDominanceFromEvidence(sm) : '';
    lines.push(`- State management: ${smLib}${variant}${dominance}`);
  }
  const fhLib = getPatternLibrary(result.patterns?.formHandling);
  if (fhLib) {
    const fh = result.patterns?.formHandling;
    const variant = fh && !isMultiPattern(fh) && fh.variant ? ` (${fh.variant})` : '';
    const dominance = fh ? extractDominanceFromEvidence(fh) : '';
    lines.push(`- Form handling: ${fhLib}${variant}${dominance}`);
  }
  if (result.stack.uiSystem) {
    lines.push(`- UI: ${result.stack.uiSystem}`);
  }
  return lines.join('\n');
}

function injectTestingStandards(result: EngineResult): string {
  const lines: string[] = [];
  if (result.stack.testing.length > 0) {
    const testCount = result.files.test > 0 ? ` (${result.files.test} test files)` : '';
    // Join all detected frameworks (was single-value before).
    lines.push(`- Framework: ${result.stack.testing.join(', ')}${testCount}`);
  }
  if (result.commands.test) {
    const testCmd = makeTestCommandNonInteractive(result.commands.test, result.stack.testing);
    lines.push(`- Test command: ${testCmd}`);
  }
  const testLib = getPatternLibrary(result.patterns?.testing);
  if (testLib) {
    const t = result.patterns?.testing;
    const variant = t && !isMultiPattern(t) && t.variant ? ` (${t.variant})` : '';
    lines.push(`- Testing patterns: ${testLib}${variant}`);
  }
  // Use TEST_DIRECTORY_NAMES (single source of truth) so projects
  // with __tests__/, spec/, e2e/, cypress/, etc. are recognized as having a
  // dedicated test directory. Previously only tests/ and test/ counted, so
  // Jest-convention and E2E-only projects incorrectly reported "co-located."
  const hasTestsDir = result.structure.some(s => {
    const name = s.path.replace(/\/$/, '');
    return TEST_DIRECTORY_NAMES.has(name);
  });
  if (hasTestsDir) {
    lines.push(`- Test location: dedicated test directory`);
  } else if (result.files.test > 0) {
    lines.push(`- Test location: co-located with source`);
  }
  return lines.join('\n');
}

function injectGitWorkflow(result: EngineResult): string {
  const lines: string[] = [];
  if (result.git.defaultBranch) {
    lines.push(`- Default branch: ${result.git.defaultBranch}`);
  }
  if (result.git.contributorCount !== null) lines.push(`- Contributors: ${result.git.contributorCount}`);
  lines.push('- Ana CLI: pipeline artifacts committed via `ana artifact save` with [slug] prefix. Build agent creates `{branchPrefix}{slug}` branches (read `branchPrefix` from `.ana/ana.json`, default `feature/`). Co-author from ana.json.');
  return lines.join('\n');
}

function injectDeployment(result: EngineResult): string {
  const lines: string[] = [];
  if (result.deployment.platform) lines.push(`- Platform: ${result.deployment.platform}`);
  if (result.deployment.configFile) lines.push(`- Config: ${result.deployment.configFile}`);
  if (result.deployment.ci) lines.push(`- CI: ${result.deployment.ci}`);
  return lines.join('\n');
}

/**
 * Build the `ai-patterns` skill's Detected section body.
 *
 * Shows the detected AI SDK (if any) and a deduped "Also detected" line for
 * additional AI services that aren't the same SDK. The filter is a plain
 * exact-match (`s.name !== sdk`) — the previous 3-way match
 * existed only because AI_PACKAGES named the base SDK `'Vercel AI SDK'`
 * while AI_SDK_PACKAGES used `'Vercel AI'`. That split was the root cause of
 * the filter complexity; standardizing on `'Vercel AI'` collapses both sides.
 *
 * Exported for direct unit testing.
 *
 * @param result - Engine scan result.
 * @returns Detected section body (empty string if no AI data).
 */
export function injectAiPatterns(result: EngineResult): string {
  const lines: string[] = [];
  if (result.stack.aiSdk) lines.push(`- AI SDK: ${result.stack.aiSdk}`);
  const sdk = result.stack.aiSdk || '';
  const aiServices = result.externalServices
    .filter(s => s.category === 'ai' && s.name !== sdk)
    .map(s => s.name);
  if (aiServices.length > 0) {
    lines.push(`- Also detected: ${aiServices.join(', ')}`);
  }
  return lines.join('\n');
}

function injectApiPatterns(result: EngineResult): string {
  const lines: string[] = [];
  if (result.stack.framework) lines.push(`- Framework: ${result.stack.framework}`);
  const valLib = getPatternLibrary(result.patterns?.validation);
  if (valLib) {
    const conf = Math.round(result.patterns!.validation!.confidence * 100);
    lines.push(`- Validation: ${valLib} (${conf}%)`);
  }
  if (result.stack.auth) lines.push(`- Auth: ${result.stack.auth}`);
  return lines.join('\n');
}

function injectDataAccess(result: EngineResult): string {
  const lines: string[] = [];
  if (result.stack.database) lines.push(`- Database: ${result.stack.database}`);
  const schemaEntries = Object.entries(result.schemas).filter(([, s]) => s.found);
  for (const [name, schema] of schemaEntries) {
    const providerSuffix = schema.provider ? ` → ${schema.provider}` : '';
    const parts = [`${name}${providerSuffix}`];
    if (schema.modelCount !== null) parts.push(`${schema.modelCount} models`);
    if (schema.path) parts.push(schema.path);
    lines.push(`- Schema: ${parts.join(', ')}`);
  }
  return lines.join('\n');
}

/**
 * Replace ## Detected section content while preserving all other sections.
 *
 * Machine/human boundary: ## Detected is machine-owned (auto-refreshable),
 * ## Rules, ## Gotchas, ## Examples are human-owned (never overwritten).
 *
 * @param fileContent - Full file content
 * @param newDetectedContent - New content for the Detected section (lines only, no heading)
 * @returns Updated file content
 */
function replaceDetectedSection(fileContent: string, newDetectedContent: string): string {
  const detectedIdx = fileContent.indexOf('## Detected');
  if (detectedIdx === -1) return fileContent;

  // Find the next ## heading after ## Detected
  const afterDetected = fileContent.indexOf('\n## ', detectedIdx + 1);
  const endIdx = afterDetected === -1 ? fileContent.length : afterDetected;

  const before = fileContent.slice(0, detectedIdx);
  const after = afterDetected === -1 ? '' : fileContent.slice(endIdx);

  const trimmed = newDetectedContent.trim();
  const body = trimmed ? trimmed + '\n' : '';

  return before + '## Detected\n' + body + after;
}

/**
 * Replace ## Rules section content while preserving all other sections.
 *
 * Used by the language gate to clear TypeScript-specific Rules on
 * non-Node/TS projects, replacing them with a placeholder.
 *
 * @param fileContent - Full file content
 * @param newRulesContent - New content for the Rules section (lines only, no heading)
 * @returns Updated file content
 */
function replaceRulesSection(fileContent: string, newRulesContent: string): string {
  const rulesIdx = fileContent.indexOf('## Rules');
  if (rulesIdx === -1) return fileContent;

  const afterRules = fileContent.indexOf('\n## ', rulesIdx + 1);
  const endIdx = afterRules === -1 ? fileContent.length : afterRules;

  const before = fileContent.slice(0, rulesIdx);
  const after = afterRules === -1 ? '' : fileContent.slice(endIdx);

  const trimmed = newRulesContent.trim();
  const body = trimmed ? trimmed + '\n' : '';

  return before + '## Rules\n' + body + after;
}
