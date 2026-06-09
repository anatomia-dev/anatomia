/**
 * Artifact format validators
 *
 * Pure validation functions extracted from artifact.ts. Each validator
 * checks a specific artifact format and returns errors/warnings.
 * No CLI dependencies (no chalk, no commander).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';
import { findProjectRoot } from '../utils/validators.js';
import type { ContractSchema } from '../types/contract.js';

/**
 * Companion YAML schema for verify_data.yaml
 */
interface VerifyDataSchema {
  schema?: unknown;
  findings?: unknown;
  [key: string]: unknown;
}

/**
 * Companion YAML schema for build_data.yaml
 */
interface BuildDataSchema {
  schema?: unknown;
  concerns?: unknown;
  [key: string]: unknown;
}

/**
 * Valid matchers for contract assertions
 */
const VALID_MATCHERS = ['equals', 'exists', 'contains', 'greater', 'truthy', 'not_equals', 'not_contains'];
const VALUE_REQUIRED_MATCHERS = ['equals', 'contains', 'greater', 'not_equals', 'not_contains'];

/**
 * Valid finding categories for verify_data.yaml
 */
const VALID_FINDING_CATEGORIES = ['code', 'test', 'upstream'];
const VALID_FINDING_SEVERITIES = ['risk', 'debt', 'observation'];
const VALID_FINDING_ACTIONS = ['promote', 'scope', 'monitor', 'acknowledge', 'accept'];

/**
 * Validate plan.md format
 *
 * @param filePath - Path to plan.md
 * @returns Error message if invalid, null if valid
 */
export function validatePlanFormat(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Check for ## Phases heading
  if (!content.includes('## Phases')) {
    return "Missing '## Phases' heading. Plan must contain a '## Phases' section with a phase entry per phase.";
  }

  // Walk the ## Phases section and collect phase entries. A phase entry is any
  // unindented list line (`- ...`) inside the section — this matches BOTH the
  // old checkbox format (`- [ ] desc`) and the new plain-list format (`- desc`),
  // since the glyph is just leading text. Indented sub-items (e.g. `  - Spec:`,
  // `  - Depends on:`) start with whitespace and are excluded.
  //
  // Mirror of countPhases (work-state.ts:111-133) — the same ## Phases walk and
  // the same Spec: regex. The canonical copy lives in work-state.ts; keep these
  // two copies in lockstep. Do NOT import countPhases here: it returns
  // {total, specs} for counting and is consumed by status/pr/work; this
  // validator needs per-phase Spec enforcement, a different contract.
  const specRegex = /Spec:\s*(spec(?:-\d+)?\.md)/; // verbatim mirror of work-state.ts:125
  const lines = content.split('\n');
  let inPhases = false;
  const phaseLineIndexes: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue; // noUncheckedIndexedAccess guard
    if (line.trim() === '## Phases') {
      inPhases = true;
      continue;
    }
    if (inPhases && line.startsWith('## ')) {
      break; // next section
    }
    if (inPhases && line.startsWith('- ')) {
      phaseLineIndexes.push(i);
    }
  }

  if (phaseLineIndexes.length === 0) {
    return "No phases found. The '## Phases' section must contain at least one phase entry ('- {description}').";
  }

  // Each phase must carry a Spec: reference between it and the next phase
  // (or the end of the collected phase list).
  for (let p = 0; p < phaseLineIndexes.length; p++) {
    const start = phaseLineIndexes[p];
    const next = phaseLineIndexes[p + 1];
    if (start === undefined) continue; // noUncheckedIndexedAccess guard
    const end = next ?? lines.length;
    const block = lines.slice(start, end).join('\n');
    if (!specRegex.test(block)) {
      const phaseLine = lines[start];
      return `Phase "${(phaseLine ?? '').trim()}" is missing a 'Spec:' reference. Each phase must reference its spec file.`;
    }
  }

  return null; // valid
}

/**
 * Validate verify report format
 *
 * @param filePath - Path to verify_report.md
 * @returns Error message if invalid, null if valid
 */
export function validateVerifyReportFormat(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Check first 10 lines for Result line
  const firstTenLines = lines.slice(0, 10).join('\n');
  const resultPattern = /\*\*Result:\*\*\s*(PASS|FAIL)/i;

  if (!resultPattern.test(firstTenLines)) {
    return "Missing '**Result:** PASS' or '**Result:** FAIL' in the first 10 lines.\nThe Result line is machine-parsed by the pipeline. It must be present.";
  }

  return null; // valid
}

/**
 * Validate scope format — checks required sections and field values.
 *
 * @param filePath - Path to scope.md file
 * @returns Error message if invalid, null if valid
 */
