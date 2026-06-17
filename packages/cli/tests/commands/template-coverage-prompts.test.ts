import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Enforcement tests for the Phase 2 prompt edits (AC8, AC9, AC10, activation).
 *
 * Template content is the product being shipped to customers, so asserting on
 * it is legitimate per testing-standards. Both platform bodies (`.claude` and
 * `.codex`) must carry the same instructions, so every check runs over both.
 */

const TEMPLATES = path.resolve(__dirname, '..', '..', 'templates');

const PLAN_TEMPLATES = ['.claude/agents/ana-plan.md', '.codex/agents/ana-plan.md'];
const VERIFY_TEMPLATES = ['.claude/agents/ana-verify.md', '.codex/agents/ana-verify.md'];

const read = (rel: string): string => fs.readFileSync(path.join(TEMPLATES, rel), 'utf-8');

describe('Phase 2 template activation + prompt fixes', () => {
  // @ana A032
  describe('ana-plan templates emit a gate-activating 1.1 contract (AC8 / activation)', () => {
    for (const rel of PLAN_TEMPLATES) {
      it(`${rel} emits version "1.1" and teaches ac:/coverage_waivers`, () => {
        const body = read(rel);
        expect(body).toContain('version: "1.1"');
        expect(body).not.toContain('version: "1.0"');
        expect(body).toContain('coverage_waivers');
        expect(body).toContain('ac:');
        // Points planners at the pre-seal preview.
        expect(body).toContain('ana plan coverage');
      });
    }
  });

  // @ana A033
  describe('ana-verify templates state the scoped two-gate (AC8)', () => {
    for (const rel of VERIFY_TEMPLATES) {
      it(`${rel} reframes contract vs intent as a two-gate`, () => {
        const body = read(rel);
        expect(body).toContain('two-gate');
        // Intent gate is named, not just the contract.
        expect(body).toContain('intent');
        // The blanket "contract is authoritative" sentence is gone.
        expect(body).not.toContain('This is the authoritative specification.');
      });
    }
  });

  // @ana A034
  describe('ana-verify templates retain the prediction step (AC9)', () => {
    for (const rel of VERIFY_TEMPLATES) {
      it(`${rel} keeps the prediction step and adds a populated-commitment second pass`, () => {
        const body = read(rel);
        expect(body).toContain('predict');
        // Step 5 second pass is a populated commitment, not just a bare question.
        expect(body).toContain('populated commitment');
      });
    }
  });

  // @ana A035
  describe('ana-verify templates introduce no re-seal / return-to-Plan path (AC10)', () => {
    for (const rel of VERIFY_TEMPLATES) {
      it(`${rel} never tells the verifier to re-seal or return to Plan`, () => {
        const body = read(rel).toLowerCase();
        expect(body).not.toContain('re-seal');
        expect(body).not.toContain('reseal');
        expect(body).not.toContain('return to plan');
        expect(body).not.toContain('return-to-plan');
        expect(body).not.toContain('back to plan');
      });
    }
  });
});
