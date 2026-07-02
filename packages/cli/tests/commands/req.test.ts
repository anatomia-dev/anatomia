/**
 * Tests for the requirement command surface: validateReqFormat (one test per
 * violation class + valid + aliases + case-insensitive enums), the `req new`
 * scaffold validity, and buildRequirementList (rows, malformed, stale, sort — the
 * data behind `req list` / `--json`).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { validateReqFormat } from '../../src/commands/artifact-validators.js';
import { buildRequirementScaffold } from '../../src/commands/req.js';
import { buildRequirementList } from '../../src/commands/req-state.js';
import { ANA_GITIGNORE_STOCK } from '../../src/commands/init/gitignore.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ana-req-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Write a requirement file and return its path.
 *
 * @param name - Filename (e.g. `REQ-foo.md`)
 * @param content - File content
 * @returns The absolute path
 */
function writeReq(name: string, content: string): string {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

/**
 * Build valid requirement content for stem `REQ-foo` with optional overrides to
 * the frontmatter block and body.
 *
 * @param frontmatter - Frontmatter lines (without the `---` fences)
 * @param body - Markdown body
 * @returns Full file content
 */
function reqFile(frontmatter: string, body?: string): string {
  const defaultBody = `## Problem
The disease.

## Evidence
The proof.

## Done Looks Like
The finish line.
`;
  return `---\n${frontmatter}\n---\n\n${body ?? defaultBody}`;
}

const VALID_FM = `req: REQ-foo
title: A thing
priority: high
status: open
created: 2026-06-28
source: hand-written`;

describe('validateReqFormat', () => {
  // @ana A005
  it('accepts a well-formed requirement (returns null)', () => {
    const p = writeReq('REQ-foo.md', reqFile(VALID_FM));
    expect(validateReqFormat(p)).toBeNull();
  });

  // @ana A006
  it('rejects an unknown frontmatter field', () => {
    const p = writeReq('REQ-foo.md', reqFile(`${VALID_FM}\nseverity: high`));
    const err = validateReqFormat(p);
    expect(err).toBeTruthy();
    expect(err).toContain('severity');
  });

  // @ana A007
  it('rejects a non-enum priority', () => {
    const p = writeReq('REQ-foo.md', reqFile(VALID_FM.replace('priority: high', 'priority: P1')));
    const err = validateReqFormat(p);
    expect(err).toBeTruthy();
    expect(err).toContain('priority');
  });

  // @ana A008
  it('rejects a req id that does not match the filename stem', () => {
    const p = writeReq('REQ-foo.md', reqFile(VALID_FM.replace('req: REQ-foo', 'req: REQ-bar')));
    const err = validateReqFormat(p);
    expect(err).toBeTruthy();
    expect(err).toContain('REQ-foo');
  });

  // @ana A009
  it('rejects a resolution on a non-archived requirement', () => {
    const p = writeReq('REQ-foo.md', reqFile(`${VALID_FM}\nresolution: completed`));
    const err = validateReqFormat(p);
    expect(err).toBeTruthy();
    expect(err).toContain('resolution');
  });

  // @ana A010
  it('rejects an archived requirement missing its resolution', () => {
    const fm = VALID_FM.replace('status: open', 'status: archived');
    const p = writeReq('REQ-foo.md', reqFile(fm));
    const err = validateReqFormat(p);
    expect(err).toBeTruthy();
    expect(err).toContain('resolution');
  });

  // @ana A011
  it('rejects a requirement missing a required section', () => {
    const body = `## Problem
The disease.

## Done Looks Like
The finish line.
`;
    const p = writeReq('REQ-foo.md', reqFile(VALID_FM, body));
    const err = validateReqFormat(p);
    expect(err).toBeTruthy();
    expect(err).toContain('Evidence');
  });

  // @ana A012
  it('rejects an empty appetite when the field is present', () => {
    const p = writeReq('REQ-foo.md', reqFile(`${VALID_FM}\nappetite: ''`));
    const err = validateReqFormat(p);
    expect(err).toBeTruthy();
    expect(err).toContain('appetite');
  });

  // @ana A013
  it('matches enums case-insensitively', () => {
    const fm = VALID_FM.replace('priority: high', 'priority: HIGH').replace('status: open', 'status: OPEN');
    const p = writeReq('REQ-foo.md', reqFile(fm));
    expect(validateReqFormat(p)).toBeNull();
  });

  // @ana A014
  it('accepts aliased section headings (grandfathers the legacy corpus)', () => {
    const body = `## Disease
The root cause.

## Why This Matters
The business impact.

## What to Build
The finish line.
`;
    const p = writeReq('REQ-foo.md', reqFile(VALID_FM, body));
    expect(validateReqFormat(p)).toBeNull();
  });
});

describe('requirements are committed by default', () => {
  // @ana A034
  it('the stock .ana/.gitignore does not ignore the requirements directory', () => {
    expect(ANA_GITIGNORE_STOCK).not.toContain('requirements');
  });
});

describe('req new scaffold', () => {
  // @ana A001, A002, A003, A004
  it('produces a scaffold that validates unmodified and has correct defaults', () => {
    const content = buildRequirementScaffold('REQ-proof-viewer', '2026-07-01');
    const p = writeReq('REQ-proof-viewer.md', content);

    // A001: validates unmodified
    expect(validateReqFormat(p)).toBeNull();
    // A002: open / unset / hand-written defaults
    expect(content).toContain('status: open');
    expect(content).toContain('priority: unset');
    expect(content).toContain('source: hand-written');
    // A003: includes the Leads section
    expect(content).toContain('## Leads');
    // A004: stamped with a created date
    expect(content).toContain('created: 2026-07-01');
  });
});

describe('buildRequirementList', () => {
  /**
   * Seed a requirements dir plus active plan slugs, then build the list in
   * filesystem (on-artifact-branch) mode.
   *
   * @param reqs - Map of filename → content under .ana/requirements/
   * @param activeSlugs - Active work-item slugs under .ana/plans/active/
   * @returns The built requirement list
   */
  function buildList(reqs: Record<string, string>, activeSlugs: string[] = []) {
    const reqDir = path.join(tmpDir, '.ana', 'requirements');
    fs.mkdirSync(reqDir, { recursive: true });
    for (const [name, content] of Object.entries(reqs)) {
      fs.writeFileSync(path.join(reqDir, name), content, 'utf-8');
    }
    for (const slug of activeSlugs) {
      fs.mkdirSync(path.join(tmpDir, '.ana', 'plans', 'active', slug), { recursive: true });
    }
    return buildRequirementList(tmpDir, 'main', true);
  }

  // @ana A015, A017
  it('renders a row per requirement with its id', () => {
    const items = buildList({
      'REQ-foo.md': reqFile(VALID_FM),
    });
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]?.req).toBe('REQ-foo');
  });

  // @ana A016
  it('flags a malformed requirement without throwing', () => {
    const items = buildList({
      'REQ-foo.md': reqFile(VALID_FM),
      'REQ-bad.md': reqFile(`${VALID_FM.replace('req: REQ-foo', 'req: REQ-bad')}\nseverity: high`),
    });
    const bad = items.find(i => i.req === 'REQ-bad');
    expect(bad?.malformed).toBe(true);
    expect(bad?.error).toContain('severity');
  });

  // @ana A018
  it('sorts by priority with critical first', () => {
    const items = buildList({
      'REQ-low.md': reqFile(VALID_FM.replace('req: REQ-foo', 'req: REQ-low').replace('priority: high', 'priority: low')),
      'REQ-crit.md': reqFile(VALID_FM.replace('req: REQ-foo', 'req: REQ-crit').replace('priority: high', 'priority: critical')),
    });
    expect(items[0]?.priority).toBe('critical');
  });

  // @ana A019
  it('flags a claimed requirement whose claiming slug is no longer active as stale', () => {
    const claimed = reqFile(
      `req: REQ-foo
title: A thing
priority: high
status: claimed
created: 2026-06-28
source: hand-written
claimed_by: gone-slug`,
    );
    const items = buildList({ 'REQ-foo.md': claimed }, ['other-active-slug']);
    const row = items.find(i => i.req === 'REQ-foo');
    expect(row?.stale).toBe(true);
  });

  // @ana A019
  it('does NOT flag a claimed requirement whose slug is still active', () => {
    const claimed = reqFile(
      `req: REQ-foo
title: A thing
priority: high
status: claimed
created: 2026-06-28
source: hand-written
claimed_by: live-slug`,
    );
    const items = buildList({ 'REQ-foo.md': claimed }, ['live-slug']);
    const row = items.find(i => i.req === 'REQ-foo');
    expect(row?.stale).toBe(false);
  });
});
