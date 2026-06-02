/**
 * Unit tests for Node.js framework detectors
 *
 * Tests Next.js, React, Nest.js, Express, and other Node frameworks.
 * Detectors now receive (deps, hints) — no filesystem mocking needed.
 * Includes CRITICAL disambiguation tests to verify detection priority.
 */

import { describe, it, expect } from 'vitest';
import { detectNextjs } from '../../../src/engine/detectors/node/nextjs';
import { detectReact } from '../../../src/engine/detectors/node/react';
import { detectNestjs } from '../../../src/engine/detectors/node/nestjs';
import { detectExpress } from '../../../src/engine/detectors/node/express';
import { detectOtherNodeFrameworks } from '../../../src/engine/detectors/node/other';
import { detectRemix } from '../../../src/engine/detectors/node/remix';
import { detectVue } from '../../../src/engine/detectors/node/vue';
import type { FrameworkHintEntry } from '../../../src/engine/types/census';

function hint(framework: string, path: string, sourceRootPath = '.'): FrameworkHintEntry {
  return { framework, sourceRootPath, path };
}

describe('Next.js detector', () => {
  it('returns null when next not in dependencies', () => {
    const result = detectNextjs(['react', 'express'], []);
    expect(result.framework).toBe(null);
    expect(result.confidence).toBe(0.0);
  });

  it('detects nextjs with dependency only (baseline 0.85 confidence)', () => {
    const result = detectNextjs(['next'], []);
    expect(result.framework).toBe('nextjs');
    expect(result.confidence).toBe(0.85);
    expect(result.indicators).toEqual(['next in dependencies']);
  });

  it('detects nextjs with next.config.js (0.95 confidence)', () => {
    const result = detectNextjs(['next'], [hint('nextjs', 'next.config.js')]);
    expect(result.framework).toBe('nextjs');
    expect(result.confidence).toBeCloseTo(0.95, 2);
    expect(result.indicators).toContain('next.config.* found');
  });

  it('detects nextjs with next.config.ts (0.95 confidence)', () => {
    const result = detectNextjs(['next'], [hint('nextjs', 'next.config.ts')]);
    expect(result.confidence).toBeCloseTo(0.95, 2);
  });

  it('detects nextjs with app directory - App Router (1.0 confidence)', () => {
    const result = detectNextjs(['next'], [
      hint('nextjs', 'next.config.js'),
      hint('nextjs-app-dir', 'app'),
    ]);
    expect(result.framework).toBe('nextjs');
    expect(result.confidence).toBe(1.0);
    expect(result.indicators).toContain('app/ directory (App Router)');
  });

  it('detects nextjs with pages directory - Pages Router (1.0 confidence)', () => {
    const result = detectNextjs(['next'], [
      hint('nextjs', 'next.config.js'),
      hint('nextjs', 'pages'),
    ]);
    expect(result.confidence).toBe(1.0);
    expect(result.indicators).toContain('pages/ directory (Pages Router)');
  });

  it('prefers app directory over pages when both present', () => {
    const result = detectNextjs(['next'], [
      hint('nextjs', 'next.config.js'),
      hint('nextjs-app-dir', 'app'),
      hint('nextjs', 'pages'),
    ]);
    expect(result.indicators).toContain('app/ directory (App Router)');
  });
});

describe('React detector', () => {
  it('returns null when react not in dependencies', () => {
    const result = detectReact(['express'], []);
    expect(result.framework).toBe(null);
  });

  it('returns null when next is present (Next.js takes priority)', () => {
    const result = detectReact(['react', 'next'], []);
    expect(result.framework).toBe(null);
  });

  it('detects react with dependency only (baseline 0.75 confidence)', () => {
    const result = detectReact(['react'], []);
    expect(result.framework).toBe('react');
    expect(result.confidence).toBe(0.75);
  });

  it('detects react with App.tsx (0.90 confidence)', () => {
    const result = detectReact(['react'], [hint('react', 'src/App.tsx')]);
    expect(result.confidence).toBe(0.90);
    expect(result.indicators).toContain('App.tsx/jsx found (React SPA)');
  });

  it('detects react with App.jsx (0.90 confidence)', () => {
    const result = detectReact(['react'], [hint('react', 'src/App.jsx')]);
    expect(result.confidence).toBe(0.90);
  });

  it('detects react with Vite (0.85 confidence)', () => {
    const result = detectReact(['react', 'vite'], []);
    expect(result.confidence).toBe(0.85);
    expect(result.indicators).toContain('Vite (React build tool)');
  });

  it('detects react with Create React App (0.90 confidence)', () => {
    const result = detectReact(['react', 'react-scripts'], []);
    expect(result.confidence).toBe(0.90);
    expect(result.indicators).toContain('Create React App');
  });

  it('detects react with App.tsx and Vite (0.90 confidence max)', () => {
    const result = detectReact(['react', 'vite'], [hint('react', 'src/App.tsx')]);
    expect(result.confidence).toBe(0.90);
  });
});

