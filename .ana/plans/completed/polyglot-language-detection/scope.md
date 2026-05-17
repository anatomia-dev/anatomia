# Scope: Polyglot Language Detection

**Created by:** Ana
**Date:** 2026-05-16

## Intent

`detectProjectType` returns `'node'` the moment `package.json` exists. It never checks whether pyproject.toml also exists. Result: litellm (47k stars, YC W23, Python FastAPI) and langflow (140k stars, Python FastAPI) detect as "Node.js" because they have `package.json` + `package-lock.json` at root for their frontend UI tooling. A potential pilot customer seeing "Language: Node.js" on their Python project is an immediate credibility failure for Anatomia's core value proposition.

The fix introduces a tiered heuristic: when both `package.json` and `pyproject.toml` coexist, read pyproject.toml content to determine whether it's a real Python project (has `[project]` with dependencies, or `[tool.poetry.dependencies]`) or just tooling config (only `[tool.ruff]`/`[tool.black]` sections). This crosses the "exists-only" design boundary in `detectProjectType` — justified because polyglot repos are the norm and one conditional file read is negligible alongside 8 exists() checks.

## Complexity Assessment
- **Kind:** feature
- **Size:** medium — changes core detection logic with cascading effects, requires lockfile invariant tests before implementation
- **Files affected:**
  - `packages/cli/src/engine/detectors/projectType.ts` — rewrite the package.json detection block (~40 lines replaced)
  - `packages/cli/src/engine/scan-engine.ts` — one-line fix to `frameworkDeps` ternary (line 675)
  - `packages/cli/tests/engine/detectors/projectType.test.ts` — new invariant tests + update existing assertion (bare package.json confidence changes from 0.95 to 0.70)
  - `packages/cli/tests/engine/detectors/polyglot.test.ts` — new test file for the polyglot heuristic specifically
- **Blast radius:**
  - `frameworkDeps` selection affects which deps reach `detectFramework` — wrong fix here means no framework detection for polyglot repos
  - `depResult` (database, auth, payments) still comes from Node `allDeps` after type flip — documented as known limitation
  - The confidence value for bare package.json (no lockfile, no pyproject.toml) changes from 0.95 to 0.70 — one existing test assertion will break and must be updated
  - Any downstream code consuming `projectTypeResult.type` gets a different value for affected repos
- **Estimated effort:** 4-6 hours including invariant tests, implementation, and regression verification
- **Multi-phase:** no

## Approach

A tiered heuristic that preserves the existing fast path for obvious Node projects while adding content-aware disambiguation for polyglot repos. The tiers are:

1. **package.json + lockfile + no competing manifest** → Node (fast path, unchanged behavior)
2. **package.json + workspaces field** → Node (monorepo root, definitively Node even pre-install)
3. **package.json + lockfile + pyproject.toml with real project deps** → Python (the hard case, content read required)
4. **package.json + no lockfile + pyproject.toml** → Python (easy case, exists-check sufficient)
5. **package.json + no lockfile + no competing manifest** → Node at reduced confidence (0.70)

"Real project deps" means: pyproject.toml contains a `[project]` section (PEP 621) with 1+ entries in the `dependencies` array, OR contains `[tool.poetry.dependencies]` (Poetry) with 1+ entries. Either signals "this IS a Python project manifest" vs. "this is a Python tooling config file."

Additionally, the `frameworkDeps` monorepo ternary at line 675 must be patched: when type is non-Node, always use the language-specific `deps` for framework detection regardless of census layout. Without this, a polyglot repo whose package.json has workspaces-like structure would route Node deps to Python framework detection.

## Acceptance Criteria

- AC1: A repo with `package.json` + `package-lock.json` + `pyproject.toml` containing `[project]` with `dependencies = ["openai", "httpx"]` detects as `type: 'python'`.
- AC2: A repo with `package.json` + `pnpm-lock.yaml` and NO pyproject.toml detects as `type: 'node'` with confidence 0.95 (unchanged behavior).
- AC3: A repo with `package.json` + `workspaces` field in package.json detects as `type: 'node'` regardless of pyproject.toml presence.
- AC4: A repo with `package.json` (no lockfile) + `pyproject.toml` detects as `type: 'python'` with confidence 0.85.
- AC5: A repo with `package.json` (no lockfile) and NO other manifest detects as `type: 'node'` with confidence 0.70.
- AC6: A repo with `package.json` + `package-lock.json` + pyproject.toml containing ONLY `[tool.ruff]` (no `[project]`, no `[tool.poetry.dependencies]`) detects as `type: 'node'`.
- AC7: Anatomia's own repo (`package.json` + `pnpm-lock.yaml`, no pyproject.toml) still detects as `type: 'node'`.
- AC8: After type flip to Python, `detectFramework` receives Python deps (not Node primaryDeps) and correctly detects FastAPI/Django/Flask.
- AC9: Lockfile invariant tests exist and pass BEFORE the polyglot logic is implemented: `package.json + any-lockfile + NO-pyproject.toml → MUST be node`.
- AC10: All existing tests pass (one assertion updated: bare package.json confidence 0.95 → 0.70).
- AC11: `bun.lock` (Bun 1.2+ text-based lockfile) is recognized alongside `bun.lockb`.

