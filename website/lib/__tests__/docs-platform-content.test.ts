import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { copy } from '@/lib/copy';

const websiteRoot = process.cwd();
const repoRoot = join(websiteRoot, '..');

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf-8');
}

function readWebsiteFile(path: string): string {
  return readFileSync(join(websiteRoot, path), 'utf-8');
}

const migratedDocs = [
  'README.md',
  'website/content/docs/start.mdx',
  'website/content/docs/guides/platform-setup.mdx',
  'website/content/docs/guides/verifying-changes.mdx',
  'website/content/docs/guides/using-ana-setup.mdx',
  'website/content/docs/guides/using-ana-learn.mdx',
  'website/content/docs/guides/reading-a-proof.mdx',
  'website/content/docs/guides/configurability.mdx',
  'website/content/docs/guides/troubleshooting.mdx',
  'website/content/docs/concepts/context.mdx',
  'website/content/docs/concepts/findings.mdx',
  'website/content/docs/concepts/pipeline.mdx',
  'website/content/docs/concepts/toolbelt.mdx',
  'website/content/docs/concepts/skills.mdx',
];

// @ana A001, A002
describe('PlatformSwitcher platform availability', () => {
  it('shows only supported platforms', () => {
    const source = readRepoFile('website/components/docs/layout/PlatformSwitcher.tsx');

    expect(source).toContain('{ id: "claude-code", label: "Claude Code", disabled: false }');
    expect(source).toContain('{ id: "codex", label: "Codex", disabled: false }');
    expect(source).not.toContain('"cursor"');
    expect(source).not.toContain('"windsurf"');
    expect(source).not.toContain('"copilot"');
    expect(source).not.toContain('"cline"');
  });
});

// @ana A003, A004, A005, A006
describe('README multi-platform command surface', () => {
  it('uses the locked opening and universal quickstart commands', () => {
    const readme = readRepoFile('README.md');
    const lockedOpening =
      'Anatomia is a CLI and agent harness for Claude Code and Codex. It scans your codebase — detecting your stack, conventions, and patterns — then runs every change through a five-agent pipeline that saves every artifact: scope, spec, contract, build report, and independent verification. Other harnesses are prompt libraries. This one has an engine.';

    expect(readme.split('\n')[6]).toBe(lockedOpening);
    expect(readme).toContain('ana run setup                 # enrich with your team\'s knowledge');
    expect(readme).toContain('ana run                       # start working');
    expect(readme).toContain('Native pipeline support for [Claude Code](https://claude.com/code) and Codex.');
  });
});

// @ana A007
describe('migrated docs command surface', () => {
  it('does not teach direct Claude agent commands', () => {
    for (const path of migratedDocs) {
      expect(readRepoFile(path), path).not.toContain('claude --agent');
    }
  });
});

// @ana A008, A009, A010, A011
describe('Quickstart init output', () => {
  it('shows platform dispatch and current init next steps', () => {
    const start = readRepoFile('website/content/docs/start.mdx');

    expect(start).toContain('`ana run` dispatches to your configured platform');
    expect(start).toContain('Skills → .ana/skills/');
    expect(start).toContain('>ana run</span>{"             Start working (Ana knows your stack)');
    expect(start).toContain('>ana run setup</span>{"       Enrich with your team\'s knowledge');
  });

  // @ana A027
  it('uses paired platform guidance without wrapping the init terminal mockup', () => {
    const start = readRepoFile('website/content/docs/start.mdx');
    const terminalMockupStart = start.indexOf('<div style={{background:"var(--bg-card)"');
    const terminalMockupEnd = start.indexOf('</div>', terminalMockupStart);
    const terminalMockup = start.slice(terminalMockupStart, terminalMockupEnd);

    expect(start).toContain('<ForPlatform platform="claude-code">');
    expect(start).toContain('<ForPlatform platform="codex">');
    expect(start).toContain('[Platform setup](/docs/guides/platform-setup)');
    expect(terminalMockup).not.toContain('ForPlatform');
  });
});

// @ana A012, A013
describe('landing page multi-platform copy', () => {
  it('names supported native platforms and uses canonical skills path', () => {
    const skillsDrawer = copy.system.drawers.find((drawer) => drawer.id === 'skills');

    expect(copy.bento.compat.body).toContain('Claude Code and Codex');
    expect(skillsDrawer?.tree.folder).toBe('.ana/skills/');
  });
});

// @ana A014
describe('AudienceCards install copy', () => {
  it('does not require Claude Code only', () => {
    const source = readRepoFile('website/components/docs/content/AudienceCards.tsx');

    expect(source).not.toContain('Requires Claude Code');
    expect(source).toContain('Claude Code or Codex');
  });
});

