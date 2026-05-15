# Contributing to Anatomia

Read [ARCHITECTURE.md](ARCHITECTURE.md) first for the module map. Then come back here for setup and extension guides.

Every file path and code identifier below is verified against the current codebase. If you follow these guides and something does not match, the code is right — file an issue.

---

## Development Setup

**Prerequisites:**
- Node.js 22+
- pnpm 9+

**Setup:**
```bash
git clone https://github.com/TettoLabs/anatomia.git
cd anatomia
pnpm install
pnpm build
```

**Running locally:**
```bash
cd packages/cli
pnpm link --global
ana --version
```

---

## Project Structure

```
packages/cli/
├── ARCHITECTURE.md        # Module map, data flow, extension points
├── CONTRIBUTING.md         # Setup, testing, step-by-step extension guides
├── src/
│   ├── index.ts           # CLI entry point — registers all 9 commands
│   ├── commands/          # 9 user-visible commands (init/, scan, setup, artifact, work, proof, pr, agents, verify)
│   │   └── init/          # 7-file split: index, types, preflight, skills, assets, state, anaJsonSchema
│   ├── engine/            # Scan engine
│   │   ├── scan-engine.ts #   scanProject() — public entry point
│   │   ├── index.ts       #   Re-exports: EngineResult, scanProject, ASTCache, ParserManager
│   │   ├── detectors/     #   12 top-level .ts files + node/ (6 + registry) + python/ (4 + registry)
│   │   ├── analyzers/     #   patterns/, structure/, conventions/ (5 files)
│   │   ├── sampling/      #   proportionalSampler.ts
│   │   ├── types/         #   EngineResult + pattern/convention/parsed Zod schemas
│   │   ├── parsers/       #   tree-sitter + per-language dependency parsers
│   │   ├── utils/         #   routeHandlers, serviceAnnotation, confidence, file
│   │   └── cache/         #   ASTCache
│   ├── types/             # Cross-command types (proof, symbol-index)
│   ├── utils/             # Shared utilities (git-operations, gotchas, displayNames, ...)
│   ├── data/
│   │   └── gotchas.ts     # GOTCHAS — pre-populated trigger-based gotchas
│   └── constants.ts       # CORE_SKILLS, CONDITIONAL_SKILL_TRIGGERS, AGENT_FILES, getStackSummary
├── templates/
│   ├── CLAUDE.md          # Project entry point template
│   └── .claude/
│       ├── agents/        # Agent definitions — see AGENT_FILES in src/constants.ts
│       └── skills/        # 8 skill templates (5 core + 3 conditional)
│           └── <name>/    # Each contains SKILL.md + ENRICHMENT.md
├── tests/                 # Vitest suite — run `(cd packages/cli && pnpm vitest run)` for current counts
│   ├── commands/          # Command tests
│   ├── engine/            # Engine tests (analyzers, detectors, parsers, conventions, patterns, utils, types)
│   ├── e2e/               # End-to-end init/scan tests
│   ├── templates/         # Template sanity tests
│   ├── contract/          # Cross-module contract tests
│   ├── scaffolds/         # Scaffold generator tests
│   └── utils/             # Utility tests
├── docs/                  # FILE_TYPES, TROUBLESHOOTING
└── tsconfig.test.json     # Test-specific tsconfig (includes tests/, used by `pnpm typecheck:tests`)
```

---

## Testing

**Run tests:**
```bash
cd packages/cli && pnpm vitest run           # All tests
cd packages/cli && pnpm vitest run tests/templates/  # Template tests only
```

**Test requirements:**
- All tests must pass before PR
- Add tests for new features
- Maintain coverage

**Test structure:**
- Use vitest
- Tests in tests/ directory
- One test file per source file
- Descriptive test names

---

## Modifying Templates

**Template locations:**
- Agent templates: `templates/.claude/agents/`
- Skill templates: `templates/.claude/skills/`
- Each skill directory contains `SKILL.md` (the template) and `ENRICHMENT.md` (setup enrichment guidance)

**Development workflow:**

1. **Edit template file** in `templates/`
2. **Run tests:** `cd packages/cli && pnpm vitest run`
3. **Test locally:** `pnpm build && cd /tmp && mkdir test && cd test && git init && npm init -y && ana init`
4. **Submit PR** with test results and rationale

---

## Template Quality Standards

**All templates must meet:**
- **Strong constraints:** Use "NEVER", "MUST NOT", "ALWAYS" (not "try to avoid")
- **Professional tone:** Imperative, clear, no jargon without explanation
- **Section structure for skills:** `## Detected`, `## Rules`, `## Gotchas`, `## Examples` — the Detected section is machine-owned (auto-refreshed by `scaffoldAndSeedSkills`); the other three are human-owned and preserved on re-init.

