/**
 * Unit tests for AnaJsonSchema — the runtime validator + defaulter for
 * .ana/ana.json.
 *
 * The schema's contract:
 *   1. Known fields with valid values → passed through.
 *   2. Known fields with invalid values → per-field .catch() fires;
 *      ONLY that field resets to its default. Other fields survive.
 *   3. Unknown fields → preserved via .passthrough() (user-added settings
 *      and legacy fields survive re-init).
 *   4. Missing fields → .default() supplies a sensible initial value so
 *      the re-init merge never has to backfill from newJson.
 */

import { describe, it, expect } from 'vitest';
import { AnaJsonSchema } from '../../../src/commands/init/anaJsonSchema.js';

describe('AnaJsonSchema', () => {
  describe('happy path', () => {
    it('parses a fully-valid ana.json unchanged', () => {
      const input = {
        anaVersion: '1.0.0',
        name: 'my-project',
        language: 'TypeScript',
        framework: 'Next.js',
        packageManager: 'pnpm',
        commands: { build: 'pnpm run build', test: 'pnpm test' },
        coAuthor: 'Ana <build@anatomia.dev>',
        artifactBranch: 'main',
        setupPhase: 'complete',
        lastScanAt: '2026-04-07T17:58:30.491Z',
      };
      const parsed = AnaJsonSchema.parse(input);
      expect(parsed.anaVersion).toBe('1.0.0');
      expect(parsed.name).toBe('my-project');
      expect(parsed.setupPhase).toBe('complete');
      expect(parsed.lastScanAt).toBe('2026-04-07T17:58:30.491Z');
    });

    it('accepts nullable fields as null', () => {
      const parsed = AnaJsonSchema.parse({
        anaVersion: '1.0.0',
        name: 'x',
        language: null,
        framework: null,
        packageManager: null,
        lastScanAt: null,
      });
      expect(parsed.language).toBeNull();
      expect(parsed.framework).toBeNull();
      expect(parsed.packageManager).toBeNull();
    });
  });

  describe('passthrough preserves unknown fields', () => {
    // @ana A001
    it('preserves unknown top-level keys through parse', () => {
      const input = {
        anaVersion: '0.1.0',
        name: 'anatomia',
        language: 'TypeScript',
        framework: null,
        packageManager: 'pnpm',
        commands: { build: 'pnpm run build' },
        coAuthor: 'Ana <build@anatomia.dev>',
        artifactBranch: 'main',
        setupPhase: 'complete',
        scanStaleDays: 7,
        lastScanAt: '2026-04-07T17:58:30.491Z',
      };
      const parsed = AnaJsonSchema.parse(input);
      expect('scanStaleDays' in parsed).toBe(true);
      expect((parsed as Record<string, unknown>)['scanStaleDays']).toBe(7);
      expect(parsed.name).toBe('anatomia');
      expect(parsed.coAuthor).toBe('Ana <build@anatomia.dev>');
      expect(parsed.artifactBranch).toBe('main');
      expect(parsed.setupPhase).toBe('complete');
    });

    it('catches invalid setupPhase "guided" and defaults to undefined', () => {
      const input = {
        anaVersion: '0.1.0',
        name: 'anatomia',
        language: 'TypeScript',
        packageManager: 'pnpm',
        coAuthor: 'Ana <build@anatomia.dev>',
        artifactBranch: 'main',
        setupPhase: 'guided',
        lastScanAt: '2026-04-07T17:58:30.491Z',
      };
      const parsed = AnaJsonSchema.parse(input);
      expect(parsed.setupPhase).toBeUndefined();
      expect(parsed.coAuthor).toBe('Ana <build@anatomia.dev>');
      expect(parsed.artifactBranch).toBe('main');
    });

    // @ana A002
    it('preserves setupMode and setupCompletedAt fossils', () => {
      const input = {
        name: 'anatomia',
        setupMode: 'complete',
        setupCompletedAt: '2026-04-06T01:04:09.194Z',
      };
      const parsed = AnaJsonSchema.parse(input);
      expect('setupMode' in parsed).toBe(true);
      expect('setupCompletedAt' in parsed).toBe(true);
      expect((parsed as Record<string, unknown>)['setupMode']).toBe('complete');
    });

    // @ana A003
    it('catches invalid setupPhase with passthrough active', () => {
      const parsed = AnaJsonSchema.parse({
        name: 'test',
        setupPhase: 'invalid-value',
        unknownKey: 'should-survive',
      });
      expect(parsed.setupPhase).toBeUndefined();
      expect((parsed as Record<string, unknown>)['unknownKey']).toBe('should-survive');
    });

    // @ana A005
    it('passthrough and catch coexistence', () => {
      const parsed = AnaJsonSchema.parse({
        name: 'test',
        setupPhase: 'bad-value',
        language: 42,
        unknownKey: 'preserved',
      });
      expect(parsed.setupPhase).toBeUndefined();
      expect(parsed.language).toBeNull();
      expect((parsed as Record<string, unknown>)['unknownKey']).toBe('preserved');
    });
  });

  describe('custom namespace', () => {
    // @ana A004
    it('round-trips custom data through parse and defaults to empty', () => {
      const withCustom = AnaJsonSchema.parse({
        name: 'test',
        custom: { myKey: 'myValue', nested: { a: 1 } },
      });
      expect(withCustom.custom).toEqual({ myKey: 'myValue', nested: { a: 1 } });

      const withoutCustom = AnaJsonSchema.parse({ name: 'test' });
      expect(withoutCustom.custom).toEqual({});
    });

    it('catches invalid custom and defaults to empty object', () => {
      const parsed = AnaJsonSchema.parse({ name: 'test', custom: 'not-an-object' });
      expect(parsed.custom).toEqual({});
    });
  });

  describe('missing fields get defaults', () => {
    it('defaults anaVersion when missing', () => {
      const parsed = AnaJsonSchema.parse({ name: 'x' });
      expect(parsed.anaVersion).toBe('0.0.0');
    });

    it('defaults name to "unknown" when missing', () => {
      const parsed = AnaJsonSchema.parse({});
      expect(parsed.name).toBe('unknown');
    });

    it('setupPhase is undefined when missing', () => {
      const parsed = AnaJsonSchema.parse({});
      expect(parsed.setupPhase).toBeUndefined();
    });

    it('defaults nullable fields to null when missing', () => {
      const parsed = AnaJsonSchema.parse({});
      expect(parsed.language).toBeNull();
      expect(parsed.framework).toBeNull();
      expect(parsed.packageManager).toBeNull();
      expect(parsed.lastScanAt).toBeNull();
    });
  });

  describe('per-field .catch() isolation', () => {
    it('resets only the broken field when multiple fields have valid values', () => {
      const parsed = AnaJsonSchema.parse({
        anaVersion: '1.0.0',
        name: 'my-project',
        language: 42, // wrong type, catches to null
        framework: 'Next.js',
        setupPhase: 'complete',
      });
      expect(parsed.language).toBeNull();
      expect(parsed.framework).toBe('Next.js');
      expect(parsed.anaVersion).toBe('1.0.0');
      expect(parsed.setupPhase).toBe('complete');
    });
  });

  describe('setupPhase enum values', () => {
    it('accepts context-complete', () => {
      const parsed = AnaJsonSchema.parse({ setupPhase: 'context-complete' });
      expect(parsed.setupPhase).toBe('context-complete');
    });

    it('accepts complete', () => {
      const parsed = AnaJsonSchema.parse({ setupPhase: 'complete' });
      expect(parsed.setupPhase).toBe('complete');
    });

    it('accepts not-started', () => {
      const parsed = AnaJsonSchema.parse({ setupPhase: 'not-started' });
      expect(parsed.setupPhase).toBe('not-started');
    });

    it('catches invalid value and defaults to undefined', () => {
      const parsed = AnaJsonSchema.parse({ setupPhase: 'invalid' });
      expect(parsed.setupPhase).toBeUndefined();
    });
  });
});
