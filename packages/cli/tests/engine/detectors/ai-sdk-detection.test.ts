/**
 * Tests for stack.aiSdk detection and computeSkillManifest integration
 */

import { describe, it, expect } from 'vitest';
import { detectAiSdk, detectNonNodeAiSdk, detectServiceDeps } from '../../../src/engine/detectors/dependencies.js';
import { computeSkillManifest } from '../../../src/constants.js';
import { createEmptyEngineResult } from '../../../src/engine/types/engineResult.js';

describe('AI SDK detection', () => {
  it('returns null when no AI SDK present', () => {
    const deps = { 'express': '4.0.0', 'typescript': '5.0.0' };
    expect(detectAiSdk(deps)).toBeNull();
  });

  it('detects @anthropic-ai/sdk as "Anthropic"', () => {
    const deps = { '@anthropic-ai/sdk': '0.20.0' };
    expect(detectAiSdk(deps)).toBe('Anthropic');
  });

  it('detects openai as "OpenAI"', () => {
    const deps = { 'openai': '4.0.0' };
    expect(detectAiSdk(deps)).toBe('OpenAI');
  });

  it('detects @ai-sdk/core as "Vercel AI"', () => {
    const deps = { '@ai-sdk/core': '1.0.0' };
    expect(detectAiSdk(deps)).toBe('Vercel AI');
  });

  it('detects ai (Vercel AI SDK) as "Vercel AI"', () => {
    const deps = { 'ai': '3.0.0' };
    expect(detectAiSdk(deps)).toBe('Vercel AI');
  });

  it('detects @google/generative-ai as "Google AI"', () => {
    const deps = { '@google/generative-ai': '0.5.0' };
    expect(detectAiSdk(deps)).toBe('Google AI');
  });

  it('detects langchain as "LangChain"', () => {
    const deps = { 'langchain': '0.1.0' };
    expect(detectAiSdk(deps)).toBe('LangChain');
  });

  it('detects @langchain/core as "LangChain"', () => {
    const deps = { '@langchain/core': '0.1.0' };
    expect(detectAiSdk(deps)).toBe('LangChain');
  });

  it('returns first/primary match when multiple AI SDKs present', () => {
    const deps = {
      'openai': '4.0.0',
      '@anthropic-ai/sdk': '0.20.0',
      'langchain': '0.1.0',
    };
    // LangChain is a meta-framework — wins over provider SDKs
    expect(detectAiSdk(deps)).toBe('LangChain');
  });

  it('meta-framework wins over provider SDK when both present', () => {
    const deps = {
      '@anthropic-ai/sdk': '0.20.0',
      'ai': '3.0.0',
    };
    // Vercel AI (meta-framework) takes priority over Anthropic (provider)
    expect(detectAiSdk(deps)).toBe('Vercel AI');
  });

  it('provider SDK wins when no meta-framework present', () => {
    const deps = {
      '@anthropic-ai/sdk': '0.20.0',
      'openai': '4.0.0',
    };
    // No meta-framework — first provider SDK wins
    expect(detectAiSdk(deps)).toBe('Anthropic');
  });

  it('Anatomia repo has no AI SDK → null', () => {
    // Anatomia doesn't use any AI SDK
    const deps = { 'typescript': '5.0.0', 'vitest': '2.0.0', 'chalk': '5.0.0' };
    expect(detectAiSdk(deps)).toBeNull();
  });
});

describe('detectNonNodeAiSdk', () => {
  // @ana A011
  it('detects openai as OpenAI', () => {
    expect(detectNonNodeAiSdk(['openai'])).toBe('OpenAI');
  });

  // @ana A012
  it('prioritizes langchain over openai', () => {
    expect(detectNonNodeAiSdk(['langchain', 'openai'])).toBe('LangChain');
  });

  // @ana A013
  it('detects crewai as CrewAI', () => {
    expect(detectNonNodeAiSdk(['crewai'])).toBe('CrewAI');
  });

  // @ana A014
  it('detects anthropic as Anthropic', () => {
    expect(detectNonNodeAiSdk(['anthropic'])).toBe('Anthropic');
  });

  it('detects autogen as AutoGen', () => {
    expect(detectNonNodeAiSdk(['autogen'])).toBe('AutoGen');
  });

  it('detects google-generativeai as Google AI', () => {
    expect(detectNonNodeAiSdk(['google-generativeai'])).toBe('Google AI');
  });

  it('detects cohere as Cohere', () => {
    expect(detectNonNodeAiSdk(['cohere'])).toBe('Cohere');
  });

  // @ana A015
  it('returns null for empty deps', () => {
    expect(detectNonNodeAiSdk([])).toBeNull();
  });

  // @ana A016
  it('returns null when no AI packages present', () => {
    expect(detectNonNodeAiSdk(['flask', 'pytest', 'requests'])).toBeNull();
  });

  it('priority: crewai beats anthropic and openai', () => {
    expect(detectNonNodeAiSdk(['openai', 'crewai', 'anthropic'])).toBe('CrewAI');
  });
});

