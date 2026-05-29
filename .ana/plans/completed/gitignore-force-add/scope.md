# Scope: Force-add gitignored infrastructure in init commit

**Created by:** Ana
**Date:** 2026-05-29

## Intent

When a host repo gitignores paths under `.claude/`, `ana init commit` silently drops infrastructure files from the commit. Skills, agents, settings.json, and hooks vanish from git — and therefore from worktrees where Build and Verify actually run. The pipeline degrades or breaks entirely without warning.

Discovered during real-world testing on 4 external repos. 1 of 3 fully-set-up repos (langfuse, 28K stars) hit this. The teams most likely to adopt Anatomia — teams already using Claude Code — are the most likely to have `.claude/` gitignore entries.

The user wants `ana init commit` to detect gitignored infrastructure files and force-add them, with clear output explaining what happened and an opt-out flag.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — one file changed, one new function, tests
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/init/commit.ts` — new `discoverGitignoredFiles()` function, modified staging to use `git add -f`, `--respect-gitignore` flag
  - `packages/cli/tests/commands/init/commit.test.ts` — tests for gitignore detection and force-add behavior
- **Blast radius:** Low. Changes are additive to the existing commit flow. The `discoverDirtyFiles()` function is unchanged — a new function handles the second pass. The `git add` call gains `-f` only for the gitignored subset. Existing behavior for repos without gitignore conflicts is identical.
- **Estimated effort:** 2-3 hours
- **Multi-phase:** no

## Approach

Add a second discovery pass after `discoverDirtyFiles()` that checks whether expected infrastructure files exist on disk but weren't discovered (meaning they're gitignored). Use `git check-ignore --stdin` for batch detection. Force-add those files with `git add -f`, print explicit output explaining what happened, and provide `--respect-gitignore` for teams that deliberately don't want this.

The existing `discoverDirtyFiles()` stays unchanged — it handles the normal case. The new function handles the gitignore edge case. Two separate file lists, two separate `git add` calls (normal and forced).

## Acceptance Criteria
- AC1: When any infrastructure file under KNOWN_ROOTS (`.ana/`, `.claude/`) or KNOWN_ROOT_FILES (`CLAUDE.md`, `AGENTS.md`) exists on disk but is gitignored, `ana init commit` force-adds it and includes it in the commit. Detection enumerates actual files on disk — not a hardcoded filename list — so ENRICHMENT.md files, future skill additions, nested agent files, and any other infrastructure files are covered automatically.
- AC2: Force-added files appear in the committed changeset (verifiable via `git log --name-only`).
- AC3: Console output explicitly names the force-added files and explains why (pipeline worktree compatibility).
- AC4: `--respect-gitignore` flag skips force-add and prints a warning that these files won't be available in worktrees.
- AC5: When no infrastructure files are gitignored, behavior is identical to current — no extra output, no `-f` flag.
- AC6: The `.claude/.gitignore` entries we create (agent-memory/, settings.local.json) are NOT force-added — only infrastructure files that Anatomia needs committed.
- AC7: Force-add works through nested gitignore scenarios (host root `.gitignore` + our `.claude/.gitignore`).

## Edge Cases & Risks

- **Entire `.claude/` gitignored:** Should still detect and force-add all infrastructure files within it. `git check-ignore` will match individual file paths even when the parent directory pattern is the one doing the ignoring.
- **Negation patterns:** A gitignore like `.claude/*` / `!.claude/settings.json` means settings.json is NOT ignored. `git check-ignore` handles this correctly — we don't need to parse gitignore ourselves.
- **Global gitignore (`~/.gitignore_global`):** `git check-ignore` respects global gitignore too. Force-add works through it. This is correct — the user ran `ana init` locally, they want these files committed.
- **Files that are both gitignored AND already tracked:** `git check-ignore` still reports them as ignored, but `git add -f` is a no-op for already-tracked files. Harmless.
- **Our own EXCLUDED_PREFIXES paths:** `agent-memory/`, `settings.local.json`, `.ana/state/`, `.ana/plans/` — these must NOT be force-added. Apply the same `isExcluded()` filter to the gitignored set.
- **Performance:** `git check-ignore --stdin` is a single subprocess call. The infrastructure file list is bounded (currently ~20 files max). No performance concern.

## Rejected Approaches

### Interactive prompt (REQ Option B)
The REQ proposed an interactive choice (force-add / skip / show details). Rejected because `init commit` is used by agents, scripts, and in non-interactive contexts. An interactive prompt would break automation. Instead: force-add by default with `--respect-gitignore` opt-out.

### Moving skills/agents to `.ana/`
Considered relocating all infrastructure to `.ana/` where we control the directory. Rejected because Claude Code reads agents from `.claude/agents/` and skills from `.claude/skills/` — those paths aren't configurable. We must write there.

### Warning at init time / guard at setup time
The REQ proposed warnings at `ana init` and guards at `ana setup`. These are UX polish, not correctness fixes. If `init commit` force-adds successfully, init can create files freely and setup enrichments will persist. The commit fix is necessary and sufficient. Init/setup guards can be added later if the UX gap bothers us.

### Silent force-add (REQ Option A as stated)
The REQ's Option A recommends `git add -f` without calling it "silent," but the description implies no opt-out. We add the `--respect-gitignore` flag because overriding a team's gitignore without any escape hatch violates the principle of informed consent. The default is still force-add — but the team can say no.

## Open Questions

None. All design questions resolved during scoping conversation.

## Exploration Findings

### Patterns Discovered
- `commit.ts:92-169`: `discoverDirtyFiles()` uses `git status --porcelain` which excludes gitignored files by design. The blind spot is structural, not a bug in the implementation.
- `commit.ts:328`: `git add` without `-f` — the staging call that silently skips gitignored files.
- `assets.ts:169-265`: `createClaudeConfiguration()` writes to `.claude/` directly in cwd, after the atomic swap. No gitignore awareness.
- `commit.test.ts`: Tests use temp dirs with real git repos (mkdtemp + git init). Well-structured helpers for running the command and capturing output.

### Constraints Discovered
- [TYPE-VERIFIED] git check-ignore --stdin (git builtin) — exits 0 when paths are ignored, 1 when not. Supports batch checking via stdin. Single subprocess call.
- [TYPE-VERIFIED] EXCLUDED_PREFIXES (commit.ts:47-55) — must be respected in the force-add pass. `agent-memory/`, `settings.local.json`, `.ana/state/`, `.ana/plans/` should never be force-added.
- [OBSERVED] KNOWN_ROOTS covers `.ana/` and `.claude/` — the force-add pass should cover the same roots plus `CLAUDE.md` and `AGENTS.md`.
- [OBSERVED] `.claude/.gitignore` created by init (assets.ts:187-191) — ignores `agent-memory/` and `settings.local.json`. These are correctly excluded from infrastructure commits by EXCLUDED_PREFIXES.

### Test Infrastructure
- `commit.test.ts`: Uses `fsp.mkdtemp` + `git init -b main` + `process.chdir`. `createProject()` helper bootstraps `.ana/ana.json`. `runInitCommit()` helper captures stdout/stderr/exitCode by mocking process.exit and console.

## For AnaPlan

### Structural Analog
`discoverDirtyFiles()` in commit.ts — the new `discoverGitignoredFiles()` function follows the same pattern: walk known roots, collect file paths, filter exclusions, return sorted array. Same inputs (projectRoot), same return type (string[]), same filtering (isExcluded).

### Relevant Code Paths
- `packages/cli/src/commands/init/commit.ts` — the entire file. The new function slots in after `discoverDirtyFiles()` at line 315. The `git add` call at line 328 needs a conditional `-f` variant for the gitignored subset.
- `packages/cli/tests/commands/init/commit.test.ts` — add test section for gitignore detection and force-add.

### Patterns to Follow
- Function signature matches `discoverDirtyFiles(projectRoot: string): string[]`
- Use `spawnSync` for `git check-ignore` (same as `git status` call in discoverDirtyFiles)
- Export the new function for direct testing (same as `discoverDirtyFiles` and `isExcluded`)
- Test pattern: create `.gitignore` with relevant entries in the temp git repo, create files on disk, verify they appear in the gitignored discovery set

### Critical Design Constraint: Enumerate Files on Disk, Not a Static List
The function MUST walk the filesystem under KNOWN_ROOTS (`.ana/`, `.claude/`) and KNOWN_ROOT_FILES (`CLAUDE.md`, `AGENTS.md`, plus monorepo AGENTS.md) to collect candidate paths, then batch-check them against `git check-ignore --stdin`. Do NOT hardcode a list of expected filenames like `['.claude/skills/coding-standards/SKILL.md', '.claude/agents/ana.md', ...]`. The file enumeration must be dynamic because:
- Skills have both SKILL.md and ENRICHMENT.md files
- New skills may be added to templates in future releases
- Users may add custom skill directories
- Agent file names may change
- `.ana/` contains nested directories (context/, scan.json, ana.json, learn/)

The approach: `fs.readdirSync` (recursive) on each KNOWN_ROOT that exists on disk, convert to repo-relative paths, filter through `isExcluded()`, then batch-check the survivors against `git check-ignore --stdin`. This mirrors how `discoverDirtyFiles` works with KNOWN_ROOTS — same roots, different detection mechanism.

### Known Gotchas
- `git check-ignore` exits 1 when NO paths are ignored (not an error — it means nothing matched). Don't treat exit code 1 as failure.
- The `--stdin` flag reads paths from stdin, one per line. Output contains only the paths that ARE ignored. Parse output lines, not exit code, to get the actual ignored paths.
- `git status --porcelain` reports untracked directories as `?? .claude/` (trailing slash, directory entry) not individual files. The force-add pass needs to enumerate actual files on disk, not rely on git status output.
- The `registerInitCommitCommand` function registers a Commander action. The `--respect-gitignore` option needs to be added to the command definition before `.action()`.
- `fs.readdirSync` with `{ recursive: true }` returns all nested entries. Filter to files only (not directories) since `git add` operates on files.

### Things to Investigate
- Whether `git add -f` on a gitignored file that's inside an untracked parent directory (e.g., `.claude/` is entirely new and ignored) requires the parent to exist in the index first, or handles it automatically. Test this in the spec's contract.
