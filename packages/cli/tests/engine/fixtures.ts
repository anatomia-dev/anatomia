/**
 * Fixture loader utility for parser tests
 */

import { ParserManager } from '../../src/engine/parsers/treeSitter.js';

/**
 * Check if WASM tree-sitter parsers are available.
 * Call once at top of test file, use result to skip tests.
 */
let _wasmAvailable: boolean | null = null;

async function isWasmAvailable(): Promise<boolean> {
  if (_wasmAvailable !== null) return _wasmAvailable;
  const manager = ParserManager.getInstance();
  _wasmAvailable = await manager.tryInitialize();
  return _wasmAvailable;
}

/**
 * Use in describe/beforeAll to skip entire suites when WASM is unavailable.
 * Example: const wasm = await skipIfNoWasm(); // returns false if skipped
 */
export async function skipIfNoWasm(): Promise<boolean> {
  const available = await isWasmAvailable();
  return available;
}
