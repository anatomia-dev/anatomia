/**
 * Capture marker — the contract between `ana test`, the save-time inliner, and
 * the three seal validators.
 *
 * A "marker" is a single-line HTML comment the agent pastes into a build
 * report. At save time the inliner expands each marker into a verbatim block —
 * `ana:capture-begin … ana:capture-end` COMMENT delimiters with the raw bytes
 * sitting directly between them, NO code fence — and three pure validators gate
 * the seal: a build report cannot seal without a real captured run whose inlined
 * bytes are byte-for-byte identical to the capture file.
 *
 * Two load-bearing correctness decisions (NOT style):
 *  1. NO code fence. The block is comment-delimited only. Captured output that
 *     itself contains ``` would otherwise break a fence.
 *  2. LENGTH-ADDRESSED extraction. The inlined content is exactly `bytes=N`
 *     after the begin delimiter's newline; the `ana:capture-end` line is a
 *     POST-CHECK at the expected byte offset, never the boundary search. The
 *     captured output can (and in our own dogfood WILL) contain the literal
 *     end-delimiter string — a delimiter scan would truncate it.
 *
 * This module is pure: no chalk, no commander, no process.exit. All byte-offset
 * work is done on Buffers so length-addressing is exact for multi-byte UTF-8.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
  /** Byte length of the capture file. */
  bytes: number;
  /** Lowercase hex sha256 of the capture file bytes. */
  sha256: string;
  /** Capture file path, relative to the slug directory. */
  file: string;
  /** `Np/Nf/Ns` when counts were derived, or `abstain` when abstaining. */
  counts: string;
  verdict: CaptureVerdict;
}

/** Result of expanding markers into verbatim blocks. */
export interface InlineResult {
  text: string;
  errors: string[];
}

/** Result of the warn-vs-block save-time gate. */
export interface CaptureGateResult {
  blocked: boolean;
  warnings: string[];
  errors: string[];
}

const MARKER_REGEX = /<!--\s*ana:capture\s+[^\n>]*?-->/;
const MARKER_REGEX_G = /<!--\s*ana:capture\s+[^\n>]*?-->/g;
const BEGIN_PREFIX = '<!-- ana:capture-begin';
const END_LINE = '<!-- ana:capture-end -->';
const END_SEQ = `\n${END_LINE}`;
const NL = 0x0a;

const BEGIN_PREFIX_BYTES = Buffer.from(BEGIN_PREFIX, 'utf8');
const END_SEQ_BYTES = Buffer.from(END_SEQ, 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// Marker formatting + parsing
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

/**
 * Render a capture marker as a single-line HTML comment.
 *
 * @param marker - Marker fields to serialize
 * @returns The `<!-- ana:capture … -->` line
 */
export function formatMarker(marker: CaptureMarker): string {
  const parts = [
    `stage=${marker.stage}`,
    `slug=${marker.slug}`,
    `bytes=${marker.bytes}`,
    `sha256=${marker.sha256}`,
    `file=${marker.file}`,
    `counts=${marker.counts}`,
    `verdict=${marker.verdict}`,
  ];
  return `<!-- ana:capture ${parts.join(' ')} -->`;
}

/**
 * Parse the key/value fields of a single marker line into a typed marker.
 *
 * @param markerText - The matched `<!-- ana:capture … -->` text
 * @returns A typed marker, or null when required fields are missing/malformed
 */
function parseMarkerText(markerText: string): CaptureMarker | null {
  const inner = markerText.replace(/^<!--\s*ana:capture\s+/, '').replace(/\s*-->$/, '');
  const fields: Record<string, string> = {};
  for (const pair of inner.trim().split(/\s+/)) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    fields[pair.slice(0, eq)] = pair.slice(eq + 1);
  }

  const stage = fields['stage'];
  const slug = fields['slug'];
  const sha256 = fields['sha256'];
  const file = fields['file'];
  const verdict = fields['verdict'];

  if (stage !== 'build' && stage !== 'verify') return null;
  if (!slug || !sha256 || !file) return null;
  if (verdict !== 'pass' && verdict !== 'fail' && verdict !== 'abstain') return null;

  const bytes = Number(fields['bytes']);
  if (!Number.isInteger(bytes) || bytes < 0) return null;

  return {
    stage,
    slug,
    bytes,
    sha256,
    file,
    counts: fields['counts'] ?? 'abstain',
    verdict,
  };
}

