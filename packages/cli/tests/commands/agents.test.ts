import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { listAgents, getAgentInfoList } from '../../src/commands/agents.js';
import { createTestProject } from '../helpers/test-project.js';
import { Command } from 'commander';

/**
 * Tests for `ana agents` command — dashboard display and model management
 */

/** Helper: create a Commander program with agents command registered */
async function createProgram(): Promise<Command> {
  const { registerAgentsCommand } = await import('../../src/commands/agents.js');
  const program = new Command();
  program.exitOverride();
  registerAgentsCommand(program);
  return program;
}

/** Helper: run a command through Commander, swallowing exit errors */
async function runCommand(program: Command, args: string[]): Promise<void> {
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch (err: unknown) {
    // Commander exitOverride throws on process.exit — ignore these
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'commander.executeSubCommandError') {
      throw err;
    }
    // Swallow other commander errors (exitCode-based)
  }
}

describe('ana agents', () => {
  let tempDir: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agents-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  /**
   * Helper to create .claude/agents directory with agent files
   */
  async function createAgentsDir(files: { name: string; content: string }[]): Promise<void> {
    await createTestProject(tempDir);
    const agentsDir = path.join(tempDir, '.claude/agents');
    await fs.mkdir(agentsDir, { recursive: true });

    for (const file of files) {
      await fs.writeFile(path.join(agentsDir, file.name), file.content, 'utf-8');
    }
  }

  /**
   * Helper to create .claude/skills directory with skill files
   */
  async function createSkillsDir(skills: { name: string; content: string }[]): Promise<void> {
    for (const skill of skills) {
      const skillDir = path.join(tempDir, '.claude/skills', skill.name);
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skill.content, 'utf-8');
    }
  }

  /** Collect all console.log output as a single string */
  function getOutput(): string {
    return logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
  }

  /** Collect all console.error output as a single string */
  function getErrorOutput(): string {
    return errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
  }

  // --- Agent listing tests ---

  describe('list display', () => {
    // @ana A001
    it('displays character count for each agent', async () => {
      await createAgentsDir([
        {
          name: 'ana.md',
          content: `---
name: ana
model: opus
description: "Scoping and navigation"
---

# Ana

Content here`
        },
      ]);

      listAgents();
      const output = getOutput();
      expect(output).toContain('chars');
    });

    // @ana A002
    it('character count includes template plus skill file sizes', async () => {
      await createAgentsDir([
        {
          name: 'test-agent.md',
          content: `---
name: test-agent
model: opus
description: "Test agent"
skills: [my-skill]
---

# Test`
        },
      ]);
      await createSkillsDir([
        { name: 'my-skill', content: 'Skill content that adds to the char count' },
      ]);

      const agentsDir = path.join(tempDir, '.claude/agents');
      const skillsDir = path.join(tempDir, '.claude/skills');
      const agents = getAgentInfoList(agentsDir, skillsDir);

      expect(agents).toHaveLength(1);
      const templateSize = fsSync.statSync(path.join(agentsDir, 'test-agent.md')).size;
      expect(agents[0]!.charCount).toBeGreaterThan(templateSize);
      expect(agents[0]!.charCount).toBeGreaterThan(0);
    });

    // @ana A016
    it('displays skill count for agents with skills', async () => {
      await createAgentsDir([
        {
          name: 'agent.md',
          content: `---
name: agent
model: opus
description: "Has skills"
skills: [git-workflow, coding-standards]
---

Content`
        },
      ]);

      listAgents();
      const output = getOutput();
      expect(output).toContain('2 skills');
    });

    // @ana A017
    it('displays 0 skills for agents without skills field', async () => {
      await createAgentsDir([
        {
          name: 'agent.md',
          content: `---
name: agent
model: opus
description: "No skills"
---

Content`
        },
      ]);

      listAgents();
      const output = getOutput();
      expect(output).toContain('0 skills');
    });

    it('displays 1 skill (singular) for single skill', async () => {
      await createAgentsDir([
        {
          name: 'agent.md',
          content: `---
name: agent
model: opus
description: "One skill"
skills: [git-workflow]
---

Content`
        },
      ]);

      listAgents();
      const output = getOutput();
      expect(output).toContain('1 skill');
      expect(output).not.toContain('1 skills');
    });

    // @ana A010
    it('uniform model shows single footer line', async () => {
      await createAgentsDir([
        {
          name: 'ana.md',
          content: `---
name: ana
model: opus
description: "Agent 1"
---`
        },
        {
          name: 'ana-plan.md',
          content: `---
name: ana-plan
model: opus
description: "Agent 2"
---`
        },
      ]);

      listAgents();
      const output = getOutput();
      expect(output).toContain('Model:');
      expect(output).toContain('opus');
    });

    // @ana A011
    it('mixed models show per-agent model inline', async () => {
      await createAgentsDir([
        {
          name: 'ana.md',
          content: `---
name: ana
model: opus
description: "Agent 1"
---`
        },
        {
          name: 'ana-build.md',
          content: `---
name: ana-build
model: sonnet
description: "Agent 2"
---`
        },
      ]);

      listAgents();
      const output = getOutput();
      expect(output).toContain('mixed');
    });

    // @ana A012
    it('agents without model field are listed with (default)', async () => {
      await createAgentsDir([
        {
          name: 'agent-a.md',
          content: `---
name: agent-a
description: "No model set"
---

Content`
        },
        {
          name: 'agent-b.md',
          content: `---
name: agent-b
description: "Also no model"
---

Content`
        },
      ]);

      listAgents();
      const output = getOutput();
      expect(output).toContain('agent-a');
      expect(output).toContain('agent-b');

      const agentsDir = path.join(tempDir, '.claude/agents');
      const skillsDir = path.join(tempDir, '.claude/skills');
      const agents = getAgentInfoList(agentsDir, skillsDir);
      expect(agents).toHaveLength(2);
    });

    it('uniform model footer shows (default) when all agents have no model', async () => {
      await createAgentsDir([
        {
          name: 'agent-a.md',
          content: `---
name: agent-a
description: "No model"
---

Content`
        },
        {
          name: 'agent-b.md',
          content: `---
name: agent-b
description: "No model either"
---

Content`
        },
      ]);

      listAgents();
      const output = getOutput();
      expect(output).toContain('Model:');
      expect(output).toContain('(default)');
    });

    it('handles empty agents directory', async () => {
      await createAgentsDir([]);
      listAgents();
      const output = getOutput();
      expect(output).toContain('(none)');
    });

    it('sorts agents alphabetically by filename stem', async () => {
      await createAgentsDir([
        {
          name: 'z-agent.md',
          content: `---
name: zebra
model: sonnet
description: Last agent
---`
        },
        {
          name: 'a-agent.md',
          content: `---
name: aardvark
model: opus
description: First agent
---`
        },
      ]);

      listAgents();
      const output = getOutput();
      const aIdx = output.indexOf('a-agent');
      const zIdx = output.indexOf('z-agent');
      expect(aIdx).toBeLessThan(zIdx);
    });

    it('includes agents without valid frontmatter', async () => {
      await createAgentsDir([
        {
          name: 'valid.md',
          content: `---
name: valid-agent
model: opus
description: Valid agent
---`
        },
        {
          name: 'no-fm.md',
          content: `# No frontmatter

Just content`
        },
      ]);

      listAgents();
      const output = getOutput();
      expect(output).toContain('no-fm');
      expect(output).toContain('valid');
    });
  });

  // --- Model subcommand tests ---

  describe('model read', () => {
    // @ana A003
    it('model subcommand with no args shows all agent models', async () => {
      await createAgentsDir([
        {
          name: 'ana.md',
          content: `---
name: ana
model: opus
description: "Agent 1"
---`
        },
      ]);

      const program = await createProgram();
      await runCommand(program, ['agents', 'model']);

      const output = getOutput();
      expect(output).toContain('Agent models');
    });

    // @ana A004
    it('model read shows (default) for agents without model field', async () => {
      await createAgentsDir([
        {
          name: 'agent.md',
          content: `---
name: agent
description: "No model"
---`
        },
      ]);

      const program = await createProgram();
      await runCommand(program, ['agents', 'model']);

      const output = getOutput();
      expect(output).toContain('(default)');
    });
  });

  describe('model set', () => {
    // @ana A005
    it('model set writes model to agent frontmatter', async () => {
      await createAgentsDir([
        {
          name: 'ana-build.md',
          content: `---
name: ana-build
model: opus
description: "Builder"
---

# Body`
        },
      ]);

      const program = await createProgram();
      await runCommand(program, ['agents', 'model', 'ana-build', 'sonnet']);

      const content = await fs.readFile(path.join(tempDir, '.claude/agents/ana-build.md'), 'utf-8');
      const modelMatch = content.match(/^model:\s*(.+)$/m);
      expect(modelMatch?.[1]).toBe('sonnet');
    });

    // @ana A006
    it('model set preserves other frontmatter fields and body', async () => {
      const body = `

# Body

Some content here

---

## Section after rule`;

      await createAgentsDir([
        {
          name: 'ana-build.md',
          content: `---
name: ana-build
model: opus
description: "Builder"
skills: [git-workflow]
---` + body
        },
      ]);

      const program = await createProgram();
      await runCommand(program, ['agents', 'model', 'ana-build', 'sonnet']);

      const content = await fs.readFile(path.join(tempDir, '.claude/agents/ana-build.md'), 'utf-8');
      expect(content).toContain('name: ana-build');
      expect(content).toContain('description: "Builder"');
      expect(content).toContain('skills: [git-workflow]');
      expect(content).toContain(body);
    });
  });

  describe('model clear', () => {
    // @ana A007
    it('model clear with --default removes model line', async () => {
      await createAgentsDir([
        {
          name: 'ana-build.md',
          content: `---
name: ana-build
model: opus
description: "Builder"
---

# Body`
        },
      ]);

      const program = await createProgram();
      await runCommand(program, ['agents', 'model', 'ana-build', '--default']);

      const content = await fs.readFile(path.join(tempDir, '.claude/agents/ana-build.md'), 'utf-8');
      expect(content).not.toMatch(/^model:/m);
    });

    // @ana A008
    it('model clear prints confirmation message', async () => {
      await createAgentsDir([
        {
          name: 'ana-build.md',
          content: `---
name: ana-build
model: opus
description: "Builder"
---

# Body`
        },
      ]);

      const program = await createProgram();
      await runCommand(program, ['agents', 'model', 'ana-build', '--default']);

      const output = getOutput();
      expect(output).toContain('default');
    });

    // @ana A015
    it('model clear when no model line prints already-default message', async () => {
      await createAgentsDir([
        {
          name: 'ana-build.md',
          content: `---
name: ana-build
description: "Builder"
---

# Body`
        },
      ]);

      const program = await createProgram();
      await runCommand(program, ['agents', 'model', 'ana-build', '--default']);

      const output = getOutput();
      expect(output).toContain('already uses default');
    });
  });

  describe('model --all', () => {
    // @ana A009
    it('model --all writes to every agent file', async () => {
      const agentFiles = [];
      for (let i = 1; i <= 6; i++) {
        agentFiles.push({
          name: `agent-${i}.md`,
          content: `---
name: agent-${i}
model: opus
description: "Agent ${i}"
---

Content`
        });
      }
      await createAgentsDir(agentFiles);

      const program = await createProgram();
      await runCommand(program, ['agents', 'model', '--all', 'sonnet']);

      let updatedCount = 0;
      for (let i = 1; i <= 6; i++) {
        const content = await fs.readFile(path.join(tempDir, `.claude/agents/agent-${i}.md`), 'utf-8');
        if (content.match(/^model:\s*sonnet$/m)) {
          updatedCount++;
        }
      }
      expect(updatedCount).toBe(6);
    });

    // @ana A020
    it('--all skips files with missing frontmatter and warns', async () => {
      await createAgentsDir([
        {
          name: 'valid.md',
          content: `---
name: valid
model: opus
description: "Valid"
---

Content`
        },
        {
          name: 'corrupt.md',
          content: `# No frontmatter at all

Just a plain markdown file`
        },
      ]);

      const program = await createProgram();
      await runCommand(program, ['agents', 'model', '--all', 'sonnet']);

      const errorOutput = getErrorOutput();
      expect(errorOutput).toContain('Warning');
      expect(errorOutput).toContain('skipped');

      const validContent = await fs.readFile(path.join(tempDir, '.claude/agents/valid.md'), 'utf-8');
      expect(validContent).toMatch(/^model:\s*sonnet$/m);
    });

    // @ana A021
    it('--all reports count of updated agents', async () => {
      await createAgentsDir([
        {
          name: 'a.md',
          content: `---
name: a
model: opus
description: "A"
---`
        },
        {
          name: 'b.md',
          content: `---
name: b
model: opus
description: "B"
---`
        },
      ]);

      const program = await createProgram();
      await runCommand(program, ['agents', 'model', '--all', 'sonnet']);

      const output = getOutput();
      expect(output).toContain('2 agents');
    });
  });

  describe('model errors', () => {
    // @ana A013
    it('model set for unknown agent shows available agents', async () => {
      await createAgentsDir([
        {
          name: 'ana.md',
          content: `---
name: ana
model: opus
description: "Ana"
---`
        },
      ]);

      const program = await createProgram();
      await runCommand(program, ['agents', 'model', 'nonexistent', 'sonnet']);

      const errorOutput = getErrorOutput();
      expect(errorOutput).toContain('Unknown agent');
      expect(errorOutput).toContain('ana');
    });

    // @ana A014
    it('model set with model-like agent name suggests --all', async () => {
      await createAgentsDir([
        {
          name: 'ana.md',
          content: `---
name: ana
model: opus
description: "Ana"
---`
        },
      ]);

      const program = await createProgram();
      await runCommand(program, ['agents', 'model', 'sonnet']);

      const errorOutput = getErrorOutput();
      expect(errorOutput).toContain('--all');
    });
  });

  // --- Edge cases ---

  describe('edge cases', () => {
    // @ana A024
    it('list errors when agents directory is missing', async () => {
      await createTestProject(tempDir);
      expect(() => listAgents()).toThrow(/init/);
    });

    it('handles agents with --- horizontal rules in body', async () => {
      await createAgentsDir([
        {
          name: 'agent.md',
          content: `---
name: agent
model: opus
description: "Has body rules"
---

# Title

Some content

---

## Section 2

More content

---

### Section 3`
        },
      ]);

      listAgents();
      const output = getOutput();
      expect(output).toContain('agent');
      expect(output).toContain('chars');
    });

    it('strips quotes from description in display', async () => {
      await createAgentsDir([
        {
          name: 'agent.md',
          content: `---
name: agent
model: opus
description: "Quoted description"
---`
        },
      ]);

      listAgents();
      const output = getOutput();
      expect(output).toContain('Quoted description');
      expect(output).not.toContain('"Quoted');
    });
  });
});
