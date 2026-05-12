# Proof Chain Dashboard

79 runs · 196 active · 97 lessons · 0 promoted · 161 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/tests/commands/work.test.ts | 15 | 11 |
| packages/cli/src/commands/work.ts | 15 | 8 |
| packages/cli/tests/commands/proof.test.ts | 11 | 5 |
| website/lib/proof-feed.ts | 10 | 3 |
| packages/cli/tests/commands/artifact.test.ts | 8 | 4 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 196 total)

### packages/cli/src/commands/artifact.ts

- **code:** git commit -- uses --only semantics (working tree, not index) — safe because git add and commit are adjacent synchronous calls, but undocumented assumption — *CLI commits scoped to intended paths*
- **code:** Site 2 stages plan.md with absolute path via runGit but tracks relative path in stagedPaths — works correctly but mixed path convention — *CLI commits scoped to intended paths*

### packages/cli/src/commands/config.ts

- **code:** displayAll shows empty object as JSON.stringify output (e.g., '{}') — inconsistent with nested object display pattern which uses indentation — *Configurability Improvements*
- **code:** Synchronous fs operations (readFileSync/writeFileSync) — works for a CLI tool but blocks the event loop during file I/O — *Configurability Improvements*
- **code:** Machine-managed check blocks dot-paths into managed fields (e.g., 'setupPhase.sub') — defensive and correct, but not spec-required. Minimal over-building. — *Configurability Improvements*

### packages/cli/src/commands/init/anaJsonSchema.ts

- **code:** Type widening from .passthrough() adds [k: string]: unknown to AnaJson — safe now but fragile if consumers enumerate keys — *Configurability Improvements*

### packages/cli/src/utils/update-check.ts

- **code:** packageName interpolated via template literal without JSON.stringify in spawn script URL — *Version Awareness Notifications*
- **code:** Four of five exports from update-check.ts are unused in production code — only checkForUpdates is imported — *Version Awareness Notifications*
- **code:** Spawn script uses require() (CommonJS) inside node -e — works but inconsistent with ESM codebase — *Version Awareness Notifications*

### packages/cli/templates/.claude/agents/ana-verify.md

- **code:** Step 7 body condensed from 3-line bulleted list to single line — functionally correct but less scannable for agents — *Configurability Improvements*
- **code:** ana-verify.md wording tweaked — out of scope, harmless formatting change — *Init must surface scan quality and pipeline readiness*

### packages/cli/tests/commands/config.test.ts

- **test:** A011 assertion uses toBeDefined() — JSON.parse would throw before reaching it, so the assertion is tautological — *Configurability Improvements*

### packages/cli/tests/commands/init-preflight.test.ts

- **test:** A014 uses toBeGreaterThan(0) — weak assertion when specific count is knowable — *Init must surface scan quality and pipeline readiness*
- **test:** A015 uses toBeGreaterThanOrEqual(3) — specific count should be exactly 3 (user.name, user.email, gh) — *Init must surface scan quality and pipeline readiness*

### packages/cli/tests/commands/init-spinner.test.ts

- **test:** Test files split from init.test.ts into init-spinner.test.ts and init-preflight.test.ts — sound decision for vi.mock isolation but spec said modify init.test.ts only — *Init must surface scan quality and pipeline readiness*

### packages/cli/tests/commands/init.test.ts

- **test:** A018/A019/A020 assert on template source content — violates 'never assert on source code content' rule but acceptable for static templates — *Init must surface scan quality and pipeline readiness*
- **test:** A022 asserts on scan-engine.ts source content — same pattern, acceptable for 'not modified' assertion — *Init must surface scan quality and pipeline readiness*

### packages/cli/tests/commands/work.test.ts

- **test:** No integration tests for artifact.ts or proof.ts scoped commit sites — 9 of 14 assertions verified by source inspection only — *CLI commits scoped to intended paths*
- **test:** Test uses toContain('completed/') for path matching — works in controlled test but would false-positive if any other path contained 'completed/' — *CLI commits scoped to intended paths*
- **test:** A020, A021 assert on source code content instead of testing behavior — *work complete --merge flag for structured PR merging*

### packages/cli/tests/utils/git-operations.test.ts

- **code:** Unspecified file change in git-operations.test.ts — flipped strip assertion to preservation assertion, necessary and correct — *Configurability Improvements*

### packages/cli/tests/utils/update-check.test.ts

- **test:** A007 tagged test checks return values not output — contract target is 'output' with not_contains 'Error' — *Version Awareness Notifications*
- **test:** A010 tagged test checks spawn not called — contract target is updateAvailable equals null, which is tested in untagged CI test — *Version Awareness Notifications*

### website/components/system/Drawer.tsx

- **code:** Drawer sectionRef prop is dead code — defined but never passed by SystemSection — *Section 4 — The System (replace Bento)*

### website/components/system/ManPage.tsx

- **code:** ManPage footer date '2026-05' is a hardcoded string — will go stale monthly — *Section 4 — The System (replace Bento)*

### website/components/system/system.module.css

- **code:** color-mix() CSS function used for hover effects — ~93% browser support, older browsers get no hover feedback — *Section 4 — The System (replace Bento)*

### website/components/system/SystemSection.tsx

- **code:** SystemSection closer does not use SectionThread component — pattern duplication — *Section 4 — The System (replace Bento)*

### website/components/ui/SectionThread.tsx

- **code:** SectionThread breathe prop applies undefined animate-breathe CSS class — no-op if invoked — *Section 4 — The System (replace Bento)*

### website/lib/copy.ts

- **code:** copy.ts systemThread key is defined but never consumed by any component — dead data — *Section 4 — The System (replace Bento)*

### General

- **test:** A006-A009 have no @ana tags in this build's test files — verified by source inspection and dogfood sync test — *Configurability Improvements*

