# Project Context

## What This Project Does

**Detected:** pnpm monorepo.

Anatomia is an open-source methodology and CLI tool for verified AI development. It exports a framework — think, plan, build, verify — that turns AI coding tools from fast-but-unreliable into structured-and-proven. The CLI (`ana`) is the delivery mechanism: it scans a project, generates validated context, and runs every change through a four-agent pipeline (Think, Plan, Build, Verify) with a fifth agent (Learn) that tends the proof chain between cycles.

Three things Anatomia provides that don't exist elsewhere:

1. **Validated context.** Machine-generated project intelligence (scan.json, skills, gotchas) that is verified against the actual codebase — not documentation, not stale READMEs. The system detects when context goes stale and refreshes it.
2. **The pipeline.** Think → Plan → Build → Verify. Four agents with specific roles, typed handoffs, and independence guarantees. Verify never reads Build's report — the developer gets two independent accounts. This prevents the "grade your own homework" failure mode.
3. **Proof chains.** Every pipeline run produces a verification record: which contract assertions passed, which failed, what the verifier found independently. The proof chain is the mechanical audit trail of every AI-assisted change.

**Sniper customer** — a startup, 2-4 engineers, modern stack, almost always building an AI product. They built fast using AI coding tools — the app works, has users, growing revenue. But the codebase is 70-95% vibe-coded: the AI wrote most of it, nobody fully reviewed every decision, and now nobody fully understands it. They're smart, technically aware, on top of the latest tools — but they lack depth. The accumulated knowledge a senior engineer builds over six months on a codebase. Hiring takes months they don't have. Anatomia gives them that knowledge layer immediately.

**Shotgun customer** — a more established team, 5-15 engineers, with real conventions — conventional commits, pre-commit hooks, CI pipelines, code review. The knowledge exists but it's in people's heads. When someone leaves, it leaves with them. Each engineer uses AI tools differently, no consistency. Their problem isn't lacking discipline — it's that nobody wrote it down in a format AI tools can read. Anatomia codifies tribal knowledge into institutional infrastructure.

The product enforces LLMs to act against their nature: think more, build less, surface tradeoffs instead of rushing to implementation. It's an advocate for quality — it exists to surface tradeoffs, challenge assumptions, and ensure that what gets built is what should get built.

Each stage produces typed artifacts that the next stage consumes:

```
Think (Ana)        →  scope.md           →  "what and why" (challenges assumptions, may push back)
Plan (AnaPlan)     →  spec.md + contract.yaml + plan.md  →  "how, with assertions"
Build (AnaBuild)   →  code + tests + build_report.md     →  "implementation + evidence"
Verify (AnaVerify) →  verify_report.md   →  "independent proof"
```

The product has four surfaces:

1. **Scan + Init** — zero-config project analysis. Produces scan.json, CLAUDE.md, AGENTS.md, skills with rules and gotchas, and context scaffolds. Entry point for every user. `ana init commit` persists infrastructure to the artifact branch.
2. **The Pipeline** — scope → spec → build → verify → proof. Managed through `ana work`, `ana artifact`, `ana verify`, `ana pr`. Where ongoing development happens with mechanical verification. Builds happen in git worktrees for isolation.
3. **Proof Intelligence** — quality trajectory, active findings, staleness detection, finding-to-rule promotion. Managed through `ana proof` subcommands and the Learn agent. Where quality compounds across pipeline cycles.
4. **Ana Docs** — the documentation site at `anatomia.dev/docs`. Concepts, guides, reference pages for agents/skills/CLI/context, and the Proof Explorer (live proof chain data rendered as navigable pages). Content lives in `website/content/docs/` (MDX) and dynamic reference pages in `website/app/docs/reference/`. The website reads CLI templates and context files at build time to generate reference documentation. Ana Docs is also an authoritative reference for agents — if an agent needs deeper understanding of a concept (contracts, findings, the proof chain, how verification works), the relevant docs page at `website/content/docs/concepts/` or `website/content/docs/guides/` is the canonical explanation.

## Architecture

**Detected:** pnpm · 2 packages (anatomia-cli, demo-site)
**Detected:** 3 directories mapped: .github/, packages/, tests/
**Detected deployment:** GitHub Actions

