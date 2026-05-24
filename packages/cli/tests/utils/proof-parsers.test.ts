import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  parseFindings,
  parseRejectionCycles,
  extractFileRefs,
  parseBuildOpenIssues,
  extractScopeSummary,
  extractScopeKind,
} from '../../src/utils/proof-parsers.js';

describe('parseFindings', () => {
  // @ana A008
  it('parses bulleted findings with em-dash format', () => {
    const content = `## Findings

- **Code — Dead logic in full-stack check:** \`projectKind.ts:105\` — BROWSER_FRAMEWORKS.has(d) will never match because dep names are lowercase.

- **Test — A003 purity test is comment-fragile:** projectKind.test.ts:187 reads source and asserts not.toContain. A comment mentioning node:fs breaks it.

- **Upstream — Pre-check tag collision:** @ana A015 tag in proof.test.ts matched a different feature's contract.

## Deployer Handoff
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(3);
    expect(findings[0]!.category).toBe('code');
    expect(findings[0]!.summary).toContain('Dead logic in full-stack check');
    expect(findings[0]!.file).toBe('projectKind.ts');
    expect(findings[1]!.category).toBe('test');
    expect(findings[1]!.summary).toContain('A003 purity test');
    expect(findings[1]!.file).toBe('projectKind.test.ts');
    expect(findings[2]!.category).toBe('upstream');
    expect(findings[2]!.summary).toContain('Pre-check tag collision');
    expect(findings[2]!.file).toBe('proof.test.ts');
  });

  it('parses numbered findings', () => {
    const content = `## Findings

1. **Code — Unused export:** ProjectKindResult exported but never imported.

2. **Test — Missing priority test:** No test for bin-over-framework priority.
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(2);
    expect(findings[0]!.category).toBe('code');
    expect(findings[0]!.file).toBeNull();
    expect(findings[1]!.category).toBe('test');
    expect(findings[1]!.file).toBeNull();
  });

  it('parses findings with colon-only format (no em-dash)', () => {
    const content = `## Findings

- **Code:** slug truncation at 24 chars misaligns table columns for long slugs.

- **Test:** duplicate @ana tag IDs across list and detail test sections.
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(2);
    expect(findings[0]!.category).toBe('code');
    expect(findings[0]!.summary).toContain('slug truncation');
    expect(findings[0]!.file).toBeNull();
    expect(findings[1]!.category).toBe('test');
    expect(findings[1]!.file).toBeNull();
  });

  it('returns empty array when no Findings section in verify report', () => {
    const content = `## Independent Findings
Some findings here.

## AC Walkthrough
Some ACs here.
`;
    expect(parseFindings(content)).toHaveLength(0);
  });

  it('returns empty array when Findings section in verify report has no parseable entries', () => {
    const content = `## Findings

Just some plain text with no structured findings.
`;
    expect(parseFindings(content)).toHaveLength(0);
  });

  it('caps summary at 1000 characters', () => {
    const longDesc = 'x'.repeat(1100);
    const content = `## Findings

- **Code — Long one:** ${longDesc}
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.summary.length).toBeLessThanOrEqual(1000);
  });

  it('extracts code anchor from backtick-quoted construct', () => {
    const content = `## Findings

- **Code — Non-recursive check:** \`readdirSync(prismaDir)\` only checks top-level entries in the directory.
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.anchor).toBe('readdirSync(prismaDir)');
  });

  it('returns null anchor when no suitable backtick content', () => {
    const content = `## Findings

- **Upstream — Spec deviation:** The spec suggested a different approach but implementation is better.
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.anchor).toBeNull();
  });

  it('skips file:line references as anchors', () => {
    const content = `## Findings

- **Code — Issue at location:** \`census.ts:219\` has a problem. The real code is \`readdirSync(prismaDir)\`.
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(1);
    // Should skip census.ts:219 (file:line ref) and use readdirSync(prismaDir)
    expect(findings[0]!.anchor).toBe('readdirSync(prismaDir)');
  });

  it('handles multi-line finding descriptions', () => {
    const content = `## Findings

- **Code — Multi-line issue:** First line of description
  continues on second line with more detail
  and a third line too.

- **Test — Next entry:** Should be separate.
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(2);
    expect(findings[0]!.summary).toContain('continues on second line');
    expect(findings[0]!.file).toBeNull();
    expect(findings[1]!.summary).toContain('Next entry');
    expect(findings[1]!.file).toBeNull();
  });

  it('parses category-header format with sub-bullets (add-hook-detection style)', () => {
    const content = `## Findings

**Code:**
- **Component file heuristic may over-count:** confirmation.ts:797 includes any .tsx file.

- **Nuxt detection deviates from spec:** Uses import matching instead of regex.

**Test:**
- **No @ana tags for 8 assertions:** A001-A003 have no tags.

**Upstream:**
- **Spec suggested regex but import matching is better:** Positive deviation.

## Deployer Handoff
`;
    const findings = parseFindings(content);
    expect(findings.length).toBeGreaterThanOrEqual(4);

    const codeFindings = findings.filter(c => c.category === 'code');
    expect(codeFindings.length).toBeGreaterThanOrEqual(2);
    expect(codeFindings[0]!.summary).toContain('Component file heuristic');
    expect(codeFindings[0]!.file).toBe('confirmation.ts');

    const testFindings = findings.filter(c => c.category === 'test');
    expect(testFindings.length).toBeGreaterThanOrEqual(1);

    const upstreamFindings = findings.filter(c => c.category === 'upstream');
    expect(upstreamFindings.length).toBeGreaterThanOrEqual(1);
  });

  it('parses standalone paragraph format (fix-skill-template-gaps style)', () => {
    const content = `## Findings

**Upstream:** Contract assertions A007 and A008 were sealed with incorrect values. The planner miscounted.

**Code:** The error-handling rule is now longer than the others. Appropriate given the nuance.

**Test:** No test coverage for template content. Visual inspection only.

## Deployer Handoff
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(3);
    expect(findings[0]!.category).toBe('upstream');
    expect(findings[0]!.summary).toContain('A007');
    expect(findings[0]!.file).toBeNull();
    expect(findings[1]!.category).toBe('code');
    expect(findings[1]!.file).toBeNull();
    expect(findings[2]!.category).toBe('test');
    expect(findings[2]!.file).toBeNull();
  });

  // @ana A001
  it('returns file field with first file ref from summary', () => {
    const content = `## Findings

- **Code — Dead logic in full-stack check:** \`projectKind.ts:105\` — BROWSER_FRAMEWORKS.has(d) will never match.
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.file).toBe('projectKind.ts');
  });

  // @ana A002
  it('returns null file when no file ref in summary', () => {
    const content = `## Findings

- **Upstream — Contract assertion sealed with incorrect value:** The planner miscounted the total assertions.
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.file).toBeNull();
  });

  // @ana A003
  it('takes first file ref when multiple files present in summary', () => {
    const content = `## Findings

- **Code — Cross-file issue:** fileA.ts:10 and fileB.ts:20 both have the same problem.
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.file).toBe('fileA.ts');
  });

  it('accepts non-standard categories like Security or Performance', () => {
    const content = `## Findings

- **Security — SQL injection in query builder:** db/queries.ts:42 — user input concatenated into SQL string.
- **Performance — N+1 query in user list:** api/users.ts:15 — fetches roles individually per user.

## Deployer Handoff
`;
    const findings = parseFindings(content);
    expect(findings).toHaveLength(2);
    expect(findings[0]!.category).toBe('security');
    expect(findings[0]!.file).toBe('db/queries.ts');
    expect(findings[1]!.category).toBe('performance');
    expect(findings[1]!.file).toBe('api/users.ts');
  });
});

describe('parseFindings backward compat', () => {
  it('parses findings with ## Findings heading', () => {
    const content = `## Findings

- **Code — New heading test:** This uses the new heading.
`;
    const findings = parseFindings(content);
    expect(findings.length).toBe(1);
    expect(findings[0]!.summary).toContain('New heading test');
  });

});

describe('parseRejectionCycles', () => {
  it('parses Previous Findings Resolution table', () => {
    const content = `## Independent Findings
Some findings.

## Previous Findings Resolution

Previous verification: 2026-04-15, Result: FAIL

### Previously UNSATISFIED Assertions
| ID | Previous Issue | Current Status | Resolution |
|----|----------------|----------------|------------|
| A015 | Test was a sentinel, not real test | ✅ SATISFIED | Builder added real scaffold test |
| A016 | Used toBeDefined instead of type check | ✅ SATISFIED | Builder replaced with type-safe assertions |

### Previous Callouts
| Callout | Status | Notes |
|---------|--------|-------|
| Dead logic in full-stack check | Still present | Not a FAIL item |

## AC Walkthrough
`;
    const result = parseRejectionCycles(content);
    expect(result.cycles).toBe(1);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0]!.id).toBe('A015');
    expect(result.failures[0]!.summary).toContain('sentinel');
    expect(result.failures[1]!.id).toBe('A016');
  });

  it('returns zero cycles when no Previous Findings Resolution section', () => {
    const content = `## Independent Findings
Some findings.

## AC Walkthrough
Some ACs.
`;
    const result = parseRejectionCycles(content);
    expect(result.cycles).toBe(0);
    expect(result.failures).toHaveLength(0);
  });

  it('returns zero cycles when section exists but no assertion table', () => {
    const content = `## Previous Findings Resolution

Previous verification: 2026-04-15, Result: FAIL

### Previous Callouts
| Callout | Status | Notes |
|---------|--------|-------|
| Some callout | Fixed | Done |
`;
    const result = parseRejectionCycles(content);
    expect(result.cycles).toBe(0);
    expect(result.failures).toHaveLength(0);
  });

  it('skips header row in assertion table', () => {
    const content = `## Previous Findings Resolution

### Previously UNSATISFIED Assertions
| ID | Previous Issue | Current Status | Resolution |
|----|----------------|----------------|------------|
| A001 | Missing validation | ✅ SATISFIED | Added input checks |
`;
    const result = parseRejectionCycles(content);
    expect(result.cycles).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.id).toBe('A001');
  });
});

describe('extractFileRefs', () => {
  // @ana A001
  it('extracts filename:line format', () => {
    const result = extractFileRefs('Dead logic in projectKind.ts:105 causes issues');
    expect(result).toContain('projectKind.ts');
  });

  // @ana A002
  it('extracts filename:line-line range format', () => {
    const result = extractFileRefs('Check scan-engine.ts:200-250 for the issue');
    expect(result).toContain('scan-engine.ts');
  });

  // @ana A003
  it('extracts filename without line number', () => {
    const result = extractFileRefs('See displayNames.ts for the mapping');
    expect(result).toContain('displayNames.ts');
  });

  // @ana A004
  it('returns multiple refs from one summary', () => {
    const result = extractFileRefs('projectKind.ts:105 and scan-engine.ts:200 both affected');
    expect(result.length).toBeGreaterThan(1);
    expect(result).toContain('projectKind.ts');
    expect(result).toContain('scan-engine.ts');
  });

  // @ana A005
  it('returns empty array when no refs found', () => {
    const result = extractFileRefs('No file references in this finding');
    expect(result.length).toBe(0);
  });

  // @ana A006
  it('handles various file extensions', () => {
    const result = extractFileRefs('Check config.json and schema.yaml and readme.md');
    expect(result).toContain('config.json');
    expect(result).toContain('schema.yaml');
    expect(result).toContain('readme.md');
  });

  it('deduplicates multiple mentions of same file', () => {
    const result = extractFileRefs('projectKind.ts:105 and projectKind.ts:200');
    expect(result).toHaveLength(1);
    expect(result).toContain('projectKind.ts');
  });

  it('handles tsx and jsx extensions', () => {
    const result = extractFileRefs('See Button.tsx:50 and helpers.jsx');
    expect(result).toContain('Button.tsx');
    expect(result).toContain('helpers.jsx');
  });

  it('preserves directory path when present', () => {
    const result = extractFileRefs('src/utils/proofSummary.ts:361 uses substring');
    expect(result).toContain('src/utils/proofSummary.ts');
    expect(result).not.toContain('proofSummary.ts');
  });

  it('distinguishes same filename in different directories', () => {
    const result = extractFileRefs('src/a/index.ts and src/b/index.ts both export');
    expect(result).toHaveLength(2);
    expect(result).toContain('src/a/index.ts');
    expect(result).toContain('src/b/index.ts');
  });

  it('skips URL-like paths', () => {
    const result = extractFileRefs('See https://docs.example.com/api/handler.ts for docs');
    expect(result).toHaveLength(0);
  });

  it('handles deep paths', () => {
    const result = extractFileRefs('packages/cli/src/engine/analyzers/patterns/confirmation.ts:847');
    expect(result).toContain('packages/cli/src/engine/analyzers/patterns/confirmation.ts');
  });

  it('handles dotted filenames like .test.ts', () => {
    const result = extractFileRefs('projectKind.test.ts has dead logic');
    expect(result).toContain('projectKind.test.ts');
    expect(result).not.toContain('test.ts');
  });

  it('handles dotted filenames with line numbers', () => {
    const result = extractFileRefs('findProjectRoot.test.ts:90-95 is a tautology');
    expect(result).toContain('findProjectRoot.test.ts');
  });

  it('handles multi-dotted filenames like .config.js', () => {
    const result = extractFileRefs('next.config.js needs updating');
    expect(result).toContain('next.config.js');
  });

  it('does not match English sentences with periods', () => {
    const result = extractFileRefs('This is wrong. The fix is elsewhere.');
    expect(result).toHaveLength(0);
  });

  it('does not match version numbers', () => {
    const result = extractFileRefs('v2.0.0 release notes');
    expect(result).toHaveLength(0);
  });
});

describe('parseBuildOpenIssues', () => {
  it('extracts numbered open issues', () => {
    const content = `## Open Issues

1. **\`extractFileRefs\` cannot parse dotted test filenames:** \`projectKind.test.ts\` is extracted as \`test.ts\` because the regex doesn't handle dots.

2. **Census dialect as sentinel entry:** Using \`orm: 'drizzle-dialect'\` is a workaround.

Verified complete by second pass.
`;
    const issues = parseBuildOpenIssues(content);
    expect(issues).toHaveLength(2);
    expect(issues[0]!.summary).toContain('extractFileRefs');
    expect(issues[0]!.file).toBe('projectKind.test.ts');
    expect(issues[1]!.summary).toContain('Census dialect');
  });

  it('extracts bulleted open issues', () => {
    const content = `## Open Issues

- **agents.test.ts fixture modification:** Added \`.ana/\` directory creation to the helper.
- **\`slugDir2\` still exists in \`saveArtifact\`:** The rename is cosmetic.

Verified complete by second pass.
`;
    const issues = parseBuildOpenIssues(content);
    expect(issues).toHaveLength(2);
    expect(issues[0]!.file).toBe('agents.test.ts');
  });

  it('returns empty array when section says None', () => {
    const content = `## Open Issues

None — verified by second pass.
`;
    const issues = parseBuildOpenIssues(content);
    expect(issues).toHaveLength(0);
  });

  it('returns empty array when section is missing', () => {
    const content = `## Test Results

Tests passed.
`;
    const issues = parseBuildOpenIssues(content);
    expect(issues).toHaveLength(0);
  });

  it('extracts file references from issue text', () => {
    const content = `## Open Issues

1. **A017 coverage is partial:** The null-null modelCount sort branch at \`scanProject.test.ts:549\` is not exercised.
`;
    const issues = parseBuildOpenIssues(content);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.file).toBe('scanProject.test.ts');
  });
});

