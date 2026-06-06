import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { isArmed, armCapture } from '../../src/utils/capture-state.js';

/**
 * Arming-signal unit tests — the keystone of the Phase-2 fail-closed flip.
 *
 * The signal MUST be: undefined-safe (a fresh or malformed project reads as
 * not-armed → warn-mode, never a throw that would brick a fresh project),
 * sticky (survives across saves), idempotent (re-arming preserves armedAt), and
 * confined to `.ana/state/` (never ana.json, never the proof chain).
 */

const tmpDirs: string[] = [];

function mkProjectRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-state-'));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.ana'), { recursive: true });
  return dir;
}

function statePath(root: string): string {
  return path.join(root, '.ana', 'state', 'capture.json');
}

afterEach(() => {
  while (tmpDirs.length) {
    fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

describe('isArmed — undefined-safe', () => {
  // @ana A034
  it('returns false for a fresh project with no capture.json', () => {
    const root = mkProjectRoot();
    expect(isArmed(root)).toBe(false);
  });

  // @ana A034
  it('returns false on a malformed capture.json (never throws)', () => {
    const root = mkProjectRoot();
    fs.mkdirSync(path.dirname(statePath(root)), { recursive: true });
    fs.writeFileSync(statePath(root), '{ this is not valid json ', 'utf-8');
    expect(() => isArmed(root)).not.toThrow();
    expect(isArmed(root)).toBe(false);
  });

  it('returns false when the record exists but armed is not true', () => {
    const root = mkProjectRoot();
    fs.mkdirSync(path.dirname(statePath(root)), { recursive: true });
    fs.writeFileSync(statePath(root), JSON.stringify({ armed: false }), 'utf-8');
    expect(isArmed(root)).toBe(false);
  });
});

describe('armCapture — sticky, idempotent, state-only', () => {
  it('arms the project and records armed:true + an armedAt timestamp', () => {
    const root = mkProjectRoot();
    armCapture(root);
    expect(isArmed(root)).toBe(true);
    const record = JSON.parse(fs.readFileSync(statePath(root), 'utf-8'));
    expect(record.armed).toBe(true);
    expect(typeof record.armedAt).toBe('string');
    expect(record.armedAt.length).toBeGreaterThan(0);
  });

  it('is idempotent — a second arm preserves the original armedAt', () => {
    const root = mkProjectRoot();
    armCapture(root);
    const first = JSON.parse(fs.readFileSync(statePath(root), 'utf-8')).armedAt;
    armCapture(root);
    const second = JSON.parse(fs.readFileSync(statePath(root), 'utf-8')).armedAt;
    expect(second).toBe(first);
    expect(isArmed(root)).toBe(true);
  });

  it('writes ONLY to .ana/state/ — never ana.json, never the proof chain', () => {
    const root = mkProjectRoot();
    armCapture(root);
    // The flag lives at .ana/state/capture.json and nowhere else.
    expect(fs.existsSync(statePath(root))).toBe(true);
    // ana.json (user-owned, preserved across re-init) is untouched.
    expect(fs.existsSync(path.join(root, '.ana', 'ana.json'))).toBe(false);
    // No proof-chain / plans artifact was written by arming.
    expect(fs.existsSync(path.join(root, '.ana', 'plans'))).toBe(false);
  });
});
