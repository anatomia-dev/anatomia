# Spec: The requirements contract — validated upstream intake

**Created by:** AnaPlan
**Date:** 2026-07-01
**Scope:** .ana/plans/active/requirements-contract/scope.md

## Approach

Introduce a **new artifact class upstream of work items**, assembled entirely from patterns the CLI already trusts. No new pipeline stage, no changes to `parseArtifactType`/`saveArtifact`, no registry contortion. The design is four layers plus two minimal edits to hot files:

1. **`src/utils/req-frontmatter.ts` (new, pure — no CLI deps).** The single frontmatter primitive every other layer builds on. `parseRequirement(content)` splits the leading `---` YAML block from the markdown body, `yaml.parse`s the frontmatter, and returns `{ frontmatter, body, hadFrontmatter }` — **preserving unknown keys and the body verbatim**. `serializeRequirement(frontmatter, body)` re-emits the file with enums canonicalized (lowercase) and unknown keys round-tripped in insertion order, leaving the body byte-for-byte untouched. This is the *elegant-solution-removes-duplication* decision (design principle: "the elegant solution is the one that removes"): validator, `req list`, the claim rewrite, and the archive move all consume ONE parse/serialize implementation — so Ana Remote's future server-side validation reuses it rather than growing a second parser that drifts.

2. **`validateReqFormat` added to `src/commands/artifact-validators.ts`.** Pure `(filePath: string) => string | null`, mirroring `validateScopeFormat` in the same file (structural analog). Returns a specific, human error string for the first violation, or `null` when valid. Consumes `parseRequirement`. Wired to a red-print + `process.exit(1)` call site in `req.ts`, exactly as `validateScopeFormat` is wired at `artifact.ts:1118`.

3. **`src/commands/req-state.ts` (new leaf module, modeled on `work-state.ts`).** Houses all requirement state logic so `work.ts` stays thin: dual-mode `discoverRequirements` (mirrors `discoverSlugs`), `buildRequirementList` (parse each file, mark malformed + stale), `getRequirementsSummary` (the cheap status probe), `claimRequirement`, `archiveRequirementsForSlug`. No chalk/commander — pure state + git, returns data.

4. **`src/commands/req.ts` (new command group).** The `list` / `validate` / `new` subcommands — the CLI/chalk layer. Registered in `index.ts` under the existing `PIPELINE` group, modeled on `registerPlanCommand`.

Minimal edits to hot files:
- **`work.ts`** — one call to `getRequirementsSummary` + one ℹ line in `printNotifications`. Nothing else.
- **`init/state.ts`** — one copy-block in `preserveUserState` mirroring the existing `plans/active` block, plus one line in the policy doc comment.
- **`templates/.claude/agents/ana.md` + `templates/.codex/agents/ana.md`** — three touchpoints, identical bodies.

**Open questions resolved (from scope):**
- *Record the claim on the work-item side?* → **Back-pointer only** (`claimed_by`). The proof-chain schema stays untouched; Think's `**Requirement:** REQ-<id>` preview line is the human link.
- *`StatusOutput.requirements` shape?* → `{ open: number; highestPriority: string }`, **present only when `open ≥ 1`, omitted when the folder is absent/empty** (developer-confirmed 2026-07-01). This is the forced resolution of the AC6 tension — "byte-identical to today" is load-bearing (AC12), so an always-present field is disallowed. Nothing else in the JSON contract needs adjusting.

