import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import {
  formatMarker,
  formatCounts,
  parseMarkers,
  inlineCaptures,
  validateCapturePresent,
  validateCaptureInlined,
  validateCaptureNotTruncated,
  evaluateCaptureGate,
  type CaptureMarker,
} from '../../src/utils/capture-marker.js';

/**
 * Marker + length-addressed inliner unit tests.
 *
 * The two load-bearing decisions get their own rows: NO code fence (backticks
 * round-trip) and LENGTH-ADDRESSED extraction (the end-delimiter STRING inside
 * the captured output round-trips intact).
 */

const tmpDirs: string[] = [];

function mkSlugDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-mark-'));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.captures'), { recursive: true });
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

/** Write a capture file + return a marker bound to it. */
function seed(slugDir: string, raw: string, stage: 'build' | 'verify' = 'build'): CaptureMarker {
  const rel = `.captures/test-${stage}-1.log`;
  fs.writeFileSync(path.join(slugDir, rel), raw);
  const buf = Buffer.from(raw, 'utf8');
  return {
    stage,
    slug: 'demo',
    bytes: buf.byteLength,
    sha256: createHash('sha256').update(buf).digest('hex'),
    file: rel,
    counts: 'abstain',
    verdict: 'abstain',
  };
}

/** Inline a report holding the marker and write it to build_report.md. */
function inlineToFile(slugDir: string, marker: CaptureMarker): { reportPath: string; text: string; errors: string[] } {
  const report = `# Build Report\n\n## Test Results\n\n${formatMarker(marker)}\n\nrest of report\n`;
  const { text, errors } = inlineCaptures(report, slugDir);
  const reportPath = path.join(slugDir, 'build_report.md');
  fs.writeFileSync(reportPath, text);
  return { reportPath, text, errors };
}

describe('marker formatting', () => {
  it('formats counts as Np/Nf/Ns or abstain (no tokenizer field)', () => {
    expect(formatCounts({ passed: 47, failed: 0, skipped: 2 })).toBe('47p/0f/2s');
    expect(formatCounts(null)).toBe('abstain');
    const line = formatMarker({ stage: 'build', slug: 's', bytes: 10, sha256: 'a', file: 'f', counts: 'abstain', verdict: 'pass' });
    expect(line).toContain('ana:capture');
    expect(line).not.toContain('tokenizer');
  });

  it('parses a marker round-trip and skips begin/end delimiters', () => {
    const text = `${formatMarker({ stage: 'build', slug: 's', bytes: 3, sha256: 'abc', file: 'f.log', counts: '1p/0f/0s', verdict: 'pass' })}\n<!-- ana:capture-begin bytes=3 sha256=abc -->\n<!-- ana:capture-end -->`;
    const markers = parseMarkers(text);
    expect(markers).toHaveLength(1);
    expect(markers[0]!.bytes).toBe(3);
    expect(markers[0]!.verdict).toBe('pass');
  });
});