/**
 * Parse all capture markers from a report's text. The `ana:capture-begin` and
 * `ana:capture-end` delimiters are NOT matched (the regex requires whitespace
 * after `capture`, which the hyphenated delimiters lack).
 *
 * @param reportText - Full build/verify report text
 * @returns Parsed markers in document order (malformed markers skipped)
 */
export function parseMarkers(reportText: string): CaptureMarker[] {
  const markers: CaptureMarker[] = [];
  for (const line of reportText.split('\n')) {
    const match = MARKER_REGEX.exec(line);
    if (!match) continue;
    const marker = parseMarkerText(match[0]);
    if (marker) markers.push(marker);
  }
  return markers;
}

// ─────────────────────────────────────────────────────────────────────────────
// Byte-offset helpers (length-addressed, never delimiter-scanned)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Test whether `buf` contains `needle` starting exactly at `offset`.
 *
 * @param buf - Haystack buffer
 * @param offset - Byte offset to test at
 * @param needle - Expected bytes
 * @returns True when `needle` sits at `offset`
 */
function bufHasAt(buf: Buffer, offset: number, needle: Buffer): boolean {
  if (offset < 0 || offset + needle.length > buf.length) return false;
  return buf.compare(needle, 0, needle.length, offset, offset + needle.length) === 0;
}

/** A located inlined block, addressed by the marker's declared byte length. */
interface LocatedBlock {
  /** The N content bytes (sliced by length, not by delimiter scan). */
  content: Buffer;
  /** Whether `END_SEQ` sits exactly at content end (the post-check). */
  endDelimiterOk: boolean;
  /** The `bytes=` value declared on the begin delimiter line, or null. */
  declaredBytes: number | null;
  /** Byte offset one past the block's end delimiter. */
  spanEnd: number;
}

/**
 * Locate the inlined block immediately following a marker, extracting exactly
 * `expectedBytes` content bytes by LENGTH. The end delimiter is verified as a
 * post-check at the resulting offset — it is never searched for.
 *
 * @param buf - The full report buffer
 * @param afterMarker - Byte offset just past the marker text (`-->`)
 * @param expectedBytes - The marker's declared content byte length
 * @returns The located block, or null when no begin delimiter follows
 */
function locateBlock(buf: Buffer, afterMarker: number, expectedBytes: number): LocatedBlock | null {
  // The marker line is followed by exactly one '\n', then the begin delimiter.
  if (buf[afterMarker] !== NL) return null;
  const beginStart = afterMarker + 1;
  if (!bufHasAt(buf, beginStart, BEGIN_PREFIX_BYTES)) return null;

  const beginLineEnd = buf.indexOf(NL, beginStart);
  if (beginLineEnd === -1) return null;
  const beginLine = buf.toString('utf8', beginStart, beginLineEnd);
  const dm = beginLine.match(/bytes=(\d+)/);
  const declaredBytes = dm && dm[1] ? parseInt(dm[1], 10) : null;

  const contentStart = beginLineEnd + 1;
  const contentEnd = contentStart + expectedBytes;
  if (contentEnd > buf.length) {
    return { content: buf.subarray(contentStart), endDelimiterOk: false, declaredBytes, spanEnd: buf.length };
  }
  const content = buf.subarray(contentStart, contentEnd);
  const endDelimiterOk = bufHasAt(buf, contentEnd, END_SEQ_BYTES);
  const spanEnd = endDelimiterOk ? contentEnd + END_SEQ_BYTES.length : contentEnd;
  return { content, endDelimiterOk, declaredBytes, spanEnd };
}

/**
 * Render a fresh verbatim block for a marker. The marker line is assumed to be
 * already emitted; the block opens with the `\n` that separates them.
 *
 * @param marker - The marker the block expands
 * @param raw - The verbatim captured bytes
 * @returns The block bytes: `\n<begin>\n` + raw + `\n<end>`
 */
function renderBlock(marker: CaptureMarker, raw: Buffer): Buffer {
  const begin = Buffer.from(`\n${BEGIN_PREFIX} bytes=${marker.bytes} sha256=${marker.sha256} -->\n`, 'utf8');
  return Buffer.concat([begin, raw, END_SEQ_BYTES]);
}