describe('extractScopeSummary', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'scope-summary-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('extracts first paragraph from Intent section', () => {
    const scopePath = path.join(tempDir, 'scope.md');
    fs.writeFileSync(scopePath, '# Scope\n\n## Intent\nThis is the intent paragraph text.\n\n## Other section\n');
    const result = extractScopeSummary(scopePath);
    expect(result).toBe('This is the intent paragraph text.');
  });

  it('returns undefined when scope.md does not exist', () => {
    const result = extractScopeSummary(path.join(tempDir, 'nonexistent.md'));
    expect(result).toBeUndefined();
  });

  it('returns undefined when scope.md has no Intent section', () => {
    const scopePath = path.join(tempDir, 'scope.md');
    fs.writeFileSync(scopePath, '# Scope\n\n## Background\nSome background.\n');
    const result = extractScopeSummary(scopePath);
    expect(result).toBeUndefined();
  });

  it('returns undefined when Intent section is empty', () => {
    const scopePath = path.join(tempDir, 'scope.md');
    fs.writeFileSync(scopePath, '# Scope\n\n## Intent\n\n## Other section\n');
    const result = extractScopeSummary(scopePath);
    expect(result).toBeUndefined();
  });
});

describe('extractScopeKind', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'scope-kind-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A012
  it('parses feature from Kind line', () => {
    const scopePath = path.join(tempDir, 'scope.md');
    fs.writeFileSync(scopePath, '# Scope\n\n## Complexity Assessment\n- **Kind:** feature\n- **Size:** small\n');
    const result = extractScopeKind(scopePath);
    expect(result).toBe('feature');
  });

  // @ana A011
  it('parses fix from Kind line', () => {
    const scopePath = path.join(tempDir, 'scope.md');
    fs.writeFileSync(scopePath, '# Scope\n\n## Complexity Assessment\n- **Kind:** fix\n- **Size:** medium\n');
    const result = extractScopeKind(scopePath);
    expect(result).toBe('fix');
  });

  // @ana A003
  it('parses milestone from Kind line', () => {
    const scopePath = path.join(tempDir, 'scope.md');
    fs.writeFileSync(scopePath, '# Scope\n\n## Complexity Assessment\n- **Kind:** milestone\n- **Size:** small\n');
    const result = extractScopeKind(scopePath);
    expect(result).toBe('milestone');
  });

  // @ana A004
  it('handles case-insensitive milestone', () => {
    const scopePath = path.join(tempDir, 'scope.md');
    fs.writeFileSync(scopePath, '# Scope\n\n## Complexity Assessment\n- **Kind:** Milestone\n- **Size:** small\n');
    const result = extractScopeKind(scopePath);
    expect(result).toBe('milestone');
  });

  // @ana A013
  it('parses chore from Kind line', () => {
    const scopePath = path.join(tempDir, 'scope.md');
    fs.writeFileSync(scopePath, '# Scope\n\n## Complexity Assessment\n- **Kind:** chore\n- **Size:** large\n');
    const result = extractScopeKind(scopePath);
    expect(result).toBe('chore');
  });

  // @ana A014
  it('handles case-insensitive values', () => {
    const scopePath = path.join(tempDir, 'scope.md');
    fs.writeFileSync(scopePath, '# Scope\n\n## Complexity Assessment\n- **Kind:** Feature\n- **Size:** small\n');
    const result = extractScopeKind(scopePath);
    expect(result).toBe('feature');
  });

  // @ana A015
  it('returns undefined for invalid kind value', () => {
    const scopePath = path.join(tempDir, 'scope.md');
    fs.writeFileSync(scopePath, '# Scope\n\n## Complexity Assessment\n- **Kind:** invalid\n- **Size:** small\n');
    const result = extractScopeKind(scopePath);
    expect(result).toBeUndefined();
  });

  // @ana A016
  it('returns undefined when Kind line is missing', () => {
    const scopePath = path.join(tempDir, 'scope.md');
    fs.writeFileSync(scopePath, '# Scope\n\n## Complexity Assessment\n- **Size:** small\n');
    const result = extractScopeKind(scopePath);
    expect(result).toBeUndefined();
  });

  // @ana A017
  it('returns undefined when scope file does not exist', () => {
    const result = extractScopeKind(path.join(tempDir, 'nonexistent.md'));
    expect(result).toBeUndefined();
  });
});