// @ana A015, A016
describe('Verify guide commands', () => {
  it('uses ana run verify and ana run build', () => {
    const guide = readRepoFile('website/content/docs/guides/verifying-changes.mdx');

    expect(guide).toContain('ana run verify');
    expect(guide).toContain('ana run build');
  });
});

// @ana A017, A018
describe('concept pages are platform-neutral', () => {
  it('removes Claude-only sessions and points custom skills to .ana/skills', () => {
    const pipeline = readRepoFile('website/content/docs/concepts/pipeline.mdx');
    const skills = readRepoFile('website/content/docs/concepts/skills.mdx');

    expect(pipeline).not.toContain('separate Claude Code session');
    expect(skills).toContain('.ana/skills/');
  });
});

// @ana A019, A020, A021, A022, A023, A024, A025, A026
describe('Platform setup guide', () => {
  it('exists in nav and documents platform selection, init, flags, and Codex manifests', () => {
    const guidePath = join(repoRoot, 'website/content/docs/guides/platform-setup.mdx');
    const meta = readRepoFile('website/content/docs/guides/meta.json');
    const guide = readFileSync(guidePath, 'utf-8');

    expect(existsSync(guidePath)).toBe(true);
    expect(meta).toContain('"using-ana-setup", "platform-setup", "verifying-changes"');
    expect(guide).toContain('ana run build --platform codex');
    expect(guide).toContain('ANA_PLATFORM');
    expect(guide).toContain('ana init --platforms');
    expect(guide).toContain('platformFlags');
    expect(guide).toContain('.agent.toml');
    expect(guide).toContain('danger-full-access');
  });

  // @ana A021, A022, A023, A024, A025, A026, A028
  it('documents resolution order, switching, manifest fields, and Learn support', () => {
    const guide = readRepoFile('website/content/docs/guides/platform-setup.mdx');

    expect(guide).toContain('Explicit `--platform`');
    expect(guide).toContain('The sole configured platform in `.ana/ana.json`');
    expect(guide).toContain('PATH auto-detection');
    expect(guide).toContain('developer_instructions');
    expect(guide).toContain('sandbox_mode');
    expect(guide).toContain('ana config set platformFlags.claude');
    expect(guide).toContain('To add Codex to a Claude Code project');
    expect(guide).toContain('Both platforms support every pipeline stage');
  });
});

// @ana A027
describe('ForPlatform docs blocks', () => {
  it('has no unpaired Claude Code conditional docs blocks', () => {
    const docsContent = migratedDocs
      .filter((path) => path.startsWith('website/content/docs/'))
      .map((path) => readRepoFile(path))
      .join('\n');
    const claudeBlocks = docsContent.match(/<ForPlatform platform="claude-code">/g) ?? [];
    const codexBlocks = docsContent.match(/<ForPlatform platform="codex">/g) ?? [];

    expect(claudeBlocks).toHaveLength(codexBlocks.length);
  });

  // @ana A027
  it('keeps platform-specific docs in adjacent Claude Code and Codex pairs', () => {
    for (const path of migratedDocs.filter((file) => file.endsWith('.mdx'))) {
      const source = readRepoFile(path);
      const tags = [...source.matchAll(/<ForPlatform platform="(claude-code|codex)">/g)].map((match) => match[1]);

      expect(tags.length % 2, path).toBe(0);
      for (let index = 0; index < tags.length; index += 2) {
        expect(tags.slice(index, index + 2), path).toEqual(['claude-code', 'codex']);
      }
    }
  });
});

// @ana A028, A029, A030
describe('Codex limitations and troubleshooting', () => {
  it('documents Learn limitation and Codex recovery paths', () => {
    const learn = readRepoFile('website/content/docs/guides/using-ana-learn.mdx');
    const troubleshooting = readRepoFile('website/content/docs/guides/troubleshooting.mdx');

    expect(learn).not.toContain('Codex Learn is not yet available');
    expect(troubleshooting).toContain('codex not found');
    expect(troubleshooting).toContain('manifest');
  });
});

// @ana A031, A032
describe('Configurability guide platform paths', () => {
  it('uses canonical custom skill paths and platform-specific custom agents', () => {
    const configurability = readRepoFile('website/content/docs/guides/configurability.mdx');

    expect(configurability).toContain('mkdir -p .ana/skills/billing');
    expect(configurability).toContain('.codex/agents/');
  });
});

// @ana A033, A034, A035
describe('generated docs assets', () => {
  it('include Platform setup and reject stale Claude agent instructions', () => {
    const searchIndex = readWebsiteFile('public/search-index.json');
    const llms = readWebsiteFile('public/llms.txt');
    const llmsFull = readWebsiteFile('public/llms-full.txt');

    expect(searchIndex).toContain('/docs/guides/platform-setup');
    expect(llms).toContain('Platform setup');
    expect(llmsFull).not.toContain('claude --agent');
  });
});
