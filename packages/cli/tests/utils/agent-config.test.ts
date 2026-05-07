import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  setFrontmatterField,
  removeFrontmatterField,
  resolveSkillCharCount,
} from '../../src/utils/agent-config.js';

/**
 * Tests for agent-config.ts — pure string-in/string-out frontmatter utilities
 */

describe('parseFrontmatter', () => {
  // @ana A022
  it('returns null for files without frontmatter', () => {
    const content = '# Just markdown\n\nNo frontmatter here.';
    expect(parseFrontmatter(content)).toBeNull();
  });

  it('returns null for empty content', () => {
    expect(parseFrontmatter('')).toBeNull();
  });

  it('parses complete frontmatter with all fields', () => {
    const content = `---
name: ana-build
model: opus[1m]
description: "Reads spec, produces working code"
skills: [git-workflow]
---

# Body content`;

    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('ana-build');
    expect(result!.model).toBe('opus[1m]');
    expect(result!.description).toBe('Reads spec, produces working code');
    expect(result!.skills).toEqual(['git-workflow']);
  });

  it('parses frontmatter without model field', () => {
    const content = `---
name: test-agent
description: A test agent
---

Content`;

    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('test-agent');
    expect(result!.model).toBeNull();
    expect(result!.description).toBe('A test agent');
  });

  it('parses frontmatter with missing fields', () => {
    const content = `---
name: minimal
---

Content`;

    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('minimal');
    expect(result!.model).toBeNull();
    expect(result!.description).toBeNull();
    expect(result!.skills).toEqual([]);
  });

  it('strips quotes from description', () => {
    const content = `---
name: test
description: "Quoted description value"
---`;

    const result = parseFrontmatter(content);
    expect(result!.description).toBe('Quoted description value');
  });

  it('strips single quotes from description', () => {
    const content = `---
name: test
description: 'Single quoted'
---`;

    const result = parseFrontmatter(content);
    expect(result!.description).toBe('Single quoted');
  });

  it('truncates description to 60 characters', () => {
    const longDesc = 'A'.repeat(80);
    const content = `---
name: test
description: ${longDesc}
---`;

    const result = parseFrontmatter(content);
    expect(result!.description).toHaveLength(60);
  });

  // @ana A023
  it('extracts skills array from inline YAML syntax', () => {
    const content = `---
name: ana-plan
skills: [coding-standards, testing-standards]
---`;

    const result = parseFrontmatter(content);
    expect(result!.skills).toEqual(['coding-standards', 'testing-standards']);
  });

  it('handles single skill in array', () => {
    const content = `---
name: test
skills: [git-workflow]
---`;

    const result = parseFrontmatter(content);
    expect(result!.skills).toEqual(['git-workflow']);
  });

  it('handles empty skills array', () => {
    const content = `---
name: test
skills: []
---`;

    const result = parseFrontmatter(content);
    expect(result!.skills).toEqual([]);
  });

  it('handles no skills field', () => {
    const content = `---
name: test
---`;

    const result = parseFrontmatter(content);
    expect(result!.skills).toEqual([]);
  });

  it('preserves raw key-value pairs', () => {
    const content = `---
name: ana
model: opus[1m]
memory: project
description: "Scoping and navigation"
---`;

    const result = parseFrontmatter(content);
    expect(result!.raw['memory']).toBe('project');
    expect(result!.raw['name']).toBe('ana');
  });

  it('does not parse --- horizontal rules in body as frontmatter', () => {
    const content = `---
name: test
model: sonnet
---

# Body

Some content

---

## Another section after horizontal rule`;

    const result = parseFrontmatter(content);
    expect(result!.name).toBe('test');
    expect(result!.model).toBe('sonnet');
    // Should only parse the first --- pair
  });
});

