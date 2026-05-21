/**
 * Shared TypeScript interfaces for the 7 docs data JSON files.
 * Used by both the extraction script (output) and loader modules (input).
 */

export interface ProofAssertion {
  id: string;
  says: string;
  status: string;
}

export interface ProofFinding {
  id?: string;
  category?: string;
  summary: string;
  file?: string;
  severity: string;
  suggestedAction?: string;
  status?: string;
}

export interface ProofTiming {
  think: number;
  plan: number;
  build: number;
  verify: number;
  totalMinutes: number;
  segments?: Array<{ stage: string; minutes: number; phase?: number }>;
}

export interface ProofEntry {
  slug: string;
  feature: string;
  result: string;
  stage: string;
  contract: {
    total: number;
    satisfied: number;
    unsatisfied: number;
  };
  assertionCount: number;
  findingCount: number;
  rejectionCycles: number;
  completedAt: string;
  surface?: string | null;
  scopeSummary: string | null;
  modulesTouched: string[];
  assertions: ProofAssertion[];
  findings: ProofFinding[];
  timing: ProofTiming;
  phases?: number;
  hashes: Record<string, string>;
  findingSeverity: { risk: number; debt: number; observation: number };
  duration: number;
  prevSlug: string | null;
  nextSlug: string | null;
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
  role: string;
  displayDescription: string;
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
  conditional: boolean;
  rules: number;
  content: string;
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
  path: string;
  description: string;
  content: string;
}

export interface BuildMeta {
  version: string;
  commitSha: string;
  buildTimestamp: string;
  testCount: number;
}