- **`packages/cli`** — the product. All CLI development happens here. Three layers:
  - **Commands** (`src/commands/`) — user-facing surface. init (with commit subcommand), scan, setup (with check/complete subcommands), artifact, work, verify, pr, proof, config, agents.
  - **Engine** (`src/engine/`) — scan intelligence. Pure functions, no CLI dependencies. Census model → detectors → analyzers → findings.
  - **Utils + Data** (`src/utils/`, `src/data/`) — shared helpers. Scaffold generators, gotcha matcher, gotcha library, git operations, worktree management.
- **`website/`** — the docs site and marketing surface. Next.js + Tailwind. No runtime dependency on the CLI, but reads CLI templates and `.ana/` context at build time for reference pages. Deployed on Vercel.

### Where to Make Changes

| To do this... | Look here |
|---------------|-----------|
| Add a scan detector | `src/engine/detectors/` |
| Add a gotcha | `src/data/gotchas.ts` (library) + `src/utils/gotchas.ts` (matcher) |
| Change what init generates | `src/commands/init/assets.ts` (generators) or `templates/` (templates) |
| Change infrastructure commit behavior | `src/commands/init/commit.ts` |
| Change skill rules | `templates/.claude/skills/{name}/SKILL.md` |
| Add a CLI command | `src/commands/`, register in `src/index.ts` |
| Change EngineResult schema | `src/engine/types/engineResult.ts` + `createEmptyEngineResult()` + all consumers |
| Add a finding rule | `src/engine/findings/rules/` |
| Change agent definitions | `templates/.claude/agents/` |
| Change proof chain commands | `src/commands/proof.ts` |
| Change proof computation | `src/utils/proofSummary.ts` |
| Change work/pipeline flow | `src/commands/work.ts` |
| Change worktree behavior | `src/utils/worktree.ts` |
| Change what re-init preserves | `src/commands/init/state.ts` (`preserveUserState`) |
| Add a docs concept/guide page | `website/content/docs/` (MDX with frontmatter) |
| Change docs reference pages | `website/app/docs/reference/` (dynamic routes reading CLI data) |
| Change ana.json schema | `src/commands/init/anaJsonSchema.ts` + `createAnaJson` in state.ts |

### Templates vs. Generators

This is the most common source of wrong-location errors:

- **Templates** are copied verbatim during init. Agent definitions (`templates/.claude/agents/*.md`) and skill rule sections (`templates/.claude/skills/*/SKILL.md`) are templates. To change what users get, edit the template file.
- **Generators** produce content from code. CLAUDE.md, AGENTS.md, project-context.md, and skill `## Detected` sections are generated by code in `assets.ts`, `scaffold-generators.ts`, and `skills.ts`. To change what users get, edit the generator function.

An LLM asked to "change the default coding-standards rules" should edit `templates/.claude/skills/coding-standards/SKILL.md`. An LLM asked to "change what the Detected section shows" should edit the injector in `src/commands/init/skills.ts`. These are different files with different change processes.

### Re-init Preservation Contract

Re-running `ana init` is designed to be safe. The function `preserveUserState` (state.ts) governs what survives:

- **Preserved:** `context/` (user-enriched content), `plans/completed/` (pipeline history), `proof_chain.json` + `PROOF_CHAIN.md` (proof data), `ana.json` user fields (commands, coAuthor, artifactBranch, branchPrefix, custom), `state/setup-progress.json` (only during in-progress setup).
- **Refreshed:** `scan.json` (full re-scan), `ana.json` mechanical fields (anaVersion, lastScanAt, name, language, framework, packageManager), skills `## Detected` sections, symbol index, `.ana/.gitignore`.
- **Merge-not-overwrite:** CLAUDE.md, AGENTS.md, agent definitions (`.claude/agents/*.md`). If they exist, they're kept as-is. Skill files get Detected refreshed but Rules/Gotchas/Examples preserved.

## Key Decisions

**Census model.** All detectors receive a `ProjectCensus` object built once at scan start. Every detector sees the same snapshot. This prevents bugs where detectors read inconsistent filesystem state.

**Compound gotcha triggers.** Gotchas can require multiple conditions (e.g., Prisma + Vercel for the serverless singleton). The matcher uses `.every()` — all conditions must match. Prevents irrelevant advice.

