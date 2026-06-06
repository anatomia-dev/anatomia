import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  formatMarker,
  formatCounts,
  countLines,
  parseMarkers,
  validateCapturePresent,
  evaluateCaptureGate,
  type CaptureMarker,
} from '../../src/utils/capture-marker.js';

/**
 * Compact marker + strict-parser unit tests.
 *
 * The marker is now a CLOSED TOKEN: a one-line attestation (counts, verdict,
 * sha256, byte/line totals) with no inlined block. The closed-token guarantee is
 * the COMBINATION of a full-line anchor, a fenced-region skip, and a required
 * `lines` field — so a fenced example, a placeholder description, a backtick-
 * wrapped line, and an old-format (inlined) marker all fail to parse as a seal.
 */

const tmpDirs: string[] = [];

function mkSlugDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-mark-'));
  tmpDirs.push(dir);
  return dir;
}

/** Write a report file holding `body` and return its path. */
function writeReport(body: string): string {
  const dir = mkSlugDir();
  const p = path.join(dir, 'build_report.md');
  fs.writeFileSync(p, body);
  return p;
}

afterEach(() => {
  while (tmpDirs.length) {
    fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

const SHA = 'a'.repeat(64);

/** A well-formed compact marker with overridable fields. */
function marker(over: Partial<CaptureMarker> = {}): CaptureMarker {
  return {
    stage: 'build',
    slug: 'demo',
    counts: '47p/0f/2s',
    verdict: 'pass',
    sha256: SHA,
    bytes: 246012,
    lines: 3100,
    ...over,
  };
}

describe('marker formatting', () => {
  it('formats counts as Np/Nf/Ns or abstain', () => {
    expect(formatCounts({ passed: 47, failed: 0, skipped: 2 })).toBe('47p/0f/2s');
    expect(formatCounts(null)).toBe('abstain');
  });

  it('counts newline bytes for the lines field', () => {
    expect(countLines(Buffer.from('a\nb\nc\n', 'utf8'))).toBe(3);
    expect(countLines(Buffer.from('', 'utf8'))).toBe(0);
    expect(countLines(Buffer.from('no newline', 'utf8'))).toBe(0);
  });

  // @ana A001 — a captured run produces a ONE-LINE sealed result, not a dump.
  it('renders a single-line marker (no embedded newline)', () => {
    const line = formatMarker(marker());
    expect(line.split('\n')).toHaveLength(1);
    expect(line.includes('\n')).toBe(false);
    expect(line).toContain('ana:capture');
  });

  // @ana A002 — the seal carries counts, verdict, fingerprint, and output size.
  it('carries counts, verdict, sha256, bytes, and lines', () => {
    const line = formatMarker(marker());
    expect(line).toContain('counts=47p/0f/2s');
    expect(line).toContain('verdict=pass');
    expect(line).toContain(`sha256=${SHA}`);
    expect(line).toContain('bytes=246012');
    expect(line).toContain('lines=3100');
  });

  // @ana A003 — the seal no longer carries a throwaway log-file path.
  it('drops the file field', () => {
    expect(formatMarker(marker()).includes('file=')).toBe(false);
  });
});

describe('strict parser — closed token', () => {
  it('parses a well-formed compact marker', () => {
    const markers = parseMarkers(formatMarker(marker()));
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ stage: 'build', slug: 'demo', counts: '47p/0f/2s', verdict: 'pass', bytes: 246012, lines: 3100 });
  });

  // @ana A012 — a marker shown as a fenced example is not a real seal.
  it('does not parse a marker inside a fenced code block', () => {
    const report = `# Report\n\n\`\`\`markdown\n${formatMarker(marker())}\n\`\`\`\n\nprose\n`;
    expect(parseMarkers(report)).toHaveLength(0);
  });

  // @ana A013 — a placeholder description with a non-hex sha256 is not a seal.
  it('does not parse a placeholder description (non-hex sha256)', () => {
    const placeholder = '<!-- ana:capture stage=build slug=x counts=1p/0f/0s verdict=pass sha256=…<64hex>… bytes=10 lines=2 -->';
    expect(parseMarkers(placeholder)).toHaveLength(0);
  });

  it('does not parse a backtick-wrapped (non-full-line) marker', () => {
    const wrapped = `\`${formatMarker(marker())}\``;
    expect(parseMarkers(wrapped)).toHaveLength(0);
  });

  it('does not parse a marker with trailing prose on the line (full-line anchor)', () => {
    const trailing = `${formatMarker(marker())} and then some prose`;
    expect(parseMarkers(trailing)).toHaveLength(0);
  });

  // @ana A029 — a seal missing its fingerprint is rejected, never accepted.
  it('rejects a marker missing the required sha256 field', () => {
    const noSha = '<!-- ana:capture stage=build slug=x counts=1p/0f/0s verdict=pass bytes=10 lines=2 -->';
    expect(parseMarkers(noSha)).toHaveLength(0);
  });

  it('rejects a marker whose sha256 is not 64 lowercase hex', () => {
    const badHex = `<!-- ana:capture stage=build slug=x counts=1p/0f/0s verdict=pass sha256=${'A'.repeat(64)} bytes=10 lines=2 -->`;
    expect(parseMarkers(badHex)).toHaveLength(0);
    const shortHex = '<!-- ana:capture stage=build slug=x counts=1p/0f/0s verdict=pass sha256=abc123 bytes=10 lines=2 -->';
    expect(parseMarkers(shortHex)).toHaveLength(0);
  });

  it('ignores unknown keys for forward-compat', () => {
    const withUnknown = `<!-- ana:capture stage=build slug=x counts=1p/0f/0s verdict=pass sha256=${SHA} bytes=10 lines=2 futurekey=whatever -->`;
    expect(parseMarkers(withUnknown)).toHaveLength(1);
  });
});

describe('reserved enginebind field — round-trip (L3 plumbing only)', () => {
  // @ana A018 — a marker WITH enginebind round-trips and re-serializes identically.
  it('round-trips a marker carrying enginebind, re-serializing identically', () => {
    const line = formatMarker(marker({ enginebind: 'reserved' }));
    expect(line).toContain('enginebind=reserved');
    const markers = parseMarkers(line);
    expect(markers).toHaveLength(1);
    expect(markers[0]!.enginebind).toBe('reserved');
    expect(formatMarker(markers[0]!)).toBe(line);
  });

  // @ana A019 — a marker WITHOUT enginebind round-trips and gains no field.
  it('round-trips a marker without enginebind, gaining no field', () => {
    const line = formatMarker(marker());
    expect(line.includes('enginebind=')).toBe(false);
    const markers = parseMarkers(line);
    expect(markers).toHaveLength(1);
    expect(markers[0]!.enginebind).toBeUndefined();
    expect(formatMarker(markers[0]!)).toBe(line);
  });
});

describe('old-format tolerance', () => {
  const oldFormat = `<!-- ana:capture stage=build slug=x bytes=9 sha256=${SHA} file=.captures/z.log counts=abstain verdict=pass -->`;

  // @ana A023 — an old-format report does not crash the new reader.
  it('does not throw when parsing an old-format inlined marker', () => {
    let threw = false;
    try {
      parseMarkers(`# Old report\n\n${oldFormat}\n<!-- ana:capture-begin bytes=9 sha256=${SHA} -->\nraw\n<!-- ana:capture-end -->\n`);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  // @ana A024 — an old-format seal (no `lines`, has `file`) is not a valid new seal.
  it('does not accept an old-format marker as a well-formed seal', () => {
    expect(parseMarkers(oldFormat)).toHaveLength(0);
  });
});

describe('validateCapturePresent + evaluateCaptureGate (present-check only)', () => {
  it('validateCapturePresent flags a report with no marker', () => {
    const p = writeReport('# Build Report\n\nno marker here\n');
    expect(validateCapturePresent(p)).not.toBeNull();
  });

  it('validateCapturePresent passes a report with a compact build marker', () => {
    const p = writeReport(`# Build Report\n\n## Test Evidence\n\n${formatMarker(marker())}\n`);
    expect(validateCapturePresent(p)).toBeNull();
  });

  it('validateCapturePresent does not accept a verify-only marker as a build run', () => {
    const p = writeReport(`# Verify Report\n\n${formatMarker(marker({ stage: 'verify' }))}\n`);
    expect(validateCapturePresent(p)).not.toBeNull();
  });

  // @ana A005 — a present compact build marker passes the gate (not blocked).
  it('does not block when enabled and a compact build marker is present', () => {
    const p = writeReport(`# Build Report\n\n${formatMarker(marker())}\n`);
    const gate = evaluateCaptureGate(p, { enabled: true });
    expect(gate.blocked).toBe(false);
    expect(gate.errors).toEqual([]);
    expect(gate.warnings).toEqual([]);
  });

  // @ana A014 — a report that only describes the seal leaves the gate unsatisfied.
  it('blocks when enabled and only a fenced/placeholder description is present', () => {
    const body = `# Build Report\n\nExample seal format:\n\n\`\`\`\n${formatMarker(marker())}\n\`\`\`\n`;
    const p = writeReport(body);
    const gate = evaluateCaptureGate(p, { enabled: true });
    expect(gate.blocked).toBe(true);
    expect(gate.errors.length).toBeGreaterThan(0);
  });

  it('never blocks when the gate is disabled, even with no marker', () => {
    const p = writeReport('# Build Report\n\nno marker\n');
    const gate = evaluateCaptureGate(p, { enabled: false });
    expect(gate.blocked).toBe(false);
    expect(gate.warnings.length).toBeGreaterThan(0);
    expect(gate.errors).toEqual([]);
  });
});
