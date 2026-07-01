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

/**
 * One pipeline session row in the Provenance view (plan, build, each build
 * rework, verify). Provenance ONLY — carries no pass/fail status field so it can
 * never read as gating (mirrors the CLI's `SessionProvenance` display contract).
 */
export interface ProofProvenanceSession {
  /** Rework-indexed label, e.g. `build` or `build 2`; model appended when models differ. */
  label: string;
  /** Pipeline role (`ana` | `plan` | `build` | `verify` | …). */
  role: string;
  /** The model that ran the session. */
  model: string;
  /** Conversation turns (0 when counts are unavailable). */
  turns: number;
  /** Tool calls (0 when counts are unavailable). */
  toolCalls: number;
  /** Token totals; `cache` combines cache-create and cache-read. */
  tokens: { input: number; output: number; cache: number };
  /** Recomputed cost in USD, or `null` when the model is unpriced or counts are unavailable. */
  costUsd: number | null;
  /** False when the transcript was unreadable at capture (no derived counts). */
  countsAvailable: boolean;
}

/** Work-item churn rollup for the Provenance view. */
export interface ProofProvenanceChurn {
  files: number;
  added: number;
  deleted: number;
}

/** Presence-floor completeness verdict passthrough (display-only, never gating). */
export interface ProofProvenanceCompleteness {
  complete: boolean;
  expected: { plan: number; build: number; verify: number };
  present: { plan: number; build: number; verify: number };
}

/**
 * Session provenance for a proof entry — per-session counts, cost, churn, and
 * completeness. Derived at extraction from the CLI's shared price table; every
 * field is a recomputable estimate, never a stored invoice. Never gating.
 */
export interface ProofProvenance {
  /** Per-session rows, in dataset order. */
  sessions: ProofProvenanceSession[];
  /** The shared model when every session ran on one, else `null` (model rides each row). */
  model: string | null;
  /** Totals footer: session count, summed priced cost, and unpriced-session count. */
  totals: { sessions: number; costUsd: number; unpriced: number };
  /** The price-table version the costs were computed against (from the CostResult), or `null`. */
  priceTableVersion: string | null;
  /** Aggregate churn, or `null` when no files changed. */
  churn: ProofProvenanceChurn | null;
  /** Completeness passthrough, or `null` on pre-completeness entries. */
  completeness: ProofProvenanceCompleteness | null;
}

/** One notable (non-satisfied) behavioral verdict surfaced in the attestation view. */
export interface ProofAttestationVerdict {
  claimId: string;
  says: string;
  status: string;
  reason: string;
}

/** Per-agent behavioral attestation record for the Session Attestation view. */
export interface ProofAttestationAgent {
  /** Rework-indexed label, e.g. `build` or `build 2`. */
  label: string;
  /** Pipeline role. */
  role: string;
  /** Claims judged satisfied. */
  satisfied: number;
  /** Claims judged violated (the only alarm-colored state). */
  violated: number;
  /** Claims that could not be verified (neutral abstention, never a failure). */
  unverifiable: number;
  /** Coverage ratio inputs for prominent display. */
  coverage: { checked: number; total: number; unverifiable: number };
  /** True when every claim was fully checked. */
  complete: boolean;
  /** sha256 of the mandate bytes, prefixed `sha256:`. */
  mandateHash: string;
  /** sha256 of the transcript bytes, prefixed `sha256:`. */
  transcriptHash: string;
  /** Up to 3 notable (non-satisfied) verdicts. */
  notable: ProofAttestationVerdict[];
}

/**
 * Session attestation for a proof entry — the coverage-aware behavioral verdict
 * of how each agent session behaved. EVIDENCE ONLY, never gating (except the
 * separate verdict veto). `unverifiable` is a neutral tally, distinct from a fail.
 */
export interface ProofAttestation {
  /** The anatrace-core engine version that judged the run. */
  coreVersion: string;
  /** The mandate framework that judged it (e.g. `anatomia`). */
  framework: string;
  /** Per-agent records, in dataset order. */
  agents: ProofAttestationAgent[];
  /** How many records have incomplete coverage. */
  incompleteCount: number;
}

/**
 * The deterministic read-build-report veto outcome. `applied:false` is the quiet
 * common case; `applied:true` is a serious, forward-only verdict override.
 */
export interface ProofVerdictVeto {
  applied: boolean;
  reason: string;
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
  /** Session provenance — present only on 1.3.0+ proofs with process capture. */
  provenance?: ProofProvenance;
  /** Session attestation — present only when compliance records were captured. */
  attestation?: ProofAttestation;
  /** Read-build-report veto outcome — present only when the veto was evaluated. */
  verdictVeto?: ProofVerdictVeto;
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