**Atomic init via rename.** Init builds the complete `.ana/` tree in a temp directory, then atomically swaps. Crash-safe. SIGKILL recovery via stale-directory detection.

**Worktree-based build isolation.** Build creates a git worktree (`ana work start` in the worktree), commits artifacts there, and the developer merges via PR. The main working tree is never modified by Build. Worktrees are managed in `.ana/worktrees/` and pruned by `work complete`.

**Infrastructure vs. pipeline commit boundary.** `ana init commit` commits project configuration and context. `ana artifact save` commits pipeline artifacts (scopes, specs, build reports). `ana work complete` commits proof chain data. Each subsystem manages its own git lifecycle. These never cross.

**Two-tier scanning.** Surface tier (dependency-based, fast, no WASM) and deep tier (tree-sitter AST for conventions, patterns, naming). `--quick` forces surface-only.

## Key Files

- CI pipeline: `.github/workflows/test.yml`, `.github/workflows/release.yml`
- Ana.json schema: `src/commands/init/anaJsonSchema.ts`
- Proof computation: `src/utils/proofSummary.ts` — health, trajectory, staleness, audit, context queries
- Work lifecycle: `src/commands/work.ts` — start, status, complete, worktree management
- Artifact save: `src/commands/artifact.ts` — validation, hashing, branch enforcement, commit
- Git operations: `src/utils/git-operations.ts` — branch detection, co-author, runGit wrapper
- Worktree management: `src/utils/worktree.ts` — create, remove, detect, path resolution
- Init orchestration: `src/commands/init/index.ts` → state.ts, assets.ts, preflight.ts, skills.ts, commit.ts
- Scaffold generators: `src/utils/scaffold-generators.ts` — project-context.md and design-principles.md templates
- Docs content: `website/content/docs/` — MDX pages with frontmatter schema
- Docs dynamic pages: `website/app/docs/reference/` and `website/app/docs/proof/` — server components reading CLI data

## What Looks Wrong But Is Intentional

- **allDeps merges all workspace packages.** Database, auth, testing, payments, and AI SDK detection run against the merged dependency map from ALL packages. Framework and uiSystem detection run against the primary package only. The split is intentional — database/auth/testing are project-wide facts; framework is identity.
- **init is idempotent but asymmetric.** Re-running init refreshes machine-owned content (Detected sections, scan.json) but preserves human-owned content (Rules, Gotchas, Examples, context files). Most init commands are destructive. This one isn't.
- **scan.json is designed for LLM agents, not humans.** Its field names, structure, and content are optimized for agent consumption. The human-readable version is the `ana scan` terminal display.
- **Pre-commit hooks enforce types, not the build.** The build uses SWC (strips types without checking). The pre-commit hook runs `tsc --noEmit`. If you skip the hook, type errors ship silently.
- **Gotcha triggers use display names, not package names.** `{ aiSdk: 'Anthropic' }` not `{ aiSdk: '@anthropic-ai/sdk' }`. Because `stack.aiSdk` stores display names from the detection layer.
- **Merge-not-overwrite means template improvements don't reach existing users.** Agent definitions and CLAUDE.md are skipped if they exist. Users who initialized with an older CLI keep their old templates. This is intentional — user customizations must survive. The tradeoff is that template improvements require manual adoption or re-init with the file deleted first.
- **Anatomia is its own customer (dogfooding).** The `.ana/` and `.claude/` directories at the repo root are our own installation of the product — the same files that `ana init` generates for customers. The `templates/` directory inside `packages/cli/` is what customers GET when they run `ana init`. These are different files with different purposes. Editing `templates/.claude/agents/ana.md` changes the product for all customers. Editing `.claude/agents/ana.md` changes our own dogfood installation only. Both exist in the same repo. The same distinction applies to skills (`templates/.claude/skills/` vs `.claude/skills/`), CLAUDE.md (`templates/CLAUDE.md` vs root `CLAUDE.md`), and context scaffolds (`src/utils/scaffold-generators.ts` generates them, `.ana/context/` holds our enriched versions).

## Active Constraints

