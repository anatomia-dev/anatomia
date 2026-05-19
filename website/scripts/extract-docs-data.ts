/**
 * Docs data extraction script.
 *
 * Reads 7 data sources from the monorepo, writes 7 JSON files to
 * website/data/docs/, and exits non-zero on any failure so next build
 * never runs against stale or missing data.
 *
 * Usage: npx tsx scripts/extract-docs-data.ts
 * Wired as: "prebuild": "tsx scripts/extract-docs-data.ts" in package.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

import type {
  ProofEntry,
  ProofAssertion,
  ProofFinding,
  AgentTemplate,
  SkillTemplate,
  CommandGroup,
  CommandsData,
  CommandOption,
  CommandArgument,
  Command,
  GotchaEntry,
  ContextFile,
  BuildMeta,
} from '../lib/docs-data/types';
import { stripJsx } from '../lib/docs-data/stripJsx';

import { buildDocsStatValues, resolveDocsStatTags } from '../lib/docs-data/docsStatValues.js';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const WEBSITE_DIR = path.resolve(__dirname, '..');
const MONOREPO_ROOT = path.resolve(WEBSITE_DIR, '..');
const CLI_PKG = path.join(MONOREPO_ROOT, 'packages', 'cli');
const OUTPUT_DIR = path.join(WEBSITE_DIR, 'data', 'docs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeJSON(filename: string, data: unknown): void {
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`  ✓ ${filename}`);
}

function parseFrontmatter(content: string): { frontmatter: Record<string, string | string[] | null>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatter: Record<string, string | string[] | null> = {};
  for (const line of match[1].split('\n')) {
    const kvMatch = line.match(/^(\w+):\s*(.+)$/);
    if (!kvMatch) continue;
    const [, key, rawValue] = kvMatch;
    let value: string | string[] | null = rawValue;

    // Handle YAML array syntax: [item1, item2]
    const arrayMatch = rawValue.match(/^\[(.+)\]$/);
    if (arrayMatch) {
      value = arrayMatch[1].split(',').map(s => s.trim());
    } else {
      // Strip surrounding quotes
      value = rawValue.replace(/^"(.*)"$/, '$1');
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body: match[2] };
}

// ---------------------------------------------------------------------------
// 1. Proof chain extraction
// ---------------------------------------------------------------------------

function categorizeEntry(entry: { modules_touched?: string[]; scope_summary?: string }): string {
  const modules = entry.modules_touched;
  if (modules && modules.length > 0) {
    const prefixMap: [string, string][] = [
      ['src/engine/', 'Engine'],
      ['src/commands/', 'Commands'],
      ['src/utils/', 'Utils'],
      ['src/data/', 'Utils'],
      ['templates/', 'Templates'],
      ['website/', 'Website'],
      ['.ana/', 'Pipeline'],
      ['.claude/', 'Pipeline'],
    ];

    // Find the dominant category
    const categoryCounts: Record<string, number> = {};
    for (const mod of modules) {
      for (const [prefix, category] of prefixMap) {
        if (mod.includes(prefix)) {
          categoryCounts[category] = (categoryCounts[category] || 0) + 1;
          break;
        }
      }
    }

    const categories = Object.entries(categoryCounts);
    if (categories.length > 0) {
      categories.sort((a, b) => b[1] - a[1]);
      return categories[0][0];
    }
  }

  // Keyword fallback on scope_summary
  const summary = (entry.scope_summary || '').toLowerCase();
  if (summary.match(/\b(?:scan|detect)\b/)) return 'Engine';
  if (summary.match(/\b(?:command|cli)\b/)) return 'Commands';
  if (summary.match(/\b(?:proof|verify|pipeline)\b/)) return 'Pipeline';
  if (summary.match(/\b(?:template)\b/)) return 'Templates';
  if (summary.match(/\b(?:website|docs)\b/)) return 'Website';

  return 'Infra';
}

function extractProofEntries(): ProofEntry[] {
  const chainPath = path.join(MONOREPO_ROOT, '.ana', 'proof_chain.json');
  const raw = JSON.parse(fs.readFileSync(chainPath, 'utf-8'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- proof chain entries have dynamic shape
  const entries: Record<string, any>[] = raw.entries;

  const mapped = entries.map((entry) => {
    // Normalize assertions
    const assertions: ProofAssertion[] = (entry.assertions || []).map((a: Record<string, unknown>) => ({
      id: a.id as string,
      says: a.says as string,
      status: a.status as string,
    }));

    // Normalize findings — default severity to "observation"
    const findings: ProofFinding[] = (entry.findings || []).map((f: Record<string, unknown>) => ({
      id: f.id as string | undefined,
      category: f.category as string | undefined,
      summary: f.summary as string,
      file: f.file as string | undefined,
      severity: (f.severity as string) || 'observation',
      suggestedAction: f.suggested_action as string | undefined,
      status: f.status as string | undefined,
    }));

    // Normalize timing — default missing stages to 0
    const rawTiming = entry.timing || {};
    const stageThink = rawTiming.think ?? 0;
    const stagePlan = rawTiming.plan ?? 0;
    const stageBuild = rawTiming.build ?? 0;
    const stageVerify = rawTiming.verify ?? 0;
    const rawTotal = rawTiming.total_minutes ?? 0;
    // If total_minutes is 0 but stages have data, compute from stages
    const computedTotal = stageThink + stagePlan + stageBuild + stageVerify;
    const rawSegments = rawTiming.segments as Array<{ stage: string; minutes: number; phase?: number }> | undefined;
    const timing: import('../lib/docs-data/types.js').ProofTiming = {
      think: stageThink,
      plan: stagePlan,
      build: stageBuild,
      verify: stageVerify,
      totalMinutes: rawTotal > 0 ? rawTotal : computedTotal,
      ...(rawSegments ? { segments: rawSegments } : {}),
    };

    // Normalize contract — only 3 common fields
    const contract = {
      total: entry.contract?.total ?? 0,
      satisfied: entry.contract?.satisfied ?? 0,
      unsatisfied: entry.contract?.unsatisfied ?? 0,
    };

    // Pre-compute finding severity counts
    const findingSeverity = { risk: 0, debt: 0, observation: 0 };
    for (const f of findings) {
      if (f.severity === 'risk') findingSeverity.risk++;
      else if (f.severity === 'debt') findingSeverity.debt++;
      else findingSeverity.observation++;
    }

    return {
      slug: entry.slug,
      feature: entry.feature,
      result: entry.result,
      stage: categorizeEntry(entry),
      contract,
      assertionCount: entry.contract?.total ?? 0,
      findingCount: findings.length,
      rejectionCycles: entry.rejection_cycles ?? 0,
      completedAt: entry.completed_at || '',
      scopeSummary: entry.scope_summary || null,
      modulesTouched: entry.modules_touched || [],
      assertions,
      findings,
      timing,
      ...(entry.phases ? { phases: entry.phases as number } : {}),
      hashes: entry.hashes || {},
      findingSeverity,
      duration: timing.totalMinutes,
      prevSlug: null as string | null,
      nextSlug: null as string | null,
    };
  });

  // Pre-compute adjacent slugs (chronological order = array order)
  for (let i = 0; i < mapped.length; i++) {
    mapped[i].prevSlug = i > 0 ? mapped[i - 1].slug : null;
    mapped[i].nextSlug = i < mapped.length - 1 ? mapped[i + 1].slug : null;
  }

  return mapped;
}

// ---------------------------------------------------------------------------
// 2. CLI commands extraction
// ---------------------------------------------------------------------------

function extractDetailsFromBlock(block: string): { description: string; arguments: CommandArgument[]; options: CommandOption[] } {
  const descMatch = block.match(/\.description\(\s*['"`]([\s\S]*?)['"`]\s*\)/);
  const description = descMatch ? descMatch[1].replace(/\n\s*/g, ' ') : '';

  const args: CommandArgument[] = [];
  const argRegex = /\.argument\(\s*['"]([<\[][^>\]]+[>\]])['"]\s*,\s*['"]([^'"]*)['"]/g;
  let argMatch;
  while ((argMatch = argRegex.exec(block)) !== null) {
    const raw = argMatch[1];
    const required = raw.startsWith('<');
    const name = raw.replace(/[<>\[\]]/g, '').replace(/\.{3}$/, '');
    args.push({ name, description: argMatch[2], required });
  }

  const options: CommandOption[] = [];
  const optRegex = /\.option\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/g;
  let optMatch;
  while ((optMatch = optRegex.exec(block)) !== null) {
    options.push({ flags: optMatch[1], description: optMatch[2] });
  }

  return { description, arguments: args, options };
}

function buildCommandTree(filePath: string): Command[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileDir = path.dirname(filePath);
  const commands: Map<string, Command> = new Map();
  const varToName: Map<string, string> = new Map();

  // First pass: find all `const X = new Command('name')` declarations
  const declRegex = /const\s+(\w+)\s*=\s*new Command\(['"]([^'"]+)['"]\)/g;
  let declMatch;
  while ((declMatch = declRegex.exec(content)) !== null) {
    varToName.set(declMatch[1], declMatch[2]);
  }

  // Also handle `return new Command('name')` (used in check.ts, symbol-index.ts)
  const returnDeclRegex = /return new Command\(['"]([^'"]+)['"]\)/g;
  let returnMatch;
  while ((returnMatch = returnDeclRegex.exec(content)) !== null) {
    // These are standalone — treat as top-level
    varToName.set(`__return_${returnMatch[1]}`, returnMatch[1]);
  }

  // Second pass: extract each command's chain details
  const lines = content.split('\n');
  for (const [varName, cmdName] of varToName) {
    // Find the line where this command is declared
    let startLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (varName.startsWith('__return_')) {
        if (lines[i].includes(`return new Command('${cmdName}')`) || lines[i].includes(`return new Command("${cmdName}")`)) {
          startLine = i;
          break;
        }
      } else if (lines[i].includes(`const ${varName}`) && lines[i].includes('new Command')) {
        startLine = i;
        break;
      }
    }
    if (startLine === -1) continue;

    // Collect the chain until .action( or next const ... = new Command or semicolon
    let block = '';
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      if (i > startLine && line.match(/\.action\s*\(/)) break;
      if (i > startLine && line.match(/^\s*const\s+\w+\s*=\s*new Command/)) break;
      // Stop at addCommand or standalone method calls on a different variable
      if (i > startLine && line.match(/^\s*\w+Command\.addCommand/)) break;
      if (i > startLine && line.match(/^\s*\w+Command\s*$/) && i + 1 < lines.length && lines[i + 1].match(/^\s*\.command\(/)) break;
      block += line + '\n';
      // If the line ends with semicolon and we have content, stop
      if (i > startLine && line.match(/;\s*$/)) break;
    }

    const details = extractDetailsFromBlock(block);
    commands.set(cmdName, {
      name: cmdName,
      ...details,
      subcommands: [],
    });
  }

  // Third pass: handle `.command('name')` chain pattern (multiline)
  // e.g., verifyCommand\n    .command('pre-check')\n    .description('...')
  // Collapse whitespace to match multiline chains
  const collapsed = content.replace(/\n\s*/g, ' ');
  const chainRegex = /(\w+)\s*\.command\(\s*['"]([^'"]+)['"]\)/g;
  let chainMatch;
  while ((chainMatch = chainRegex.exec(collapsed)) !== null) {
    const parentVar = chainMatch[1];
    const childName = chainMatch[2];
    const parentName = varToName.get(parentVar);
    if (!parentName) continue;

    // Extract the chain from the match point to the next .action(
    const rest = collapsed.substring(chainMatch.index);
    const actionIdx = rest.indexOf('.action(');
    const chainBlock = actionIdx !== -1 ? rest.substring(0, actionIdx) : rest.substring(0, 300);

    const details = extractDetailsFromBlock(chainBlock);
    const childCmd: Command = { name: childName, ...details, subcommands: [] };

    const parent = commands.get(parentName);
    if (parent) {
      if (!parent.subcommands.find(s => s.name === childName)) {
        parent.subcommands.push(childCmd);
      }
    }
  }

  // Fourth pass: wire addCommand relationships for same-file commands
  const addCommandVarRegex = /(\w+)\.addCommand\((\w+)\b/g;
  let addMatch;
  while ((addMatch = addCommandVarRegex.exec(content)) !== null) {
    const parentVar = addMatch[1];
    const childVar = addMatch[2];
    if (parentVar === 'program') continue;

    const parentName = varToName.get(parentVar);
    const childName = varToName.get(childVar);
    if (!parentName || !childName) continue;

    const parent = commands.get(parentName);
    const child = commands.get(childName);
    if (parent && child && !parent.subcommands.find(s => s.name === child.name)) {
      parent.subcommands.push(child);
    }
  }

  // Fifth pass: handle cross-file addCommand with function calls
  // e.g., setupCommand.addCommand(createCheckCommand())
  const addCommandFuncRegex = /(\w+)\.addCommand\(\s*(create\w+)\(\)/g;
  let funcMatch;
  while ((funcMatch = addCommandFuncRegex.exec(content)) !== null) {
    const parentVar = funcMatch[1];
    const funcName = funcMatch[2];
    if (parentVar === 'program') continue;

    const parentName = varToName.get(parentVar);
    if (!parentName) continue;

    // Find the import for this function
    const importRegex = new RegExp(`import\\s*\\{[^}]*\\b${funcName}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"']`);
    const importMatch = content.match(importRegex);
    if (!importMatch) continue;

    // Resolve the import path to a .ts file
    let importPath = importMatch[1];
    if (importPath.endsWith('.js')) {
      importPath = importPath.replace(/\.js$/, '.ts');
    }
    const resolvedPath = path.resolve(fileDir, importPath);

    if (fs.existsSync(resolvedPath)) {
      // Parse the imported file for `return new Command(...)` pattern
      const importedContent = fs.readFileSync(resolvedPath, 'utf-8');
      const returnCmdMatch = importedContent.match(/return new Command\(['"]([^'"]+)['"]\)/);
      if (returnCmdMatch) {
        const childName = returnCmdMatch[1];
        // Extract the chain from the return statement
        const importedLines = importedContent.split('\n');
        const returnLine = importedLines.findIndex(l => l.includes(`return new Command('${childName}')`) || l.includes(`return new Command("${childName}")`));
        if (returnLine !== -1) {
          let block = '';
          for (let i = returnLine; i < importedLines.length; i++) {
            const line = importedLines[i];
            if (i > returnLine && line.match(/\.action\s*\(/)) break;
            block += line + '\n';
            if (i > returnLine && line.match(/;\s*$/)) break;
          }
          const details = extractDetailsFromBlock(block);
          const childCmd: Command = { name: childName, ...details, subcommands: [] };

          const parent = commands.get(parentName);
          if (parent && !parent.subcommands.find(s => s.name === childName)) {
            parent.subcommands.push(childCmd);
          }
        }
      }
    }
  }

  // Return only top-level commands (those added to program, not nested)
  const childNames = new Set<string>();
  for (const cmd of commands.values()) {
    for (const sub of cmd.subcommands) {
      childNames.add(sub.name);
    }
  }

  return Array.from(commands.values()).filter(cmd => !childNames.has(cmd.name));
}

function extractCommands(): CommandsData {
  // Read index.ts to get group structure
  const indexPath = path.join(CLI_PKG, 'src', 'index.ts');
  const indexContent = fs.readFileSync(indexPath, 'utf-8');

  // Extract group names and their command registrations
  const groups: CommandGroup[] = [];
  const groupRegex = /program\.commandsGroup\(['"]([^'"]+)['"]\);/g;
  let groupMatch;
  const groupPositions: { name: string; pos: number }[] = [];

  while ((groupMatch = groupRegex.exec(indexContent)) !== null) {
    // Commander uses UPPERCASE for help display; convert to title case for docs
    const titleCase = groupMatch[1].toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    groupPositions.push({ name: titleCase, pos: groupMatch.index });
  }

  // Find register calls and their positions
  const registerRegex = /register(\w+)Command\(program\);/g;
  let regMatch;
  const registrations: { funcName: string; pos: number }[] = [];

  while ((regMatch = registerRegex.exec(indexContent)) !== null) {
    registrations.push({ funcName: regMatch[1], pos: regMatch.index });
  }

  // Map function names to file paths
  const funcToFile: Record<string, string> = {
    Scan: 'src/commands/scan.ts',
    Init: 'src/commands/init/index.ts',
    Setup: 'src/commands/setup.ts',
    Work: 'src/commands/work.ts',
    Artifact: 'src/commands/artifact.ts',
    Verify: 'src/commands/verify.ts',
    Pr: 'src/commands/pr.ts',
    Config: 'src/commands/config.ts',
    Proof: 'src/commands/proof.ts',
    Agents: 'src/commands/agents.ts',
    Doctor: 'src/commands/doctor.ts',
  };

  // Assign registrations to groups
  for (let gi = 0; gi < groupPositions.length; gi++) {
    const group = groupPositions[gi];
    const nextGroupPos = gi + 1 < groupPositions.length ? groupPositions[gi + 1].pos : Infinity;

    const groupCommands: Command[] = [];
    for (const reg of registrations) {
      if (reg.pos > group.pos && reg.pos < nextGroupPos) {
        const filePath = funcToFile[reg.funcName];
        if (filePath) {
          const fullPath = path.join(CLI_PKG, filePath);
          const cmds = buildCommandTree(fullPath);
          groupCommands.push(...cmds);
        }
      }
    }

    groups.push({ name: group.name, commands: groupCommands });
  }

  // Count total commands (including subcommands)
  let totalCommands = 0;
  function countCommands(cmds: Command[]): void {
    for (const cmd of cmds) {
      totalCommands++;
      countCommands(cmd.subcommands);
    }
  }
  for (const group of groups) {
    countCommands(group.commands);
  }

  return { groups, totalCommands };
}

// ---------------------------------------------------------------------------
// 3. Agent templates extraction
// ---------------------------------------------------------------------------

const AGENT_DISPLAY: Record<string, { role: string; displayDescription: string }> = {
  ana: { role: 'Think agent', displayDescription: 'Scoper, navigator, advisor. Understands intent, bounds scope, identifies tradeoffs.' },
  'ana-plan': { role: 'Plan agent', displayDescription: 'Architect. Reads scope, writes spec + sealed contract.' },
  'ana-build': { role: 'Build agent', displayDescription: 'Builder. Implements spec, writes tests tagged to contract, produces build report.' },
  'ana-verify': { role: 'Verify agent', displayDescription: 'Fault-finder. Independent verification against the sealed contract. Never reads the build report.' },
  'ana-learn': { role: 'Learn agent', displayDescription: 'Quality gardener. Tends the proof chain between cycles. Promotes findings to skill rules.' },
  'ana-setup': { role: 'Setup orchestrator', displayDescription: 'Calibrates project knowledge during init. Guess-and-confirm pattern.' },
};

const AGENT_READS_WRITES: Record<string, { reads: string[]; writes: string[] }> = {
  ana: { reads: ['codebase', '.ana/context/*', '.ana/scan.json'], writes: ['scope.md'] },
  'ana-plan': { reads: ['scope.md', 'codebase'], writes: ['plan.md', 'spec.md', 'contract.yaml'] },
  'ana-build': { reads: ['spec.md', 'contract.yaml'], writes: ['code', 'tests', 'build_report.md'] },
  'ana-verify': { reads: ['spec.md', 'contract.yaml', 'code', 'tests'], writes: ['verify_report.md'] },
  'ana-learn': { reads: ['proof_chain.json', 'skills', 'codebase'], writes: ['skill rules', 'finding closures'] },
  'ana-setup': { reads: ['scan.json', 'codebase'], writes: ['project-context.md', 'design-principles.md'] },
};

function extractForbidden(body: string): string[] {
  const forbidden: string[] = [];
  const sectionMatch = body.match(/## What You Do NOT Do\s*\n([\s\S]*?)(?=\n---|\n## |$)/);
  if (!sectionMatch) return forbidden;

  const lines = sectionMatch[1].split('\n');
  for (const line of lines) {
    const bulletMatch = line.match(/^-\s+\*\*(.+?)\*\*/);
    if (bulletMatch) {
      // Strip trailing punctuation artifacts
      forbidden.push(bulletMatch[1].replace(/\*+$/, '').trim());
    }
  }

  return forbidden;
}

function extractAgentTemplates(): AgentTemplate[] {
  const agentsDir = path.join(CLI_PKG, 'templates', '.claude', 'agents');
  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md')).sort();

  return files.map(file => {
    const content = fs.readFileSync(path.join(agentsDir, file), 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);
    const name = (frontmatter.name as string) || file.replace('.md', '');
    const readsWrites = AGENT_READS_WRITES[name] || { reads: [], writes: [] };
    const display = AGENT_DISPLAY[name] || { role: '', displayDescription: '' };

    // Parse skills — could be array or null
    let skills: string[] | null = null;
    if (frontmatter.skills) {
      skills = Array.isArray(frontmatter.skills) ? frontmatter.skills : [frontmatter.skills as string];
    }

    return {
      name,
      model: (frontmatter.model as string) || '',
      description: (frontmatter.description as string) || '',
      skills,
      memory: (frontmatter.memory as string) || null,
      initialPrompt: (frontmatter.initialPrompt as string) || null,
      reads: readsWrites.reads,
      writes: readsWrites.writes,
      forbidden: extractForbidden(body),
      bodyMarkdown: body.trim(),
      role: display.role,
      displayDescription: display.displayDescription,
    };
  });
}

// ---------------------------------------------------------------------------
// 4. Skill templates extraction
// ---------------------------------------------------------------------------

function extractSkillTemplates(): SkillTemplate[] {
  const skillsDir = path.join(CLI_PKG, 'templates', '.claude', 'skills');
  const skillDirs = fs.readdirSync(skillsDir).filter(d => {
    const skillFile = path.join(skillsDir, d, 'SKILL.md');
    return fs.existsSync(skillFile);
  }).sort();

  return skillDirs.map(dir => {
    const content = fs.readFileSync(path.join(skillsDir, dir, 'SKILL.md'), 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    // Parse sections: find ## headings and their content
    const sections: { heading: string; content: string }[] = [];
    const sectionRegex = /^## (.+)$/gm;
    let match;
    const sectionPositions: { heading: string; start: number }[] = [];

    while ((match = sectionRegex.exec(body)) !== null) {
      sectionPositions.push({ heading: match[1], start: match.index + match[0].length });
    }

    for (let i = 0; i < sectionPositions.length; i++) {
      const start = sectionPositions[i].start;
      const end = i + 1 < sectionPositions.length
        ? body.lastIndexOf('\n## ', sectionPositions[i + 1].start)
        : body.length;
      const sectionContent = body.substring(start, end).trim();
      sections.push({ heading: sectionPositions[i].heading, content: sectionContent });
    }

    // Count rules: bullet items in the ## Rules section
    const rulesSection = sections.find(s => s.heading === 'Rules');
    const rulesCount = rulesSection
      ? (rulesSection.content.match(/^- /gm) || []).length
      : 0;

    // Conditional skills: api-patterns, data-access, ai-patterns
    const CONDITIONAL_SKILLS = ['api-patterns', 'data-access', 'ai-patterns'];
    const skillName = (frontmatter.name as string) || dir;
    const isConditional = CONDITIONAL_SKILLS.includes(skillName);

    return {
      name: skillName,
      description: (frontmatter.description as string) || '',
      sections,
      conditional: isConditional,
      rules: rulesCount,
      content: body,
    };
  });
}

// ---------------------------------------------------------------------------
// 5. Gotchas extraction
// ---------------------------------------------------------------------------

async function extractGotchas(): Promise<GotchaEntry[]> {
  // Import gotchas.ts directly — it's a pure data file with zero external dependencies.
  // We're running under tsx, so .ts imports work.
  const gotchasModule = await import(path.join(CLI_PKG, 'src', 'data', 'gotchas.ts'));
  return gotchasModule.GOTCHAS;
}

// ---------------------------------------------------------------------------
// 6. Context files extraction
// ---------------------------------------------------------------------------

const CONTEXT_FILE_DEFS: { filename: string; dir: string; path: string; description: string }[] = [
  {
    filename: 'project-context.md',
    dir: 'context',
    path: '.ana/context/project-context.md',
    description: 'Product purpose, architecture, domain vocabulary, where to make changes. The file that makes agents understand THIS project.',
  },
  {
    filename: 'design-principles.md',
    dir: 'context',
    path: '.ana/context/design-principles.md',
    description: 'How your team defines "good." Each principle shapes scoping and design decisions. If a principle wouldn\'t change a decision, it doesn\'t belong here.',
  },
  {
    filename: 'ana.json',
    dir: '',
    path: '.ana/ana.json',
    description: 'CLI configuration. Build, test, and lint commands, co-author trailer, artifact branch. Some fields are yours to edit; others are managed by the CLI.',
  },
  {
    filename: 'scan.json',
    dir: '',
    path: '.ana/scan.json',
    description: 'Machine-detected project data. Stack, file counts, patterns, conventions. Regenerated on every ana scan. Don\'t edit manually.',
  },
];

function extractContextFiles(): ContextFile[] {
  const anaDir = path.join(MONOREPO_ROOT, '.ana');

  return CONTEXT_FILE_DEFS.map(def => {
    const fullPath = def.dir
      ? path.join(anaDir, def.dir, def.filename)
      : path.join(anaDir, def.filename);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const name = def.filename.replace(/\.(md|json)$/, '');
    return {
      name,
      filename: def.filename,
      path: def.path,
      description: def.description,
      content,
    };
  });
}

// ---------------------------------------------------------------------------
// 7. Build meta extraction
// ---------------------------------------------------------------------------

function extractBuildMeta(): BuildMeta {
  const cliPkg = JSON.parse(fs.readFileSync(path.join(CLI_PKG, 'package.json'), 'utf-8'));
  const version = cliPkg.version;

  let commitSha = process.env.VERCEL_GIT_COMMIT_SHA || '';
  if (!commitSha) {
    try {
      commitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    } catch {
      commitSha = 'unknown';
    }
  }

  return {
    version,
    commitSha,
    buildTimestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 8. Search index generation
// ---------------------------------------------------------------------------

interface SearchIndexEntry {
  type: string;
  title: string;
  description: string;
  route: string;
}

function generateSearchIndex(
  proofEntries: ProofEntry[],
  commandsData: CommandsData,
  agentTemplates: AgentTemplate[],
  skillTemplates: SkillTemplate[],
): SearchIndexEntry[] {
  const entries: SearchIndexEntry[] = [];

  // MDX pages — read frontmatter from content/docs/
  const contentDir = path.join(WEBSITE_DIR, 'content', 'docs');
  function scanMdxDir(dir: string, routePrefix: string): void {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanMdxDir(fullPath, `${routePrefix}${item}/`);
      } else if (item.endsWith('.mdx') && item !== 'meta.json') {
        const mdxContent = fs.readFileSync(fullPath, 'utf-8');
        const { frontmatter } = parseFrontmatter(mdxContent);
        const slug = item.replace('.mdx', '');
        const route = `/docs/${routePrefix}${slug}`;
        entries.push({
          type: 'page',
          title: (frontmatter.title as string) || slug,
          description: (frontmatter.description as string) || '',
          route,
        });
      }
    }
  }
  scanMdxDir(contentDir, '');

  // Static pages not from MDX
  entries.push(
    { type: 'page', title: 'Proof Chain Explorer', description: 'Browse all verified pipeline runs — filter by stage, findings, rejection cycles', route: '/docs/proof' },
    { type: 'page', title: 'CLI Commands', description: 'Every command in the ana CLI, grouped by category', route: '/docs/reference/cli' },
    { type: 'page', title: 'Agent Templates', description: 'The 6 agent definitions that ship on ana init', route: '/docs/reference/agents' },
    { type: 'page', title: 'Skill Files', description: 'All 8 skill templates — core and conditional', route: '/docs/reference/skills' },
    { type: 'page', title: 'Context Files', description: 'The files in .ana/ that give agents project-specific knowledge', route: '/docs/reference/context' },
  );

  // Commands — flatten all groups
  for (const group of commandsData.groups) {
    function addCommands(cmds: Command[], prefix: string): void {
      for (const cmd of cmds) {
        entries.push({
          type: 'command',
          title: `ana ${prefix}${cmd.name}`,
          description: cmd.description,
          route: `/docs/reference/cli#${group.name.toLowerCase().replace(/\s+/g, '-')}`,
        });
        addCommands(cmd.subcommands, `${prefix}${cmd.name} `);
      }
    }
    addCommands(group.commands, '');
  }

  // Proof entries
  for (const entry of proofEntries) {
    entries.push({
      type: 'proof',
      title: `${entry.slug} — ${entry.feature}`,
      description: entry.scopeSummary || `${entry.assertionCount} assertions · ${entry.findingCount} findings`,
      route: `/docs/proof/${entry.slug}`,
    });
  }

  // Agent templates
  for (const agent of agentTemplates) {
    entries.push({
      type: 'agent',
      title: agent.name,
      description: agent.displayDescription || agent.description,
      route: `/docs/reference/agents/${agent.name}`,
    });
  }

  // Skill templates
  for (const skill of skillTemplates) {
    entries.push({
      type: 'skill',
      title: skill.name,
      description: skill.description,
      route: `/docs/reference/skills/${skill.name}`,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// 9. llms.txt generation
// ---------------------------------------------------------------------------

function generateLlmsTxt(
  searchIndex: SearchIndexEntry[],
  docsStatValues: Record<string, string>,
): { llmsTxt: string; llmsFullTxt: string } {
  // Read project description from project-context.md
  const contextPath = path.join(MONOREPO_ROOT, '.ana', 'context', 'project-context.md');
  let projectDescription = '';
  if (fs.existsSync(contextPath)) {
    const contextContent = fs.readFileSync(contextPath, 'utf-8');
    // First meaningful paragraph after the frontmatter
    const lines = contextContent.split('\n');
    for (const line of lines) {
      if (line.startsWith('Anatomia is')) {
        projectDescription = line.trim();
        break;
      }
    }
  }

  const baseUrl = 'https://anatomia.dev';
  const pages = searchIndex.filter(e => e.type === 'page');

  // Group pages by section
  const concepts = pages.filter(p => p.route.includes('/concepts/'));
  const guides = pages.filter(p => p.route.includes('/guides/'));
  const startPage = pages.filter(p => p.route === '/docs/start');

  // Build llms.txt
  const llmsLines: string[] = [
    '# Anatomia',
    '',
    `> ${projectDescription}`,
    '',
  ];

  if (startPage.length > 0) {
    llmsLines.push('## Get Started', '');
    for (const p of startPage) {
      llmsLines.push(`- [${p.title}](${baseUrl}${p.route}): ${p.description}`);
    }
    llmsLines.push('');
  }

  if (concepts.length > 0) {
    llmsLines.push('## Concepts', '');
    for (const p of concepts) {
      llmsLines.push(`- [${p.title}](${baseUrl}${p.route}): ${p.description}`);
    }
    llmsLines.push('');
  }

  if (guides.length > 0) {
    llmsLines.push('## Guides', '');
    for (const p of guides) {
      llmsLines.push(`- [${p.title}](${baseUrl}${p.route}): ${p.description}`);
    }
    llmsLines.push('');
  }

  llmsLines.push('## Reference', '');
  llmsLines.push(`- [CLI Commands](${baseUrl}/docs/reference/cli): Every command grouped by category`);
  llmsLines.push(`- [Agent Templates](${baseUrl}/docs/reference/agents): The 6 agent definitions`);
  llmsLines.push(`- [Skill Files](${baseUrl}/docs/reference/skills): Core and conditional skill templates`);
  llmsLines.push(`- [Context Files](${baseUrl}/docs/reference/context): .ana/ project knowledge files`);
  llmsLines.push('');

  llmsLines.push('## Proof Chain', '');
  llmsLines.push(`- [Browse All Proofs](${baseUrl}/docs/proof): Verified pipeline runs`);
  llmsLines.push('');

  const llmsTxt = llmsLines.join('\n');

  // Build llms-full.txt — concatenate all MDX content with JSX stripped
  const contentDir = path.join(WEBSITE_DIR, 'content', 'docs');
  const fullLines: string[] = [
    '# Anatomia — Full Documentation',
    '',
    `> ${projectDescription}`,
    '',
  ];

  function concatMdx(dir: string): void {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir).sort();
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        concatMdx(fullPath);
      } else if (item.endsWith('.mdx')) {
        const mdxContent = fs.readFileSync(fullPath, 'utf-8');
        const { frontmatter, body } = parseFrontmatter(mdxContent);
        const title = (frontmatter.title as string) || item.replace('.mdx', '');
        fullLines.push('---', '', `## ${title}`, '');
        if (frontmatter.description) {
          fullLines.push(`> ${frontmatter.description}`, '');
        }
        fullLines.push(stripJsx(resolveDocsStatTags(body, docsStatValues)), '');
      }
    }
  }
  concatMdx(contentDir);

  const llmsFullTxt = fullLines.join('\n');

  return { llmsTxt, llmsFullTxt };
}

// ---------------------------------------------------------------------------
// 10. Internal link validation
// ---------------------------------------------------------------------------

function validateInternalLinks(
  proofEntries: ProofEntry[],
  commandsData: CommandsData,
  agentTemplates: AgentTemplate[],
  skillTemplates: SkillTemplate[],
): string[] {
  // Build set of known routes
  const knownRoutes = new Set<string>();

  // Static routes
  knownRoutes.add('/docs');
  knownRoutes.add('/docs/proof');
  knownRoutes.add('/docs/reference/cli');
  knownRoutes.add('/docs/reference/agents');
  knownRoutes.add('/docs/reference/skills');
  knownRoutes.add('/docs/reference/context');

  // MDX page routes
  const contentDir = path.join(WEBSITE_DIR, 'content', 'docs');
  function addMdxRoutes(dir: string, prefix: string): void {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, item);
      if (fs.statSync(fullPath).isDirectory()) {
        addMdxRoutes(fullPath, `${prefix}${item}/`);
      } else if (item.endsWith('.mdx')) {
        knownRoutes.add(`/docs/${prefix}${item.replace('.mdx', '')}`);
      }
    }
  }
  addMdxRoutes(contentDir, '');

  // Proof slugs
  for (const entry of proofEntries) {
    knownRoutes.add(`/docs/proof/${entry.slug}`);
  }

  // Agent names
  for (const agent of agentTemplates) {
    knownRoutes.add(`/docs/reference/agents/${agent.name}`);
  }

  // Skill names
  for (const skill of skillTemplates) {
    knownRoutes.add(`/docs/reference/skills/${skill.name}`);
  }

  // Scan all MDX files for internal links
  const brokenLinks: string[] = [];
  const hrefRegex = /href="(\/docs\/[^"#]*)/g;

  function scanDir(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, item);
      if (fs.statSync(fullPath).isDirectory()) {
        scanDir(fullPath);
      } else if (item.endsWith('.mdx')) {
        const mdxContent = fs.readFileSync(fullPath, 'utf-8');
        let match;
        while ((match = hrefRegex.exec(mdxContent)) !== null) {
          const href = match[1];
          if (!knownRoutes.has(href)) {
            const relPath = path.relative(contentDir, fullPath);
            brokenLinks.push(`${relPath}: href="${href}" not found`);
          }
        }
      }
    }
  }
  scanDir(contentDir);

  return brokenLinks;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Extracting docs data...\n');

  // Clean output directory
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Extract all data sources
  const proofEntries = extractProofEntries();
  writeJSON('proof-entries.json', proofEntries);

  const commands = extractCommands();
  writeJSON('commands.json', commands);

  const agentTemplates = extractAgentTemplates();
  writeJSON('agent-templates.json', agentTemplates);

  const skillTemplates = extractSkillTemplates();
  writeJSON('skill-templates.json', skillTemplates);

  const gotchas = await extractGotchas();
  writeJSON('gotchas.json', gotchas);

  const contextFiles = extractContextFiles();
  writeJSON('context-files.json', contextFiles);

  const buildMeta = extractBuildMeta();
  writeJSON('build-meta.json', buildMeta);

  // Build docs stat values for DocsStat tag resolution in llms-full.txt
  const stages: Record<string, number[]> = { think: [], plan: [], build: [], verify: [] };
  let rejections = 0;
  let totalFindings = 0;
  for (const entry of proofEntries) {
    if (entry.rejectionCycles > 0) rejections++;
    totalFindings += entry.findingCount;
    if (entry.timing.think > 0) stages.think.push(entry.timing.think);
    if (entry.timing.plan > 0) stages.plan.push(entry.timing.plan);
    if (entry.timing.build > 0) stages.build.push(entry.timing.build);
    if (entry.timing.verify > 0) stages.verify.push(entry.timing.verify);
  }
  function median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
  }
  const docsStatValues = buildDocsStatValues({
    proofCount: proofEntries.length,
    rejections,
    findings: totalFindings,
    skillCount: skillTemplates.length,
    gotchaCount: gotchas.length,
    medianThink: median(stages.think),
    medianPlan: median(stages.plan),
    medianBuild: median(stages.build),
    medianVerify: median(stages.verify),
  });

  // Generate search index — write to both data/docs (for validation) and public (for client fetch)
  const searchIndex = generateSearchIndex(proofEntries, commands, agentTemplates, skillTemplates);
  writeJSON('search-index.json', searchIndex);
  const publicDir = path.join(WEBSITE_DIR, 'public');
  fs.writeFileSync(path.join(publicDir, 'search-index.json'), JSON.stringify(searchIndex, null, 2) + '\n', 'utf-8');
  console.log('  ✓ public/search-index.json');

  // Generate llms.txt files
  const { llmsTxt, llmsFullTxt } = generateLlmsTxt(searchIndex, docsStatValues);
  fs.writeFileSync(path.join(publicDir, 'llms.txt'), llmsTxt, 'utf-8');
  console.log('  ✓ public/llms.txt');
  fs.writeFileSync(path.join(publicDir, 'llms-full.txt'), llmsFullTxt, 'utf-8');
  console.log('  ✓ public/llms-full.txt');

  // Validate internal links
  const brokenLinks = validateInternalLinks(proofEntries, commands, agentTemplates, skillTemplates);
  if (brokenLinks.length > 0) {
    console.error('\n✗ Broken internal links:');
    for (const link of brokenLinks) {
      console.error(`  - ${link}`);
    }
    process.exit(1);
  }
  console.log('  ✓ Internal links validated');

  // Validate completeness
  const errors: string[] = [];
  if (proofEntries.length === 0) errors.push('No proof entries extracted');
  if (commands.groups.length === 0) errors.push('No command groups extracted');
  if (commands.totalCommands === 0) errors.push('No commands extracted (totalCommands is 0)');
  if (agentTemplates.length !== 6) errors.push(`Expected 6 agent templates, got ${agentTemplates.length}`);
  if (skillTemplates.length !== 8) errors.push(`Expected 8 skill templates, got ${skillTemplates.length}`);
  if (gotchas.length === 0) errors.push('No gotchas extracted');
  if (contextFiles.length !== 4) errors.push(`Expected 4 context files, got ${contextFiles.length}`);
  if (!buildMeta.version) errors.push('Build meta missing version');
  if (searchIndex.length <= 100) errors.push(`Search index has ${searchIndex.length} entries, expected > 100`);

  if (errors.length > 0) {
    console.error('\n✗ Validation failed:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(`\n✓ All data extracted successfully`);
  console.log(`  Proof entries: ${proofEntries.length}`);
  console.log(`  Commands: ${commands.totalCommands} (${commands.groups.length} groups)`);
  console.log(`  Agents: ${agentTemplates.length}`);
  console.log(`  Skills: ${skillTemplates.length}`);
  console.log(`  Gotchas: ${gotchas.length}`);
  console.log(`  Context files: ${contextFiles.length}`);
  console.log(`  Search index: ${searchIndex.length} entries`);
  console.log(`  Version: ${buildMeta.version}`);
}

main().catch(err => {
  console.error('Extraction failed:', err);
  process.exit(1);
});
