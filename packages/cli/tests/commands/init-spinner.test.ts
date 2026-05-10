/**
 * Tests for runAnalyzer spinner behavior.
 *
 * Separated from init.test.ts because mocking ora requires vi.mock at module level,
 * which would affect all tests in the file. These tests mock ora and scan-engine
 * to verify spinner.warn vs spinner.succeed is called with the correct message.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEmptyEngineResult } from '../../src/engine/types/engineResult.js';

// Hoist mock instances so vi.mock factories can reference them
const mockSpinner = vi.hoisted(() => {
  const spinner = {
    start: vi.fn(),
    succeed: vi.fn(),
    warn: vi.fn(),
    fail: vi.fn(),
  };
  spinner.start.mockReturnValue(spinner);
  return spinner;
});

const mockScanProject = vi.hoisted(() => vi.fn());

vi.mock('ora', () => ({
  default: vi.fn(() => mockSpinner),
}));

vi.mock('../../src/engine/scan-engine.js', () => ({
  scanProject: mockScanProject,
}));

import { runAnalyzer } from '../../src/commands/init/state.js';

describe('runAnalyzer spinner messages', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // @ana A001, A002
  it('calls spinner.warn with "Deep scan incomplete" when Analyzer blind spot exists', async () => {
    const result = createEmptyEngineResult();
    result.blindSpots = [
      { area: 'Analyzer', issue: 'Tree-sitter analysis unavailable: WASM load failed', resolution: 'Install tree-sitter' },
    ];
    mockScanProject.mockResolvedValue(result);

    await runAnalyzer('/fake/path');

    expect(mockSpinner.warn).toHaveBeenCalledWith('Deep scan incomplete');
    expect(mockSpinner.succeed).not.toHaveBeenCalled();
  });

  // @ana A003
  it('calls spinner.succeed with "Deep scan complete" when no blind spots', async () => {
    const result = createEmptyEngineResult();
    result.blindSpots = [];
    mockScanProject.mockResolvedValue(result);

    await runAnalyzer('/fake/path');

    expect(mockSpinner.succeed).toHaveBeenCalledWith('Deep scan complete — no gaps detected');
    expect(mockSpinner.warn).not.toHaveBeenCalled();
  });

  it('calls spinner.succeed with "Analysis complete" for non-Analyzer blind spots', async () => {
    const result = createEmptyEngineResult();
    result.blindSpots = [
      { area: 'Database', issue: 'No schema found', resolution: 'Create schema.prisma' },
    ];
    mockScanProject.mockResolvedValue(result);

    await runAnalyzer('/fake/path');

    expect(mockSpinner.succeed).toHaveBeenCalledWith('Analysis complete');
    expect(mockSpinner.warn).not.toHaveBeenCalled();
  });

  // @ana A021
  it('calls spinner.warn with "Analyzer failed" when scanProject throws', async () => {
    mockScanProject.mockRejectedValue(new Error('WASM load failed'));

    const result = await runAnalyzer('/fake/path');

    expect(result).toBeNull();
    expect(mockSpinner.warn).toHaveBeenCalledWith('Analyzer failed — continuing with empty scaffolds');
  });
});