**Scope corrections (verify before trusting the scope's file list):**
- `validateReqFormat` belongs in **`src/commands/artifact-validators.ts`**, NOT `src/utils/artifact-validators.ts` (the scope's path is wrong — the file lives in `commands/`).
- The AC3 alias test uses an **inline fixture**, not the external `anatomia_reference/REQs/` corpus — that path does not exist in this checkout.

## Output Mockups

**`ana req new proof-viewer`** → creates `.ana/requirements/REQ-proof-viewer.md`:

```markdown
---
req: REQ-proof-viewer
title: <one-line title>
priority: unset          # critical | high | medium | low | unset — unset is honest; proposing a priority is Think's job
status: open
created: 2026-07-01
source: hand-written
# appetite: worth a week, no more   # optional worth-ceiling — what it's worth, NOT a cost estimate
---

## Problem
<The disease in one or two sentences. Root cause, not symptom.>

## Evidence
<Why this matters. For tech debt, the code fact IS the evidence — cite file:line; don't restate it in business-speak. For product, "founder reports X" is honest; don't embellish.>

## Done Looks Like
<Observable outcome. Not a solution — a finish line.>

## Leads
<OPTIONAL, UNTRUSTED. Proposed fixes, file:line pointers, known traps. Think may adopt or discard — any claim here is re-verified against the code, never imported on faith.>
```

**`ana req list`** (human):
```
REQ-proof-viewer      high     open      3d    Proof Explorer viewer page
REQ-cli-telemetry     medium   claimed   1d    Anonymous CLI usage telemetry
REQ-legacy-thing      ⚠ malformed — unknown frontmatter field 'severity'
REQ-old-claim         high     claimed   9d    Refactor scan cache   ⚠ stale (claimed_by 'scan-cache' not in plans/active)

2 open · 1 claimed · 1 malformed
```

**`ana req list --json`**:
```json
[
  { "req": "REQ-proof-viewer", "priority": "high", "status": "open", "created": "2026-06-28", "title": "Proof Explorer viewer page", "malformed": false, "stale": false },
  { "req": "REQ-legacy-thing", "malformed": true, "error": "unknown frontmatter field 'severity'" }
]
```

**`ana work status`** (human, with 2 open requirements) — the new ℹ line joins the existing notification channel:
```
ℹ 2 open requirements (highest: high). Run: ana req list
```

**`ana work status --json`** with open requirements (field present ONLY when open ≥ 1):
```json
{
  "artifactBranch": "main",
  "requirements": { "open": 2, "highestPriority": "high" },
  "items": []
}
```
With no requirements folder → **no `requirements` key, no ℹ line** — byte-identical to today.

**`ana req validate <file>`** — valid exits 0 silently (or a green ✓); each violation prints one red, specific line and exits 1:
```
Error: requirement format invalid.
priority must be one of: critical, high, medium, low, unset. Got: 'P1'
```

## File Changes

### src/utils/req-frontmatter.ts (create)
**What changes:** Pure frontmatter primitive. `parseRequirement(content) => { frontmatter: Record<string, unknown>; body: string; hadFrontmatter: boolean }` and `serializeRequirement(frontmatter, body) => string`. Export a `RequirementFrontmatter` interface and the enum constants (`PRIORITY_VALUES`, `STATUS_VALUES`, `RESOLUTION_VALUES`, `PRIORITY_ORDER`). Enum canonicalization (case-insensitive → lowercase) lives here as a helper both the validator and serializer use.
**Pattern to follow:** `yaml` (^2.8, already a dep) for parse/stringify. Keep it pure like `src/utils/verdict.ts` — data in, data out, zero chalk.
**Why:** One parse/serialize implementation. Without it, four consumers grow four frontmatter parsers that drift on the first Ana-Remote metadata key.

### src/commands/artifact-validators.ts (modify)
**What changes:** Add `validateReqFormat(filePath: string): string | null`. Check, in order, returning a specific message on first failure: frontmatter present & parseable; no unknown frontmatter keys (allowlist the known set); `req` === `path.basename(filePath, '.md')`; `priority`/`status` in enum (case-insensitive); `created` parses as a date; `resolution` present **iff** `status === 'archived'` and in enum when present; `appetite` non-empty if the key is present; required sections `## Problem`, `## Evidence`, `## Done Looks Like` present and non-empty (accepting the aliases below). Return `null` when valid.
**Pattern to follow:** `validateScopeFormat` (same file, lines 157–283) — the required-section extraction loop, the exact-enum check (`Kind`), and the message style are the template. Reuse its section-extraction approach for the Problem/Evidence/Done blocks.
**Why:** The hard gate. `ana req validate` is where machine-read strictness lives; without exact-enum + section checks a malformed requirement reaches a consuming agent as if it were trusted.

**Section aliases (grandfather the team's hand-written corpus):** `Problem` ← `Disease`; `Evidence` ← `Why This Matters`; `Done Looks Like` ← `What to Build`; `Not This` ← `What NOT to Build`; `Leads` ← `Proposed Fix`, `Rabbit Holes`. A required section is satisfied by its canonical heading OR any alias.

### src/commands/req-state.ts (create)
**What changes:** Leaf state module. Functions:
- `discoverRequirements(projectRoot, artifactBranch, onArtifactBranch): string[]` — dual-mode enumeration of `.ana/requirements/*.md` (root only, not `archived/`). Filesystem on the artifact branch; `git ls-tree --name-only origin/<branch> .ana/requirements/` otherwise. Non-zero git exit → `[]`.
- `buildRequirementList(projectRoot, artifactBranch, onArtifactBranch): RequirementListItem[]` — parse each discovered file; on parse/validation failure mark `{ malformed: true, error }` instead of throwing; cross-reference `claimed_by` against `discoverSlugs(...)` (imported from `work-state.ts`) to set `stale`. Sort by `PRIORITY_ORDER` then `created`.
- `getRequirementsSummary(projectRoot, artifactBranch, onArtifactBranch): { open: number; highestPriority: string } | null` — the status probe. Counts `status: open` files and finds the highest priority by `PRIORITY_ORDER`. Wrapped in try/catch → returns `null` on ANY error. **Reads no config files.**
- `claimRequirement(projectRoot, reqId): { path: string } ` — resolve `reqId` to exactly one root file (error naming both paths if ambiguous per the duplicate-id edge case; error if missing or `status !== 'open'`); rewrite frontmatter `status: claimed`, `claimed_by: <slug>` via `serializeRequirement`. **Throws typed errors** the caller surfaces.
- `archiveRequirementsForSlug(projectRoot, slug): string[]` — find root requirements with `claimed_by === slug`, move each to `.ana/requirements/archived/` with `status: archived`, `resolution: completed`. Returns moved paths. Caller wraps best-effort.
**Pattern to follow:** `work-state.ts` — leaf module, dual-mode `discoverSlugs` (lines 159–184) is the exact enumeration analog; import `discoverSlugs` from it for the stale check.
**Why:** Keeps `work.ts` (proof-chain hot spot #1) from absorbing requirement logic. All new surface area lands in a fresh, testable module.

### src/commands/req.ts (create)
**What changes:** `registerReqCommand(program)` adding a `req` group with `list` (`--json`), `validate <file>`, and `new <id>`. `new` normalizes `<id>` (strip a leading `REQ-`/`req-` if the user typed it), writes `.ana/requirements/REQ-<id>.md` from a `buildRequirementScaffold(id, todayISO)` generator, refusing to overwrite an existing file. `validate` calls `validateReqFormat`, red-prints + `exit(1)` on error, green ✓ + `exit(0)` on success. `list` calls `buildRequirementList` and renders the human table / `--json` array; malformed rows render with ⚠ and never crash.
**Pattern to follow:** `registerPlanCommand` in `plan.ts` (lines 156–169) for the group + subcommand shape and the `runPlanCoverage` red-print/exit call-site convention. `--json` flag convention from the sibling `work status` command.
**Why:** The user-facing surface. Generated scaffold (not a copied template) matches the `scaffold-generators.ts` precedent — this file is generated (injects date + id), not copied.

### src/index.ts (modify)
**What changes:** `import { registerReqCommand } from './commands/req.js';` and call it inside the `PIPELINE` group (near `registerWorkCommand`, line 69).
**Pattern to follow:** The existing `registerPlanCommand(program)` registration line.
**Why:** Without registration the command group is unreachable.

### src/commands/work.ts (modify)
**What changes:** In `getWorkStatus`, call `getRequirementsSummary(projectRoot, artifactBranch, onArtifactBranch)` **once**, BEFORE the `slugs.length === 0` branch, and thread the result into BOTH `StatusOutput` construction sites (the empty-slugs early return ~line 490 and the normal path ~line 542). Add `requirements?: { open: number; highestPriority: string }` to the `StatusOutput` interface (optional — set only when the summary is non-null AND `open ≥ 1`). In `printNotifications`, add one line after the existing nudges: `ℹ ${n} open requirement(s) (highest: ${highestPriority}). Run: ana req list` — guarded by `if (output.requirements && output.requirements.open > 0)`.
**Pattern to follow:** The `updateAvailable` conditional in `printNotifications` (lines 294–299) is the exact model for a conditional ℹ one-liner. `StatusOutput` serializes as-is to `--json`.
**Why:** The free surfacing pipe — Think already echoes ℹ lines verbatim. The probe must run before the empty-slugs branch so open requirements surface even with zero active work.
**Gotcha (load-bearing):** Do NOT read `ana.json` for the probe — `getWorkStatus` already parses it twice (`retire-capture-self-arming-C3`). `getRequirementsSummary` takes the already-resolved `projectRoot`/`artifactBranch`/`onArtifactBranch` and reads only the requirements directory.

### src/commands/work.ts (modify — startWork, `--req` claim)
**What changes:** Add a `req?: string` option to `startWork`. It is meaningful ONLY on the new-work-item creation path (scope does not yet exist — the block at lines ~1411–1437 that `mkdir`s `activePath` and writes `work_started_at`). When `--req` is passed: resolve + validate the requirement is `open` **before** `mkdir` (fail loudly, `exit(1)`, naming both paths on ambiguity), then after `work_started_at` is written, call `claimRequirement` and include the rewritten requirement file in the "Start work" commit.
**Pattern to follow:** The new-item block's `writeTimestamp` + `commitSaves` sequence (lines 1432–1434). Add the option in `registerWorkCommand`'s `startCommand` (`.option('--req <id>', ...)`).
**Why:** Claim is explicit user intent → hard error on failure (asymmetric with the best-effort archive). Validating before `mkdir` avoids a half-started work item pointing at a bad requirement.

### src/commands/work.ts (modify — completeWork archive)
**What changes:** In the successful completion path (after the proof chain is written/committed, before the final success print), call `archiveRequirementsForSlug(projectRoot, slug)` wrapped in try/catch → on error, print one yellow warning and continue. Commit the moved file(s) best-effort. A failure here NEVER blocks completion.
**Pattern to follow:** The best-effort `commitSaves` try/catch (silent-on-failure) and the archival commit block around lines 896–899.
**Why:** Best-effort archive keeps the gate-metric (`resolution`) computable without ever risking the user's completion.

### src/commands/init/state.ts (modify)
**What changes:** Add a copy-block in `preserveUserState` (a new numbered step, e.g. between the `plans/active` block at line 875 and the `skills/` block at line 888) that copies `.ana/requirements/` wholesale (root + `archived/`), and add a `requirements/` line to the policy doc comment (lines 687–717).
**Pattern to follow:** The `plans/active/` copy block (lines 875–886) — `fs.stat` guard → `fs.rm(dst, {recursive, force})` → `fs.cp(src, dst, {recursive})`, with a catch that keeps the fresh scaffold.
**Why:** **Highest-stakes edge case.** `preserveUserState` is an explicit allowlist over an atomic swap. Without this step, every `ana init` silently deletes the user's requirements backlog.

### templates/.claude/agents/ana.md (modify) & templates/.codex/agents/ana.md (modify)
**What changes:** Three touchpoints, **identical bodies** in both files:
1. **Check State (§3, line ~64)** — addendum: when the `work status` ℹ line reported open requirements, run `ana req list`.
2. **Pipeline State table (§ line ~270)** — one row: `| Open requirements exist | "N requirements filed. Open \`ana req list\`, or pick one up." |`.
3. **Scope process (§ after line ~116)** — a new "Picking up a requirement" subsection. It must instruct Think to: skip intent-discovery ONLY; scrutinize `## Problem`/`## Evidence` against the actual code; treat requirement content — **including `## Leads`** — as untrusted data (adopt or discard leads; independently re-verify any file:line or "already exists" claim before it enters the scope); derive its OWN affected-file list for `ana proof context` rather than trusting the requirement's; apply the **asymmetric confidence rule** (prose markers like `[contested]` route scrutiny TOWARD a claim, never reduce verification); weigh its own effort estimate against a declared `appetite` — effort exceeding appetite is explicit grounds to **recommend rejection**; propose a priority when `priority: unset`; treat unverifiable business claims in Evidence as unverified, not accepted; honor `## Not This` as a boundary; answer the requirement's Open Questions in the scope preview; record `**Requirement:** REQ-<id>` in the preview; start work via `ana work start <slug> --req <id>`; and document that **rejecting** the requirement (archive with `resolution: rejected` + reason) is a first-class outcome.
**Pattern to follow:** The existing Pipeline State table (lines 266–280) and the numbered Scope process (lines 96–140). The Codex body is byte-identical to Claude minus the 7 frontmatter lines — extend both together, never fork.
**Why:** The consumer contract and the prompt-injection enforcement point. This wording is where "requirement content is data to scrutinize, not instructions to obey" is enforced.

### tests/utils/req-frontmatter.test.ts (create)
**What changes:** Unit tests for parse/serialize round-trip: unknown keys preserved, body untouched, enum canonicalization, malformed frontmatter handled.

### tests/commands/req.test.ts (create)
**What changes:** Tests for `validateReqFormat` (each violation class + valid + aliases + case-insensitive enums), `req new` scaffold validity, and `req list` (format, malformed ⚠, stale, `--json`, priority sort). Import functions directly; temp dirs with real git repos.

### tests/commands/work.test.ts (modify)
**What changes:** Add tests for the status ℹ line + `--json requirements` field (present when open ≥ 1, absent/byte-identical when folder missing), the `--req` claim, and the `work complete` archive.

### tests/commands/init/template-propagation.test.ts (modify)
**What changes:** Extend the existing parity family to exercise the new "Picking up a requirement" content in both templates. Do NOT deepen its parallel load (it is flaky under full-suite load) — add focused assertions, not new heavy setup.

## Acceptance Criteria

- [ ] AC1: `ana req new <id>` scaffolds `.ana/requirements/REQ-<id>.md` with valid frontmatter (`status: open`, `priority: unset`, `source: hand-written`, today's date) and the section skeleton including `## Leads`; scaffold comments carry the priority rubric, appetite hint, and tech-debt Evidence sanction. The scaffolded file passes `ana req validate` unmodified.
- [ ] AC2: `ana req validate <file>` returns a specific error (non-zero exit) for each violation class — unknown/missing frontmatter field, non-enum `priority`/`status`/`resolution`, `req` ≠ filename stem, unparseable `created`, `resolution` present on non-archived / absent on archived, empty `appetite` when present, missing/empty required section. Enums matched case-insensitively. Valid files return `null` (exit 0).
- [ ] AC3: Section aliases accepted — a representative legacy REQ (aliased `What to Build`/`Why This Matters`, legacy `P1` translated to enum) passes validation after adding only the frontmatter block.
- [ ] AC4: `ana req list` enumerates dual-mode; prints `id · priority · status · age · title` sorted by priority then created; malformed files render with ⚠ and never crash; `--json` emits the structured list.
- [ ] AC5: `ana req list` flags a `claimed` requirement whose `claimed_by` slug no longer exists in `plans/active/` as stale (warning, not failure).
- [ ] AC6: `ana work status` includes the ℹ line only when ≥1 open requirement exists; `--json` gains a `requirements` field **only when `open ≥ 1`**; when the folder is absent/empty, output is byte-identical to today.
- [ ] AC7: `ana work start <slug> --req <id>` claims the requirement (`status: claimed`, `claimed_by: <slug>`); errors cleanly when the requirement doesn't exist or isn't `open`. Plain `ana work start` is unchanged.
- [ ] AC8: `ana work complete <slug>` moves requirements with `claimed_by == slug` to `archived/` with `status: archived` + `resolution: completed`, best-effort — a failure warns and never blocks completion.
- [ ] AC9: Re-init preserves `.ana/requirements/` wholesale — `preserveUserState` gains a copy step + policy-comment line; re-init over a repo with requirements leaves the folder byte-identical.
- [ ] AC10: Think template updated identically in both `.claude` and `.codex` `ana.md`: Check State addendum, one Pipeline State row, and the "Picking up a requirement" subsection with all behaviors enumerated in the File Changes section.
- [ ] AC11: No changes to `parseArtifactType`, `saveArtifact`, or non-Think templates; `ANA_GITIGNORE_STOCK` unchanged — requirements commit by default (not gitignored).
- [ ] AC12: Test count does not decrease; new behavior covered including the AC6 empty/absent byte-identity case and the AC9 preservation case.
- [ ] New: `pnpm --filter anatomia-cli test -- --run` passes with no regressions.
- [ ] New: `(cd packages/cli && pnpm run lint)` clean.
- [ ] New: `(cd packages/cli && pnpm run build)` succeeds (dist fresh for terminal-output tests).

## Testing Strategy

- **Unit tests (`tests/utils/req-frontmatter.test.ts`):** round-trip fidelity — an unknown frontmatter key (`ana_remote_id: x`) survives parse→serialize; the markdown body is byte-identical after a `status` rewrite; enum values canonicalize to lowercase; a file with no frontmatter parses to `hadFrontmatter: false` without throwing.
- **Unit tests (`tests/commands/req.test.ts`):** `validateReqFormat` — one test per violation class asserting a **non-null** error string, one asserting `null` for a valid file, one for each alias, one proving `PRIORITY: High` (case-insensitive) passes. `req new` — the scaffold parses and `validateReqFormat` returns `null`. `req list` — a fixture dir with one valid + one malformed + one stale requirement produces the expected rows; `--json` yields a sorted array with `critical` first; the malformed row carries `malformed: true` and does not throw.
- **Integration tests (`tests/commands/work.test.ts`):** capture `getWorkStatus` console output — the ℹ line appears with 2 open requirements and its `highestPriority` is correct; `--json` has `requirements.open === 2`; with **no** requirements dir, the parsed JSON has no `requirements` key (`'requirements' in parsed === false`) — the byte-identity proof. `startWork(slug, { req })` rewrites the file to `status: claimed` / `claimed_by: slug`; `startWork` with a non-open `--req` throws/exits non-zero. `completeWork` moves a claimed requirement to `archived/` with `resolution: completed`; a simulated archive failure (e.g. unwritable dir) still completes.
- **Enforcement tests (`tests/commands/init/template-propagation.test.ts`):** both `ana.md` templates contain "Picking up a requirement" and the untrusted-data language; the `.codex` body equals the `.claude` body minus frontmatter (source-content assertion — permitted for template enforcement).
- **Preservation test:** run a real init-over-existing with a populated `.ana/requirements/` (root + `archived/`) and assert the folder is byte-identical afterward. This test must exist before the feature is considered real (highest-stakes edge case).
- **Edge cases:** duplicate `req` id across root + `archived/` → `--req` claim errors naming both paths; `git ls-tree` with no remote requirements folder → `discoverRequirements` returns `[]` with no stderr; status/directory drift (archived status, file in root) → `list` warns, never auto-moves.

## Dependencies

None new. `yaml` (^2.8) is already a dependency (contract parsing). `chalk`, `commander`, `fs`, `path`, git helpers from `git-operations.ts` — all present.

## Constraints

- **Zero config reads in the status probe.** `getRequirementsSummary` must not read `ana.json` (hot spot: `getWorkStatus` already parses it twice).
- **Frontmatter rewrite fidelity.** Claim/archive must round-trip unknown keys and leave the markdown body untouched (forward-compat for Ana Remote metadata).
- **Template parity.** `.codex` body byte-identical to `.claude` minus frontmatter. Extend the existing parity test, don't fork it — and don't add heavy parallel setup (it's flaky under load).
- **Additive only.** No changes to `parseArtifactType`, `saveArtifact`, `ANA_GITIGNORE_STOCK`, or any non-Think agent template. Requirements commit by default.
- **Best-effort must never block.** The archive step and every git operation in it degrade to a warning; completion always succeeds.

## Gotchas

- **`work.ts` has two `StatusOutput` construction sites.** The empty-slugs early return (~line 490) and the normal path (~line 542) BOTH build the output. The requirements probe must feed both, or open requirements vanish when there's no active work (AC6 failure).
- **`req` field = exact filename stem.** For `REQ-foo.md`, `req: REQ-foo`. Validation is `req === path.basename(filePath, '.md')`. `req new <id>` prefixes `REQ-` and strips a user-typed `REQ-`/`req-` to avoid `REQ-REQ-foo`.
- **`git ls-tree` on a missing remote path exits non-zero** — handle as empty (`discoverSlugs` already does this; mirror it).
- **Tests that create git repos must `git init -b main`** — CI runners have varying `init.defaultBranch` (has caused CI failures 3×).
- **Run `(cd packages/cli && pnpm run build)` before terminal-output tests** — stale `dist/` gives false passes.
- **The alias test cannot depend on `anatomia_reference/REQs/`** — it doesn't exist here. Build the legacy fixture inline.
- **`resolution` is present iff archived.** Both directions are violations: present on a non-archived file, AND absent on an archived file.
- **Priority ordering:** `critical > high > medium > low > unset`. `unset` sorts last and is the "highest" only when all open requirements are `unset`.

## Build Brief

### Rules That Apply
- All local imports end in `.js`; use `node:` prefix for built-ins. Omitting `.js` compiles but crashes the built CLI at runtime.
- `import type` for type-only imports, separate from value imports. Named exports only — no default exports.
- Explicit return types on all exported functions; `@param`/`@returns` JSDoc on exported functions (eslint pre-commit enforces this).
- Two error layers: `req-state.ts` and `req-frontmatter.ts` are state/pure — return data or throw typed errors, no chalk. `req.ts` (command layer) surfaces errors: `chalk.red` + `process.exit(1)`.
- `| null` for a value checked-and-empty (e.g. `getRequirementsSummary` returns `... | null`); `?:` for a value that may not have been set (the `StatusOutput.requirements` field).
- Prefer early returns over nested conditionals.
- Tests: assert specific values (`toBe(2)`, not `toBeGreaterThan(0)`); assert a search succeeded (`expect(line).toBeDefined()`) before asserting its content; force `git init -b main`; inline fixtures in temp dirs.

### Pattern Extracts

**Dual-mode enumeration — `work-state.ts:159–184` (`discoverSlugs`), the exact analog for `discoverRequirements`:**
```ts
export function discoverSlugs(artifactBranch: string, onArtifactBranch: boolean, projectRoot: string): string[] {
  const plansPath = '.ana/plans/active';
  if (onArtifactBranch) {
    const fullPath = path.join(projectRoot, plansPath);
    if (!fs.existsSync(fullPath)) return [];
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .filter(entry => entry.name !== '.DS_Store' && entry.name !== '.gitkeep')
      .map(entry => entry.name);
  } else {
    const lsResult = runGit(['ls-tree', '--name-only', `origin/${artifactBranch}`, `${plansPath}/`]);
    if (lsResult.exitCode !== 0 || !lsResult.stdout) return [];
    return lsResult.stdout.split('\n').filter(Boolean).map(line => path.basename(line))
      .filter(name => name !== '.DS_Store' && name !== '.gitkeep');
  }
}
```

**Validator shape + exact-enum check — `artifact-validators.ts:157,201–209` (`validateScopeFormat`), the template for `validateReqFormat`:**
```ts
export function validateScopeFormat(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  // ...
  const kindMatch = content.match(/\*\*Kind:\*\*\s*(.+)/);
  if (!kindMatch || !kindMatch[1]) {
    return "Missing 'Kind' field in Complexity Assessment. Add: **Kind:** feature / fix / chore / milestone";
  }
  const kindRaw = kindMatch[1].trim().toLowerCase();
  if (kindRaw !== 'feature' && kindRaw !== 'fix' && kindRaw !== 'chore' && kindRaw !== 'milestone') {
    return `Kind must be exactly one of: feature, fix, chore, milestone. Got: '${kindMatch[1].trim()}'`;
  }
  // ...
  return null; // valid
}
```

**Conditional ℹ notification — `work.ts:294–299` (`printNotifications`), the model for the requirements line:**
```ts
function printNotifications(output: StatusOutput): void {
  if (output.updateAvailable) {
    console.log(chalk.gray(
      `ℹ anatomia-cli v${output.updateAvailable.latest} available (current: v${output.updateAvailable.current}). Run: npm update -g anatomia-cli`
    ));
  }
  // ... add: if (output.requirements && output.requirements.open > 0) { console.log(chalk.gray(`ℹ ${...} open requirement(s) (highest: ${...}). Run: ana req list`)); }
}
```

**Preservation copy-block — `init/state.ts:875–886` (`plans/active`), the exact mirror for `.ana/requirements/`:**
```ts
// 7. Copy plans/active/ (in-flight pipeline work — scopes, specs, contracts)
const activeSrc = path.join(existingAnaPath, 'plans', 'active');
const activeDst = path.join(tmpAnaPath, 'plans', 'active');
try {
  const stats = await fs.stat(activeSrc);
  if (stats.isDirectory()) {
    await fs.rm(activeDst, { recursive: true, force: true });
    await fs.cp(activeSrc, activeDst, { recursive: true });
  }
} catch {
  // No active plans — keep the fresh .gitkeep
}
```

**Command group registration — `plan.ts:156–169` (`registerPlanCommand`), the shape for `registerReqCommand`:**
```ts
export function registerPlanCommand(program: Command): void {
  const planCommand = new Command('plan').description('Plan-time helpers for writing contracts');
  planCommand
    .command('coverage')
    .description('Preview the AC → assertion coverage map (read-only, never gates)')
    .argument('<slug>', 'Work item slug (e.g., add-status-command)')
    .action((slug: string) => { runPlanCoverage(slug); });
  program.addCommand(planCommand);
}
```

**Frontmatter types already in the tree — `CoverageWaiver`/`ContractSchema` in `src/types/contract.ts`** show the house style for a small typed interface with justifying JSDoc; model `RequirementFrontmatter` on it.

### Proof Context

**work.ts** (touched in 29 cycles — the proof chain's #1 hot spot). Relevant active findings:
- `retire-capture-self-arming-C3` (**blocker for this build**): `getWorkStatus` reads + parses `ana.json` twice per call already. The requirements probe must add ZERO config reads.
- `decompose-work-ts-C1` / `platform-aware-cli-C12`: `work.ts` is over-large; new logic belongs in `req-state.ts`, not `work.ts`.
- `cross-machine-provenance-C7`: duplicated readers in `work.ts` drift — reinforces "one shared frontmatter parser," don't inline a second one.

**Co-change partners for work.ts** (blast-radius awareness — files historically touched alongside `work.ts`; check whether your change ripples to them): `src/commands/proof.ts` (31 work items), `src/commands/artifact.ts` (28), `src/types/proof.ts` (22). This build should NOT need to touch them — if you find yourself editing `artifact.ts` (`parseArtifactType`/`saveArtifact`), stop: AC11 forbids it.

**init/state.ts** and **artifact-validators.ts**: no active findings surfaced for the specific functions being modified. `preserveUserState` is governed by the explicit-allowlist contract in `project-context.md` (Re-init Preservation Contract) — the copy-block is the whole risk surface.

### Checkpoint Commands
- After `req-frontmatter.ts` + `artifact-validators.ts` + `req.ts`: `(cd packages/cli && pnpm vitest run tests/commands/req.test.ts tests/utils/req-frontmatter.test.ts)` — Expected: new tests pass.
- After `work.ts` edits: `(cd packages/cli && pnpm vitest run tests/commands/work.test.ts)` — Expected: existing + new work tests pass.
- After template edits: `(cd packages/cli && pnpm vitest run tests/commands/init/template-propagation.test.ts)` — Expected: parity holds.
- After all changes: `(cd packages/cli && pnpm run build)` then `pnpm --filter anatomia-cli test -- --run` — Expected: full suite green, count ≥ baseline + new tests.
- Lint: `(cd packages/cli && pnpm run lint)` — Expected: clean.

### Build Baseline
Run the surface test command and record exact counts before building.
- Command used: `(cd packages/cli && pnpm vitest run)`
- Current test files: **194** (from scan.json `files.test`; confirm by running).
- Current tests: run the command and record the exact number before writing code.
- After build: expected baseline + new tests (req validator/list/scaffold, frontmatter round-trip, status ℹ + JSON, claim, archive, preservation, template parity).
- Regression focus: `tests/commands/work.test.ts` (status output parity — the byte-identity case is the sharpest regression risk), `tests/commands/init/*` (preservation), `tests/commands/init/template-propagation.test.ts` (parity, flaky under load — run it in isolation to confirm).
