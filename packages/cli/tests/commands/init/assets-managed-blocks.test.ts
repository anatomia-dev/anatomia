/**
 * `mergeManagedBlock(existing, managed, markerKey)` — the marker-delimited
 * merge primitive shared by the Codex per-agent `## Skills` projection block.
 * Boundary + injection discipline: it touches only the marker-delimited region
 * for its key and preserves every other byte; `managed:null` prunes the block.
 * (Modeled on the hooks-merge boundary + `## Detected` injection — not a rename
 * of mergeHooksSettings.)
 */

import { describe, it, expect } from 'vitest';
import { mergeManagedBlock } from '../../../src/commands/init/assets.js';

const BEGIN = (key: string): string => `<!-- >>> Anatomia managed: ${key} (do not edit this block) >>> -->`;
const END = (key: string): string => `<!-- <<< Anatomia managed: ${key} <<< -->`;

describe('mergeManagedBlock — net-new merge primitive', () => {
  it('wraps the body in markers on a fresh (null) file', () => {
    const out = mergeManagedBlock(null, 'hello body', 'command:ship');
    expect(out).toBe(`${BEGIN('command:ship')}\nhello body\n${END('command:ship')}\n`);
  });

  it('treats empty-string existing as a fresh write', () => {
    const out = mergeManagedBlock('', 'b', 'command:ship');
    expect(out).toBe(`${BEGIN('command:ship')}\nb\n${END('command:ship')}\n`);
  });

  it('replaces only its own region in place, preserving surrounding user content', () => {
    const existing = `# User intro\n\n${BEGIN('command:ship')}\nold body\n${END('command:ship')}\n\n# User outro\n`;
    const out = mergeManagedBlock(existing, 'new body', 'command:ship');
    expect(out).toBe(`# User intro\n\n${BEGIN('command:ship')}\nnew body\n${END('command:ship')}\n\n# User outro\n`);
    // The user's prose is preserved verbatim.
    expect(out).toContain('# User intro');
    expect(out).toContain('# User outro');
    // The old managed body is gone.
    expect(out).not.toContain('old body');
  });

  it('appends a block to a file that has user content but no managed region', () => {
    const out = mergeManagedBlock('# Hand authored\n', 'managed body', 'command:ship');
    expect(out).toBe(`# Hand authored\n\n${BEGIN('command:ship')}\nmanaged body\n${END('command:ship')}\n`);
  });

  it('prunes its block out, returning surrounding user content', () => {
    const existing = `# Keep me\n\n${BEGIN('command:ship')}\nbody\n${END('command:ship')}\n`;
    const out = mergeManagedBlock(existing, null, 'command:ship');
    expect(out).toBe('# Keep me\n');
  });

  it('returns null when pruning a managed-only file (nothing left to keep)', () => {
    const existing = `${BEGIN('command:ship')}\nbody\n${END('command:ship')}\n`;
    const out = mergeManagedBlock(existing, null, 'command:ship');
    expect(out).toBeNull();
  });

  it('prune of an absent block is a no-op (returns existing unchanged)', () => {
    const existing = '# Just user content\n';
    expect(mergeManagedBlock(existing, null, 'command:ship')).toBe(existing);
  });

  it('keys are independent — a second key appends rather than overwriting the first', () => {
    const first = mergeManagedBlock(null, 'A body', 'command:a');
    const both = mergeManagedBlock(first, 'B body', 'command:b');
    expect(both).toContain(BEGIN('command:a'));
    expect(both).toContain('A body');
    expect(both).toContain(BEGIN('command:b'));
    expect(both).toContain('B body');
  });

  it('does not throw on a mangled begin-without-end file (degrades to append)', () => {
    const mangled = `${BEGIN('command:ship')}\nuser broke the end marker\n`;
    const out = mergeManagedBlock(mangled, 'fresh body', 'command:ship');
    expect(out).not.toBeNull();
    expect(out).toContain('fresh body');
  });
});