describe('inliner — length-addressed round-trip', () => {
  // @ana A009
  it('round-trips: inlined block sha256 equals the marker sha256', () => {
    const slugDir = mkSlugDir();
    const raw = ' RUN  v1.6.0\n ✓ foo.test.ts (12)\n Tests  47 passed (49)\n';
    const marker = seed(slugDir, raw);
    const { reportPath, text } = inlineToFile(slugDir, marker);

    expect(validateCaptureInlined(reportPath)).toBeNull();
    expect(validateCaptureNotTruncated(reportPath)).toBeNull();
    // The raw bytes appear verbatim, with NO code fence wrapping them.
    expect(text).toContain(raw);
    expect(text).not.toContain('```');
  });

  // @ana A010
  it('round-trips captured output containing backticks/code fences (no fence used)', () => {
    const slugDir = mkSlugDir();
    const raw = 'output with ```ts\ncode fence\n``` and `inline backticks` inside\n';
    const marker = seed(slugDir, raw);
    const { reportPath, text } = inlineToFile(slugDir, marker);
    const rawBytes = Buffer.byteLength(raw, 'utf8');

    expect(validateCaptureInlined(reportPath)).toBeNull();
    expect(text).toContain(raw);
    // extracted byte length equals raw byte length
    const persisted = fs.readFileSync(reportPath, 'utf8');
    expect(persisted).toContain(raw);
    expect(Buffer.byteLength(raw, 'utf8')).toBe(rawBytes);
  });

  // @ana A011
  it('round-trips captured output that contains the literal end-delimiter string', () => {
    const slugDir = mkSlugDir();
    // The dogfood hazard: captured output prints the end delimiter itself.
    const raw = `line one\n${'<!-- ana:capture-end -->'}\nline three\nTests 1 passed\n`;
    const marker = seed(slugDir, raw);
    const { reportPath } = inlineToFile(slugDir, marker);

    // Length-addressed extraction is NOT fooled by the delimiter inside content.
    expect(validateCaptureInlined(reportPath)).toBeNull();
    expect(validateCaptureNotTruncated(reportPath)).toBeNull();
  });

  it('round-trips captured output that contains a full nested marker line', () => {
    const slugDir = mkSlugDir();
    const raw = `running tests\n<!-- ana:capture stage=build slug=x bytes=9 sha256=deadbeef file=f.log counts=abstain verdict=pass -->\ndone\n`;
    const marker = seed(slugDir, raw);
    const { reportPath } = inlineToFile(slugDir, marker);
    // Only the REAL marker is expanded; the nested one inside content is inert.
    expect(parseMarkers(fs.readFileSync(reportPath, 'utf8')).filter((mk) => mk.slug === 'demo')).toHaveLength(1);
    expect(validateCaptureInlined(reportPath)).toBeNull();
    expect(validateCaptureNotTruncated(reportPath)).toBeNull();
  });

  it('is idempotent — re-inlining a saved report changes nothing', () => {
    const slugDir = mkSlugDir();
    const raw = 'Tests  3 passed (3)\n';
    const marker = seed(slugDir, raw);
    const { reportPath, text } = inlineToFile(slugDir, marker);
    const second = inlineCaptures(text, slugDir);
    expect(second.text).toBe(text);
    fs.writeFileSync(reportPath, second.text);
    expect(validateCaptureInlined(reportPath)).toBeNull();
  });

  it('is a no-op (keeps the committed block) when the .log is gone', () => {
    const slugDir = mkSlugDir();
    const raw = 'Tests  3 passed (3)\n';
    const marker = seed(slugDir, raw);
    const { text } = inlineToFile(slugDir, marker);
    // Simulate a fresh checkout: remove the capture file, re-inline.
    fs.rmSync(path.join(slugDir, marker.file));
    const reinlined = inlineCaptures(text, slugDir);
    expect(reinlined.text).toBe(text); // committed block preserved verbatim
    const reportPath = path.join(slugDir, 'r.md');
    fs.writeFileSync(reportPath, reinlined.text);
    expect(validateCaptureInlined(reportPath)).toBeNull();
  });
});

describe('validators', () => {
  // @ana A021
  it('preserves error text verbatim in the inlined block', () => {
    const slugDir = mkSlugDir();
    const raw = 'FAIL src/a.test.ts\n  AssertionError: expected 1 to be 2\n Tests  1 failed (1)\n';
    const marker = seed(slugDir, raw);
    const { reportPath } = inlineToFile(slugDir, marker);
    const persisted = fs.readFileSync(reportPath, 'utf8');
    // extracted.containsErrorToken === true
    expect(persisted).toContain('AssertionError');
    expect(validateCaptureInlined(reportPath)).toBeNull();
  });

  // @ana A012
  it('validateCapturePresent flags a report with no capture marker', () => {
    const slugDir = mkSlugDir();
    const reportPath = path.join(slugDir, 'build_report.md');
    fs.writeFileSync(reportPath, '# Build Report\n\nno marker here\n');
    expect(validateCapturePresent(reportPath)).not.toBeNull();
  });

  // @ana A013
  it('validateCaptureInlined catches a tampered inlined byte', () => {
    const slugDir = mkSlugDir();
    const raw = 'Tests  10 passed (10)\n';
    const marker = seed(slugDir, raw);
    const { reportPath, text } = inlineToFile(slugDir, marker);
    // Flip a byte inside the block (same length → sha must still catch it).
    const tampered = text.replace('10 passed', '99 passed');
    expect(tampered).not.toBe(text);
    fs.writeFileSync(reportPath, tampered);
    expect(validateCaptureInlined(reportPath)).not.toBeNull();
  });

  // @ana A014
  it('validateCaptureNotTruncated catches a shortened block', () => {
    const slugDir = mkSlugDir();
    const raw = 'line one\nline two\nline three\nTests 1 passed\n';
    const marker = seed(slugDir, raw);
    const { reportPath, text } = inlineToFile(slugDir, marker);
    // Delete a line from inside the block — end delimiter shifts off its offset.
    const truncated = text.replace('line two\n', '');
    expect(truncated).not.toBe(text);
    fs.writeFileSync(reportPath, truncated);
    expect(validateCaptureNotTruncated(reportPath)).not.toBeNull();
  });
});

