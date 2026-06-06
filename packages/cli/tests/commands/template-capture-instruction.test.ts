import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * AC8 — the instruction surface. All four agent templates that run tests must
 * instruct running them through `ana test`, kept in sync across `.claude` and
 * `.codex` (bodies byte-identical except the `.claude` YAML frontmatter).
 */

const TEMPLATES = path.resolve(__dirname, '..', '..', 'templates');

const BUILD_TEMPLATES = [
  '.claude/agents/ana-build.md',
  '.codex/agents/ana-build.md',
];
const VERIFY_TEMPLATES = [
  '.claude/agents/ana-verify.md',
  '.codex/agents/ana-verify.md',
];

const read = (rel: string): string => fs.readFileSync(path.join(TEMPLATES, rel), 'utf-8');

/** Strip a leading `---`-delimited YAML frontmatter block (`.claude` only). */
function stripFrontmatter(text: string): string {
  if (!text.startsWith('---')) return text;
  const end = text.indexOf('\n---', 3);
  return end === -1 ? text : text.slice(text.indexOf('\n', end + 1) + 1);
}

describe('AC8 — ana test instruction in all four templates', () => {
  // @ana A022
  it('all four templates instruct running tests through `ana test`', () => {
    const all = [...BUILD_TEMPLATES, ...VERIFY_TEMPLATES];
    const withInstruction = all.filter((rel) => /`?ana test`?/.test(read(rel)));
    expect(withInstruction).toHaveLength(4);
  });

  it('build templates carry the build-stage + checkpoint forms', () => {
    for (const rel of BUILD_TEMPLATES) {
      const body = read(rel);
      expect(body).toContain('ana test --stage build --slug');
      expect(body).toContain('ana test --slug {slug} -- {checkpoint command');
    }
  });

  it('verify templates carry the verify-stage form', () => {
    for (const rel of VERIFY_TEMPLATES) {
      expect(read(rel)).toContain('ana test --stage verify --slug');
    }
  });

  it('codex bodies mirror claude bodies (identical except frontmatter)', () => {
    expect(stripFrontmatter(read('.claude/agents/ana-build.md')).trimStart()).toBe(read('.codex/agents/ana-build.md').trimStart());
    expect(stripFrontmatter(read('.claude/agents/ana-verify.md')).trimStart()).toBe(read('.codex/agents/ana-verify.md').trimStart());
  });
});
