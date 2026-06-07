import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * AC7 — the instruction surface. Build and verify agent templates seal their
 * final/independent run through `ana test`, but no longer route every test
 * through it nor wrap a focused checkpoint command. Kept in sync across `.claude`
 * and `.codex` (bodies byte-identical except the `.claude` YAML frontmatter).
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

describe('AC7 — ana test instruction in build + verify templates', () => {
  // @ana A016, A017, A020 — build templates keep the final build-seal instruction
  // and drop the route-everything, checkpoint-wrapping, and byte/line wording.
  it('build templates seal the final run and drop the checkpoint/route-everything forms', () => {
    for (const rel of BUILD_TEMPLATES) {
      const body = read(rel);
      expect(body).toContain('ana test --stage build --slug');
      expect(body).not.toContain('-- {checkpoint command');
      expect(body).not.toContain('Run every test through');
      expect(body).not.toContain('byte/line totals');
    }
  });

  // @ana A018, A019 — verify templates keep the unconditional verify-seal
  // instruction and drop the focused-checkpoint form.
  it('verify templates carry the verify-stage form and drop the checkpoint form', () => {
    for (const rel of VERIFY_TEMPLATES) {
      const body = read(rel);
      expect(body).toContain('ana test --stage verify --slug');
      expect(body).not.toContain('-- {checkpoint command');
      expect(body).not.toContain('byte/line totals');
    }
  });

  it('codex bodies mirror claude bodies (identical except frontmatter)', () => {
    expect(stripFrontmatter(read('.claude/agents/ana-build.md')).trimStart()).toBe(read('.codex/agents/ana-build.md').trimStart());
    expect(stripFrontmatter(read('.claude/agents/ana-verify.md')).trimStart()).toBe(read('.codex/agents/ana-verify.md').trimStart());
  });
});