See the "Templates are behavioral contracts" note in [ARCHITECTURE.md](ARCHITECTURE.md) for the framing.

---

## Common Contributions — Step-by-Step Guides

### 1. Adding a Framework Detector

Example throughout: adding **Hono** (a lightweight Node.js web framework).

1. **Create the detector** at `src/engine/detectors/node/<name>.ts` (e.g. `.../hono.ts`):
   ```typescript
   import type { Detection } from '../python/fastapi.js';  // shared shape

   export async function detectHono(
     _rootPath: string,
     dependencies: string[]
   ): Promise<Detection> {
     if (dependencies.includes('hono')) {
       return { framework: 'hono', confidence: 0.9, indicators: ['hono in dependencies'] };
     }
     return { framework: null, confidence: 0.0, indicators: [] };
   }
   ```
2. **Register it** in `src/engine/detectors/node/framework-registry.ts`:
   ```typescript
   import { detectHono } from './hono.js';

   export const NODE_FRAMEWORK_DETECTORS: NodeFrameworkDetector[] = [
     detectNextjs,
     detectRemix,
     detectNestjs,
     detectExpress,
     detectHono,        // add at correct priority
     detectReact,
     detectOtherNodeFrameworks,
   ];
   ```
   **Priority matters.** First match wins. Put disambiguating frameworks before their parents (Next.js before React, Nest before Express).
3. **Add a display name** in `src/utils/displayNames.ts` in `FRAMEWORK_DISPLAY_NAMES`:
   ```typescript
   hono: 'Hono',
   ```
4. **Test it** on a real Hono project:
   ```bash
   ana scan /path/to/hono-project
   # Stack line should show "... · Hono · ..."
   ```
5. **Add a unit test** in `tests/engine/detectors/node-frameworks.test.ts`.

Python, Go, and Rust follow the same pattern. Python uses `detectors/python/framework-registry.ts`; Go and Rust currently have single-function detectors in `detectors/go.ts` / `detectors/rust.ts` — when either language grows multiple detector files, add a `framework-registry.ts` alongside.

### 2. Adding a Gotcha

Gotchas are short, high-value warnings injected into `## Gotchas` sections of skill files on **fresh init only**. The gotcha system fired 80+ times across 22 test projects with zero false positives — precise triggers are the whole point.

1. **Edit** `src/data/gotchas.ts` and add an entry to `GOTCHAS`:
   ```typescript
   {
     id: 'tanstack-query-staletime',
     triggers: { framework: 'Next.js', database: 'Drizzle' },  // ALL triggers must match
     skill: 'data-access',
     text: 'TanStack Query defaults to staleTime: 0. Set a sensible default or every mount refetches.',
   },
   ```
2. **Triggers are compound.** `triggers` is `Record<string, string>` — every key/value pair must match the corresponding `stack.*` field. Compound triggers (`framework + database`) are how gotchas stay precise. See `matchGotchas()` in `src/utils/gotchas.ts`.
3. **Valid skill targets:** any of `CORE_SKILLS` + `CONDITIONAL_SKILL_TRIGGERS` names in `src/constants.ts` (`coding-standards`, `testing-standards`, `git-workflow`, `deployment`, `troubleshooting`, `ai-patterns`, `api-patterns`, `data-access`).
4. **Test it:**
   ```bash
   pnpm build
   cd /tmp && rm -rf gotcha-test && mkdir gotcha-test && cd gotcha-test
   git init -q
   echo '{"name":"x","dependencies":{"next":"14","drizzle-orm":"0.30"}}' > package.json
   git add -A && git -c user.email=t@t -c user.name=t commit -qm init
   ana init --yes
   grep "staleTime" .claude/skills/data-access/SKILL.md  # should find your gotcha
   ```
5. **Re-init is the negative test.** Delete `.ana/`, edit the gotcha out of the skill file, run `ana init --yes` again — your edit should survive. `scaffoldAndSeedSkills` sets `allowGotchaInjection = false` when a skill file already exists.

### 3. Adding a Service

Services show up in scan output and AGENTS.md's Services list. Two registration sites:

1. **Primary registration** in `src/engine/scan-engine.ts` at `EXTERNAL_SERVICE_PACKAGES`:
   ```typescript
   const EXTERNAL_SERVICE_PACKAGES: Record<string, { name: string; category: string }> = {
     // ...
     'replicate': { name: 'Replicate', category: 'ai' },
   };
   ```