- **The CLI is the primary development focus.** The website is a product surface but secondary to CLI development.
- **The CLI is published on npm as `anatomia-cli`.** Install with `npm install -g anatomia-cli`.
- **The scan produces one result per repo, not per package.** Per-package scanning for multi-product monorepos is a known limitation.
- **Test count must not decrease.** CI runs across 3 OS × 2 Node versions. Coverage thresholds enforced in vitest.config.ts.
- **ana.json user fields are preserved on re-init.** Only `anaVersion` and `lastScanAt` refresh mechanically. Fields like `commands` and `artifactBranch` are user-owned and require manual update if the scan would produce a different value. Full mechanical-field refresh is a separate design decision.
- **Every product change must work for all customers.** Anatomia dogfoods itself, but we are not the only user. Any change to templates, generators, scan detectors, CLI commands, or agent behavior ships to every customer on their next `ana init` or CLI update. A change that works for a TypeScript CLI monorepo (us) but breaks for a Python web app or a Go microservice is not shippable. Scope and test with the sniper customer (2-4 person startup, AI product, vibe-coded) and the shotgun customer (5-15 engineers, real conventions) in mind.
- **Scope for teams shipping production software.** The pipeline's value requires a codebase with real stakes — users, revenue, or team dependencies. Don't scope features for hobby projects or hello-world demos. The verification overhead should be proportional to the stakes.

## Domain Vocabulary

- **Scan** — engine analysis of a project. Produces `EngineResult` (serialized as `scan.json`). Two tiers: surface and deep.
- **Init** — bootstraps `.ana/` and `.claude/` from scan data. Idempotent — re-init refreshes scan without destroying user content. `ana init commit` persists infrastructure to git.
- **Scan finding** — deterministic check from the engine (secrets, validation, env hygiene). Severity: critical, warn, info, pass. Lives in `scan.json`.
- **Proof finding** — verification observation from Verify or Build. Severity: risk, debt, observation. Suggested action: promote, scope, monitor, accept. Lives in `proof_chain.json` with lifecycle state: active → promoted or closed.
- **Skill** — `.claude/skills/{name}/SKILL.md`. Four sections: Detected (machine-owned), Rules, Gotchas, Examples (human-owned). ENRICHMENT.md files guide the setup agent on what to enrich.
- **Contract** — `contract.yaml` written by Plan. Typed assertions (id, says, block, target, matcher, value). Build tags tests with `// @ana A001`. Verify checks each tag independently.
- **Proof chain** — `proof_chain.json` + `PROOF_CHAIN.md`. One entry per completed pipeline run with assertions, findings, timing, hashes. View an entry: `ana proof {slug}`. Query by file before scoping: `ana proof context {files}`. Run `ana proof --help` for all subcommands. For deeper understanding, read the AnaDocs guide at `website/content/docs/guides/reading-a-proof.mdx`.
- **Worktree** — git worktree created by `ana work start` for build isolation. Build and Verify run in the worktree, not the main working tree.
- **Learn** — `claude --agent ana-learn`. The fifth agent. Triages findings, promotes patterns to skills. Runs between pipeline cycles.
- **AnaDocs** — the documentation site at `anatomia.dev/docs`. Content in `website/content/docs/`, dynamic reference pages in `website/app/docs/reference/`, Proof Explorer in `website/app/docs/proof/`. Also an authoritative reference for agents — read the relevant concept or guide page when a concept needs deeper understanding.
- **Slug** — kebab-case work item identifier. Used in branches (`feature/{slug}` by default, configurable via `branchPrefix`), commits (`[{slug}]`), and plan directories.
- **Dogfood** — Anatomia's own installation of itself. The `.ana/` and `.claude/` directories at the repo root are our dogfood — the product running on its own codebase. Changes to dogfood files affect only us. Changes to product files (`templates/`, generators in `src/`) affect all customers. When scoping work, always clarify: dogfood change or product change?
- **Ana / AnaThink** — used interchangeably. The thinking agent (`claude --agent ana`). Scopes work, navigates, advises. Produces scope.md.
- **AnaPlan** — the planning agent. Reads scope, produces spec.md + contract.yaml + plan.md.
- **AnaBuild** — the build agent. Reads spec, produces code + tests + build_report.md.
- **AnaVerify** — the verification agent. Reads spec + code, produces verify_report.md. Never reads the build report.
- **AnaLearn** — the learning agent. Tends the proof chain between pipeline cycles.
