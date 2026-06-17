/**
 * Config-driven custom skills (Slice 5).
 *
 * `scaffoldAndSeedSkills` is relaxed so a custom skill is first-class:
 *
 *  1. A user-authored `.ana/skills/<name>/SKILL.md` (no bundled template, not
 *     declared in ana.json) becomes a manifest member: re-init refreshes its
 *     machine-owned ## Detected section (a no-op — custom skills have no
 *     injector) and PRESERVES the human-authored body, instead of the old
 *     behavior where any skill lacking a bundled template was skipped.
 *
 *  2. A manifest-named skill (declared `always:true` in ana.json.skills) that
 *     ships NO bundled template and has NO file on disk yet gets a minimal
 *     stub SKILL.md written — not silently dropped.
 *
 * The no-regression anchor: a stock manifest skill (e.g. coding-standards)
 * still scaffolds from its bundled template byte-for-byte, and absent config /
 * no custom dirs leaves the stock skill set untouched.
 *
 * Tests call scaffoldAndSeedSkills directly with a temp skillsPath (acting as
 * `.ana/skills/`) and the real templates dir, mirroring the direct-function
 * convention in assets-agent-skills.test.ts. engineResult is null so the only
 * mutation is the scaffold itself (Detected injection is skipped without a
 * scan), which keeps the custom-skill assertions about preservation crisp.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { scaffoldAndSeedSkills } from '../../../src/commands/init/skills.js';
import { buildCustomSkillStub } from '../../../src/manifest.js';
import { createEmptyEngineResult } from '../../../src/engine/types/engineResult.js';
import { createEmptyPatternAnalysis } from '../../../src/engine/types/patterns.js';
import { computeSkillManifest } from '../../../src/constants.js';

const realTemplatesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'templates',
);

describe('scaffoldAndSeedSkills — config-driven custom skills (Slice 5)', () => {
  let skillsPath: string;

  beforeEach(async () => {
    skillsPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-custom-skills-'));
  });

  afterEach(async () => {
    await fs.rm(skillsPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  /** Read a scaffolded SKILL.md from the temp skills dir. */
  async function readSkill(name: string): Promise<string> {
    return fs.readFile(path.join(skillsPath, name, 'SKILL.md'), 'utf-8');
  }

  async function skillExists(name: string): Promise<boolean> {
    try {
      await fs.access(path.join(skillsPath, name, 'SKILL.md'));
      return true;
    } catch {
      return false;
    }
  }

  it('writes a minimal stub for a manifest-declared skill with no template and no file', async () => {
    await scaffoldAndSeedSkills(
      skillsPath,
      realTemplatesDir,
      null,
      'fresh',
      { skills: { observability: { always: true } } },
    );

    expect(await skillExists('observability')).toBe(true);
    const stub = await readSkill('observability');
    // Stub mirrors the bundled-template section structure so the rest of the
    // pipeline (and the user) treat it uniformly.
    expect(stub).toContain('name: observability');
    expect(stub).toContain('# observability');
    expect(stub).toContain('## Detected');
    expect(stub).toContain('## Rules');
    expect(stub).toContain('## Gotchas');
    expect(stub).toContain('## Examples');
    // Exactly the bytes the pure builder produces (ana run setup is the
    // Claude-default agent command).
    expect(stub).toBe(buildCustomSkillStub('observability', 'ana run setup'));
  });

  it('still scaffolds a stock manifest skill from its bundled template (no regression)', async () => {
    await scaffoldAndSeedSkills(
      skillsPath,
      realTemplatesDir,
      null,
      'fresh',
      { skills: { observability: { always: true } } },
    );

    // coding-standards is a CORE skill — its bundled template is copied verbatim
    // (no engineResult → no Detected mutation), even alongside the custom stub.
    const stock = await fs.readFile(
      path.join(realTemplatesDir, '.claude/skills', 'coding-standards', 'SKILL.md'),
      'utf-8',
    );
    expect(await readSkill('coding-standards')).toBe(stock);
  });

  it('a user-authored custom SKILL.md (no template, not in config) becomes a manifest member', async () => {
    // The user hand-authored a custom skill directly under .ana/skills/.
    const customBody =
      '---\nname: domain-glossary\n---\n\n# domain-glossary\n\n## Detected\n\n## Rules\n- A widget is a frobnicator with a handle.\n';
    await fs.mkdir(path.join(skillsPath, 'domain-glossary'), { recursive: true });
    await fs.writeFile(path.join(skillsPath, 'domain-glossary', 'SKILL.md'), customBody, 'utf-8');

    // Re-init with NO config mentioning the skill at all.
    await scaffoldAndSeedSkills(skillsPath, realTemplatesDir, null, 'reinit', {});

    // The custom skill survived (was discovered + processed, not dropped) and
    // its human-authored Rules are preserved verbatim (no injector → Detected
    // refresh is a no-op without a scan).
    expect(await skillExists('domain-glossary')).toBe(true);
    const after = await readSkill('domain-glossary');
    expect(after).toContain('A widget is a frobnicator with a handle.');
    expect(after).toBe(customBody);
  });

  it('re-init preserves a custom skill body across multiple inits (never reverts)', async () => {
    const customBody =
      '---\nname: runbook\n---\n\n# runbook\n\n## Detected\n\n## Rules\n- Page the on-call before failing over.\n';
    await fs.mkdir(path.join(skillsPath, 'runbook'), { recursive: true });
    await fs.writeFile(path.join(skillsPath, 'runbook', 'SKILL.md'), customBody, 'utf-8');

    await scaffoldAndSeedSkills(skillsPath, realTemplatesDir, null, 'reinit', {});
    await scaffoldAndSeedSkills(skillsPath, realTemplatesDir, null, 'reinit', {});

    expect(await readSkill('runbook')).toBe(customBody);
  });

  it('a stub written on first init is preserved (not re-stubbed) on a second init', async () => {
    const anaJson = { skills: { observability: { always: true } } };
    await scaffoldAndSeedSkills(skillsPath, realTemplatesDir, null, 'fresh', anaJson);

    // User fleshes out the stub's Rules.
    const stub = await readSkill('observability');
    const enriched = stub.replace(
      /## Rules\n[^\n]*/,
      '## Rules\n- Trace every external call with an OTel span.',
    );
    await fs.writeFile(path.join(skillsPath, 'observability', 'SKILL.md'), enriched, 'utf-8');

    // Re-init: the now-existing file takes the existing path (Detected refresh,
    // preserve body) — the stub builder must NOT clobber the enriched content.
    await scaffoldAndSeedSkills(skillsPath, realTemplatesDir, null, 'reinit', anaJson);

    const after = await readSkill('observability');
    expect(after).toContain('Trace every external call with an OTel span.');
    expect(after).toBe(enriched);
  });

  it('absent config and no custom dirs → only the stock manifest set, byte-identical', async () => {
    await scaffoldAndSeedSkills(skillsPath, realTemplatesDir, null, 'fresh', {});

    // The five CORE skills scaffold from bundled templates verbatim; no stray
    // custom dirs appear.
    for (const name of ['coding-standards', 'testing-standards', 'git-workflow', 'deployment', 'troubleshooting']) {
      const stock = await fs.readFile(
        path.join(realTemplatesDir, '.claude/skills', name, 'SKILL.md'),
        'utf-8',
      );
      expect(await readSkill(name)).toBe(stock);
    }
    // No conditional skills (no scan) and no custom skills.
    expect(await skillExists('observability')).toBe(false);
    const entries = await fs.readdir(skillsPath);
    expect(entries.sort()).toEqual(
      ['coding-standards', 'deployment', 'git-workflow', 'testing-standards', 'troubleshooting'].sort(),
    );
  });

  it('discovers a custom dir AND stubs a config-only skill in the same init', async () => {
    // One custom skill already on disk, one declared in config with nothing on disk.
    const customBody = '---\nname: on-call\n---\n\n# on-call\n\n## Detected\n\n## Rules\n- Ack within 5m.\n';
    await fs.mkdir(path.join(skillsPath, 'on-call'), { recursive: true });
    await fs.writeFile(path.join(skillsPath, 'on-call', 'SKILL.md'), customBody, 'utf-8');

    await scaffoldAndSeedSkills(
      skillsPath,
      realTemplatesDir,
      null,
      'reinit',
      { skills: { observability: { always: true } } },
    );

    // Disk-authored skill preserved.
    expect(await readSkill('on-call')).toBe(customBody);
    // Config-declared skill stubbed.
    expect(await skillExists('observability')).toBe(true);
    expect(await readSkill('observability')).toBe(buildCustomSkillStub('observability', 'ana run setup'));
  });

  it('an untriggered bundled skill on disk is left untouched (not reclassified as custom)', async () => {
    // api-patterns ships a bundled template but is conditional: a scan that does
    // NOT set stack.framework never adds it to the manifest. A user dir named
    // `api-patterns` must NOT be reclassified as a custom skill — otherwise the
    // library rule keyed by that bundled name (zod-safe-parse, fired by
    // validation:zod) would splice into the user file, and because this file has
    // no `## Detected` heading, at a WRONG insertion point (before `## Rules`).
    const userBody =
      '---\nname: api-patterns\n---\n\n# api-patterns\n\n## Rules\n- Our hand-written API conventions.\n';
    await fs.mkdir(path.join(skillsPath, 'api-patterns'), { recursive: true });
    await fs.writeFile(path.join(skillsPath, 'api-patterns', 'SKILL.md'), userBody, 'utf-8');

    // framework:null → api-patterns NOT in manifest; validation:zod → the
    // api-patterns library rule WOULD match (proving the scenario is non-vacuous).
    const result = createEmptyEngineResult();
    result.patterns = {
      ...createEmptyPatternAnalysis(),
      validation: { library: 'zod', confidence: 0.95, evidence: [] },
    };
    expect(computeSkillManifest(result)).not.toContain('api-patterns');

    await scaffoldAndSeedSkills(skillsPath, realTemplatesDir, result, 'reinit', {});

    const after = await readSkill('api-patterns');
    expect(after).toBe(userBody); // byte-identical — never entered the scaffold loop
    expect(after).not.toContain('Library Rules');
  });

  it('a config skill name with traversal never writes outside the skills dir', async () => {
    // A hand- or tool-authored ana.json declaring an always-on skill whose name
    // escapes the skills dir must be rejected by the resolver guard — no stub is
    // written, and nothing appears above skillsPath.
    const parent = path.dirname(skillsPath);
    const sentinel = path.join(parent, 'evil', 'SKILL.md');
    await fs.rm(path.join(parent, 'evil'), { recursive: true, force: true });

    await scaffoldAndSeedSkills(
      skillsPath,
      realTemplatesDir,
      null,
      'fresh',
      { skills: { '../evil': { always: true }, '..': { always: true } } },
    );

    await expect(fs.access(sentinel)).rejects.toThrow();
    // The skills dir contains only the stock core set — no '..'/'../evil' members.
    const entries = await fs.readdir(skillsPath);
    expect(entries).not.toContain('..');
    expect(entries).not.toContain('evil');
  });

  it('a directory without a SKILL.md is not treated as a custom skill', async () => {
    // ENRICHMENT-only or stray dir under .ana/skills/ — must be ignored, not
    // mistaken for a custom skill member.
    await fs.mkdir(path.join(skillsPath, 'not-a-skill'), { recursive: true });
    await fs.writeFile(path.join(skillsPath, 'not-a-skill', 'NOTES.md'), 'scratch\n', 'utf-8');

    await scaffoldAndSeedSkills(skillsPath, realTemplatesDir, null, 'reinit', {});

    // No SKILL.md was created for it.
    expect(await skillExists('not-a-skill')).toBe(false);
  });
});

describe('buildCustomSkillStub — pure stub builder', () => {
  it('renders frontmatter, title, and all four sections', () => {
    const stub = buildCustomSkillStub('observability', 'ana run setup');
    expect(stub).toContain('name: observability');
    expect(stub).toContain('# observability');
    expect(stub).toContain('## Detected');
    expect(stub).toContain('## Rules');
    expect(stub).toContain('## Gotchas');
    expect(stub).toContain('## Examples');
    // Points the user at setup to flesh it out.
    expect(stub).toContain('ana run setup');
  });

  it('threads the setup command through (platform-agnostic)', () => {
    const stub = buildCustomSkillStub('metrics', 'codex run setup');
    expect(stub).toContain('name: metrics');
    expect(stub).toContain('codex run setup');
    expect(stub).not.toContain('ana run setup');
  });
});