describe('computeSkillManifest with aiSdk', () => {
  it('includes ai-patterns when stack.aiSdk is set', () => {
    const result = { ...createEmptyEngineResult(), stack: { ...createEmptyEngineResult().stack, aiSdk: 'Anthropic' } };
    const skills = computeSkillManifest(result);
    expect(skills).toContain('ai-patterns');
  });

  it('does NOT include ai-patterns when stack.aiSdk is null', () => {
    const result = createEmptyEngineResult();
    const skills = computeSkillManifest(result);
    expect(skills).not.toContain('ai-patterns');
  });

  it('includes data-access when stack.database is set', () => {
    const result = { ...createEmptyEngineResult(), stack: { ...createEmptyEngineResult().stack, database: 'Prisma' } };
    const skills = computeSkillManifest(result);
    expect(skills).toContain('data-access');
  });

  it('includes api-patterns when stack.framework is set', () => {
    const result = { ...createEmptyEngineResult(), stack: { ...createEmptyEngineResult().stack, framework: 'Next.js' } };
    const skills = computeSkillManifest(result);
    expect(skills).toContain('api-patterns');
  });

  // CLI frameworks have zero API surface — api-patterns is noise.
  // Four CLI framework values are passthrough (no display-name transform) so
  // they match `stack.framework` exactly.
  it.each(['typer', 'click', 'clap-cli', 'cobra-cli'])(
    'does NOT include api-patterns when stack.framework is CLI framework %s',
    (cliFramework) => {
      const result = { ...createEmptyEngineResult(), stack: { ...createEmptyEngineResult().stack, framework: cliFramework } };
      const skills = computeSkillManifest(result);
      expect(skills).not.toContain('api-patterns');
    },
  );

  it('includes api-patterns when stack.framework is FastAPI', () => {
    // FastAPI is a Python web framework — NOT in NON_API_FRAMEWORKS. Sibling
    // to the CLI framework exclusion above: proves the Set check is tight
    // (only the 4 CLI values are excluded, everything else still fires).
    const result = { ...createEmptyEngineResult(), stack: { ...createEmptyEngineResult().stack, framework: 'FastAPI' } };
    const skills = computeSkillManifest(result);
    expect(skills).toContain('api-patterns');
  });
});

describe('detectServiceDeps — AI provider entries', () => {
  // @ana A017
  it('detects @ai-sdk/groq as Vercel AI (Groq)', () => {
    const services = detectServiceDeps({ '@ai-sdk/groq': '1.0.0' });
    expect(services).toContainEqual({ name: 'Vercel AI (Groq)', category: 'ai' });
  });

  // @ana A018
  it('detects @ai-sdk/deepseek as Vercel AI (DeepSeek)', () => {
    const services = detectServiceDeps({ '@ai-sdk/deepseek': '1.0.0' });
    expect(services).toContainEqual({ name: 'Vercel AI (DeepSeek)', category: 'ai' });
  });

  // @ana A019
  it('detects @ai-sdk/xai as Vercel AI (xAI)', () => {
    const services = detectServiceDeps({ '@ai-sdk/xai': '1.0.0' });
    expect(services).toContainEqual({ name: 'Vercel AI (xAI)', category: 'ai' });
  });

  // @ana A025
  it('existing AI provider detection unchanged', () => {
    const services = detectServiceDeps({
      '@ai-sdk/anthropic': '1.0.0',
      '@ai-sdk/openai': '1.0.0',
    });
    const names = services.map(s => s.name);
    expect(names).toContain('Vercel AI (Anthropic)');
    expect(names).toContain('Vercel AI (OpenAI)');
  });
});

describe('detectServiceDeps — AI provider wildcard', () => {
  // @ana A020, A021
  it('wildcard catches unknown @ai-sdk provider with correct capitalization', () => {
    const services = detectServiceDeps({ '@ai-sdk/newprovider': '1.0.0' });
    expect(services).toContainEqual({ name: 'Vercel AI (Newprovider)', category: 'ai' });
  });

  // @ana A022
  it('wildcard excludes non-provider @ai-sdk packages', () => {
    const services = detectServiceDeps({
      '@ai-sdk/react': '1.0.0',
      '@ai-sdk/svelte': '1.0.0',
      '@ai-sdk/vue': '1.0.0',
    });
    const names = services.map(s => s.name);
    expect(names).not.toContain('Vercel AI (React)');
    expect(names).not.toContain('Vercel AI (Svelte)');
    expect(names).not.toContain('Vercel AI (Vue)');
  });

  // @ana A023
  it('wildcard excludes @ai-sdk/provider-utils', () => {
    const services = detectServiceDeps({ '@ai-sdk/provider-utils': '1.0.0' });
    const names = services.map(s => s.name);
    expect(names).not.toContain('Vercel AI (Provider-utils)');
    expect(names).not.toContain('Vercel AI (provider-utils)');
  });

  it('wildcard excludes @ai-sdk/core', () => {
    const services = detectServiceDeps({ '@ai-sdk/core': '1.0.0' });
    const names = services.map(s => s.name);
    // core is in the exclusion set, not treated as a provider
    expect(names).not.toContain('Vercel AI (Core)');
  });

  // @ana A024
  it('no duplicate entries for explicit providers', () => {
    const services = detectServiceDeps({
      '@ai-sdk/groq': '1.0.0',
      '@ai-sdk/anthropic': '1.0.0',
      '@ai-sdk/newprovider': '1.0.0',
    });
    const names = services.map(s => s.name);
    // Each name appears exactly once
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('wildcard capitalizes multi-word provider correctly', () => {
    const services = detectServiceDeps({ '@ai-sdk/someprovider': '1.0.0' });
    expect(services).toContainEqual({ name: 'Vercel AI (Someprovider)', category: 'ai' });
  });

  it('explicit entry overrides wildcard casing', () => {
    // @ai-sdk/xai has explicit entry with custom casing 'xAI'
    const services = detectServiceDeps({ '@ai-sdk/xai': '1.0.0' });
    expect(services).toContainEqual({ name: 'Vercel AI (xAI)', category: 'ai' });
    // Should NOT also produce a wildcard "Vercel AI (Xai)"
    const names = services.filter(s => s.name.includes('xAI') || s.name.includes('Xai'));
    expect(names).toHaveLength(1);
  });
});
