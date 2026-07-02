/**
 * Unit tests for the requirement frontmatter primitive — parse/serialize
 * round-trip fidelity, unknown-key preservation, byte-identical body, and enum
 * canonicalization.
 */

import { describe, it, expect } from 'vitest';
import {
  parseRequirement,
  serializeRequirement,
  canonicalizeEnumValue,
  PRIORITY_ORDER,
  PRIORITY_VALUES,
} from '../../src/utils/req-frontmatter.js';

const VALID = `---
req: REQ-foo
title: A thing
priority: high
status: open
created: 2026-06-28
source: hand-written
---

## Problem
The disease.

## Evidence
The proof.
`;

describe('parseRequirement', () => {
  it('splits frontmatter from body and reports hadFrontmatter true', () => {
    const { frontmatter, body, hadFrontmatter } = parseRequirement(VALID);
    expect(hadFrontmatter).toBe(true);
    expect(frontmatter['req']).toBe('REQ-foo');
    expect(frontmatter['priority']).toBe('high');
    expect(body.startsWith('\n## Problem')).toBe(true);
  });

  it('returns hadFrontmatter false for a file with no frontmatter without throwing', () => {
    const content = '## Problem\nNo frontmatter here.\n';
    const parsed = parseRequirement(content);
    expect(parsed.hadFrontmatter).toBe(false);
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe(content);
  });

  it('treats an unterminated frontmatter block as no frontmatter', () => {
    const content = '---\nreq: REQ-foo\nstatus: open\n\n## Problem\nText\n';
    const parsed = parseRequirement(content);
    expect(parsed.hadFrontmatter).toBe(false);
    expect(parsed.body).toBe(content);
  });

  it('preserves unknown frontmatter keys', () => {
    const content = `---\nreq: REQ-foo\nana_remote_id: x\n---\nbody\n`;
    const { frontmatter } = parseRequirement(content);
    expect(frontmatter['ana_remote_id']).toBe('x');
  });
});

describe('serializeRequirement', () => {
  it('round-trips an unknown key through parse → serialize', () => {
    const content = `---\nreq: REQ-foo\nana_remote_id: x\nstatus: open\n---\n\n## Problem\nText\n`;
    const { frontmatter, body } = parseRequirement(content);
    const out = serializeRequirement(frontmatter, body);
    const reparsed = parseRequirement(out);
    expect(reparsed.frontmatter['ana_remote_id']).toBe('x');
  });

  it('leaves the markdown body byte-identical after a status rewrite', () => {
    const { frontmatter, body } = parseRequirement(VALID);
    const updated = { ...frontmatter, status: 'claimed', claimed_by: 'some-slug' };
    const out = serializeRequirement(updated, body);
    const reparsed = parseRequirement(out);
    expect(reparsed.body).toBe(body);
    expect(reparsed.frontmatter['status']).toBe('claimed');
    expect(reparsed.frontmatter['claimed_by']).toBe('some-slug');
  });

  it('canonicalizes enum values to lowercase on serialize', () => {
    const frontmatter = { req: 'REQ-foo', priority: 'HIGH', status: 'Open', resolution: 'Completed' };
    const out = serializeRequirement(frontmatter, 'body');
    const { frontmatter: reparsed } = parseRequirement(out);
    expect(reparsed['priority']).toBe('high');
    expect(reparsed['status']).toBe('open');
    expect(reparsed['resolution']).toBe('completed');
  });

  it('preserves key insertion order', () => {
    const frontmatter = { req: 'REQ-foo', zeta: 1, alpha: 2, status: 'open' };
    const out = serializeRequirement(frontmatter, 'body');
    const fmBlock = out.split('\n---\n')[0] ?? '';
    const keyOrder = fmBlock
      .split('\n')
      .filter(l => /^[a-z]/i.test(l))
      .map(l => l.split(':')[0]);
    expect(keyOrder).toEqual(['req', 'zeta', 'alpha', 'status']);
  });
});

describe('canonicalizeEnumValue', () => {
  it('lowercases and trims a string', () => {
    expect(canonicalizeEnumValue('  High ')).toBe('high');
  });

  it('returns empty string for a non-string', () => {
    expect(canonicalizeEnumValue(undefined)).toBe('');
    expect(canonicalizeEnumValue(42)).toBe('');
  });
});

describe('PRIORITY_ORDER', () => {
  it('ranks critical highest and unset last', () => {
    expect(PRIORITY_ORDER[0]).toBe('critical');
    expect(PRIORITY_ORDER[PRIORITY_ORDER.length - 1]).toBe('unset');
  });

  it('covers exactly the allowed priority values', () => {
    expect([...PRIORITY_ORDER].sort()).toEqual([...PRIORITY_VALUES].sort());
  });
});
