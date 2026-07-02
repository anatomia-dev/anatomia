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
import { RESULT_HEADLINE_PATTERN } from '../utils/verdict.js';
import {
  parseRequirement,
  canonicalizeEnumValue,
  PRIORITY_VALUES,
  STATUS_VALUES,
  RESOLUTION_VALUES,
} from '../utils/req-frontmatter.js';
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
 * Minimum contract version that activates the scope-coverage gate. Below this
 * (every contract that exists today is "1.0") the gate is a silent no-op. The
 * compare is numeric major.minor — NOT lexical ("1.10" must beat "1.9").
 */
export const COVERAGE_GATE_MIN_VERSION = '1.1';

/**
 * Matchers that establish a coverage link but say little about semantic
 * strength. An AC pinned only by these still counts as covered (the gate
 * checks the link exists, not that it semantically tests the AC — that stays
 * Verify's job), but is surfaced as `info`.
 */
const WEAK_MATCHERS = new Set(['exists', 'contains', 'truthy']);

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

  // Check first 10 lines for Result line. PRESENCE check only — this guards that
  // the machine-parsed Result line exists at save time; it deliberately does NOT
  // derive/coerce the verdict (that is deriveVerdict's job). Shares the one
  // headline pattern to avoid regex drift.
  const firstTenLines = lines.slice(0, 10).join('\n');

  if (!RESULT_HEADLINE_PATTERN.test(firstTenLines)) {
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
 * Frontmatter keys a requirement is allowed to carry. Unknown keys are rejected
 * by the validator (the strict machine gate) even though the frontmatter
 * primitive preserves them on round-trip (the lenient forward-compat layer). When
 * a new metadata key becomes official, it joins this allowlist.
 */
const KNOWN_REQ_KEYS = new Set([
  'req', 'title', 'priority', 'status', 'created', 'source', 'appetite', 'claimed_by', 'resolution',
]);

/**
 * Required requirement sections and their accepted aliases (canonical heading OR
 * any alias satisfies the section). Aliases grandfather the team's hand-written
 * corpus.
 */
const REQUIRED_REQ_SECTIONS: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: 'Problem', aliases: ['Problem', 'Disease'] },
  { canonical: 'Evidence', aliases: ['Evidence', 'Why This Matters'] },
  { canonical: 'Done Looks Like', aliases: ['Done Looks Like', 'What to Build'] },
];

/**
 * Extract the trimmed content of the first `## ` section whose heading matches one
 * of `names` (case-insensitive). Content runs until the next `## ` heading.
 *
 * @param body - The requirement markdown body (after frontmatter)
 * @param names - Accepted heading names (canonical + aliases)
 * @returns The trimmed section content, or null when no matching heading exists
 */
function extractReqSection(body: string, names: string[]): string | null {
  const wanted = new Set(names.map(n => n.toLowerCase()));
  const lines = body.split('\n');
  let capturing = false;
  const collected: string[] = [];

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      if (capturing) break; // reached the next section
      const name = (heading[1] ?? '').trim().toLowerCase();
      if (wanted.has(name)) {
        capturing = true;
      }
      continue;
    }
    if (capturing) collected.push(line);
  }

  if (!capturing) return null;
  return collected.join('\n').trim();
}

/**
 * Validate requirement (`.ana/requirements/REQ-*.md`) format — the hard machine
 * gate for `ana req validate`.
 *
 * Checks, in order, returning a specific human message on the first violation:
 * frontmatter present & parseable; no unknown frontmatter keys; `req` equals the
 * filename stem; `priority`/`status` in enum (case-insensitive); `created` parses
 * as a date; `resolution` present iff `status: archived` (and in enum when
 * present); `appetite` non-empty when the key is present; required sections
 * present and non-empty (accepting aliases). Returns `null` when valid.
 *
 * @param filePath - Path to the requirement file
 * @returns Error message if invalid, null if valid
 */
export function validateReqFormat(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  return validateReqContent(content, path.basename(filePath, '.md'));
}

