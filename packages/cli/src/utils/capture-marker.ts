/**
 * Capture marker — the contract between `ana test` and the save-time seal gate.
 *
 * A "marker" is a single-line HTML comment the agent pastes into a build (or
 * verify) report. It is the COMPACT attestation of a captured test run: it
 * carries the counts, the verdict, and a sha256 fingerprint — but NOT the raw
 * output itself. The fingerprint is computed over a canonical, deterministic
 * summary of the RESULT (`stage | slug | counts | verdict`), not over the raw
 * runner bytes, so the same outcome always mints a byte-identical marker.
 * Nothing is inlined at save time and nothing committed contains a verbatim
 * dump — the one-line marker is the whole sealed account.
 *
 * The marker is a CLOSED TOKEN. A line is a real marker only when, after
 * trimming, it is exactly `<!-- ana:capture … -->` with every required field
 * present and well-formed (notably a 64-char lowercase-hex `sha256`), and only
 * when it sits OUTSIDE a fenced code region. This combination — full-line anchor
 * + fenced-region skip + a well-formed `sha256` — is what keeps a prose
 * description or a fenced example from being mistaken for a real seal. (A
 * verbatim real marker pasted raw into prose is a forgery surface consciously
 * deferred to a future engine-bound token; the reserved `enginebind` field is
 * the plumbing for it.)
 *
 * This module is pure: no chalk, no commander, no process.exit. `node:crypto` is
 * permitted — the canonical hash is computed here.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import type { CaptureVerdict, TestCounts } from './capture-runner.js';

/** Capture stage — which pipeline step produced the run. */
export type CaptureStage = 'build' | 'verify';

export type { CaptureVerdict } from './capture-runner.js';

/**
 * A parsed capture marker — the fields carried in the single-line
 * `<!-- ana:capture … -->` comment.
 */
export interface CaptureMarker {
  stage: CaptureStage;
  slug: string;
  /** `Np/Nf/Ns` when counts were derived, or `abstain` when abstaining. */
  counts: string;
  verdict: CaptureVerdict;
  /** Lowercase hex sha256 of the canonical result summary. */
  sha256: string;
  /**
   * Reserved L3 engine-binding token. Plumbing only — the parser round-trips it
   * present and absent and builds no nonce/binding machinery. Its existence is
   * what lets a future engine-bound seal ship without a second format migration.
   */
  enginebind?: string;
}

/** Result of the warn-vs-block save-time gate. */
export interface TestEvidenceGateResult {
  blocked: boolean;
  warnings: string[];
  errors: string[];
}