2. **Category** should be one of: `ai`, `analytics`, `auth`, `backend`, `database`, `deployment`, `email`, `hosting`, `jobs`, `monitoring`, `payments`, `storage`, `other`.
3. **Naming convention for multi-provider SDKs:** use the branded name in stack (`'Vercel AI'`) and parenthesized variants in services (`'Vercel AI (Anthropic)'`, `'Vercel AI (OpenAI)'`). The exact-match filter in `injectAiPatterns` relies on this split.
4. **AI services have a second registration** in `AI_PACKAGES` in `src/engine/detectors/dependencies.ts` (used for stack-level SDK detection). Keep them aligned: if you add a package to one map, consider whether it belongs in both.
5. **Test:**
   ```bash
   ana scan /path/to/project-using-your-service
   # Look for your service in the Services section
   ```

### 4. Adding a Skill Template

Example throughout: adding a `code-review` skill for projects with CI configured.

1. **Create the template** at `templates/.claude/skills/<skill-name>/SKILL.md` (e.g. `.../code-review/SKILL.md`):
   ```markdown
   ---
   name: code-review
   description: "Invoke when reviewing PRs, critiquing code, or checking style compliance."
   ---

   # Code Review

   ## Detected
   <!-- Populated by scan during init. Do not edit manually. -->

   ## Rules
   - Rule 1
   - Rule 2

   ## Gotchas
   *Not yet captured. Add as you discover them during development.*

   ## Examples
   *Not yet captured.*
   ```
2. **Register it.** Two options:
   - **Core skill** (always scaffolded): add to `CORE_SKILLS` in `src/constants.ts`.
   - **Conditional skill** (scaffolded only when a trigger matches): add a predicate to `CONDITIONAL_SKILL_TRIGGERS` in `src/constants.ts`:
     ```typescript
     'code-review': (r) => r?.deployment?.ci !== null,
     ```