## Edge Cases & Risks

- **Node project with pyproject.toml for tooling (ruff/black config):** Handled. Tooling-only pyproject.toml has no `[project]` section and no `[tool.poetry.dependencies]`. The content check correctly identifies these as "not a Python project." They stay Node.
- **Poetry project without `[project]` section:** Poetry projects use `[tool.poetry.dependencies]` instead of PEP 621's `[project]`. The check covers both forms. Validated: this catches Poetry-based Python projects that don't adopt PEP 621.
- **Malformed pyproject.toml:** If the file can't be read or parsed, fall through to Node (conservative default). The heuristic should never crash.
- **litellm's Prisma in package.json:** After type flip, `depResult` (from `detectFromDeps(allDeps)`) still reads Node deps. litellm will show `database: 'Prisma'` from its frontend package.json even though the real DB is PostgreSQL via Python. Result: "Python / FastAPI / Prisma" — partially wrong but STILL better than current "Node.js / unknown / Prisma." Documented as known limitation. Fix path: `detectNonNodeDatabase(deps)` enrichment in a follow-up scope using the same pattern as `detectNonNodeAiSdk`.
- **Fresh Node project without lockfile:** A developer who ran `npm init` but hasn't run `npm install` gets confidence 0.70 instead of 0.95. This is intentional — without a lockfile, the signal IS weaker. The troubleshooting skill already recommends "Install dependencies first." No user-facing regression (confidence isn't displayed).
- **Existing test breakage:** `projectType.test.ts` line 36-45 creates bare package.json (no lockfile). Currently asserts confidence 0.95. After fix, returns 0.70. This test must be updated — it's testing the right behavior for the new heuristic.
- **Go projects with package.json:** Same logic applies. `package.json + no lockfile + go.mod` → Go. `package.json + lockfile + go.mod` → needs go.mod content check (future scope). For now, Go is not affected because no Go repo in the test matrix has both. Document that the pattern extends to Go/Rust if needed.
- **Performance:** One additional `readFile` call for pyproject.toml, ONLY when both package.json AND pyproject.toml exist AND a lockfile is present. For the common case (package.json + lockfile, no pyproject.toml), zero additional I/O.

## Rejected Approaches

- **Source file counting as primary heuristic:** Count `.py` vs `.ts` files to determine primary language. Rejected: adds filesystem traversal to a hot path, threshold is arbitrary, doesn't work for repos where frontend has many .ts files (litellm's admin UI), and is slower than one content read. Reserved as a backup tiebreaker if edge cases emerge post-ship.
- **Entry point heuristic (`main.py`, `app.py` exists):** Rejected: too many false negatives (FastAPI projects use `uvicorn app.main:app`, not a root `main.py`). Not reliable enough for a primary signal.
- **README parsing:** Check first 20 lines for "pip install" vs "npm install". Rejected: fragile, language-dependent, and doesn't work for repos with minimal READMEs.
- **Package.json dep count threshold (≤3 deps = tooling):** Rejected: litellm's package.json has real frontend deps (React, Prisma). The threshold would need to be high enough to not misclassify real frontends, which makes it useless as a discriminator.
- **Changing `stack.aiSdk` type to string[] for polyglot:** Rejected: breaking change to EngineResult consumed by display, skills, gotchas. Out of scope. The enrichment pattern (fill when null) handles priority correctly.

## Open Questions

- None. All heuristic details validated against both motivation repos. litellm has `[project]` with dependencies. langflow has `[project]` with 1 dependency. Neither has `workspaces` in package.json. The approach is confirmed.

## Exploration Findings

