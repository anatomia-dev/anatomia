/**
 * Slice 2 — extractImports now populates `names[]` for TS/TSX by executing the
 * written-but-previously-unused `namedImport` query (queries.ts). These tests
 * pin that wiring: named imports surface their identifiers, default/namespace
 * imports contribute none, multi-statement files never cross-attribute names,
 * and non-TS languages keep the empty list their query implies.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ParserManager, extractImports } from '../../../src/engine/parsers/treeSitter.js';
import { skipIfNoWasm } from '../fixtures.js';

const wasmAvailable = await skipIfNoWasm();

describe.skipIf(!wasmAvailable)('extractImports — named-import wiring', () => {
  const manager = ParserManager.getInstance();

  beforeAll(async () => {
    await ParserManager.getInstance().initialize();
  });

  it('populates names[] for a TypeScript named import', () => {
    const parser = manager.getParser('typescript');
    const code = 'import { Controller, Get } from "@nestjs/common";';
    const tree = parser.parse(code);
    expect(tree).not.toBeNull();

    const imports = extractImports(tree!, code, 'typescript');
    tree!.delete();

    expect(imports).toHaveLength(1);
    expect(imports[0]?.module).toBe('@nestjs/common');
    expect(imports[0]?.names).toEqual(['Controller', 'Get']);
  });

  it('captures the imported identifier even with an alias', () => {
    const parser = manager.getParser('typescript');
    const code = 'import { foo as bar } from "./util";';
    const tree = parser.parse(code);
    const imports = extractImports(tree!, code, 'typescript');
    tree!.delete();

    expect(imports).toHaveLength(1);
    // The bare imported identifier is captured (not the local alias).
    expect(imports[0]?.names).toContain('foo');
  });

  it('default and namespace imports contribute no names', () => {
    const parser = manager.getParser('typescript');
    const code = [
      'import React from "react";',
      'import * as path from "node:path";',
    ].join('\n');
    const tree = parser.parse(code);
    const imports = extractImports(tree!, code, 'typescript');
    tree!.delete();

    // Both statements are still recorded as module imports, but with no names.
    const react = imports.find((i) => i.module === 'react');
    const nodePath = imports.find((i) => i.module === 'node:path');
    expect(react?.names).toEqual([]);
    expect(nodePath?.names).toEqual([]);
  });

  it('does not cross-attribute names across multiple statements', () => {
    const parser = manager.getParser('typescript');
    const code = [
      'import { A } from "./a";',
      'import { B, C } from "./b";',
    ].join('\n');
    const tree = parser.parse(code);
    const imports = extractImports(tree!, code, 'typescript');
    tree!.delete();

    const a = imports.find((i) => i.module === './a');
    const b = imports.find((i) => i.module === './b');
    expect(a?.names).toEqual(['A']);
    expect(b?.names).toEqual(['B', 'C']);
  });

  it('works for TSX as well', () => {
    const parser = manager.getParser('tsx');
    const code = 'import { useState } from "react";';
    const tree = parser.parse(code);
    const imports = extractImports(tree!, code, 'tsx');
    tree!.delete();

    expect(imports[0]?.names).toEqual(['useState']);
  });

  it('leaves names empty for languages without a namedImport query (Python)', () => {
    const parser = manager.getParser('python');
    const code = 'from fastapi import FastAPI, HTTPException';
    const tree = parser.parse(code);
    const imports = extractImports(tree!, code, 'python');
    tree!.delete();

    expect(imports).toHaveLength(1);
    expect(imports[0]?.module).toBe('fastapi');
    // Python's `imports` query has no name capture — names stay empty (no
    // regression to the prior behavior).
    expect(imports[0]?.names).toEqual([]);
  });
});
