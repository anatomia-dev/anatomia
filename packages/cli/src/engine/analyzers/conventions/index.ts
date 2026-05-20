/**
 * Convention detection orchestrator
 *
 * Combines all 5 convention analyzers into single detectConventions() function.
 */

import { join, basename } from 'node:path';
import type { DeepTierInput } from '../../types/index.js';
import type { ConventionAnalysis } from '../../types/conventions.js';
import { createEmptyConventionAnalysis } from '../../types/conventions.js';
import { readFile } from '../../utils/file.js';
import {
  analyzeNamingConvention,
  analyzeFunctionNaming,
  analyzeClassNaming,
  analyzeVariableNaming,
  analyzeConstantNaming,
} from './naming.js';
import { analyzeImportConvention, detectProjectRoot, parseTsconfigAlias } from './imports.js';
import { analyzeIndentation } from './indentation.js';
import { analyzeCodePatterns } from './codePatterns.js';

/**
 * Detect conventions from project code
 *
 * Orchestrates 3 convention analyzers:
 * 1. Naming (files, variables, functions, classes, constants)
 * 2. Imports (absolute vs relative)
 * 3. Indentation (spaces/tabs with width)
 *
 * typeHints + docstrings were removed — they read fields that don't
 * exist on FunctionInfo and always returned defaults. Phantom detection
 * deleted rather than shipped as zeros.
 *
 * Samples 50 files (broader than patterns' 20) for statistical validity.
 *
 * @param rootPath - Project root directory
 * @param analysis - AnalysisResult with parsed files (needs parsed.files)
 * @returns Convention analysis or empty if detection fails
 *
 * @example
 * ```typescript
 * const input: DeepTierInput = { projectType, framework, structure, parsed };
 * const conventions = await detectConventions(projectRoot, input);
 *
 * console.log(conventions.naming?.files.majority);  // 'snake_case'
 * console.log(conventions.imports?.style);          // 'absolute'
 * console.log(conventions.indentation?.width);      // 4
 * ```
 */
export async function detectConventions(
  rootPath: string,
  analysis: DeepTierInput,
  options?: {
    preSampledFiles?: string[];
    tsconfigEntries?: import('../../types/census.js').TsconfigEntry[];
  },
): Promise<ConventionAnalysis> {
  const startTime = Date.now();

  try {
    // Require parsed data from the parsing phase
    if (!analysis.parsed) {
      throw new Error('Parsed data required for convention detection');
    }

    const { files: parsedFiles } = analysis.parsed;
    const { projectType } = analysis;

    // Use pre-sampled file list from proportional sampler
    const sampledFilePaths = options?.preSampledFiles ?? [];

    // File naming uses sampledFilePaths (50 files) — only needs basenames, no AST
    const fileNamingNames = sampledFilePaths.map(p => basename(p).replace(/\.[^.]+$/, ''));
    const fileNaming = analyzeNamingConvention(fileNamingNames, projectType);
    // Function/class naming uses parsedFiles (tree-sitter AST needed)
    const functionNaming = analyzeFunctionNaming(parsedFiles, projectType);
    const classNaming = analyzeClassNaming(parsedFiles, projectType);

    // Variable and constant naming (async - uses tree-sitter queries)
    const variableNaming = await analyzeVariableNaming(parsedFiles, projectType, rootPath);
    const constantNaming = await analyzeConstantNaming(parsedFiles, projectType, rootPath);

    const naming = {
      files: fileNaming,
      functions: functionNaming,
      classes: classNaming,
      variables: variableNaming,
      constants: constantNaming,
    };

    // Detect project root and tsconfig aliases for import classification
    const projectRoot = await detectProjectRoot(rootPath, projectType);
    const tsconfigAliases = projectType === 'node' ? await parseTsconfigAlias(rootPath, options?.tsconfigEntries) : [];
    const aliasPatterns = tsconfigAliases.length > 0 ? tsconfigAliases : undefined;

    // Analyze import conventions (uses parsed imports)
    const imports = analyzeImportConvention(
      parsedFiles.flatMap(f => f.imports),
      projectType,
      projectRoot,
      aliasPatterns
    );

    // Analyze indentation (only first 10 files for efficiency)
    const indentSamplePaths = sampledFilePaths.slice(0, 10);
    const indentContents = await Promise.all(
      indentSamplePaths.map(path => readFile(join(rootPath, path)))
    );
    const indentation = await analyzeIndentation(indentContents, rootPath);

    // Code pattern signals — read sampled file contents for grep-based detection
    const patternSamplePaths = sampledFilePaths.slice(0, 30);
    const patternContents = await Promise.all(
      patternSamplePaths.map(async (p) => {
        const content = await readFile(join(rootPath, p));
        return { path: p, content };
      })
    );
    const codePatterns = analyzeCodePatterns(patternContents);

    // Combine into ConventionAnalysis
    const detectionTime = Date.now() - startTime;

    return {
      naming,
      imports,
      indentation,
      codePatterns,
      sampledFiles: sampledFilePaths.length,
      detectionTime,
    };
  } catch (_error) {
    // Graceful degradation - return empty conventions
    console.error('Convention detection failed:', _error);
    return createEmptyConventionAnalysis();
  }
}