describe('Nest.js detector', () => {
  it('returns null when @nestjs/core not in dependencies', () => {
    const result = detectNestjs(['express'], []);
    expect(result.framework).toBe(null);
  });

  it('detects nestjs with dependency only (baseline 0.90 confidence)', () => {
    const result = detectNestjs(['@nestjs/core'], []);
    expect(result.framework).toBe('nestjs');
    expect(result.confidence).toBe(0.90);
  });

  it('detects nestjs with src/main.ts (0.95 confidence)', () => {
    const result = detectNestjs(['@nestjs/core'], [hint('nestjs', 'src/main.ts')]);
    expect(result.confidence).toBeCloseTo(0.95, 2);
    expect(result.indicators).toContain('src/main.ts found');
  });
});

describe('Express detector', () => {
  it('returns null when express not in dependencies', () => {
    const result = detectExpress(['react'], []);
    expect(result.framework).toBe(null);
  });

  it('returns null when @nestjs/core is also present', () => {
    const result = detectExpress(['express', '@nestjs/core'], []);
    expect(result.framework).toBe(null);
  });

  it('detects express with dependency only (baseline 0.80 confidence)', () => {
    const result = detectExpress(['express'], []);
    expect(result.framework).toBe('express');
    expect(result.confidence).toBe(0.80);
  });

  it('detects express with server.js (0.90 confidence)', () => {
    const result = detectExpress(['express'], [hint('express', 'server.js')]);
    expect(result.confidence).toBe(0.90);
    expect(result.indicators).toContain('server.js or app.js found');
  });

  it('detects express with src/server.js (0.90 confidence)', () => {
    const result = detectExpress(['express'], [hint('express', 'src/server.js')]);
    expect(result.confidence).toBe(0.90);
  });

  it('detects express with app.js (0.90 confidence)', () => {
    const result = detectExpress(['express'], [hint('express', 'app.js')]);
    expect(result.confidence).toBe(0.90);
  });
});

describe('Remix detector', () => {
  it('detects React Router v7 (@react-router/dev)', () => {
    const result = detectRemix(['@react-router/dev'], []);
    expect(result.framework).toBe('react-router');
    expect(result.confidence).toBe(0.90);
  });

  it('detects legacy Remix (@remix-run/react)', () => {
    const result = detectRemix(['@remix-run/react'], []);
    expect(result.framework).toBe('remix');
    expect(result.confidence).toBe(0.90);
  });

  it('does NOT detect bare react-router', () => {
    const result = detectRemix(['react-router'], []);
    expect(result.framework).toBe(null);
  });

  it('prefers React Router v7 over Remix when both present', () => {
    const result = detectRemix(['@react-router/dev', '@remix-run/react'], []);
    expect(result.framework).toBe('react-router');
  });
});

describe('Other Node frameworks', () => {
  it('detects Fastify', () => {
    const result = detectOtherNodeFrameworks(['fastify'], []);
    expect(result.framework).toBe('fastify');
    expect(result.confidence).toBe(0.85);
  });

  it('detects Koa', () => {
    const result = detectOtherNodeFrameworks(['koa'], []);
    expect(result.framework).toBe('koa');
    expect(result.confidence).toBe(0.85);
  });

  it('detects Hono', () => {
    const result = detectOtherNodeFrameworks(['hono'], []);
    expect(result.framework).toBe('hono');
    expect(result.confidence).toBe(0.85);
  });

  it('returns null for unknown dependencies', () => {
    const result = detectOtherNodeFrameworks(['custom-framework'], []);
    expect(result.framework).toBe(null);
  });
});

