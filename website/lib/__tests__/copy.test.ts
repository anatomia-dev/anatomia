import { describe, it, expect } from 'vitest';
import { copy } from '@/lib/copy';

// @ana A001
describe("ana-verify chip role reads 'isolated · fault-finds'", () => {
  it('describes Verify as fault-finding, not a machine that computes the verdict', () => {
    const chip = copy.bento.agents.chips.find((c) => c.name === 'ana-verify');
    expect(chip).toBeDefined();
    expect(chip?.role).toBe('isolated · fault-finds');
  });
});

// @ana A002
describe('diff section title is unchanged', () => {
  it("retains the 'Mechanical, not vibes.' title", () => {
    expect(copy.bento.diff.title).toBe('Mechanical, not vibes.');
  });
});

// @ana A003
describe('diff section body retains the no-self-grading line', () => {
  it("contains 'No LLM grades its own code.'", () => {
    expect(copy.bento.diff.body).toContain('No LLM grades its own code.');
  });
});

// @ana A004
describe('manifesto pull quote is unchanged', () => {
  it("retains the 'you read the chain' line", () => {
    // Assert on a substring that avoids the unicode right-single-quote (’).
    expect(copy.manifesto.pull).toContain('You don');
    expect(copy.manifesto.pull).toContain('have to trust the model. You read the chain.');
  });
});

// @ana A031
describe('copy has 20 top-level sections', () => {
  it('has all 20 expected sections', () => {
    const expectedSections = [
      'meta', 'nav', 'hero', 'scan', 'scanThread', 'system',
      'proof', 'marquee', 'bento', 'pricing', 'proofFeed',
      'docs', 'manifesto', 'contact', 'changelog', 'cliRef',
      'examples', 'about', 'license', 'footer',
    ];

    const actualKeys = Object.keys(copy);
    expect(actualKeys).toHaveLength(20);

    for (const section of expectedSections) {
      expect(copy).toHaveProperty(section);
    }
  });
});

// @ana A032
describe('nav.links structure', () => {
  it('has 4 entries each with label and href', () => {
    expect(copy.nav.links).toHaveLength(4);

    for (const link of copy.nav.links) {
      expect(typeof link.label).toBe('string');
      expect(typeof link.href).toBe('string');
      expect(link.label.length).toBeGreaterThan(0);
      expect(link.href.length).toBeGreaterThan(0);
    }
  });
});

// @ana A033
describe('footer.columns structure', () => {
  it('has 3 columns each with title and non-empty links array', () => {
    expect(copy.footer.columns).toHaveLength(3);

    for (const column of copy.footer.columns) {
      expect(typeof column.title).toBe('string');
      expect(column.title.length).toBeGreaterThan(0);
      expect(Array.isArray(column.links)).toBe(true);
      expect(column.links.length).toBeGreaterThan(0);
    }
  });
});

// @ana A034
describe('footer links are complete', () => {
  it('every footer link has non-empty label and href', () => {
    for (const column of copy.footer.columns) {
      for (const link of column.links) {
        expect(typeof link.label).toBe('string');
        expect(link.label.length).toBeGreaterThan(0);
        expect(typeof link.href).toBe('string');
        expect(link.href.length).toBeGreaterThan(0);
      }
    }
  });
});

// @ana A035
describe('hero.ctas.primary structure', () => {
  it('has label, command, and href fields', () => {
    expect(copy.hero.ctas.primary).toHaveProperty('label');
    expect(copy.hero.ctas.primary).toHaveProperty('command');
    expect(copy.hero.ctas.primary).toHaveProperty('href');
    expect(typeof copy.hero.ctas.primary.label).toBe('string');
    expect(typeof copy.hero.ctas.primary.command).toBe('string');
    expect(typeof copy.hero.ctas.primary.href).toBe('string');
  });
});

describe('pricing.plans structure', () => {
  it('has 2 entries with name and features arrays', () => {
    expect(copy.pricing.plans).toHaveLength(2);

    for (const plan of copy.pricing.plans) {
      expect(typeof plan.name).toBe('string');
      expect(Array.isArray(plan.features)).toBe(true);
      expect(plan.features.length).toBeGreaterThan(0);
    }
  });
});
