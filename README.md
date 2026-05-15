# Anatomia

[![CI](https://github.com/TettoLabs/anatomia/actions/workflows/test.yml/badge.svg)](https://github.com/TettoLabs/anatomia/actions)
[![npm](https://img.shields.io/npm/v/anatomia-cli)](https://www.npmjs.com/package/anatomia-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Anatomia is the engineering judgment your AI doesn't have. Four agents scope, plan, build, and verify every change. Contracts are sealed before code is written — typed assertions the verifier checks against the code, not Build's account of what it did. Every run produces a proof chain entry — what was asserted, what was found, what shipped. A fifth agent learns from that record and promotes what it finds to rules that shape future builds. Not opinion. Mechanical proof.

## Scan any project in 10 seconds

```bash
npx anatomia-cli scan .
```

No install. One command. Here's what you'll see:

```
┌─────────────────────────────────────────────────────────────────────┐
│  my-saas-app                                              web-app   │
│  TypeScript · Next.js · Prisma → PostgreSQL (37 models) · Clerk     │
└─────────────────────────────────────────────────────────────────────┘

  Stack
  ─────
  Language     TypeScript
  Framework    Next.js
  Database     Prisma → PostgreSQL (37 models)
  Auth         Clerk
  AI           Anthropic
  Payments     Stripe
  Testing      Vitest, Playwright
  UI           Tailwind CSS
  Services     Resend · Sentry · PostHog · Inngest (+2 more)
  Deploy       Vercel · GitHub Actions

  Intelligence
  ────────────
  Activity     4 contributors · 18→12→22→15 weekly
  Hot files    webhooks.ts (31), chat.ts (24), schema.prisma (19)
  Docs         README.md · CONTRIBUTING.md · .env.example + 3 more
  Pre-commit   typecheck + lint

  ⚠ Hardcoded PostHog project key in lib/analytics.ts
  ⚠ 2/3 sampled API routes have no input validation
  Run `ana init` to scaffold 8 skills (5 core + api-patterns, data-access, ai-patterns)
```

## Install

Like what you see? Install globally to use the `ana` command directly:

```bash
npm install -g anatomia-cli
```

Requires Node.js 22+.

## Quick start

```bash
ana init                      # generate context + agents
claude --agent ana            # start working
claude --agent ana-setup      # enrich with your team's knowledge (optional, recommended, ~10 min)
```

`init` runs scan automatically and works standalone — no Claude Code required.
The pipeline and setup require [Claude Code](https://claude.com/code).

Tell Ana what you want to build. It'll investigate the codebase, surface tradeoffs, and push back if the approach has problems. When the scope is right, it hands off to Plan, Build, and Verify.

## What it does

### Scan + init

`ana scan` reads your project and detects framework, database, auth, testing, services, conventions, and patterns. Re-running `ana init` refreshes scan data without overwriting your edits.

`ana init` writes that intelligence to files agents read:

- `scan.json` — full structured scan data for agent consumption
- `CLAUDE.md` and `AGENTS.md` — cross-tool project context
- 5 core + 3 conditional skill templates with scan-driven Detected sections
- 16 stack-specific gotchas with compound triggers

Setup (`claude --agent ana-setup`) bridges the gap between what scan detects and what your team knows. A ~10 minute session that investigates your codebase, asks 2-3 questions, and writes enriched context. After setup, agents understand your product and decisions — not just your stack.

### The pipeline

| Stage | Agent | Role | Produces |
|-------|-------|------|----------|
| Think | Ana | Thinking partner — scope, investigate, advise, push back | `scope.md` |
| Plan | AnaPlan | Architect — design + sealed contract | `spec.md` + `contract.yaml` + `plan.md` |
| Build | AnaBuild | Builder — implement spec, prove it works | Code + tests + `build_report.md` |
| Verify | AnaVerify | Fault-finder — reads spec and code, skips Build's report | `verify_report.md` |
| Learn | AnaLearn | Proof analyst — runs between cycles | Stronger skills and system improvements |

### Proof intelligence

Every pipeline run writes a proof chain entry — here's one:

```
┌─────────────────────────────────────────────────────────────────────┐
│  ana proof                                                          │
│  Add Stripe Webhooks                                2026-04-29 11:07│
└─────────────────────────────────────────────────────────────────────┘

  Result: PASS

  Contract
  ────────
  14/14 satisfied · 0 unsatisfied · 0 deviated

  Assertions (6 of 14)
  ──────────
  ✓ Webhook endpoint verifies Stripe signature before processing
  ✓ Events are processed idempotently using the Stripe event ID
  ✓ Failed signature check returns 400, not 500
  ✓ Unrecognized event types return 200 without processing
  ✓ Migration adds idempotency_key column with unique constraint
  ✓ Existing checkout and billing portal flows pass without modification

  Findings
  ────────
  [risk · scope] Signature verification uses direct string comparison —
                 timing-safe equality not enforced
  [debt · scope] No retry mechanism for failed event processing —
                 transient DB errors will drop events silently
  [observation · monitor] Webhook handler is 340 lines with a switch
                          that will grow with every new event type

  Timing
  ──────
  Total        52 min
  Think        4 min
  Plan         15 min
  Build        22 min
  Verify       11 min
```

Each entry adds to a proof chain. `ana proof health` tracks the trajectory across runs — first-pass verification rate, risks per run, hot spots where findings cluster, and what to fix next. When patterns recur, `proof promote` turns them into skill rules that reach the next build. `proof audit` groups active findings by file. `proof stale` flags findings whose files changed since discovery.

## Commands

### Scan and init

| Command | Description |
|---------|-------------|
| `ana scan [path]` | Detect stack, conventions, patterns. `--quick` for surface-only, `--json` for structured output |
| `ana init` | Generate `.ana/` context and `.claude/` agent definitions |

### Pipeline

| Command | Description |
|---------|-------------|
| `ana work start <slug>` | Start a work item, record timestamp |
| `ana work status` | Show pipeline state for active work |
| `ana work complete <slug>` | Archive plan, write proof chain entry |
| `ana artifact save <type> <slug>` | Save pipeline artifact with hash verification |
| `ana artifact save-all <slug>` | Save all artifacts in a plan directory atomically |
| `ana verify pre-check <slug>` | Run contract seal verification |
| `ana pr create <slug>` | Create PR from verified build |

### Proof intelligence

| Command | Description |
|---------|-------------|
| `ana proof <slug>` | Display proof chain entry |
| `ana proof health` | Quality trajectory dashboard |
| `ana proof audit` | Active findings grouped by file |
| `ana proof close <ids...>` | Close resolved findings with reason |
| `ana proof promote <ids...>` | Promote findings to skill rules |
| `ana proof strengthen <ids...>` | Commit skill edits and close findings |
| `ana proof lesson <ids...>` | Record findings as institutional lessons |
| `ana proof stale` | Show findings with staleness signals |
| `ana proof context <files...>` | Query proof chain for file context |

### Setup

| Command | Description |
|---------|-------------|
| `ana setup` | Enrich context with team knowledge (Claude Code agent) |
| `ana setup check` | Validate context file quality |
| `ana setup complete` | Validate context and finalize setup |
| `ana agents` | Agent dashboard — list deployed agent definitions |
| `ana agents model [agent] [model]` | Show or set agent model overrides |

## Works with

Built for [Claude Code](https://claude.com/code). The pipeline, agents, and skills are Claude Code native.

Scan output (`AGENTS.md`, `CLAUDE.md`) works with any AI tool that reads markdown.

## Development

```bash
git clone https://github.com/TettoLabs/anatomia.git
cd anatomia && pnpm install && pnpm build
cd packages/cli && pnpm vitest run
```

See [CONTRIBUTING.md](https://github.com/TettoLabs/anatomia/blob/main/packages/cli/CONTRIBUTING.md) for extension guides and [ARCHITECTURE.md](https://github.com/TettoLabs/anatomia/blob/main/packages/cli/ARCHITECTURE.md) for the module map.

This project is built with Anatomia. The `.ana/` directory is the proof — every feature was scoped, planned, built, and verified through the same pipeline this tool installs for you.

## License

MIT
