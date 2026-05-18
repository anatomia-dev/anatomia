# Proof Chain Dashboard

123 runs · 72 active · 3 promoted · 648 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 9 | 7 |
| packages/cli/tests/commands/work.test.ts | 6 | 5 |
| packages/cli/src/engine/detectors/projectType.ts | 4 | 2 |
| packages/cli/tests/commands/proof.test.ts | 3 | 3 |
| packages/cli/src/utils/proofSummary.ts | 3 | 2 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 72 total)

### packages/cli/src/commands/check.ts

- **code:** Freshness section shows 'current' when scan data is unavailable (null result) — *Unified Staleness Awareness*

### packages/cli/src/commands/config.ts

- **test:** No dedicated test for empty-string buildPackage/testPackage rejection — verified by source inspection only — *Flip Monorepo Command Semantics*

### packages/cli/src/commands/init/state.ts

- **code:** pkg.path injected without sanitization in new buildPackageCmd and testPackageCmd — same known risk as monorepo-build-scoping-C5 — *Flip Monorepo Command Semantics*
- **code:** Build/lint scoping silently degrades when cwd is omitted — no warning that scoping was skipped — *Monorepo build command scoping*
- **code:** pkg.path injected into shell command without sanitization — path with spaces or special chars would produce broken subshell — *Monorepo build command scoping*

### packages/cli/src/commands/proof.ts

- **code:** commitAndPushProofChanges and pullBeforeRead exported from proof.ts instead of extracted to git-operations.ts — *Learn Session Memory*
- **code:** Duplicated zero-entry JSON payload — identical object literal at two call sites — *Audit matrix orientation*

### packages/cli/src/engine/detectors/git.ts

- **code:** Multi-remote repos: origin/ prefix stripping ignores non-origin remotes — *Fix scan branch detection — remove local branches from shared intelligence*
- **code:** detectBranches and detectBranchPatterns both run git branch -r independently — two subprocess calls for the same data — *Fix scan branch detection — remove local branches from shared intelligence*

### packages/cli/src/engine/detectors/projectType.ts

- **code:** hasRustWorkspace catch block unreachable — regex cannot throw — *Rust/Go Polyglot Detection*
- **code:** Priority ordering Python > Rust > Go in Tier 3 is implicit and untested — *Rust/Go Polyglot Detection*
- **code:** Tier 4 no-lockfile + pyproject with no real deps returns 0.70 — same confidence as Tier 5 bare package.json, indistinguishable to downstream consumers — *Polyglot Language Detection*
- **code:** nextSection search uses indexOf('\n[') which misses a section header at position 0 of the sliced block (no preceding newline) — *Polyglot Language Detection*

### packages/cli/src/engine/findings/rules/secrets.ts

- **code:** Single-angle pattern suppresses real passwords that happen to be lowercase words in angle brackets (e.g., <admin>, <token>) — *Fix Scanner Trust Output*

### packages/cli/src/utils/proofSummary.ts

- **code:** formatRelativeTime doesn't handle invalid input — produces 'NaNw ago' for bad ISO strings — *Audit matrix orientation*
- **code:** proofSummary.ts now ~2330 lines — past comfort threshold, growing — *Audit matrix orientation*

### packages/cli/tests/commands/init/monorepoCommandScoping.test.ts

- **test:** A007 tests null equality, not string equality — doesn't exercise the string-comparison branch — *Flip Monorepo Command Semantics*
- **test:** Repeated tmpDir/cwdDir setup+teardown boilerplate in every test — no shared beforeEach/afterEach — *Monorepo build command scoping*

### packages/cli/tests/commands/proof.test.ts

- **test:** A008/A009 use toBeDefined() instead of specific values for stale_count and recent_entries — *Audit matrix orientation*

### packages/cli/tests/engine/detectors/polyglot.test.ts

- **test:** A012 frameworkDeps test verifies detector-level cascade but not the actual scan-engine.ts ternary conditional — the ternary fix is tested structurally, not behaviorally — *Polyglot Language Detection*

### packages/cli/tests/engine/findings/secrets.test.ts

- **test:** A007 test asserts 'at least one critical' but doesn't verify BOTH passwords fire — url2 could silently pass — *Fix Scanner Trust Output*

### packages/cli/tests/utils/scan-freshness.test.ts

- **test:** No integration tests for output/JSON assertions — unit tests + source inspection chain only — *Unified Staleness Awareness*

### website/app/docs/proof/[slug]/page.tsx

- **code:** GitHub outage degrades valid new slugs to 404 — fetchProofChainEntry returns null on network failure, triggering notFound() — *Ship log proof linking*

### website/components/pricing/pricing.module.css

- **code:** Error color hardcoded as #ff8a8a on highlighted card instead of CSS custom property — *Team edition waitlist form*

### website/components/pricing/WaitlistForm.tsx

- **code:** Honeypot DOM input is dead code — JSON submission hardcodes _gotcha: '' regardless of field value — *Team edition waitlist form*
- **code:** Hidden _source DOM input is dead code — JSON body hardcodes _source value, DOM element never read — *Team edition waitlist form*
- **code:** Success message aria-live on freshly mounted element — screen readers may not announce dynamically inserted aria-live regions — *Team edition waitlist form*
- **code:** No client-side rate limiting — user can spam submit after error state re-enables the button — *Team edition waitlist form*

### website/components/system/Drawer.tsx

- **code:** Drawer moreCount has no floor guard — commandCount < 6 produces negative display — *Dynamic marketing stats — wire command count and version fallback*

### website/lib/proof-feed.ts

- **code:** VERSION_FALLBACK evaluated at module load time — single-shot, no retry on transient readFileSync failure — *Dynamic marketing stats — wire command count and version fallback*

