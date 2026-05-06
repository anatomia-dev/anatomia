/**
 * Unit tests for the partial runtime validator.
 *
 * The schema guards the three invariants in scan.json that downstream
 * consumers (ana setup check, setup agent scaffolding, init re-read)
 * rely on: schemaVersion === '1.0', all 8 stack fields present (nullable),
 * and the commands sub-object with its six fields. Drift in any of these
 * is exactly what runtime validation is there to catch.
 *
 * These tests exercise the schema directly. The readScanJson() integration
 * in commands/check.ts is tested by scan(.) + corrupted-file smoke tests
 * that live alongside the existing setup check suite.
 */

import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  EngineResultPartialSchema,
  parseEngineResultPartial,
  type EngineResultPartial,
} from '../../../src/engine/types/engineResult-partial.js';

/**
 * Minimum valid shape — every field present with the right types.
 * Return type annotated as `EngineResultPartial` (the schema's inferred
 * type) rather than letting TypeScript narrow it to string-literal types;
 * tests need to mutate nullable fields to null and empty-record fields
 * to `{}` without fighting the inferred shape.
 */
const validShape = (): EngineResultPartial => ({
  schemaVersion: '1.0',
  stack: {
    language: 'TypeScript',
    framework: 'Next.js',
    database: 'Prisma',
    auth: null,
    testing: ['Vitest'],
    payments: null,
    workspace: 'pnpm monorepo',
    aiSdk: null,
    uiSystem: null,
  },
  commands: {
    build: 'next build',
    test: 'vitest run',
    lint: null,
    dev: 'next dev',
    packageManager: 'pnpm',
    all: {
      build: 'next build',
      dev: 'next dev',
      test: 'vitest run',
    },
  },
});

describe('EngineResultPartialSchema', () => {
  it('accepts a well-formed scan.json with all fields populated', () => {
    expect(() => parseEngineResultPartial(validShape())).not.toThrow();
  });

  it('accepts nullable stack fields as null', () => {
    const data = validShape();
    data.stack.language = null;
    data.stack.framework = null;
    // testing is string[], not string|null. Empty array is the
    // canonical "no framework detected" value.
    data.stack.testing = [];
    expect(() => parseEngineResultPartial(data)).not.toThrow();
  });

  it('accepts empty commands.all record', () => {
    const data = validShape();
    data.commands.all = {};
    expect(() => parseEngineResultPartial(data)).not.toThrow();
  });

  it('rejects missing schemaVersion', () => {
    const data = validShape() as Partial<ReturnType<typeof validShape>>;
    delete data.schemaVersion;
    expect(() => parseEngineResultPartial(data)).toThrow(ZodError);
  });

  it('rejects schemaVersion drift (forward version would be a breaking change)', () => {
    const data = validShape() as unknown as { schemaVersion: string };
    data.schemaVersion = '2.0';
    try {
      parseEngineResultPartial(data);
      throw new Error('expected ZodError');
    } catch (err) {
      expect(err).toBeInstanceOf(ZodError);
      const zod = err as ZodError;
      expect(zod.issues.some(i => i.path.includes('schemaVersion'))).toBe(true);
    }
  });

  it('rejects stack.language as a number (Zod catches type drift)', () => {
    const data = validShape() as unknown as { stack: { language: unknown } };
    data.stack.language = 42;
    try {
      parseEngineResultPartial(data);
      throw new Error('expected ZodError');
    } catch (err) {
      expect(err).toBeInstanceOf(ZodError);
      const zod = err as ZodError;
      expect(zod.issues.some(i => i.path.join('.') === 'stack.language')).toBe(true);
    }
  });

  it('rejects missing stack field (e.g. aiSdk)', () => {
    const data = validShape() as Partial<ReturnType<typeof validShape>>;
    // aiSdk is required; an old scan.json missing it should fail
    delete (data.stack as Partial<NonNullable<typeof data.stack>>).aiSdk;
    expect(() => parseEngineResultPartial(data)).toThrow(ZodError);
  });

  it('accepts commands.packageManager: null (non-Node projects have no package manager)', () => {
    // packageManager is nullable because Python/Go/Rust
    // projects legitimately have no package manager in the Node sense.
    // The pre-fix schema required a string, which forced scan-engine to
    // fall back to 'npm' for every non-Node project — a semantic lie.
    const data = validShape() as unknown as { commands: { packageManager: unknown } };
    data.commands.packageManager = null;
    expect(() => parseEngineResultPartial(data)).not.toThrow();
  });

  it('rejects commands.packageManager being a number (nullable string, not any)', () => {
    const data = validShape() as unknown as { commands: { packageManager: unknown } };
    data.commands.packageManager = 42;
    expect(() => parseEngineResultPartial(data)).toThrow(ZodError);
  });

  it('rejects commands.all containing a non-string value', () => {
    const data = validShape() as unknown as { commands: { all: Record<string, unknown> } };
    data.commands.all = { build: 42 };
    expect(() => parseEngineResultPartial(data)).toThrow(ZodError);
  });

  it('rejects entirely non-object input', () => {
    expect(() => parseEngineResultPartial('not an object')).toThrow(ZodError);
    expect(() => parseEngineResultPartial(null)).toThrow(ZodError);
    expect(() => parseEngineResultPartial(undefined)).toThrow(ZodError);
    expect(() => parseEngineResultPartial(42)).toThrow(ZodError);
  });

  it('ZodError includes a path to the first offending field', () => {
    const data = validShape() as unknown as { commands: { build: unknown } };
    data.commands.build = 99;  // should be string | null
    try {
      parseEngineResultPartial(data);
      throw new Error('expected ZodError');
    } catch (err) {
      expect(err).toBeInstanceOf(ZodError);
      const zod = err as ZodError;
      const firstIssue = zod.issues[0];
      expect(firstIssue).toBeDefined();
      expect(firstIssue!.path).toContain('commands');
      expect(firstIssue!.path).toContain('build');
    }
  });

  it('schema is exported as both EngineResultPartialSchema and parseEngineResultPartial', () => {
    // Two-way API: consumers who want a type-safe parse call the function;
    // consumers who want to compose with other schemas import the object.
    expect(EngineResultPartialSchema).toBeDefined();
    expect(typeof EngineResultPartialSchema.parse).toBe('function');
    expect(parseEngineResultPartial(validShape())).toBeDefined();
  });
});