// @ana A001
describe('Vue detector', () => {
  it('returns null when vue not in dependencies', () => {
    const result = detectVue(['react', 'express'], []);
    expect(result.framework).toBe(null);
    expect(result.confidence).toBe(0.0);
  });

  // @ana A002
  it('returns null when nuxt is present (Nuxt takes priority)', () => {
    const result = detectVue(['vue', 'nuxt'], []);
    expect(result.framework).toBe(null);
  });

  it('detects vue with dependency only (baseline 0.75 confidence)', () => {
    const result = detectVue(['vue'], []);
    expect(result.framework).toBe('vue');
    expect(result.confidence).toBe(0.75);
    expect(result.indicators).toContain('vue in dependencies');
  });

  // @ana A003
  it('detects vue with vue.config hint (0.90 confidence)', () => {
    const result = detectVue(['vue'], [hint('vue', 'vue.config.ts')]);
    expect(result.framework).toBe('vue');
    expect(result.confidence).toBe(0.90);
    expect(result.indicators).toContain('vue.config.* found (Vue CLI)');
  });

  // @ana A024
  it('detects vue with vite in deps (0.85 confidence)', () => {
    const result = detectVue(['vue', 'vite'], []);
    expect(result.framework).toBe('vue');
    expect(result.confidence).toBe(0.85);
    expect(result.indicators).toContain('Vite (Vue build tool)');
  });

  it('detects vue with vue.config and vite (0.90 confidence max)', () => {
    const result = detectVue(['vue', 'vite'], [hint('vue', 'vue.config.ts')]);
    expect(result.confidence).toBe(0.90);
  });
});

describe('CRITICAL: Framework disambiguation', () => {
  it('Next.js wins over React (Next.js includes React)', () => {
    const deps = ['next', 'react'];
    const nextResult = detectNextjs(deps, [hint('nextjs', 'next.config.js')]);
    const reactResult = detectReact(deps, []);
    expect(nextResult.framework).toBe('nextjs');
    expect(reactResult.framework).toBe(null);
  });

  it('Nest.js wins over Express (Nest.js wraps Express)', () => {
    const deps = ['@nestjs/core', 'express'];
    const nestResult = detectNestjs(deps, [hint('nestjs', 'src/main.ts')]);
    const expressResult = detectExpress(deps, []);
    expect(nestResult.framework).toBe('nestjs');
    expect(expressResult.framework).toBe(null);
  });

  it('Remix wins over React (Remix bundles React)', () => {
    const deps = ['@remix-run/react', 'react'];
    const remixResult = detectRemix(deps, []);
    const reactResult = detectReact(deps, []);
    // React detector doesn't know about Remix — but registry ordering ensures
    // Remix is checked first. Here we just verify React still fires (for standalone).
    expect(remixResult.framework).toBe('remix');
    // React fires because no 'next' dep — but registry priority prevents misclassification
    expect(reactResult.framework).toBe('react');
  });

  // @ana A016
  it('Next.js detection is unchanged after adding Vue and vite support', () => {
    const deps = ['next', 'react'];
    const result = detectNextjs(deps, [hint('nextjs', 'next.config.ts')]);
    expect(result.framework).toBe('nextjs');
  });

  // @ana A017
  it('React detection still guards against Next.js', () => {
    const deps = ['next', 'react'];
    const result = detectReact(deps, []);
    expect(result.framework).toBe(null);
  });

  it('Vue wins over React when both present (registry ordering)', () => {
    const deps = ['vue', 'react'];
    const vueResult = detectVue(deps, []);
    expect(vueResult.framework).toBe('vue');
    // React also fires independently (no 'next' guard for vue)
    const reactResult = detectReact(deps, []);
    expect(reactResult.framework).toBe('react');
    // But Vue is checked first in registry, so Vue wins at runtime
  });

  it('Nuxt blocks Vue detection (Nuxt includes Vue)', () => {
    const deps = ['vue', 'nuxt'];
    const vueResult = detectVue(deps, []);
    expect(vueResult.framework).toBe(null);
  });
});