/**
 * Iterate every capture marker in `content`, yielding the parsed marker and the
 * byte offset just past its text (where a block would begin).
 *
 * @param content - Report text
 * @param cb - Callback per marker
 */
function eachMarker(content: string, cb: (marker: CaptureMarker | null, markerByteEnd: number) => void): void {
  const buf = Buffer.from(content, 'utf8');
  let m: RegExpExecArray | null;
  const re = new RegExp(MARKER_REGEX_G.source, 'g');
  while ((m = re.exec(content)) !== null) {
    const markerByteStart = Buffer.byteLength(content.slice(0, m.index), 'utf8');
    const markerByteEnd = markerByteStart + Buffer.byteLength(m[0], 'utf8');
    const marker = parseMarkerText(m[0]);
    cb(marker, markerByteEnd);
    // Skip any existing block so a marker line INSIDE captured content is never
    // mistaken for a real marker. Located by the marker's own declared length.
    if (marker) {
      const loc = locateBlock(buf, markerByteEnd, marker.bytes);
      if (loc) {
        const skipToStr = buf.toString('utf8', 0, loc.spanEnd).length;
        if (skipToStr > re.lastIndex) re.lastIndex = skipToStr;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inliner — expand bare markers; idempotent; length-addressed
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expand every capture marker in a report into a verbatim comment-delimited
 * block, located and replaced by byte LENGTH.
 *
 * For each marker: if the capture file is present and matches the marker
 * (sha256 + byte length), a fresh block is emitted (replacing any prior block —
 * idempotent re-inline). If the capture file is gone but a block already exists
 * (re-save / fresh checkout / `.log` cleaned up), the existing block is kept
 * verbatim — the inliner is a no-op and validation runs against the committed
 * block. A bare marker with no `.log` and no block records an error (the
 * warn-mode gate turns it into a warning in Phase 1).
 *
 * @param reportText - The report text to inline into
 * @param slugDir - Absolute path to the slug directory (resolves `file`)
 * @returns The inlined text and any per-marker errors
 */
export function inlineCaptures(reportText: string, slugDir: string): InlineResult {
  const errors: string[] = [];
  const buf = Buffer.from(reportText, 'utf8');
  const out: Buffer[] = [];
  let cursor = 0;

  let m: RegExpExecArray | null;
  const re = new RegExp(MARKER_REGEX_G.source, 'g');
  while ((m = re.exec(reportText)) !== null) {
    const markerByteStart = Buffer.byteLength(reportText.slice(0, m.index), 'utf8');
    const markerByteEnd = markerByteStart + Buffer.byteLength(m[0], 'utf8');

    // Copy through up to and including the marker text.
    out.push(buf.subarray(cursor, markerByteEnd));
    cursor = markerByteEnd;

    const marker = parseMarkerText(m[0]);
    const existing = marker ? locateBlock(buf, markerByteEnd, marker.bytes) : null;

    // Always advance the scanner past an existing block so marker-looking lines
    // inside captured content are never re-matched (the dogfood hazard).
    if (existing) {
      const skipToStr = buf.toString('utf8', 0, existing.spanEnd).length;
      if (skipToStr > re.lastIndex) re.lastIndex = skipToStr;
    }

    if (!marker) {
      errors.push('Malformed capture marker — cannot inline.');
      continue; // leave any following text untouched (copied through)
    }

    // Prefer (re-)expanding from the capture file when it matches the marker.
    let raw: Buffer | null = null;
    try {
      raw = fs.readFileSync(path.join(slugDir, marker.file));
    } catch {
      raw = null;
    }

    if (raw) {
      const sha = createHash('sha256').update(raw).digest('hex');
      if (sha === marker.sha256 && raw.byteLength === marker.bytes) {
        if (existing) cursor = existing.spanEnd; // drop the prior block, replace
        out.push(renderBlock(marker, raw));
        continue;
      }
      errors.push(`Capture file mismatch for ${marker.file} — left as-is.`);
      continue; // keep existing block (if any) for the validators to judge
    }

    if (!existing) {
      errors.push(`Capture file not found: ${marker.file}`);
    }
    // No fresh expansion and a block already present → no-op (committed block is
    // the source of truth). cursor unchanged: the block is copied through.
  }

  out.push(buf.subarray(cursor));
  return { text: Buffer.concat(out).toString('utf8'), errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Seal validators — pure (filePath) => string | null
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seal validator: a build report must carry at least one captured build run.
 *
 * Uses the block-skipping `eachMarker` scan (not a per-line `parseMarkers`
 * scan) so a `build` marker line that appears INSIDE another capture's inlined
 * block cannot satisfy the present-check. This matters once the gate enforces:
 * the present-check is load-bearing and must agree with the integrity
 * validators on what counts as a real top-level marker.
 *
 * @param filePath - Path to the (already-inlined) build report
 * @returns An error string when no build capture is present, null otherwise
 */
export function validateCapturePresent(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  let hasBuild = false;
  eachMarker(content, (marker) => {
    if (marker && marker.stage === 'build') hasBuild = true;
  });
  if (!hasBuild) {
    return 'No captured test run found. Run `ana test --stage build --slug <slug>` and paste the marker into the build report.';
  }
  return null;
}

/**
 * Seal validator: each marker's inlined block must be byte-for-byte identical to
 * the captured output (sha256 equal). Content is extracted by LENGTH.
 *
 * @param filePath - Path to the (already-inlined) build report
 * @returns An error string on the first tampered/absent block, null otherwise
 */
export function validateCaptureInlined(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const buf = Buffer.from(content, 'utf8');
  let result: string | null = null;

  eachMarker(content, (marker, markerByteEnd) => {
    if (result) return;
    if (!marker) {
      result = 'Malformed capture marker in build report.';
      return;
    }
    const loc = locateBlock(buf, markerByteEnd, marker.bytes);
    if (!loc) {
      result = `Capture marker has no inlined block (sha256=${marker.sha256}).`;
      return;
    }
    const actualSha = createHash('sha256').update(loc.content).digest('hex');
    if (actualSha !== marker.sha256) {
      result = `Inlined capture block was altered — sha256 mismatch (expected ${marker.sha256}).`;
    }
  });

  return result;
}

/**
 * Seal validator: each marker's inlined block byte length must equal the
 * marker's recorded byte length, and the end delimiter must sit exactly at that
 * offset (catches truncation).
 *
 * @param filePath - Path to the (already-inlined) build report
 * @returns An error string on the first truncated/absent block, null otherwise
 */
export function validateCaptureNotTruncated(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const buf = Buffer.from(content, 'utf8');
  let result: string | null = null;

  eachMarker(content, (marker, markerByteEnd) => {
    if (result) return;
    if (!marker) {
      result = 'Malformed capture marker in build report.';
      return;
    }
    const loc = locateBlock(buf, markerByteEnd, marker.bytes);
    if (!loc) {
      result = `Capture marker has no inlined block (sha256=${marker.sha256}).`;
      return;
    }
    if (loc.declaredBytes !== null && loc.declaredBytes !== marker.bytes) {
      result = `Inlined capture block byte-length mismatch — begin delimiter declares ${loc.declaredBytes}, marker ${marker.bytes}.`;
      return;
    }
    if (!loc.endDelimiterOk) {
      result = `Inlined capture block was truncated — end delimiter is not at the expected ${marker.bytes}-byte offset.`;
    }
  });

  return result;
}

/**
 * Run the three seal validators and decide warn-vs-block.
 *
 * In Phase 1 callers always pass `armed: false`, so `blocked` is always false —
 * failures surface as warnings and never `process.exit`. Phase 2 passes
 * `armed: true` for a project that has sealed real evidence, flipping a
 * preservation failure to `blocked: true`.
 *
 * @param filePath - Path to the (already-inlined) build report
 * @param opts - Gate options
 * @param opts.armed - Whether the project has armed enforcement (false in Phase 1)
 * @returns The gate decision with messages partitioned into warnings/errors
 */
export function evaluateCaptureGate(filePath: string, opts: { armed: boolean }): CaptureGateResult {
  const messages: string[] = [];
  for (const validate of [validateCapturePresent, validateCaptureInlined, validateCaptureNotTruncated]) {
    const msg = validate(filePath);
    if (msg) messages.push(msg);
  }
  if (opts.armed && messages.length > 0) {
    return { blocked: true, warnings: [], errors: messages };
  }
  return { blocked: false, warnings: messages, errors: [] };
}