export function validateScopeFormat(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Check for at least 3 acceptance criteria
  const acPattern = /^-\s+(AC\d+|##?\s*AC|\*\*AC)/mi;
  const acMatches = content.match(new RegExp(acPattern.source, 'gmi'));
  if (!acMatches || acMatches.length < 3) {
    return "Missing acceptance criteria. Scope must contain at least 3 acceptance criteria (lines starting with '- AC').";
  }

  // Check for Structural Analog section
  if (!content.match(/###?\s+Structural\s+Analog/i)) {
    return "Missing 'Structural Analog' section. Every scope needs a structural analog to guide implementation.";
  }

  // Check for Intent section with content
  if (!content.match(/###?\s+Intent/i)) {
    return "Missing 'Intent' section. Scope must explain the purpose of this work.";
  }

  // Extract content between Intent heading and next section
  const lines = content.split('\n');
  let inIntent = false;
  const intentLines: string[] = [];
  for (const line of lines) {
    if (/^##\s+Intent/i.test(line)) {
      inIntent = true;
      continue;
    }
    if (inIntent) {
      if (/^##/.test(line)) break; // Next section starts
      intentLines.push(line);
    }
  }
  const intentContent = intentLines.join('\n').trim();
  if (!intentContent) {
    return "Empty 'Intent' section. Scope must explain the purpose of this work.";
  }

  // Check for Complexity Assessment section
  if (!content.match(/##\s+Complexity\s+Assessment/i)) {
    return "Missing 'Complexity Assessment' section. Every scope needs a complexity assessment.";
  }

  // Check for Kind field (strict — exact match only)
  const kindMatch = content.match(/\*\*Kind:\*\*\s*(.+)/);
  if (!kindMatch || !kindMatch[1]) {
    return "Missing 'Kind' field in Complexity Assessment. Add: **Kind:** feature / fix / chore / milestone";
  }
  const kindRaw = kindMatch[1].trim().toLowerCase();
  if (kindRaw !== 'feature' && kindRaw !== 'fix' && kindRaw !== 'chore' && kindRaw !== 'milestone') {
    return `Kind must be exactly one of: feature, fix, chore, milestone. Got: '${kindMatch[1].trim()}'`;
  }

  // Check for Size field (lenient — first valid token)
  const sizeMatch = content.match(/\*\*Size:\*\*\s*(.+)/);
  if (!sizeMatch || !sizeMatch[1]) {
    return "Missing 'Size' field in Complexity Assessment. Add: **Size:** small / medium / large";
  }
  const sizeValue = sizeMatch[1].trim();
  if (!/^(small|medium|large)\b/i.test(sizeValue)) {
    return `Size must start with one of: small, medium, large. Got: '${sizeValue}'`;
  }

  // Check for Multi-phase field (lenient — first valid token)
  const multiMatch = content.match(/\*\*Multi-phase:\*\*\s*(.+)/);
  if (!multiMatch || !multiMatch[1]) {
    return "Missing 'Multi-phase' field in Complexity Assessment. Add: **Multi-phase:** yes / no";
  }
  const multiValue = multiMatch[1].trim();
  if (!/^(yes|no)\b/i.test(multiValue)) {
    return `Multi-phase must start with one of: yes, no. Got: '${multiValue}'`;
  }

  // Check for Surface field (optional — single-package repos have no surfaces)
  const surfaceMatch = content.match(/\*\*Surface:\*\*\s*(.+)/);
  if (surfaceMatch && surfaceMatch[1]) {
    const surfaceValue = surfaceMatch[1].trim().toLowerCase();
    if (surfaceValue !== 'cross-surface') {
      // Validate against ana.json surfaces if available
      try {
        const anaJsonPath = path.join(findProjectRoot(), '.ana', 'ana.json');
        if (fs.existsSync(anaJsonPath)) {
          const anaContent = JSON.parse(fs.readFileSync(anaJsonPath, 'utf-8'));
          const surfaces = anaContent.surfaces as Record<string, unknown> | undefined;
          if (surfaces && Object.keys(surfaces).length > 0) {
            const surfaceKeys = Object.keys(surfaces).map(k => k.toLowerCase());
            if (!surfaceKeys.includes(surfaceValue)) {
              return `Surface must be one of: ${Object.keys(surfaces).join(', ')}, or 'cross-surface'. Got: '${surfaceMatch[1].trim()}'`;
            }
          }
        }
      } catch {
        // ana.json missing or malformed — skip validation gracefully
      }
    }
  }

  // Check for Approach section with content
  if (!content.match(/##\s+Approach\s*$/im)) {
    return "Missing 'Approach' section. Scope must describe the strategic direction.";
  }

  const approachLines: string[] = [];
  let inApproach = false;
  for (const line of lines) {
    if (/^##\s+Approach\s*$/i.test(line)) {
      inApproach = true;
      continue;
    }
    if (inApproach) {
      if (/^##/.test(line)) break;
      approachLines.push(line);
    }
  }
  const approachContent = approachLines.join('\n').trim();
  if (!approachContent) {
    return "Empty 'Approach' section. Scope must describe the strategic direction.";
  }

  // Check for Edge Cases section
  if (!content.match(/##\s+Edge\s+Cases/i)) {
    return "Missing 'Edge Cases' section. Scope must identify edge cases and risks.";
  }

  return null; // valid
}

/**
 * Validate spec format
 *
 * @param filePath - Path to spec.md or spec-N.md
 * @returns Object with error if invalid, warning for non-blocking issues, empty if valid
 */
export function validateSpecFormat(filePath: string): { error?: string; warning?: string } {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Note: file_changes has moved to contract.yaml in S8 — no longer required in spec

  // Check for Build Brief section
  if (!content.match(/###?\s+Build\s+Brief/i)) {
    return { error: "Missing 'Build Brief' section. Spec must include build guidance for the implementer." };
  }

  // Check for approximate baseline (warning only)
  const baselinePattern = /(Current\s+test|Current\s+tests)/i;
  const hasBaseline = baselinePattern.test(content);
  if (hasBaseline) {
    const approximatePattern = /[~]|approx/i;
    const lines = content.split('\n');
    for (const line of lines) {
      if (baselinePattern.test(line) && approximatePattern.test(line)) {
        return { warning: "Build baseline contains approximations (~). Run the test command to get exact counts." };
      }
    }
  }

  return {}; // valid
}

/**
 * Validate contract format
 *
 * @param filePath - Path to contract.yaml
 * @returns Array of error messages, empty if valid
 */
export function validateContractFormat(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const errors: string[] = [];

  // 1. Parse YAML
  let contract: ContractSchema;
  try {
    contract = yaml.parse(content);
  } catch (e) {
    return [`YAML parse error: ${e instanceof Error ? e.message : 'Invalid YAML'}`];
  }

  if (!contract || typeof contract !== 'object') {
    return ['Contract must be a YAML object'];
  }

  // 2. Header fields
  if (!contract.version) {
    errors.push('Missing "version" field');
  }
  if (!contract.sealed_by) {
    errors.push('Missing "sealed_by" field');
  }
  if (!contract.feature || typeof contract.feature !== 'string' || !contract.feature.trim()) {
    errors.push('Missing or empty "feature" field');
  }

  // 3. Assertions array
  if (!contract.assertions) {
    errors.push('Missing "assertions" array');
  } else if (!Array.isArray(contract.assertions)) {
    errors.push('"assertions" must be an array');
  } else if (contract.assertions.length === 0) {
    errors.push('"assertions" array cannot be empty');
  } else {
    // Track IDs for uniqueness check
    const seenIds = new Set<string>();

    for (let i = 0; i < contract.assertions.length; i++) {
      const assertion = contract.assertions[i];
      if (!assertion) continue; // noUncheckedIndexedAccess guard
      const prefix = assertion.id ? `Assertion ${assertion.id}` : `Assertion ${i + 1}`;

      // Required fields
      if (!assertion.id || typeof assertion.id !== 'string') {
        errors.push(`${prefix}: missing or invalid "id" field`);
      } else {
        if (seenIds.has(assertion.id)) {
          errors.push(`Duplicate assertion ID: ${assertion.id}`);
        }
        seenIds.add(assertion.id);
      }

      if (!assertion.says || typeof assertion.says !== 'string' || !assertion.says.trim()) {
        errors.push(`${prefix}: missing or empty "says" field`);
      }

      if (!assertion.block || typeof assertion.block !== 'string') {
        errors.push(`${prefix}: missing "block" field`);
      }

      if (!assertion.target || typeof assertion.target !== 'string') {
        errors.push(`${prefix}: missing "target" field`);
      }

      // Matcher validation
      if (!assertion.matcher) {
        errors.push(`${prefix}: missing "matcher" field`);
      } else if (!VALID_MATCHERS.includes(assertion.matcher)) {
        errors.push(`${prefix}: unknown matcher "${assertion.matcher}" (valid: ${VALID_MATCHERS.join(', ')})`);
      } else if (VALUE_REQUIRED_MATCHERS.includes(assertion.matcher) && assertion.value === undefined) {
        errors.push(`${prefix}: matcher "${assertion.matcher}" requires "value" field`);
      }
    }
  }

  // 4. File changes
  if (!contract.file_changes) {
    errors.push('Missing "file_changes" array');
  } else if (!Array.isArray(contract.file_changes)) {
    errors.push('"file_changes" must be an array');
  } else if (contract.file_changes.length === 0) {
    errors.push('"file_changes" array cannot be empty');
  } else {
    const validActions = ['create', 'modify', 'delete'];
    for (let i = 0; i < contract.file_changes.length; i++) {
      const change = contract.file_changes[i];
      if (!change) continue; // noUncheckedIndexedAccess guard
      const prefix = `file_changes[${i}]`;

      if (!change.path || typeof change.path !== 'string') {
        errors.push(`${prefix}: missing "path" field`);
      }

      if (!change.action || !validActions.includes(change.action)) {
        errors.push(`${prefix}: invalid "action" (must be: ${validActions.join(', ')})`);
      }
    }
  }

  return errors;
}

/**
 * Validate verify_data.yaml companion format.
 *
 * Follows the validateContractFormat error-accumulation pattern:
 * YAML parse -> required field checks -> enum validation -> error array return.
 * Warnings (file existence, missing file on non-upstream) are emitted via
 * the returned warnings array but do not block the save.
 *
 * @param filePath - Path to verify_data.yaml
 * @param projectRoot - Project root for file existence checks
 * @returns Object with errors (block save) and warnings (emit but proceed)
 */
export function validateVerifyDataFormat(filePath: string, projectRoot?: string): { errors: string[]; warnings: string[] } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const errors: string[] = [];
  const warnings: string[] = [];

  let data: VerifyDataSchema;
  try {
    data = yaml.parse(content);
  } catch (e) {
    return { errors: [`YAML parse error: ${e instanceof Error ? e.message : 'Invalid YAML'}`], warnings: [] };
  }

  if (!data || typeof data !== 'object') {
    return { errors: ['verify_data.yaml must be a YAML object'], warnings: [] };
  }

  // schema field must equal 1
  if (data.schema === undefined || data.schema === null) {
    errors.push('Missing "schema" field');
  } else if (data.schema !== 1) {
    errors.push(`Invalid "schema" value: ${data.schema} (expected: 1)`);
  }

  // findings must be an array
  if (!data.findings) {
    errors.push('Missing "findings" field');
  } else if (!Array.isArray(data.findings)) {
    errors.push('"findings" must be an array');
  } else {
    for (let i = 0; i < data.findings.length; i++) {
      const finding = data.findings[i] as Record<string, unknown> | undefined;
      if (!finding) continue;
      const prefix = `Finding ${i + 1}`;

      const cat = finding['category'];
      const summary = finding['summary'];
      const sev = finding['severity'];
      const ra = finding['related_assertions'];
      const file = finding['file'];

      // category required, must be one of known values
      if (!cat || typeof cat !== 'string') {
        errors.push(`${prefix}: missing "category" field`);
      } else if (!VALID_FINDING_CATEGORIES.includes(cat)) {
        errors.push(`${prefix}: invalid category "${cat}" (valid: ${VALID_FINDING_CATEGORIES.join(', ')})`);
      }

      // summary required, non-empty string
      if (!summary || typeof summary !== 'string' || !summary.trim()) {
        errors.push(`${prefix}: missing "summary" field`);
      }

      // severity required, must be valid
      if (sev === undefined || sev === null) {
        errors.push(`${prefix}: missing "severity" field`);
      } else if (typeof sev !== 'string' || !VALID_FINDING_SEVERITIES.includes(sev)) {
        errors.push(`${prefix}: invalid severity "${sev}" (valid: ${VALID_FINDING_SEVERITIES.join(', ')})`);
      }

      // suggested_action required, must be valid
      const action = finding['suggested_action'];
      if (action === undefined || action === null) {
        errors.push(`${prefix}: missing "suggested_action" field`);
      } else if (typeof action !== 'string' || !VALID_FINDING_ACTIONS.includes(action)) {
        errors.push(`${prefix}: invalid suggested_action "${action}" (valid: ${VALID_FINDING_ACTIONS.join(', ')})`);
      }

      // related_assertions optional, but if present must be array of strings
      if (ra !== undefined) {
        if (!Array.isArray(ra)) {
          errors.push(`${prefix}: "related_assertions" must be an array`);
        } else {
          for (const item of ra) {
            if (typeof item !== 'string') {
              errors.push(`${prefix}: "related_assertions" elements must be strings`);
              break;
            }
          }
        }
      }

      // resolves optional, but if present must be array of strings with valid ID format
      const resolves = finding['resolves'];
      if (resolves !== undefined) {
        if (!Array.isArray(resolves)) {
          errors.push(`${prefix}: "resolves" must be an array`);
        } else {
          for (const item of resolves) {
            if (typeof item !== 'string') {
              errors.push(`${prefix}: "resolves" elements must be strings`);
              break;
            }
          }
          // Format warning for IDs not matching {slug}-C{N} pattern
          const idPattern = /^[a-z0-9-]+-C\d+$/;
          for (const item of resolves) {
            if (typeof item === 'string' && !idPattern.test(item)) {
              warnings.push(`${prefix}: "resolves" entry "${item}" does not match expected finding ID format ({slug}-C{N}).`);
            }
          }
        }
        // resolves on non-upstream findings is likely a mistake
        if (cat !== 'upstream' && typeof cat === 'string') {
          warnings.push(`${prefix}: "resolves" is intended for upstream findings, but category is "${cat}".`);
        }
      }

      // file warnings (non-blocking)
      if (file && typeof file === 'string' && projectRoot) {
        if (!fs.existsSync(path.join(projectRoot, file))) {
          warnings.push(`Finding ${i + 1} references "${file}" which does not exist.`);
        }
      } else if (!file && cat !== 'upstream' && typeof cat === 'string') {
        warnings.push(`Finding ${i + 1} (category: ${cat}) has no file reference.`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Validate build_data.yaml companion format.
 *
 * @param filePath - Path to build_data.yaml
 * @returns Object with errors (block save) and warnings (emit but proceed)
 */
export function validateBuildDataFormat(filePath: string): { errors: string[]; warnings: string[] } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const errors: string[] = [];
  const warnings: string[] = [];

  let data: BuildDataSchema;
  try {
    data = yaml.parse(content);
  } catch (e) {
    return { errors: [`YAML parse error: ${e instanceof Error ? e.message : 'Invalid YAML'}`], warnings: [] };
  }

  if (!data || typeof data !== 'object') {
    return { errors: ['build_data.yaml must be a YAML object'], warnings: [] };
  }

  if (data.schema === undefined || data.schema === null) {
    errors.push('Missing "schema" field');
  } else if (data.schema !== 1) {
    errors.push(`Invalid "schema" value: ${data.schema} (expected: 1)`);
  }

  if (!data.concerns) {
    errors.push('Missing "concerns" field');
  } else if (!Array.isArray(data.concerns)) {
    errors.push('"concerns" must be an array');
  } else {
    for (let i = 0; i < data.concerns.length; i++) {
      const concern = data.concerns[i] as Record<string, unknown> | undefined;
      if (!concern) continue;
      const prefix = `Concern ${i + 1}`;
      const summary = concern['summary'];

      if (!summary || typeof summary !== 'string' || !summary.trim()) {
        errors.push(`${prefix}: missing "summary" field`);
      }

      // severity required, must be valid
      const sev = concern['severity'];
      if (sev === undefined || sev === null) {
        errors.push(`${prefix}: missing "severity" field`);
      } else if (typeof sev !== 'string' || !VALID_FINDING_SEVERITIES.includes(sev)) {
        errors.push(`${prefix}: invalid severity "${sev}" (valid: ${VALID_FINDING_SEVERITIES.join(', ')})`);
      }

      // suggested_action required, must be valid
      const action = concern['suggested_action'];
      if (action === undefined || action === null) {
        errors.push(`${prefix}: missing "suggested_action" field`);
      } else if (typeof action !== 'string' || !VALID_FINDING_ACTIONS.includes(action)) {
        errors.push(`${prefix}: invalid suggested_action "${action}" (valid: ${VALID_FINDING_ACTIONS.join(', ')})`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Validate build report format
 *
 * @param filePath - Path to build_report.md or build_report_N.md
 * @returns Error message if invalid, null if valid
 */
export function validateBuildReportFormat(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Check for required sections
  const requiredSections = [
    { pattern: /###?\s+Deviation/i, name: 'Deviations' },
    { pattern: /###?\s+Open\s+Issue/i, name: 'Open Issues' },
    { pattern: /###?\s+(Acceptance\s+Criteria|AC\s+Coverage|Criteria\s+Coverage)/i, name: 'AC Coverage' },
    { pattern: /###?\s+PR\s+Summary/i, name: 'PR Summary' }
  ];

  for (const section of requiredSections) {
    if (!section.pattern.test(content)) {
      return `Missing '${section.name}' section. Build report must document all required sections.`;
    }
  }

  return null; // valid
}
