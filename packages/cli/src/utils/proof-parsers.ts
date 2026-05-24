/**
 * Proof chain parsing and extraction functions.
 *
 * Leaf module — no dependencies on other proof modules.
 * Parsing functions for build reports, verify reports, and scope files.
 */

import * as fs from 'node:fs';

/**
 * Per-assertion proof data
 */
export interface ProofAssertion {
  id: string;
  says: string;
  verifyStatus: 'SATISFIED' | 'UNSATISFIED' | 'DEVIATED' | 'UNCOVERED' | null;
  evidence?: string;
}

/**
 * Deviation from contract
 */
export interface ProofDeviation {
  contract_id: string;
  says: string;
  instead: string | null;
  reason: string | null;
  outcome: string | null;
}

/**
 * Parse build report's ## Open Issues section.
 *
 * Extracts Build's self-reported concerns. Format: bold title + colon + description,
 * numbered or bulleted. Returns empty array when section says "None" or is missing.
 *
 * @param content - Build report content
 * @returns Array of { summary, file } for each open issue
 */
export function parseBuildOpenIssues(content: string): Array<{ summary: string; file: string | null }> {
  const results: Array<{ summary: string; file: string | null }> = [];

  const sectionMatch = content.match(/## Open Issues\n([\s\S]*?)(?=\n## |$)/);
  if (!sectionMatch || !sectionMatch[1]) return results;

  const section = sectionMatch[1].trim();
  if (section.startsWith('None')) return results;

  // Match bold-prefixed list items and join continuation lines
  const lines = section.split('\n');
  let current: string | null = null;

  const flush = () => {
    if (current) {
      const summary = current.replace(/\*\*/g, '').substring(0, 1000).trim();
      if (summary) {
        const fileRefs = extractFileRefs(summary);
        results.push({ summary, file: fileRefs[0] ?? null });
      }
    }
    current = null;
  };

  for (const line of lines) {
    if (line.match(/^[-*\d.]+\s+\*\*/)) {
      flush();
      current = line.replace(/^[-*\d.]+\s+/, '');
    } else if (current && line.trim() && !line.startsWith('#')) {
      current += ' ' + line.trim();
    }
  }
  flush();

  return results;
}

/**
 * Extract file references from finding summary text.
 *
 * Matches patterns like:
 *   - filename.ts:123 (with line number)
 *   - filename.ts:123-456 (with line range)
 *   - filename.ts (without line number)
 *
 * Supports extensions: .ts, .tsx, .js, .jsx, .json, .yaml, .yml, .md
 *
 * @param summary - Finding summary text
 * @returns Array of unique filenames (without line numbers)
 */
export function extractFileRefs(summary: string): string[] {
  // Match file path with optional line number or range.
  // Captures full path as written: src/utils/proofSummary.ts:361 → src/utils/proofSummary.ts
  // Also handles bare filenames: proofSummary.ts:361 → proofSummary.ts
  // Note: longer extensions must come before shorter prefixes (tsx before ts, json before js, yaml before yml)
  const pattern = /((?:[\w./-]+\/)?[a-zA-Z0-9_.-]+\.(?:tsx|ts|jsx|json|js|yaml|yml|md))(?::\d+(?:-\d+)?)?/g;
  const matches = summary.matchAll(pattern);
  const refs = new Set<string>();
  for (const match of matches) {
    if (match[1]) {
      // Skip URL-like paths (from links in finding text)
      if (match[1].startsWith('//') || match[1].includes('://')) continue;
      refs.add(match[1]);
    }
  }
  return Array.from(refs);
}

/**
 * Extract the first paragraph of the ## Intent section from a scope.md file.
 *
 * "First paragraph" = text between `## Intent\n` and the next blank line or `##` heading.
 * Returns undefined if scope.md doesn't exist or has no Intent section.
 *
 * @param scopePath - Absolute path to scope.md
 * @returns First paragraph text, or undefined
 */
export function extractScopeSummary(scopePath: string): string | undefined {
  if (!fs.existsSync(scopePath)) return undefined;
  try {
    const content = fs.readFileSync(scopePath, 'utf-8');
    const intentMatch = content.match(/## Intent\n([\s\S]*?)(?=\n## |\n\n|$)/);
    if (!intentMatch || !intentMatch[1]) return undefined;
    const paragraph = intentMatch[1].trim();
    return paragraph || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extracts the kind classification from a scope.md file.
 * Parses the `**Kind:**` line in the Complexity Assessment section.
 * Returns undefined if scope.md doesn't exist, has no Kind line, or has an invalid value.
 *
 * @param scopePath - Absolute path to scope.md
 * @returns Parsed kind ('feature' | 'fix' | 'chore' | 'milestone'), or undefined
 */
export function extractScopeKind(scopePath: string): 'feature' | 'fix' | 'chore' | 'milestone' | undefined {
  if (!fs.existsSync(scopePath)) return undefined;
  try {
    const content = fs.readFileSync(scopePath, 'utf-8');
    const kindMatch = content.match(/\*\*Kind:\*\*\s*(.+)/);
    if (!kindMatch || !kindMatch[1]) return undefined;
    const raw = kindMatch[1].trim().toLowerCase();
    if (raw === 'feature' || raw === 'fix' || raw === 'chore' || raw === 'milestone') return raw;
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse findings from verify report's ## Findings section.
 *
 * Format-agnostic: finds bold category keywords (Code, Test, Upstream, Security,
 * Performance, etc.) and captures summaries. Handles all observed formats:
 *   - `- **Code — Title:** description` (bulleted with em-dash)
 *   - `- **Code:** description` (bulleted with colon)
 *   - `**Code:** description` (standalone paragraph)
 *   - `**Code:**\n- **Title:** desc` (category header + sub-bullets)
 *   - `1. **Title:** desc` (numbered, no category — defaults to "code")
 *
 * @param content - Verify report content
 * @returns Array of { category, summary, file, anchor } (id assigned later by writeProofChain)
 */
export function parseFindings(content: string): Array<{ category: string; summary: string; file: string | null; anchor: string | null }> {
  const results: Array<{ category: string; summary: string; file: string | null; anchor: string | null }> = [];

  // Find ## Findings section
  const findingsMatch = content.match(/## Findings\n([\s\S]*?)(?=\n## |$)/);
  if (!findingsMatch || !findingsMatch[1]) return results;

  const section = findingsMatch[1];
  const lines = section.split('\n');

  let currentCategory: string | null = null;
  let currentSummary: string[] = [];

  const flushFinding = () => {
    if (currentCategory && currentSummary.length > 0) {
      const summary = currentSummary.join(' ').trim().substring(0, 1000).trim();
      if (summary) {
        const fileRefs = extractFileRefs(summary);
        // Extract code anchor: first backtick-quoted construct >5 chars with a letter, not a file:line ref
        const backticks = [...summary.matchAll(/`([^`]+)`/g)].map(m => m[1]).filter((b): b is string => b !== undefined);
        const anchor = backticks.find(b =>
          b.length > 5 && /[a-zA-Z]/.test(b) && !b.match(/^\S+\.\w+:\d+/)
        ) ?? null;
        results.push({ category: currentCategory, summary, file: fileRefs[0] ?? null, anchor });
      }
    }
    currentSummary = [];
  };

  for (const line of lines) {
    // Look for a bold category keyword: **Word — or **Word:** or **Word**:
    const categoryMatch = line.match(/\*\*(\w+)\s*(?:[—–:-]|:\*\*|\*\*\s*[—–:-])/i);

    if (categoryMatch && categoryMatch[1]) {
      flushFinding();
      currentCategory = categoryMatch[1].toLowerCase();

      // Extract summary: everything after the category keyword.
      // For "- **Code — Title:** desc" → "Title: desc"
      // For "**Code:** desc" → "desc"
      // For "**Code:**" → "" (category-only header, sub-bullets provide content)
      const afterCategory = line.replace(
        /^[-*\d.]*\s*\*\*\w+\s*[—–:-]?\s*/,  // strip prefix + **Category + separator
        ''
      );
      const rest = afterCategory
        .replace(/\*\*/g, '')           // strip remaining bold markers
        .replace(/^\s*:?\s*/, '')       // strip leading colon
        .trim();
      currentSummary = rest ? [rest] : [];
    } else if (currentCategory && line.trim()) {
      const trimmed = line.replace(/^\s*[-*]\s*/, '').trim();
      if (trimmed.match(/^\*\*[^*]+\*\*/)) {
        // Sub-bullet with bold text — new finding under same category
        flushFinding();
        const cleaned = trimmed.replace(/\*\*/g, '').replace(/^\s*[-:]\s*/, '').trim();
        currentSummary = cleaned ? [cleaned] : [];
      } else if (trimmed) {
        currentSummary.push(trimmed);
      }
    } else if (!line.trim() && currentCategory && currentSummary.length > 0) {
      // Empty line — flush current finding, keep category for next sub-bullet
      flushFinding();
    }
  }

  flushFinding();
  return results;
}

/**
 * Parse rejection cycle data from verify report's Previous Findings Resolution section.
 *
 * Looks for the machine-parseable table in the Previous Findings Resolution section:
 *   ### Previously UNSATISFIED Assertions
 *   | ID | Previous Issue | Current Status | Resolution |
 *
 * Returns cycle count and list of previously-failed assertions.
 *
 * @param content - Verify report content
 * @returns { cycles, failures }
 */
export function parseRejectionCycles(content: string): {
  cycles: number;
  failures: Array<{ id: string; summary: string }>;
} {
  // Find the "Previous Findings Resolution" section
  const section = content.match(/## Previous Findings Resolution([\s\S]*?)(?=\n## [^#]|$)/);
  if (!section || !section[1]) return { cycles: 0, failures: [] };

  // Find the "Previously UNSATISFIED Assertions" table
  const assertionTable = section[1].match(/### Previously UNSATISFIED Assertions\n([\s\S]*?)(?=\n### |$)/);
  if (!assertionTable || !assertionTable[1]) return { cycles: 0, failures: [] };

  const failures: Array<{ id: string; summary: string }> = [];
  const rowPattern = /\|\s*(A\d+)\s*\|\s*([^|]+)\s*\|/g;
  let match;
  while ((match = rowPattern.exec(assertionTable[1])) !== null) {
    const id = match[1];
    const summary = match[2];
    if (id && summary) {
      // Skip header row (contains "ID" or "Previous Issue")
      if (id === 'ID' || summary.trim() === 'Previous Issue') continue;
      failures.push({ id, summary: summary.trim() });
    }
  }

  return { cycles: failures.length > 0 ? 1 : 0, failures };
}
