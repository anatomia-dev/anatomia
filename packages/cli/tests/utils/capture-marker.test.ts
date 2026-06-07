import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  formatMarker,
  formatCounts,
  canonicalCaptureString,
  captureSha,
  parseMarkers,
  validateCapturePresent,
  evaluateCaptureGate,
  type CaptureMarker,
} from '../../src/utils/capture-marker.js';

/**
 * Compact marker + strict-parser unit tests.
 *
 * The marker is a CLOSED TOKEN: a one-line attestation (stage, slug, counts,
 * verdict, sha256) with no inlined block and no raw-output size fields. The
 * sha256 is computed over a canonical, deterministic summary of the RESULT, so
 * the same outcome always mints a byte-identical marker. The closed-token
 * guarantee is the COMBINATION of a full-line anchor, a fenced-region skip, and
 * a well-formed 64-hex `sha256` — so a fenced example, a placeholder
 * description, and a backtick-wrapped line all fail to parse as a seal.
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
    ...over,
  };
}

describe('canonical capture string + deterministic seal', () => {
  const input = { stage: 'build', slug: 'demo', counts: '47p/0f/2s', verdict: 'pass' } as const;

  // @ana A001 — the canonical string has the exact, fixed byte layout the seal pins.
  it('canonicalCaptureString returns the exact fixed byte layout', () => {
    expect(canonicalCaptureString(input)).toBe('stage=build\nslug=demo\ncounts=47p/0f/2s\nverdict=pass');
  });

  // @ana A002 — two seals of the same outcome produce a byte-identical marker.
  it('two captures of the same outcome produce a byte-identical marker', () => {
    const seal = (): string => formatMarker({ ...input, sha256: captureSha(input) });
    expect(seal()).toBe(seal());
  });

  // @ana A003 — the marker's sha256 recomputes from its own visible fields.
  it("the marker's sha256 recomputes from its visible fields", () => {
    const line = formatMarker({ ...input, sha256: captureSha(input) });
    const parsed = parseMarkers(line)[0]!;
    expect(parsed.sha256).toBe(
      captureSha({ stage: parsed.stage, slug: parsed.slug, counts: parsed.counts, verdict: parsed.verdict }),
    );
  });

  // @ana A004 — a different result (verdict or counts) yields a different fingerprint.
  it('captureSha discriminates: a changed verdict or counts changes the hash', () => {
    expect(captureSha({ ...input, verdict: 'fail' })).not.toBe(captureSha(input));
    expect(captureSha({ ...input, counts: 'abstain' })).not.toBe(captureSha(input));
  });
});

describe('marker formatting', () => {
  it('formats counts as Np/Nf/Ns or abstain', () => {
    expect(formatCounts({ passed: 47, failed: 0, skipped: 2 })).toBe('47p/0f/2s');
    expect(formatCounts(null)).toBe('abstain');
  });

  it('renders a single-line marker (no embedded newline)', () => {
    const line = formatMarker(marker());
    expect(line.split('\n')).toHaveLength(1);
    expect(line.includes('\n')).toBe(false);
    expect(line).toContain('ana:capture');
  });

  // @ana A005, A006 — the seal no longer reports raw-output byte or line totals.
  it('drops the bytes and lines fields', () => {
    const line = formatMarker(marker());
    expect(line).not.toContain('bytes=');
    expect(line).not.toContain('lines=');
  });

  // @ana A007 — the seal still carries the load-bearing fields.
  it('carries stage, slug, counts, verdict, and sha256', () => {
    const line = formatMarker(marker());
    expect(line).toContain('stage=build');
    expect(line).toContain('slug=demo');
    expect(line).toContain('counts=47p/0f/2s');
    expect(line).toContain('verdict=pass');
    expect(line).toContain(`sha256=${SHA}`);
  });

  it('drops the file field', () => {
    expect(formatMarker(marker()).includes('file=')).toBe(false);
  });
});

describe('strict parser — closed token', () => {
  // @ana A008 — a correctly-formed new five-field seal is recognized as a real seal.
  it('parses a well-formed compact marker', () => {
    const markers = parseMarkers(formatMarker(marker()));
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ stage: 'build', slug: 'demo', counts: '47p/0f/2s', verdict: 'pass' });
  });

  it('does not parse a marker inside a fenced code block', () => {
    const report = `# Report\n\n\`\`\`markdown\n${formatMarker(marker())}\n\`\`\`\n\nprose\n`;
    expect(parseMarkers(report)).toHaveLength(0);
  });

  // @ana A009 — a placeholder description with a non-hex sha256 is not a seal.
  it('does not parse a placeholder description (non-hex sha256)', () => {
    const placeholder = '<!-- ana:capture stage=build slug=x counts=1p/0f/0s verdict=pass sha256=…<64hex>… -->';
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

  // @ana A010 — a seal missing its fingerprint is rejected, never accepted.
  it('rejects a marker missing the required sha256 field', () => {
    const noSha = '<!-- ana:capture stage=build slug=x counts=1p/0f/0s verdict=pass -->';
    expect(parseMarkers(noSha)).toHaveLength(0);
  });

  // @ana A009 — a malformed fingerprint is rejected, not trusted.
  it('rejects a marker whose sha256 is not 64 lowercase hex', () => {
    const badHex = `<!-- ana:capture stage=build slug=x counts=1p/0f/0s verdict=pass sha256=${'A'.repeat(64)} -->`;
    expect(parseMarkers(badHex)).toHaveLength(0);
    const shortHex = '<!-- ana:capture stage=build slug=x counts=1p/0f/0s verdict=pass sha256=abc123 -->';
    expect(parseMarkers(shortHex)).toHaveLength(0);
  });

  it('ignores unknown keys for forward-compat', () => {
    const withUnknown = `<!-- ana:capture stage=build slug=x counts=1p/0f/0s verdict=pass sha256=${SHA} futurekey=whatever -->`;
    expect(parseMarkers(withUnknown)).toHaveLength(1);
  });
});

describe('reserved enginebind field — round-trip (L3 plumbing only)', () => {
  it('round-trips a marker carrying enginebind, re-serializing identically', () => {
    const line = formatMarker(marker({ enginebind: 'reserved' }));
    expect(line).toContain('enginebind=reserved');
    const markers = parseMarkers(line);
    expect(markers).toHaveLength(1);
    expect(markers[0]!.enginebind).toBe('reserved');
    expect(formatMarker(markers[0]!)).toBe(line);
  });

  it('round-trips a marker without enginebind, gaining no field', () => {
    const line = formatMarker(marker());
    expect(line.includes('enginebind=')).toBe(false);
    const markers = parseMarkers(line);
    expect(markers).toHaveLength(1);
    expect(markers[0]!.enginebind).toBeUndefined();
    expect(formatMarker(markers[0]!)).toBe(line);
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

  // @ana A023 — a present new-shape build marker passes the gate (not blocked).
  it('does not block when enabled and a compact build marker is present', () => {
    const p = writeReport(`# Build Report\n\n${formatMarker(marker())}\n`);
    const gate = evaluateCaptureGate(p, { enabled: true });
    expect(gate.blocked).toBe(false);
    expect(gate.errors).toEqual([]);
    expect(gate.warnings).toEqual([]);
  });

  // @ana A024 — a report with no seal is blocked from saving when the gate is enabled.
  it('blocks when enabled and no marker is present', () => {
    const p = writeReport('# Build Report\n\nno marker here\n');
    const gate = evaluateCaptureGate(p, { enabled: true });
    expect(gate.blocked).toBe(true);
    expect(gate.errors.length).toBeGreaterThan(0);
  });

  // @ana A025 — a seal shown only as a fenced example does not satisfy the gate.
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
