export type {
  ProofEntry,
  ProofAssertion,
  ProofFinding,
  ProofTiming,
  ProofStats,
  AgentTemplate,
  CommandOption,
  CommandArgument,
  Command,
  CommandGroup,
  CommandsData,
  SkillSection,
  SkillTemplate,
  GotchaEntry,
  ContextFile,
  BuildMeta,
} from './types';

export { getProofEntries, getProofBySlug, getProofStats, getMedianTimings } from './proofs';
export { getAgentTemplates, getAgentByName, getAgentCount } from './agents';
export { getSkillTemplates, getSkillByName, getSkillCount } from './skills';
export { getCommands, getCommandCount, getCommandGroups } from './commands';
export { getContextFiles } from './context';
export { getGotchas, getGotchaCount } from './gotchas';
export { getBuildMeta } from './meta';
export { buildDocsStatValues, resolveDocsStatTags } from './docsStatValues';
export type { DocsStatInput } from './docsStatValues';