describe('setFrontmatterField', () => {
  // @ana A018
  it('preserves all other fields when adding a new field', () => {
    const content = `---
name: test-agent
description: A test agent
---

Body content`;

    const result = setFrontmatterField(content, 'model', 'sonnet');
    expect(result).not.toBeNull();

    const parsed = parseFrontmatter(result!);
    expect(parsed!.name).toBe('test-agent');
    expect(parsed!.description).toBe('A test agent');
    expect(parsed!.model).toBe('sonnet');
  });

  it('updates existing field value', () => {
    const content = `---
name: test
model: opus
description: Test agent
---

Body`;

    const result = setFrontmatterField(content, 'model', 'sonnet');
    const parsed = parseFrontmatter(result!);
    expect(parsed!.model).toBe('sonnet');
    expect(parsed!.name).toBe('test');
    expect(parsed!.description).toBe('Test agent');
  });

  // @ana A019
  it('preserves body content including --- horizontal rules', () => {
    const body = `

# Body

Some content

---

## Section after rule

More content

---

### Third section`;

    const content = `---
name: test
model: opus
---` + body;

    const result = setFrontmatterField(content, 'model', 'sonnet');
    expect(result).not.toBeNull();
    // Body after the frontmatter closing --- must be identical
    expect(result!).toContain(body);
  });

  it('returns null when no frontmatter block exists', () => {
    const content = '# No frontmatter\n\nJust content';
    expect(setFrontmatterField(content, 'model', 'sonnet')).toBeNull();
  });

  it('preserves skills and memory fields', () => {
    const content = `---
name: ana
model: opus[1m]
memory: project
description: "Scoping and navigation"
skills: [git-workflow, coding-standards]
---

Body`;

    const result = setFrontmatterField(content, 'model', 'sonnet');
    const parsed = parseFrontmatter(result!);
    expect(parsed!.model).toBe('sonnet');
    expect(parsed!.raw['memory']).toBe('project');
    expect(parsed!.skills).toEqual(['git-workflow', 'coding-standards']);
  });
});

describe('removeFrontmatterField', () => {
  it('removes existing field', () => {
    const content = `---
name: test
model: opus
description: Test agent
---

Body`;

    const result = removeFrontmatterField(content, 'model');
    expect(result).not.toBeNull();
    const parsed = parseFrontmatter(result!);
    expect(parsed!.model).toBeNull();
    expect(parsed!.name).toBe('test');
    expect(parsed!.description).toBe('Test agent');
  });

  it('returns content unchanged when field does not exist', () => {
    const content = `---
name: test
description: Test agent
---

Body`;

    const result = removeFrontmatterField(content, 'model');
    expect(result).not.toBeNull();
    // Name and description still intact
    const parsed = parseFrontmatter(result!);
    expect(parsed!.name).toBe('test');
    expect(parsed!.description).toBe('Test agent');
  });

  it('returns null when no frontmatter block exists', () => {
    const content = '# No frontmatter\n\nJust content';
    expect(removeFrontmatterField(content, 'model')).toBeNull();
  });

  it('preserves body including --- horizontal rules', () => {
    const body = `

# Body

---

## Section`;

    const content = `---
name: test
model: opus
---` + body;

    const result = removeFrontmatterField(content, 'model');
    expect(result).not.toBeNull();
    expect(result!).toContain(body);
  });
});

describe('resolveSkillCharCount', () => {
  it('sums file sizes for valid skills', () => {
    const mockStat = (filePath: string) => {
      if (filePath.includes('git-workflow')) return { size: 500 };
      if (filePath.includes('coding-standards')) return { size: 300 };
      return { size: 0 };
    };

    const result = resolveSkillCharCount(
      ['git-workflow', 'coding-standards'],
      '/fake/skills',
      mockStat
    );
    expect(result).toBe(800);
  });

  it('returns 0 for missing skill files', () => {
    const mockStat = () => {
      throw new Error('ENOENT');
    };

    const result = resolveSkillCharCount(['nonexistent'], '/fake/skills', mockStat);
    expect(result).toBe(0);
  });

  it('returns 0 for empty skills array', () => {
    const mockStat = () => ({ size: 100 });
    const result = resolveSkillCharCount([], '/fake/skills', mockStat);
    expect(result).toBe(0);
  });

  it('handles mix of valid and missing skills', () => {
    const mockStat = (filePath: string) => {
      if (filePath.includes('git-workflow')) return { size: 500 };
      throw new Error('ENOENT');
    };

    const result = resolveSkillCharCount(
      ['git-workflow', 'nonexistent'],
      '/fake/skills',
      mockStat
    );
    expect(result).toBe(500);
  });
});