/** A line is a real marker only when, trimmed, it is EXACTLY this — full-line. */
const FULL_LINE_MARKER = /^<!--\s*ana:capture\s+(.+?)\s*-->$/;
/** A fence open/close line (``` …), used to skip fenced code regions. */
const FENCE_LINE = /^\s*```/;
/** A 64-char lowercase-hex sha256 — a plausible doc placeholder must fail this. */
const HEX64 = /^[0-9a-f]{64}$/;

// ─────────────────────────────────────────────────────────────────────────────
// Marker formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format engine-derived counts into the marker's `counts` token.
 *
 * @param counts - Derived counts, or null to abstain
 * @returns `Np/Nf/Ns` when counts present, `abstain` when null
 */
export function formatCounts(counts: TestCounts | null): string {
  if (!counts) return 'abstain';
  return `${counts.passed}p/${counts.failed}f/${counts.skipped}s`;
}

/** The deterministic result summary the seal is computed over. */
export interface CanonicalCaptureInput {
  stage: CaptureStage;
  slug: string;
  /** The `formatCounts(...)` string — `Np/Nf/Ns` or `abstain`. */
  counts: string;
  verdict: CaptureVerdict;
}

/**
 * Serialize a result into its canonical, deterministic byte layout — the single
 * source of truth the seal is hashed over. Field order is fixed
 * (`stage`, `slug`, `counts`, `verdict`), each field is `key=value`, and fields
 * are separated by a single newline. No value can contain a newline, so the form
 * is unambiguous. `enginebind` does NOT participate — it is a dormant reserved
 * field, not part of the result summary.
 *
 * @param input - The deterministic result fields
 * @returns The canonical string `stage=…\nslug=…\ncounts=…\nverdict=…`
 */
export function canonicalCaptureString(input: CanonicalCaptureInput): string {
  return `stage=${input.stage}\nslug=${input.slug}\ncounts=${input.counts}\nverdict=${input.verdict}`;
}

/**
 * Compute the seal's `sha256` over the canonical result summary. Determinism is
 * structural: the same visible fields always hash to the same fingerprint, and
 * the fingerprint is recomputable from the marker — it proves determinism and
 * self-consistency, not forgery resistance.
 *
 * @param input - The deterministic result fields
 * @returns Lowercase hex sha256 of `canonicalCaptureString(input)`
 */
export function captureSha(input: CanonicalCaptureInput): string {
  return createHash('sha256').update(canonicalCaptureString(input), 'utf8').digest('hex');
}

/**
 * Render a capture marker as a single-line HTML comment. Field order is
 * `stage slug counts verdict sha256 [enginebind]`; the reserved `enginebind` is
 * emitted only when present.
 *
 * @param marker - Marker fields to serialize
 * @returns The `<!-- ana:capture … -->` line
 */
export function formatMarker(marker: CaptureMarker): string {
  const parts = [
    `stage=${marker.stage}`,
    `slug=${marker.slug}`,
    `counts=${marker.counts}`,
    `verdict=${marker.verdict}`,
    `sha256=${marker.sha256}`,
  ];
  if (marker.enginebind !== undefined) parts.push(`enginebind=${marker.enginebind}`);
  return `<!-- ana:capture ${parts.join(' ')} -->`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Strict marker parsing — closed token, full-line, fenced-region-skipping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse one line into a typed marker under the STRICT grammar. Returns null
 * unless, after trimming, the line is exactly `<!-- ana:capture … -->` and every
 * required field is present and well-formed:
 *   - `stage` ∈ {build, verify}
 *   - `slug`, `counts` non-empty
 *   - `verdict` ∈ {pass, fail, abstain}
 *   - `sha256` = 64 lowercase hex
 * Unknown keys are ignored (forward-compat); the reserved `enginebind` is
 * captured when present so it re-serializes unchanged. A well-formed `sha256` is
 * the discriminator: a prose description or fenced placeholder fails the hex
 * check and is never accepted as a real seal.
 *
 * @param line - A single report line (untrimmed)
 * @returns A typed marker, or null when the line is not a well-formed marker
 */
function parseMarkerText(line: string): CaptureMarker | null {
  const m = FULL_LINE_MARKER.exec(line.trim());
  if (!m) return null;

  const fields: Record<string, string> = {};
  for (const pair of m[1]!.trim().split(/\s+/)) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    fields[pair.slice(0, eq)] = pair.slice(eq + 1);
  }

  const stage = fields['stage'];
  if (stage !== 'build' && stage !== 'verify') return null;

  const slug = fields['slug'];
  if (!slug) return null;

  const counts = fields['counts'];
  if (!counts) return null;

  const verdict = fields['verdict'];
  if (verdict !== 'pass' && verdict !== 'fail' && verdict !== 'abstain') return null;

  const sha256 = fields['sha256'];
  if (!sha256 || !HEX64.test(sha256)) return null;

  const marker: CaptureMarker = { stage, slug, counts, verdict, sha256 };
  if ('enginebind' in fields) marker.enginebind = fields['enginebind']!;
  return marker;
}

/**
 * Parse all well-formed capture markers from a report's text. Lines inside
 * fenced code regions (triple-backtick blocks) are skipped, so a marker shown as
 * a fenced example never parses as a real seal. Malformed lines are skipped.
 *
 * @param reportText - Full build/verify report text
 * @returns Parsed markers in document order
 */
export function parseMarkers(reportText: string): CaptureMarker[] {
  const markers: CaptureMarker[] = [];
  let inFence = false;
  for (const line of reportText.split('\n')) {
    if (FENCE_LINE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const marker = parseMarkerText(line);
    if (marker) markers.push(marker);
  }
  return markers;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seal validator + gate — pure
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seal validator: a build report must carry at least one well-formed `build`
 * capture marker. "Present" means "a well-formed compact build seal exists" —
 * well-formedness lives in the strict parser, so a fenced example, a placeholder
 * description, or an old-format inlined marker does not count.
 *
 * @param filePath - Path to the build report
 * @returns An error string when no build capture is present, null otherwise
 */
export function validateCapturePresent(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const hasBuild = parseMarkers(content).some((marker) => marker.stage === 'build');
  if (!hasBuild) {
    return 'No captured test run found. Run `ana test --stage build --slug <slug>` and paste the marker into the build report.';
  }
  return null;
}

/**
 * Decide warn-vs-block for a build report's capture seal.
 *
 * Enablement is a committed-config decision (`testEvidenceGate` in `ana.json`),
 * resolved by the caller and passed in as `opts.enabled`. With nothing inlined,
 * the gate weighs ONLY presence: a well-formed build seal must exist. When the
 * gate is NOT enabled, a missing seal surfaces as a warning and never
 * `process.exit`s; when it IS enabled, a missing seal becomes `blocked: true`.
 *
 * @param filePath - Path to the build report
 * @param opts - Gate options
 * @param opts.enabled - Whether the capture gate is enabled for this project
 * @returns The gate decision with messages partitioned into warnings/errors
 */
export function evaluateTestEvidenceGate(filePath: string, opts: { enabled: boolean }): TestEvidenceGateResult {
  const messages: string[] = [];
  const msg = validateCapturePresent(filePath);
  if (msg) messages.push(msg);
  if (opts.enabled && messages.length > 0) {
    return { blocked: true, warnings: [], errors: messages };
  }
  return { blocked: false, warnings: messages, errors: [] };
}
