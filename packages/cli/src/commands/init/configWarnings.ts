/**
 * Fail-soft validation pass for the ultimate-configurability keys.
 *
 * The configurability keys (`agents`, `skills`) all degrade silently via
 * per-field `.catch(undefined)` in the Zod schema and fail-soft resolvers —
 * "not nuke" shipped, but "WARN" did not. This module is the LOUD half: it
 * diffs the RAW ana.json (as read off
 * disk, before Zod coercion) against what the resolvers will actually honor, and
 * returns a clear, field-named warning for each value that will be ignored.
 *
 * It NEVER throws and NEVER mutates — the contract stays "degrade, don't crash,
 * don't clobber"; this only makes the degrade visible. The returned strings are
 * pushed onto the init warning channel so the user sees, e.g.:
 *
 *   Warning: agents.ana-build.skills must be an array of strings — ignoring
 *   (using stock). Got: "notanarray"
 *
 * Kept separate from the resolvers (manifest.ts) and the capability readers
 * (assets.ts) so the validation surface is one auditable list, and so the
 * resolvers stay pure (no logging side effects).
 */

import { isSafeNameSegment } from '../../manifest.js';

/**
 * Narrow an unknown value to a plain (non-array) object record.
 *
 * @param value - Candidate value
 * @returns The record, or null when not a plain object
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Render a rejected value compactly for a warning (so the user sees WHAT they
 * wrote without a giant dump).
 *
 * @param value - The offending value
 * @returns A short, single-line description
 */
function describe(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `an array (${value.length} item${value.length === 1 ? '' : 's'})`;
  if (typeof value === 'object') return 'an object';
  return typeof value;
}

/**
 * Collect field-named warnings for malformed configurability keys.
 *
 * @param raw - The raw ana.json as read off disk (anything; never trusted)
 * @returns Zero or more human-readable, field-named warning lines
 */
export function collectConfigWarnings(raw: unknown): string[] {
  const warnings: string[] = [];
  const root = asRecord(raw);
  if (!root) return warnings;

  // ── agents ──────────────────────────────────────────────────────────────
  if (root['agents'] !== undefined) {
    const agents = asRecord(root['agents']);
    if (!agents) {
      warnings.push(
        `agents must be an object keyed by agent name (e.g. { "ana-build": { "skills": [...] } }) `
        + `— ignoring (using stock). Got: ${describe(root['agents'])}`,
      );
    } else {
      for (const [name, entry] of Object.entries(agents)) {
        if (!isSafeNameSegment(name)) {
          warnings.push(
            `agents has an invalid agent name '${name}' — ignoring `
            + `(names may use [A-Za-z0-9._-], excluding '.' and '..').`,
          );
          continue;
        }
        const e = asRecord(entry);
        if (!e) {
          warnings.push(
            `agents.${name} must be an object (e.g. { "skills": [...], "model": "opus" }) `
            + `— ignoring. Got: ${describe(entry)}`,
          );
          continue;
        }
        if (e['skills'] !== undefined && !isStringArray(e['skills'])) {
          warnings.push(
            `agents.${name}.skills must be an array of strings — ignoring (using stock). `
            + `Got: ${describe(e['skills'])}`,
          );
        }
        if (e['model'] !== undefined && typeof e['model'] !== 'string') {
          warnings.push(
            `agents.${name}.model must be a string — ignoring. Got: ${describe(e['model'])}`,
          );
        }
      }
    }
  }

  // ── skills ──────────────────────────────────────────────────────────────
  if (root['skills'] !== undefined) {
    const skills = asRecord(root['skills']);
    if (!skills) {
      warnings.push(
        `skills must be an object keyed by skill name (e.g. { "observability": { "always": true } }) `
        + `— ignoring (using stock). Got: ${describe(root['skills'])}`,
      );
    } else {
      for (const [name, entry] of Object.entries(skills)) {
        if (!isSafeNameSegment(name)) {
          warnings.push(
            `skills has an invalid skill name '${name}' — ignoring `
            + `(names may use [A-Za-z0-9._-], excluding '.' and '..').`,
          );
          continue;
        }
        const e = asRecord(entry);
        if (!e) {
          warnings.push(
            `skills.${name} must be an object (e.g. { "always": true }) — ignoring. Got: ${describe(entry)}`,
          );
          continue;
        }
        if (e['always'] !== undefined && typeof e['always'] !== 'boolean') {
          warnings.push(
            `skills.${name}.always must be a boolean — ignoring. Got: ${describe(e['always'])}`,
          );
        }
      }
    }
  }

  return warnings;
}

/**
 * True when `value` is an array of strings.
 *
 * @param value - Candidate value
 * @returns Whether every element is a string
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}