3. **Add a Detected section injector** (optional — only if the skill's Detected section should show project-specific data) in `src/commands/init/skills.ts` at `SKILL_INJECTORS`:
   ```typescript
   const SKILL_INJECTORS: Record<string, DetectedInjector> = {
     // ...
     'code-review': injectCodeReview,
   };

   function injectCodeReview(result: EngineResult): string {
     return result.deployment.ci ? `- CI: ${result.deployment.ci}` : '';
   }
   ```
4. **Test:**
   ```bash
   pnpm build
   ana init --yes /tmp/some-project
   ls .claude/skills/code-review/  # should exist
   cat .claude/skills/code-review/SKILL.md | head -20  # verify Detected section
   ```

---

## Code Patterns to Avoid

These are real anti-patterns found and removed during codebase cleanup. Do not reintroduce them.

### Type washing

**Do not** manually retype parameters or return values with looser types. The compiler cannot catch drift between the loose shape and the real shape.

```typescript
// BAD — the parameter shape is silently narrower than the real type
function mapConventions(raw: { naming: { files: { majority: string } } }): ConventionsOutput {
  return { naming: { files: { majority: raw.naming.files.majority } } };
}
```

```typescript
// GOOD — import the real type, let tsc enforce completeness
import type { ConventionAnalysis } from '../types/conventions.js';
function formatConventions(input: ConventionAnalysis): string { ... }
```

The architecture cleanup deleted `mapConventions` and `mapToPatternDetail` because they were the bridge between parallel type definitions that drifted silently on every schema change. Five type pairs are now unified via direct composition in `EngineResult`. If you find yourself writing a function that takes one type and returns a lightly-relabeled version of the same data, **stop** — unify the types instead.

### Phantom analyzers

**Do not** write analyzers that cast to nonexistent fields via `as unknown as`. The cast lies to the compiler; the code reads zeros; the tests assert on the zeros; nothing ever catches it.

```typescript
// BAD — this is what the deleted typeHints.ts / docstrings.ts did
const fn = parsedFunction as unknown as { returnType?: string; parameters?: { type: string }[] };
const annotated = fn.parameters?.filter(p => p.type).length ?? 0;
// fn.parameters is ALWAYS undefined because ParsedFile never populates it.
// The function always returns 0. The test asserts 0. It passes forever.
```

If you catch yourself writing `as unknown as <bigger type>`, stop and either extract the missing data for real (tree-sitter query work) or delete the analyzer.

Phantom tests are the corollary: `expect(result).toBe(0)` on a function that always returns 0 provides zero signal. Every new test must use input that *should* produce a non-default output. See `tests/engine/utils/service-annotation.test.ts` for the "stack field coverage" pattern that flags regressions rather than asserting on sentinels.

### Duplicate type definitions

**Do not** define the same concept twice — once on the detector side, once inline in `EngineResult`. The cleanup unified 5 such pairs (conventions, patterns, commands, git, deployment). The compile-time assertions in `tests/engine/types.test.ts` will fail if you regress any of them. If you need a new detector that feeds `EngineResult`, import the detector's type directly into the field declaration.

```typescript
// BAD
// engine/detectors/foo.ts:
export interface FooInfo { a: string; b: number; }
// engine/types/engineResult.ts:
foo: { a: string; b: number };  // duplicate — will drift

// GOOD
// engine/detectors/foo.ts:
export interface FooInfo { a: string; b: number; }
// engine/types/engineResult.ts:
import type { FooInfo } from '../detectors/foo.js';
foo: FooInfo;
```

---

## Error Handling Convention

Three patterns. Pick based on the caller's needs, not on reflex.

### 1. Silent catch for optional files

When a file is optional and its absence is not an error — use a narrow try/catch that swallows the error and returns an empty/default value. Example: `readFile()` in `src/engine/utils/file.ts`:

```typescript
export async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';  // empty = "this file didn't exist or couldn't be read; caller treats as absent"
  }
}
```

Use this for: missing lockfiles, missing config files, missing dependency manifests. The caller handles the empty value naturally.

### 2. Return null for fallible lookups

When a function looks up something that may or may not exist — return `null` or `undefined` instead of throwing. Example: `detectAiSdk()` in `src/engine/detectors/dependencies.ts`:

```typescript
export function detectAiSdk(allDeps: Record<string, string>): string | null {
  for (const [pkg, name] of AI_SDK_PACKAGES) {
    if (allDeps[pkg]) return name;
  }
  return null;  // no match — caller handles
}
```

Use this for: detectors, helpers that answer a yes/no question, parsers that may not find what they're looking for. The TypeScript type system enforces that the caller handles the `null` case.

### 3. Throw for real errors

When the operation MUST succeed and failure means the tool cannot continue — throw. Example: `state.ts` in `src/commands/init/` uses `catch (error)` to wrap the failure and `process.exit(1)`:

```typescript
} catch (error) {
  if (error instanceof Error) {
    console.error(chalk.red(`\n Init failed: ${error.message}`));
    console.error(chalk.gray('No changes made to your project.'));
  }
  process.exit(1);
}
```

Use this for: init pipeline phases, anything downstream of the atomic rename, any user-facing operation where silent failure would corrupt state.

### Do not introduce `Result<T, E>` types

TypeScript already has `T | null` and `T | undefined`. Those express "might fail" at the type level with zero runtime overhead. A `Result<T, E>` wrapper type adds an allocation per call, forces every caller to unwrap, and duplicates the work the type system already does.

The catch blocks in `src/` are all legitimately one of the three patterns above. None needed a Result wrapper. Document your error handling with a one-line comment at the catch site if it is not obvious which pattern applies.

---

## Branching Policy

**Branching policy: feature branches + PR review.**

1. Create a branch: `feature/<slug>` or `fix/<short-description>`
2. Open a PR to `main`
3. **CI must pass** — the workflow runs typecheck + typecheck:tests + lint + test + build on Ubuntu x Node 22/24
4. **Pre-commit hook** runs typecheck + typecheck:tests + lint locally on every commit (installed by husky; `pnpm install` sets it up)
5. **Human review required** before merge
6. **Squash-merge preferred** for clean history

Do not `--no-verify`. The pre-commit hook catches the exact class of bugs that let 140 silent type errors accumulate before they were cleaned up. If the hook fires, fix the issue — do not bypass it.

---

## Pull Request Process

1. Fork the repository (or create a branch if you have push access)
2. Create a feature branch: `git checkout -b feature/<name>`
3. Make your changes — the husky pre-commit hook will run checks on every commit
4. Run the full suite locally: `cd packages/cli && pnpm vitest run && pnpm lint && pnpm typecheck && pnpm typecheck:tests`
5. Push and open a Pull Request
6. Wait for CI — the same four checks run on Ubuntu x Node 22/24
7. Address review feedback

**PR requirements:**
- All tests pass (locally AND in CI)
- Lint clean (0 errors)
- `tsc --noEmit` clean on both `tsconfig.json` and `tsconfig.test.json`
- If you changed scan output behavior, include byte-diff evidence against a real project
- Update `ARCHITECTURE.md` if you added a module or extension point
- Update this file if you changed any of the extension-point guides above

---

## Code Style

- **TypeScript:** Strict mode enforced — `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. See `tsconfig.base.json`.
- **Formatting:** Prettier (2 spaces, single quotes)
- **Linting:** ESLint with `@typescript-eslint`. JSDoc required on public exports.
- **Imports:** Use `.js` extension for ESM imports (e.g., `import { x } from './foo.js'` even for a `.ts` file). Required for Node's native ESM loader.

---

Questions? Open an issue: https://github.com/TettoLabs/anatomia/issues
