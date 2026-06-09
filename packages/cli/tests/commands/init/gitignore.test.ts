/**
 * Tests for the pure `mergeGitignore` helper and the surface stock constants.
 *
 * Pure function — inline string fixtures, no temp files. Exact-value
 * assertions on full output strings (idempotency depends on byte-exactness).
 */

import { describe, it, expect } from 'vitest';
import {
  mergeGitignore,
  ANA_GITIGNORE_STOCK,
  CLAUDE_GITIGNORE_STOCK,
  CODEX_GITIGNORE_STOCK,
} from '../../../src/commands/init/gitignore.js';

const START = '# >>> Anatomia managed (do not edit) >>>';
const END = '# <<< Anatomia managed <<<';

describe('mergeGitignore', () => {
  describe('case 1: empty/null/whitespace input → block only', () => {
    // @ana A019
    it('null input returns the managed block only, with both sentinels', () => {
      const result = mergeGitignore(null, ANA_GITIGNORE_STOCK);
      expect(result).toBe(
        `${START}\n` +
          '# Anatomia runtime state — local to each developer\n' +
          'state/\n' +
          'worktrees/\n' +
          '# Raw test-capture logs — scratch; deleted after the count + sha are sealed into the compact build_report.md marker\n' +
          'plans/active/*/.captures/\n' +
          `${END}\n`,
      );
    });

    // @ana A019
    it('empty string returns block only', () => {
      const result = mergeGitignore('', ANA_GITIGNORE_STOCK);
      expect(result).toContain(START);
      expect(result).toContain(END);
      expect(result).toContain('state/');
    });

    // @ana A019
    it('whitespace-only input returns block only', () => {
      const result = mergeGitignore('\n  \n\t\n', ANA_GITIGNORE_STOCK);
      expect(result).toBe(mergeGitignore(null, ANA_GITIGNORE_STOCK));
    });

    // @ana A019
    it('block-only output ends with exactly one terminating newline', () => {
      const result = mergeGitignore(null, ANA_GITIGNORE_STOCK);
      expect(result.endsWith(`${END}\n`)).toBe(true);
      expect(result.endsWith(`${END}\n\n`)).toBe(false);
    });
  });

  describe('case 2: well-formed managed block', () => {
    // @ana A005
    it('regenerates stock when the user deleted a stock line', () => {
      // User removed `state/` from the managed block.
      const input =
        `${START}\n` +
        '# Anatomia runtime state — local to each developer\n' +
        'worktrees/\n' +
        `${END}\n`;
      const result = mergeGitignore(input, ANA_GITIGNORE_STOCK);
      expect(result).toContain('state/');
    });

    it('preserves user content below the block verbatim', () => {
      const input =
        `${START}\n` +
        'state/\n' +
        `${END}\n` +
        '\n' +
        '# my local scratch\n' +
        '.notes/\n';
      const result = mergeGitignore(input, ANA_GITIGNORE_STOCK);
      expect(result).toContain('# my local scratch\n.notes/');
    });

    // @ana A009
    it('keeps a user !negation below the END sentinel after re-merge', () => {
      const input =
        `${START}\n` +
        CLAUDE_GITIGNORE_STOCK +
        `\n${END}\n\n` +
        '# my local scratch\n' +
        '.notes/\n' +
        '!settings.local.json.example\n';
      const result = mergeGitignore(input, CLAUDE_GITIGNORE_STOCK);
      const afterEnd = result.slice(result.indexOf(END) + END.length);
      expect(afterEnd).toContain('!settings.local.json.example');
    });

    // @ana A017
    it('consolidates user content above the start sentinel below the block', () => {
      const input =
        'line-that-was-above\n' +
        `${START}\n` +
        'state/\n' +
        `${END}\n`;
      const result = mergeGitignore(input, ANA_GITIGNORE_STOCK);
      const afterEnd = result.slice(result.indexOf(END) + END.length);
      expect(afterEnd).toContain('line-that-was-above');
      // The line must NOT appear before the START sentinel anymore.
      expect(result.indexOf('line-that-was-above')).toBeGreaterThan(result.indexOf(END));
    });

    // @ana A021
    it('preserves a well-formed user-region line equal to stock verbatim', () => {
      const input =
        `${START}\n` +
        'state/\n' +
        `${END}\n\n` +
        'state/\n'; // user re-declares a stock line in their own region
      const result = mergeGitignore(input, ANA_GITIGNORE_STOCK);
      const afterEnd = result.slice(result.indexOf(END) + END.length);
      expect(afterEnd).toContain('state/');
    });

    // @ana A020
    it('preserves CRLF inside a user line verbatim', () => {
      const input =
        `${START}\n` +
        'state/\n' +
        `${END}\n\n` +
        'user-crlf-line\r\n' +
        'plain-line\n';
      const result = mergeGitignore(input, ANA_GITIGNORE_STOCK);
      expect(result).toContain('user-crlf-line\r');
    });
  });

  describe('case 3: legacy / fail-safe migration', () => {
    // @ana A010, A011
    it('wraps a legacy bare-stock file in the managed block and preserves user lines', () => {
      const legacy =
        '# Anatomia runtime state — local to each developer\n' +
        'state/\n' +
        'worktrees/\n' +
        'user-custom-ignore-line\n';
      const result = mergeGitignore(legacy, ANA_GITIGNORE_STOCK);
      expect(result).toContain('# >>> Anatomia managed (do not edit) >>>');
      expect(result).toContain('user-custom-ignore-line');
      // The bare stock line is stripped from the user region (it lives in block now).
      const afterEnd = result.slice(result.indexOf(END) + END.length);
      expect(afterEnd).not.toContain('worktrees/');
      expect(afterEnd).toContain('user-custom-ignore-line');
    });

    it('benign promotion: a line matching OLD/removed stock survives as user content', () => {
      // `old-stock-line` is NOT in current stock, so it is preserved.
      const legacy = 'old-stock-line\nuser-custom-ignore-line\n';
      const result = mergeGitignore(legacy, ANA_GITIGNORE_STOCK);
      expect(result).toContain('old-stock-line');
      expect(result).toContain('user-custom-ignore-line');
    });

    // @ana A018
    it('only-START marker degrades to user content, nothing deleted', () => {
      const input = `${START}\n` + 'user-line-near-broken-marker\n';
      const result = mergeGitignore(input, ANA_GITIGNORE_STOCK);
      expect(result).toContain('user-line-near-broken-marker');
    });

    // @ana A018
    it('only-END marker degrades to user content', () => {
      const input = 'user-line-near-broken-marker\n' + `${END}\n`;
      const result = mergeGitignore(input, ANA_GITIGNORE_STOCK);
      expect(result).toContain('user-line-near-broken-marker');
    });

    // @ana A018
    it('duplicate START markers degrade to user content', () => {
      const input = `${START}\n${START}\nstate/\n${END}\nuser-line-near-broken-marker\n`;
      const result = mergeGitignore(input, ANA_GITIGNORE_STOCK);
      expect(result).toContain('user-line-near-broken-marker');
    });

    // @ana A018
    it('END-before-START degrades to user content', () => {
      const input = `${END}\nuser-line-near-broken-marker\n${START}\n`;
      const result = mergeGitignore(input, ANA_GITIGNORE_STOCK);
      expect(result).toContain('user-line-near-broken-marker');
    });
  });

  describe('idempotency (all surfaces, with and without user content)', () => {
    const surfaces: Array<[string, string]> = [
      ['ANA', ANA_GITIGNORE_STOCK],
      ['CLAUDE', CLAUDE_GITIGNORE_STOCK],
      ['CODEX', CODEX_GITIGNORE_STOCK],
    ];

    for (const [name, stock] of surfaces) {
      // @ana A006, A007, A008
      it(`${name}: feeding output back is byte-identical (no user content)`, () => {
        const first = mergeGitignore(null, stock);
        const second = mergeGitignore(first, stock);
        expect(second).toBe(first);
      });

      // @ana A006, A007, A008
      it(`${name}: feeding output back is byte-identical (with user content)`, () => {
        const seeded = mergeGitignore(`${stock}\n\nuser-custom-ignore-line\n`, stock);
        const first = mergeGitignore(seeded, stock);
        const second = mergeGitignore(first, stock);
        expect(second).toBe(first);
      });
    }

    // @ana A023
    it('whole-file-CRLF managed input is detected well-formed and regenerates byte-identical', () => {
      // Build a well-formed managed file then convert ALL line endings to CRLF.
      const lf = mergeGitignore('user-custom-ignore-line', ANA_GITIGNORE_STOCK);
      const crlf = lf.replace(/\n/g, '\r\n');
      const first = mergeGitignore(crlf, ANA_GITIGNORE_STOCK);
      const second = mergeGitignore(first, ANA_GITIGNORE_STOCK);
      // Detected as well-formed (not demoted to legacy) → its own output is stable.
      expect(second).toBe(first);
      // And it is NOT a duplicated/doubled block.
      expect(first.match(/Anatomia managed \(do not edit\)/g)?.length).toBe(1);
    });
  });

  describe('A044: stock never ignores provenance', () => {
    // @ana A014
    it('ANA stock output never contains provenance', () => {
      expect(mergeGitignore(null, ANA_GITIGNORE_STOCK)).not.toContain('provenance');
    });

    // @ana A015
    it('CLAUDE stock output never contains provenance', () => {
      expect(mergeGitignore(null, CLAUDE_GITIGNORE_STOCK)).not.toContain('provenance');
    });

    // @ana A016
    it('CODEX stock output never contains provenance', () => {
      expect(mergeGitignore(null, CODEX_GITIGNORE_STOCK)).not.toContain('provenance');
    });

    it('throws if stockBlock contains provenance (hard gate)', () => {
      expect(() => mergeGitignore(null, 'provenance/')).toThrow(/A044/);
    });
  });

  describe('stock identity (project-type-independent)', () => {
    // @ana A022
    it('ANA stock contains no language/framework tokens', () => {
      expect(ANA_GITIGNORE_STOCK).not.toContain('TypeScript');
      expect(ANA_GITIGNORE_STOCK).not.toContain('node_modules');
      expect(ANA_GITIGNORE_STOCK).not.toContain('Python');
    });

    it('ANA stock has the exact expected content', () => {
      expect(ANA_GITIGNORE_STOCK).toBe(
        '# Anatomia runtime state — local to each developer\n' +
          'state/\n' +
          'worktrees/\n' +
          '# Raw test-capture logs — scratch; deleted after the count + sha are sealed into the compact build_report.md marker\n' +
          'plans/active/*/.captures/',
      );
    });

    // @ana A013
    it('CLAUDE stock has the exact expected content (incl. scheduled_tasks.lock)', () => {
      expect(CLAUDE_GITIGNORE_STOCK).toBe(
        '# Per-developer state — not committed\n' +
          'agent-memory/\n' +
          'settings.local.json\n' +
          '# Claude Code harness runtime lock — regenerated each session, never committed\n' +
          'scheduled_tasks.lock',
      );
    });

    // @ana A003
    it('CODEX stock has the exact expected content', () => {
      expect(CODEX_GITIGNORE_STOCK).toBe(
        '# Per-developer state — not committed\n' + 'agent-memory/\n' + 'settings.local.json',
      );
    });

    it('worktrees/ stays in ANA stock (worktree.test.ts:306 depends on it)', () => {
      expect(ANA_GITIGNORE_STOCK).toContain('worktrees/');
    });
  });
});
