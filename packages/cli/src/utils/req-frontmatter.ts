/**
 * Requirement frontmatter primitive — the single parse/serialize implementation
 * every requirement consumer builds on.
 *
 * Pure like {@link ../utils/verdict.ts}: data in, data out, zero chalk / commander.
 * `parseRequirement` splits the leading `---` YAML block from the markdown body
 * and preserves unknown keys and the body verbatim. `serializeRequirement`
 * re-emits the file with the known enums canonicalized (lowercase) and unknown
 * keys round-tripped in insertion order, leaving the body byte-for-byte untouched.
 *
 * One parse/serialize implementation means the validator, `req list`, the claim
 * rewrite, and the archive move all consume the SAME primitive — so a future
 * server-side validator reuses it rather than growing a second parser that drifts
 * on the first new metadata key.
 */

import * as yaml from 'yaml';

/** Allowed `priority` values. `unset` is honest — proposing a priority is Think's job. */
export const PRIORITY_VALUES = ['critical', 'high', 'medium', 'low', 'unset'] as const;

/** Allowed `status` values across a requirement's lifecycle. */
export const STATUS_VALUES = ['open', 'claimed', 'archived'] as const;

/** Allowed `resolution` values — present iff `status: archived`. */
export const RESOLUTION_VALUES = ['completed', 'rejected'] as const;

/**
 * Priority ranking, highest first. Index is the rank — `critical` sorts before
 * `unset`. `unset` sorts last and is the "highest" only when every open
 * requirement is `unset`.
 */
export const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low', 'unset'] as const;

/** The frontmatter keys the enum canonicalizer lowercases on serialize. */
const ENUM_KEYS = new Set(['priority', 'status', 'resolution']);

/**
 * Known requirement frontmatter shape. Unknown keys are preserved on round-trip
 * (forward-compat for future metadata), so the index signature is intentional.
 */
export interface RequirementFrontmatter {
  /** Requirement id — must equal the filename stem (e.g. `REQ-proof-viewer`). */
  req?: string;
  /** One-line human title. */
  title?: string;
  /** One of {@link PRIORITY_VALUES}. */
  priority?: string;
  /** One of {@link STATUS_VALUES}. */
  status?: string;
  /** ISO date the requirement was created. */
  created?: string;
  /** Where the requirement came from (e.g. `hand-written`). */
  source?: string;
  /** Optional worth-ceiling — what it's worth, not a cost estimate. */
  appetite?: string;
  /** Back-pointer to the work-item slug that claimed this requirement. */
  claimed_by?: string;
  /** One of {@link RESOLUTION_VALUES} — present iff archived. */
  resolution?: string;
  /** Unknown keys are preserved verbatim on round-trip. */
  [key: string]: unknown;
}

/**
 * The result of splitting a requirement file into frontmatter and body.
 */
export interface ParsedRequirement {
  /** The parsed YAML frontmatter (empty object when absent). */
  frontmatter: Record<string, unknown>;
  /** The markdown body after the closing `---`, byte-for-byte. */
  body: string;
  /** Whether a well-formed leading `---` frontmatter block was present. */
  hadFrontmatter: boolean;
}

/**
 * Canonicalize an enum value for case-insensitive comparison: trimmed lowercase,
 * or empty string for a non-string. Shared by the validator and the serializer
 * so both agree on what "the same enum value" means.
 *
 * @param value - The raw frontmatter value
 * @returns The trimmed, lowercased string (empty when not a string)
 */
export function canonicalizeEnumValue(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Split a requirement file into frontmatter and body.
 *
 * Preserves unknown frontmatter keys and returns the body byte-for-byte. A file
 * with no leading `---` block (or an unterminated one) returns
 * `hadFrontmatter: false` with the whole content as the body — it never throws
 * for a missing block. A present-but-malformed YAML block lets `yaml.parse`
 * throw so callers can mark the file malformed.
 *
 * @param content - Full requirement file content
 * @returns The parsed frontmatter, the verbatim body, and whether frontmatter was present
 */
export function parseRequirement(content: string): ParsedRequirement {
  if (!/^---[ \t]*\r?\n/.test(content)) {
    return { frontmatter: {}, body: content, hadFrontmatter: false };
  }

  const lines = content.split('\n');
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === '---') {
      closeIdx = i;
      break;
    }
  }

  if (closeIdx === -1) {
    // Unterminated frontmatter — treat as no frontmatter rather than throwing.
    return { frontmatter: {}, body: content, hadFrontmatter: false };
  }

  const fmText = lines.slice(1, closeIdx).join('\n');
  const body = lines.slice(closeIdx + 1).join('\n');
  const parsed = yaml.parse(fmText) as unknown;
  const frontmatter =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};

  return { frontmatter, body, hadFrontmatter: true };
}

/**
 * Re-emit a requirement file from frontmatter and body.
 *
 * The known enums (`priority`, `status`, `resolution`) are canonicalized to
 * lowercase; every other key — including unknown ones — is round-tripped in
 * insertion order. The body is left byte-for-byte untouched.
 *
 * @param frontmatter - The frontmatter object to serialize
 * @param body - The markdown body to append verbatim
 * @returns The reassembled requirement file content
 */
export function serializeRequirement(frontmatter: Record<string, unknown>, body: string): string {
  const canonical: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    canonical[key] = ENUM_KEYS.has(key) && typeof value === 'string' ? canonicalizeEnumValue(value) : value;
  }
  const yamlStr = yaml.stringify(canonical);
  return `---\n${yamlStr}---\n${body}`;
}