/**
 * Content-based core of {@link validateReqFormat}. Takes the raw file content and
 * the expected `req` id (the filename stem) so it works for on-disk files AND for
 * requirement content read from a git branch (where no path exists). `req list`
 * reuses this to flag malformed rows with the same messages the validator prints.
 *
 * @param content - Raw requirement file content
 * @param stem - The expected `req` value (filename without `.md`)
 * @returns Error message if invalid, null if valid
 */
export function validateReqContent(content: string, stem: string): string | null {
  let parsed;
  try {
    parsed = parseRequirement(content);
  } catch (e) {
    return `Frontmatter is not parseable: ${e instanceof Error ? e.message : 'invalid YAML'}`;
  }

  const { frontmatter: fm, body, hadFrontmatter } = parsed;
  if (!hadFrontmatter) {
    return "Missing frontmatter. A requirement must begin with a '---' YAML block.";
  }

  // Unknown-key allowlist.
  for (const key of Object.keys(fm)) {
    if (!KNOWN_REQ_KEYS.has(key)) {
      return `Unknown frontmatter field '${key}'. Allowed: ${[...KNOWN_REQ_KEYS].join(', ')}.`;
    }
  }

  // req must equal the filename stem.
  if (fm['req'] !== stem) {
    return `req must equal the filename stem. Expected '${stem}', got '${fm['req'] ?? '(missing)'}'.`;
  }

  // priority enum.
  const priority = canonicalizeEnumValue(fm['priority']);
  if (!priority) {
    return `priority is required. Must be one of: ${PRIORITY_VALUES.join(', ')}.`;
  }
  if (!(PRIORITY_VALUES as readonly string[]).includes(priority)) {
    return `priority must be one of: ${PRIORITY_VALUES.join(', ')}. Got: '${fm['priority']}'.`;
  }

  // status enum.
  const status = canonicalizeEnumValue(fm['status']);
  if (!status) {
    return `status is required. Must be one of: ${STATUS_VALUES.join(', ')}.`;
  }
  if (!(STATUS_VALUES as readonly string[]).includes(status)) {
    return `status must be one of: ${STATUS_VALUES.join(', ')}. Got: '${fm['status']}'.`;
  }

  // created must be a parseable date.
  const created = fm['created'];
  if (created === undefined || created === null || created === '') {
    return 'created is required. Add an ISO date (e.g. 2026-07-01).';
  }
  const createdDate = created instanceof Date ? created : new Date(String(created));
  if (isNaN(createdDate.getTime())) {
    return `created must be a valid date. Got: '${String(created)}'.`;
  }

  // resolution present iff archived.
  const hasResolution = fm['resolution'] !== undefined && fm['resolution'] !== null && fm['resolution'] !== '';
  if (status === 'archived') {
    if (!hasResolution) {
      return `Archived requirements must carry a resolution. Add one of: ${RESOLUTION_VALUES.join(', ')}.`;
    }
    const resolution = canonicalizeEnumValue(fm['resolution']);
    if (!(RESOLUTION_VALUES as readonly string[]).includes(resolution)) {
      return `resolution must be one of: ${RESOLUTION_VALUES.join(', ')}. Got: '${fm['resolution']}'.`;
    }
  } else if (hasResolution) {
    return "resolution is only allowed on archived requirements (status: archived).";
  }

  // appetite non-empty when present.
  if ('appetite' in fm) {
    const appetite = fm['appetite'];
    if (typeof appetite !== 'string' || !appetite.trim()) {
      return 'appetite, when present, must be a non-empty value.';
    }
  }

  // Required sections present and non-empty (aliases accepted).
  for (const section of REQUIRED_REQ_SECTIONS) {
    const sectionContent = extractReqSection(body, section.aliases);
    if (sectionContent === null) {
      const aliasNote = section.aliases.length > 1
        ? ` (or alias: ${section.aliases.slice(1).join(', ')})`
        : '';
      return `Missing required section '## ${section.canonical}'${aliasNote}.`;
    }
    if (!sectionContent) {
      return `Section '## ${section.canonical}' is empty. It must have content.`;
    }
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
 * Per-AC coverage join between a scope's acceptance criteria and a contract's
 * assertion links + waivers. Exported deliberately: Phase 2's proof-coverage
 * computation and `ana plan coverage` consume the same join, so it is built as
 * a standalone foundation rather than inlined into the gate.
 */
export interface CoverageJoin {
  acs: Array<{
    /** The scope AC id, normalized upper-case (e.g. "AC1"). */
    id: string;
    /** How this AC is covered. `uncovered` is the only blocking status. */
    status: 'pinned' | 'judgment' | 'retired' | 'uncovered';
    /** Ids of the assertions whose `ac:` links this AC (empty unless pinned). */
    assertions: string[];
    /** True when every linking assertion uses a weak matcher only. */
    weakOnly: boolean;
  }>;
  /** Mirror of {@link extractScopeACs}'s ambiguous flag (fail-open signal). */
  ambiguous: boolean;
}

/**
 * Structured, chalk-free result of the pre-seal coverage gate. `artifact.ts`
 * prints `diagnostic` (always), `info`/`warnings` (yellow) and, on `block`,
 * `errors` (red) followed by `process.exit(1)`.
 */
export interface CoverageGateResult {
  /** version >= MIN AND scope has high-confidence ACs AND not ambiguous. */
  active: boolean;
  /** active AND >=1 AC uncovered. The only condition that fails the seal. */
  block: boolean;
  /** AC ids with no assertion link and no waiver. */
  uncovered: string[];
  /** Human-readable block reasons (printed red, then exit 1). */
  errors: string[];
  /** Non-blocking notes (e.g. fail-open degrade). */
  warnings: string[];
  /** Weak-matcher-only coverage notes — never block. */
  info: string[];
  /** The single always-printed decision line (never empty). */
  diagnostic: string;
}

/**
 * Numeric major.minor comparison for contract version strings. Avoids the
 * lexical trap where "1.10" < "1.9". A missing/blank/garbage version is treated
 * as below any real minimum (so a legacy or malformed contract stays inactive).
 *
 * @param version - The contract's `version` field (e.g. "1.0", "1.1")
 * @param min - The minimum activating version (e.g. "1.1")
 * @returns True when `version` is greater than or equal to `min`
 */
export function isVersionAtLeast(version: string | undefined, min: string): boolean {
  const parse = (v: string): [number, number] => {
    const parts = v.split('.');
    const major = Number.parseInt(parts[0] ?? '', 10);
    const minor = Number.parseInt(parts[1] ?? '', 10);
    return [Number.isFinite(major) ? major : 0, Number.isFinite(minor) ? minor : 0];
  };
  if (typeof version !== 'string' || !version.trim()) return false;
  const [vMaj, vMin] = parse(version);
  const [mMaj, mMin] = parse(min);
  if (vMaj !== mMaj) return vMaj > mMaj;
  return vMin >= mMin;
}

/**
 * Recover acceptance-criterion ids from a scope's markdown. Handles four
 * conventions seen across the corpus: dash/star bullets (`- AC1:`), headings
 * (`## AC1`), bold (`**AC1**`), and bare labels (`AC1:`). Ids are de-duplicated
 * and normalized upper-case (one AC mentioned in both a heading and a bullet is
 * a single id).
 *
 * The `ambiguous` flag is the per-scope fail-open classifier (AC14): it is true
 * only when the scope shows AC-signal (an "Acceptance Criteria" heading, or an
 * `AC<n>` token anywhere) yet no well-formed id can be recovered. A scope with
 * no AC section at all returns `{ ids: [], ambiguous: false }` — that is a
 * build-only scope, not an unreadable one.
 *
 * @param scopeContent - Raw markdown contents of scope.md
 * @returns The recovered AC id set and whether the scope is ambiguous
 */
export function extractScopeACs(scopeContent: string): { ids: string[]; ambiguous: boolean } {
  const ids = new Set<string>();
  if (typeof scopeContent !== 'string' || scopeContent.length === 0) {
    return { ids: [], ambiguous: false };
  }

  const lines = scopeContent.split('\n');
  for (const line of lines) {
    // Heading form: `## AC1`, `### **AC1**`
    const heading = line.match(/^\s*#{1,6}\s+\*{0,2}\s*(AC\d+)\b/i);
    if (heading?.[1]) ids.add(heading[1].toUpperCase());

    // Bullet form: `- AC1:`, `* **AC1**`, `- AC1 — desc`
    const bullet = line.match(/^\s*[-*]\s+\*{0,2}\s*(AC\d+)\b/i);
    if (bullet?.[1]) ids.add(bullet[1].toUpperCase());

    // Bare label at line start: `AC1:`, `AC1.`, `AC1)`
    const bare = line.match(/^\s*(AC\d+)\s*[:.)\]]/i);
    if (bare?.[1]) ids.add(bare[1].toUpperCase());

    // Bold form anywhere on the line: `**AC1**`, `**AC1:**`
    const boldRe = /\*\*\s*(AC\d+)\b/gi;
    let m: RegExpExecArray | null;
    while ((m = boldRe.exec(line)) !== null) {
      if (m[1]) ids.add(m[1].toUpperCase());
    }
  }

  const idList = [...ids];
  if (idList.length > 0) {
    return { ids: idList, ambiguous: false };
  }

  // No ids recovered. Ambiguous only if the scope shows AC-signal anyway.
  const hasACHeading = /^\s*#{1,6}\s+Acceptance\s+Criteria/im.test(scopeContent);
  const hasACToken = /\bAC\d+\b/i.test(scopeContent);
  return { ids: [], ambiguous: hasACHeading || hasACToken };
}

/**
 * Join a scope's acceptance criteria against a contract's assertion `ac:` links
 * and `coverage_waivers`. The standalone helper the gate (and Phase 2) call.
 *
 * Coverage is structural, not semantic: an AC is `pinned` when at least one
 * assertion lists it in `ac:`, `judgment`/`retired` when a waiver (with a
 * non-empty reason) excuses it, and `uncovered` otherwise. A waiver missing its
 * required `reason` does not count — that is what makes over-waiving visible.
 *
 * @param scopeContent - Raw markdown contents of scope.md
 * @param contract - The parsed contract schema
 * @returns The per-AC coverage join
 */
export function joinCoverage(scopeContent: string, contract: ContractSchema): CoverageJoin {
  const { ids, ambiguous } = extractScopeACs(scopeContent);

  // AC id -> covering assertion ids + their matchers.
  const linksByAC = new Map<string, { ids: string[]; matchers: string[] }>();
  const assertions = Array.isArray(contract?.assertions) ? contract.assertions : [];
  for (const a of assertions) {
    if (!a || a.ac === undefined || a.ac === null) continue;
    const acList = Array.isArray(a.ac) ? a.ac : [a.ac];
    for (const rawAc of acList) {
      if (typeof rawAc !== 'string' || !rawAc.trim()) continue;
      const acId = rawAc.trim().toUpperCase();
      const entry = linksByAC.get(acId) ?? { ids: [], matchers: [] };
      entry.ids.push(a.id);
      entry.matchers.push(typeof a.matcher === 'string' ? a.matcher : '');
      linksByAC.set(acId, entry);
    }
  }

  // AC id -> waiver kind (only waivers with a non-empty reason count).
  const waiverByAC = new Map<string, 'judgment' | 'retired'>();
  const waivers = Array.isArray(contract?.coverage_waivers) ? contract.coverage_waivers : [];
  for (const w of waivers) {
    if (!w || typeof w.ac !== 'string' || !w.ac.trim()) continue;
    if (w.kind !== 'judgment' && w.kind !== 'retired') continue;
    if (typeof w.reason !== 'string' || !w.reason.trim()) continue;
    waiverByAC.set(w.ac.trim().toUpperCase(), w.kind);
  }

  const acs = ids.map(id => {
    const link = linksByAC.get(id);
    if (link && link.ids.length > 0) {
      const weakOnly = link.matchers.every(matcher => WEAK_MATCHERS.has(matcher));
      return { id, status: 'pinned' as const, assertions: link.ids, weakOnly };
    }
    const waiver = waiverByAC.get(id);
    if (waiver) {
      return { id, status: waiver, assertions: [] as string[], weakOnly: false };
    }
    return { id, status: 'uncovered' as const, assertions: [] as string[], weakOnly: false };
  });

  return { acs, ambiguous };
}

/**
 * The pure pre-seal coverage gate — a thin policy layer over {@link joinCoverage}.
 * Never throws and never prints: a malformed contract or scope degrades to an
 * inactive/warn result. All chalk + `process.exit` live in `artifact.ts`.
 *
 * Activation requires version >= 1.1 AND a non-ambiguous scope AND at least one
 * recovered AC. When active, it blocks iff at least one AC is `uncovered`.
 *
 * @param input - The sibling scope.md contents and the parsed contract
 * @param input.scopeContent - Raw markdown contents of the sibling scope.md
 * @param input.contract - The parsed contract schema being saved
 * @returns The structured gate result (see {@link CoverageGateResult})
 */
export function evaluateCoverageGate(input: { scopeContent: string; contract: ContractSchema }): CoverageGateResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  let join: CoverageJoin;
  try {
    join = joinCoverage(input?.scopeContent ?? '', input?.contract ?? {});
  } catch {
    return {
      active: false,
      block: false,
      uncovered: [],
      errors,
      warnings,
      info,
      diagnostic: 'inactive (coverage gate could not evaluate — treated as legacy)',
    };
  }

  // Fail-open: an unrecognized AC format warns for this scope, never blocks.
  if (join.ambiguous) {
    warnings.push('Scope acceptance-criteria format not recognized — coverage gate degraded to warn-only for this scope.');
    return {
      active: false,
      block: false,
      uncovered: [],
      errors,
      warnings,
      info,
      diagnostic: 'skipped (AC format unrecognized — warn only, not blocking)',
    };
  }

  const versionActive = isVersionAtLeast(input?.contract?.version, COVERAGE_GATE_MIN_VERSION);
  const hasACs = join.acs.length > 0;

  if (!versionActive) {
    return {
      active: false,
      block: false,
      uncovered: [],
      errors,
      warnings,
      info,
      diagnostic: `inactive (legacy contract, version ${input?.contract?.version ?? '1.0'})`,
    };
  }

  if (!hasACs) {
    // Build-only / no-AC scope: nothing to cover (AC6).
    return {
      active: false,
      block: false,
      uncovered: [],
      errors,
      warnings,
      info,
      diagnostic: 'inactive (scope has no acceptance criteria)',
    };
  }

  // Active. Compute coverage.
  const uncovered = join.acs.filter(ac => ac.status === 'uncovered').map(ac => ac.id);
  for (const ac of join.acs) {
    if (ac.status === 'pinned' && ac.weakOnly) {
      info.push(`${ac.id} covered by weak matcher only — the link exists; semantic strength is Verify's call.`);
    }
  }

  const block = uncovered.length > 0;
  const total = join.acs.length;
  const covered = total - uncovered.length;
  const waived = join.acs.filter(ac => ac.status === 'judgment' || ac.status === 'retired').length;

  if (block) {
    errors.push(`Contract leaves ${uncovered.length} scope acceptance criteri${uncovered.length === 1 ? 'on' : 'a'} uncovered.`);
    for (const id of uncovered) {
      errors.push(
        `${id} has no covering assertion and no coverage_waivers entry. ` +
        `Either add an assertion with \`ac: ${id}\`, or add a coverage_waivers entry ` +
        `({ ac: ${id}, kind: judgment|retired, reason: "..." }) explaining why it is not mechanically pinned.`
      );
    }
  }

  const waivedNote = waived > 0 ? ` (${waived} by waiver)` : '';
  const diagnostic = `active — ${covered}/${total} acceptance criteria covered${waivedNote}`;

  return { active: true, block, uncovered, errors, warnings, info, diagnostic };
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