describe('evaluateCaptureGate — warn-mode (Phase 1)', () => {
  // @ana A015
  it('never blocks when not armed, even with a failing validator', () => {
    const slugDir = mkSlugDir();
    const reportPath = path.join(slugDir, 'build_report.md');
    fs.writeFileSync(reportPath, '# Build Report\n\nno capture marker at all\n');
    const gate = evaluateCaptureGate(reportPath, { armed: false });
    expect(gate.blocked).toBe(false);
    expect(gate.warnings.length).toBeGreaterThan(0);
    expect(gate.errors).toEqual([]);
  });

  it('passes cleanly on a valid sealed report', () => {
    const slugDir = mkSlugDir();
    const marker = seed(slugDir, 'Tests  5 passed (5)\n');
    const { reportPath } = inlineToFile(slugDir, marker);
    const gate = evaluateCaptureGate(reportPath, { armed: false });
    expect(gate.blocked).toBe(false);
    expect(gate.warnings).toEqual([]);
  });
});

describe('validateCapturePresent — block-skipping scan (load-bearing once armed)', () => {
  // @ana A012 — a build marker embedded INSIDE another capture's inlined block
  // must NOT satisfy the present-check; only a real top-level marker counts.
  it('does not accept a build marker that lives inside captured content', () => {
    const slugDir = mkSlugDir();
    // A verify capture whose raw output happens to contain a build marker line.
    const embeddedBuildMarker =
      '<!-- ana:capture stage=build slug=x bytes=5 sha256=abc123 file=.captures/z.log counts=abstain verdict=pass -->';
    const raw = `running the verify suite...\n${embeddedBuildMarker}\nTests  3 passed (3)\n`;
    const marker = seed(slugDir, raw, 'verify');
    const { reportPath, errors } = inlineToFile(slugDir, marker);
    expect(errors).toEqual([]);
    // Only a top-level VERIFY marker exists — the embedded build line is inside
    // the skipped block, so the present-check (which requires a build run) fails.
    expect(validateCapturePresent(reportPath)).not.toBeNull();
  });

  it('accepts a genuine top-level build marker', () => {
    const slugDir = mkSlugDir();
    const marker = seed(slugDir, 'Tests  4 passed (4)\n'); // stage=build by default
    const { reportPath } = inlineToFile(slugDir, marker);
    expect(validateCapturePresent(reportPath)).toBeNull();
  });
});

describe('evaluateCaptureGate — fail-closed flip (Phase 2)', () => {
  // @ana A030
  it('blocks when armed and a preservation validator fails', () => {
    const slugDir = mkSlugDir();
    const reportPath = path.join(slugDir, 'build_report.md');
    fs.writeFileSync(reportPath, '# Build Report\n\nno capture marker at all\n');
    const gate = evaluateCaptureGate(reportPath, { armed: true });
    expect(gate.blocked).toBe(true);
    expect(gate.errors.length).toBeGreaterThan(0);
    expect(gate.warnings).toEqual([]);
  });

  // @ana A033 — fail-OPEN on counts holds after the flip: the gate only weighs
  // preservation, so a sealed report whose counts abstain is never blocked.
  it('does not block when armed if preservation holds but counts abstain', () => {
    const slugDir = mkSlugDir();
    // seed() defaults counts/verdict to abstain; the block is still valid.
    const marker = seed(slugDir, 'bespoke harness ran; no parseable counts here\n');
    const { reportPath } = inlineToFile(slugDir, marker);
    const gate = evaluateCaptureGate(reportPath, { armed: true });
    expect(gate.blocked).toBe(false);
    expect(gate.errors).toEqual([]);
    expect(gate.warnings).toEqual([]);
  });

  // @ana A030 — a tampered (preservation-failing) sealed report blocks once armed.
  it('blocks an armed save whose inlined block was altered', () => {
    const slugDir = mkSlugDir();
    const marker = seed(slugDir, 'Tests  7 passed (7)\n');
    const { reportPath, text } = inlineToFile(slugDir, marker);
    fs.writeFileSync(reportPath, text.replace('7 passed', '9 passed'));
    const gate = evaluateCaptureGate(reportPath, { armed: true });
    expect(gate.blocked).toBe(true);
  });
});