### Patterns Discovered
- `projectType.ts:41-47`: The early-return on package.json. Currently checks lockfiles as indicators (records them) but returns `'node'` regardless of whether lockfiles exist.
- `scan-engine.ts:675-677`: The `frameworkDeps` monorepo ternary. Uses `census.primaryDeps` (Node deps from primary workspace package) when layout is monorepo, `deps` (language-specific) otherwise. After type flip, this must always use `deps`.
- `scan-engine.ts:651-652`: `allDeps = census.allDeps` and `depResult = detectFromDeps(allDeps)` — these are set BEFORE type detection and never re-evaluated. This is why database/auth/payments still come from Node deps after type flip.

### Constraints Discovered
- [TYPE-VERIFIED] litellm pyproject.toml has `[project]` with dependencies (openai, httpx, many more)
- [TYPE-VERIFIED] langflow pyproject.toml has `[project]` with `dependencies = ["langflow-base[complete]>=0.9.3"]` — 1 entry, meets 1+ threshold
- [TYPE-VERIFIED] Neither litellm nor langflow has `workspaces` field in root package.json
- [TYPE-VERIFIED] Both litellm and langflow have `package-lock.json` at root — lockfile-only heuristic insufficient
- [OBSERVED] `confidence` field from projectTypeResult is not consumed by scan-engine.ts — changing it has no behavioral effect downstream
- [OBSERVED] litellm's package.json has Prisma in dependencies — after type flip, `depResult.database` will show "Prisma" from Node deps (known limitation)

### Test Infrastructure
- `tests/engine/detectors/projectType.test.ts`: Existing tests use temp directories with files written via `fs.writeFile`. Pattern: create dir, write manifest files, call `detectProjectType(dir)`, assert result. The polyglot tests follow this pattern — write both `package.json` + lockfile + `pyproject.toml` with specific content.

## For AnaPlan

### Structural Analog
The existing `detectProjectType` function itself (projectType.ts:35-80) is the analog — it's the code being modified. The PATTERN to follow is the existing lockfile indicator recording (lines 43-46) which already checks multiple lockfile types. The new code extends this pattern: after lockfile checks, conditionally read pyproject.toml content.

### Relevant Code Paths
- `packages/cli/src/engine/detectors/projectType.ts:35-80` — the function to modify
- `packages/cli/src/engine/scan-engine.ts:660-668` — where `deps` is overwritten based on projectType (confirms the cascade)
- `packages/cli/src/engine/scan-engine.ts:675-677` — the `frameworkDeps` ternary to patch
- `packages/cli/src/engine/scan-engine.ts:651-652` — `allDeps` and `depResult` (unchanged, source of known limitation)
- `packages/cli/src/engine/parsers/python/pyproject.ts` — pyproject.toml parser (for reference on TOML parsing approach, though the type detection only needs section-level checks, not full dep parsing)
- `packages/cli/tests/engine/detectors/projectType.test.ts:36-45` — the test that will break (bare package.json confidence assertion)

### Patterns to Follow
- The pyproject.toml content check should be a focused helper function (e.g., `hasPythonProjectDeps(content: string): boolean`) that does simple string/regex matching for `[project]` + `dependencies` or `[tool.poetry.dependencies]`. It does NOT need full TOML parsing — section headers and key presence are sufficient.
- Error handling: wrap the file read in try/catch, fall through to Node on any failure (conservative default).
- The `frameworkDeps` fix is a one-line change to the existing ternary condition — add `&& projectTypeResult.type === 'node'`.

### Known Gotchas
- The existing `parsePyprojectToml` in `parsers/python/pyproject.ts` is a FULL dependency parser (extracts package names). The type detection check does NOT need this — it only needs to know "does `[project]` with `dependencies` exist?" Don't import or reuse the full parser. A lightweight section-presence check is correct.
- Writing the lockfile invariant tests FIRST is a real requirement, not ceremony. The test should assert `package.json + pnpm-lock.yaml → node` BEFORE the polyglot code exists. Then verify the test still passes after the polyglot code is added. This proves the Node fast-path is preserved.
- The `bun.lock` file (Bun 1.2+, text-based) is DIFFERENT from `bun.lockb` (binary). Both must be checked. The current code only checks `bun.lockb`.

### Things to Investigate
- Whether the existing `parsePyprojectToml` utility can be partially reused for section detection, or whether a simpler regex/string check is better. The full parser does dependency extraction; the type check only needs section presence. Likely simpler to write a 10-line helper than import and partially use the full parser.
