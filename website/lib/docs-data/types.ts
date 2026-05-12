/**
 * Shared TypeScript interfaces for the 7 docs data JSON files.
 * Used by both the extraction script (output) and loader modules (input).
 */

export interface ProofEntry {
  slug: string;
  feature: string;
  result: string;
  stage: string;
  contract: {
    total: number;
    satisfied: number;
  };
  assertionCount: number;
  findingCount: number;
  completedAt: string;
  scopeSummary: string | null;
  modulesTouched: string[];
}

export interface ProofStats {
  entries: number;
  assertions: number;
  findings: number;
  rejections: number;
}

export interface AgentTemplate {
  name: string;
  model: string;
  description: string;
  skills: string[] | null;
  memory: string | null;
  initialPrompt: string | null;
  reads: string[];
  writes: string[];
  forbidden: string[];
  bodyMarkdown: string;
}

export interface CommandOption {
  flags: string;
  description: string;
}

export interface CommandArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface Command {
  name: string;
  description: string;
  arguments: CommandArgument[];
  options: CommandOption[];
  subcommands: Command[];
}

export interface CommandGroup {
  name: string;
  commands: Command[];
}

export interface CommandsData {
  groups: CommandGroup[];
  totalCommands: number;
}

export interface SkillSection {
  heading: string;
  content: string;
}

export interface SkillTemplate {
  name: string;
  description: string;
  sections: SkillSection[];
}

export interface GotchaEntry {
  id: string;
  triggers: Record<string, string>;
  skill: string;
  text: string;
}

export interface ContextFile {
  name: string;
  filename: string;
  content: string;
}

export interface BuildMeta {
  version: string;
  commitSha: string;
  buildTimestamp: string;
}
