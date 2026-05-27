# Spec: README Terminal Demo

**Created by:** AnaPlan
**Date:** 2026-05-27
**Scope:** .ana/plans/active/readme-terminal-demo/scope.md

## Approach

Replace the static code block in the README hero section with an animated GIF of `ana scan .` running on dub. The GIF is recorded using VHS (charmbracelet) from a full clone of dub. The `.tape` file is committed alongside the GIF as the reproducibility artifact.

Three changes:
1. Create `assets/demo/dub-scan.tape` — the VHS recording script.
2. Generate `assets/demo/dub-scan.gif` — the recorded output.
3. Modify `README.md` — replace the static hero section with the GIF embed + npx call-to-action below.

**Recording environment:** The GIF must be recorded from a **full clone** of dub (not shallow). The existing `test_repos/_handoff_30/dub` is shallow and will NOT populate the Intelligence section (Activity, Hot files). Clone fresh with `git clone https://github.com/dubinc/dub.git` into a temp location if needed.

**Theme decision:** Dark only (Catppuccin Mocha). npm strips `<picture>` and `<source>` elements, so dark/light switching would break on npmjs.com. Dark terminal on any background is the industry standard.

## Output Mockups

### README hero section (after change)

```markdown
## Scan any project in 10 seconds

<img alt="ana scan running on dub — detecting TypeScript, Next.js, Prisma with 80 models, auth, AI, payments, and contributor activity" width="600" src="assets/demo/dub-scan.gif">

```bash
npx anatomia-cli scan .
```

No install. One command. [See more examples →](https://anatomia.dev/docs)
```

### VHS tape file structure

The tape file is ~15 lines. It sets terminal dimensions, types the command, waits for output, and holds the final frame. Comments document the recording requirements.

## File Changes

### `assets/demo/dub-scan.tape` (create)
**What changes:** New VHS tape file that records `ana scan .` running on a full clone of dub.
**Pattern to follow:** Standard VHS tape format from charmbracelet docs. Self-documenting with comments.
**Why:** The tape file is the reproducibility artifact. If the GIF needs re-recording (scan format changes, dub's stack changes), anyone can run `vhs dub-scan.tape` to regenerate.

Key parameters (verified by scope investigation — do not change without visual verification):
- `Set Width 1200` / `Set Height 1000` — fits full scan output without scrolling
- `Set FontSize 18` — readable at `width="600"` display size
- `Set Theme "Catppuccin Mocha"` — dark theme, industry standard
- `Set TypingSpeed 50ms` — natural typing cadence
- `Set Padding 20` — breathing room around content
- `Output dub-scan.gif` — output in same directory

The tape should:
1. Set all terminal parameters
2. Type `ana scan .` (not `npx anatomia-cli scan .` — shorter, cleaner in recording)
3. Press Enter
4. Sleep 25 seconds — dub scan takes ~5.4s, remaining ~19-20s holds the final output for reading before loop
5. Include comments documenting: full clone requirement, VHS version tested (v0.11.0), re-recording instructions

### `assets/demo/dub-scan.gif` (create)
**What changes:** Generated GIF output from running VHS on the tape file.
**Pattern to follow:** N/A — binary output from VHS.
**Why:** The hero demo image. Must exist for the README `<img>` tag to render.

Generation: Run `vhs assets/demo/dub-scan.tape` from the project root, with the working directory set to a full dub clone. Expected size: ~155KB (well under the 500KB limit).

**Important:** The GIF generation requires:
- VHS installed (`brew install charmbracelet/tap/vhs`)
- A full clone of dub (`git clone https://github.com/dubinc/dub.git`)
- `ana` available on PATH (the built CLI)
- Run `vhs` from inside the dub clone directory

If VHS or dub clone are not available, create the tape file and modify the README anyway. Document the manual GIF generation step in the build report. The tape file and README changes are independently valuable.

### `README.md` (modify)
**What changes:** Replace lines 9-50 (the hero section) with the GIF embed and restructured call-to-action.
**Pattern to follow:** charmbracelet/gum README — plain `<img>` tag, `width="600"`, relative path.
**Why:** The static code block doesn't demonstrate the product. The animated GIF shows the scan resolving in real time on a recognizable project.

Specific changes to the hero section:

**Remove entirely:**
- The first `bash` code block (`npx anatomia-cli scan .`) at lines 11-13
- The "No install. One command. Here's what you'll see:" text at line 15
- The entire static scan output code block (lines 17-50)

**Replace with (in order):**
1. The heading `## Scan any project in 10 seconds` stays (line 9)
2. Blank line
3. `<img>` tag: `<img alt="ana scan running on dub — detecting TypeScript, Next.js, Prisma with 80 models, auth, AI, payments, and contributor activity" width="600" src="assets/demo/dub-scan.gif">`
4. Blank line
5. The `npx` command in a bash code block:
   ````
   ```bash
   npx anatomia-cli scan .
   ```
   ````
6. Blank line
7. `No install. One command. [See more examples →](https://anatomia.dev/docs)`

The `<img>` tag uses only `alt`, `width`, and `src` attributes — npm's sanitizer strips everything else (`loading`, `class`, `style`).

## Acceptance Criteria

- [ ] AC1: The README hero section contains an animated GIF showing `ana scan .` running on dub, displaying the full scan output including the Intelligence section (Activity, Hot files, Docs).
- [ ] AC2: The static code block that previously showed inbox-zero scan output is removed.
- [ ] AC3: The `npx anatomia-cli scan .` command appears below the GIF, not above it.
- [ ] AC4: The GIF is embedded via `<img>` tag with `alt` text and `width="600"`.
- [ ] AC5: `assets/demo/dub-scan.tape` exists and is a valid VHS tape file that reproduces the recording.
- [ ] AC6: `assets/demo/dub-scan.gif` exists and is under 500KB.
- [ ] AC7: The GIF renders correctly on GitHub (animated, autoplaying, looping).
- [ ] AC8: The GIF renders correctly on npmjs.com via `<img>` tag.
- [ ] AC9: A "See more examples" link points to `https://anatomia.dev/docs`.
- [ ] AC10: No build errors — `pnpm run build` passes.
- [ ] AC11: No test regressions — `pnpm run test -- --run` passes.

## Testing Strategy

- **Unit tests:** None required. No production code changes.
- **Integration tests:** None required. README and assets are static files.
- **Manual verification:**
  - Verify GIF animates when viewed in a browser (open `assets/demo/dub-scan.gif` directly)
  - Verify README renders correctly on GitHub after push
  - Verify README renders correctly on npmjs.com after publish
- **Regression:** Run `pnpm run test -- --run` to confirm no existing tests break.

## Dependencies

- VHS v0.11.0+ (charmbracelet/tap) installed via `brew install charmbracelet/tap/vhs`
- ffmpeg and ttyd (VHS dependencies, installed automatically with VHS)
- Full clone of dub (`git clone https://github.com/dubinc/dub.git`)
- `ana` CLI built and on PATH

## Constraints

- `<img>` tag must use only `alt`, `src`, `width`, `height` attributes. npm's sanitizer strips all others.
- No `<picture>` or `<source>` elements — npm strips them.
- GIF must be under 500KB.
- Display width must be `600` to match Charm's pattern and prevent the GIF from dominating the page.

## Gotchas

- **Shallow clone = no Intelligence section.** `git clone --depth 200` of dub does NOT populate Activity or Hot files. The recording must use a full clone. The tape file comments must document this.
- **VHS working directory matters.** VHS runs commands in its own working directory. The tape must be run from inside the dub clone, not from the anatomia repo root. The `Output` directive in the tape needs a path back to the anatomia assets directory, OR the developer `cd`s into the dub clone and runs `vhs /path/to/anatomia/assets/demo/dub-scan.tape`.
- **Catppuccin Latte is broken.** Despite the name, VHS renders it as dark. If a light theme is ever needed, use `Builtin Solarized Light` instead.
- **Finding text wraps at 1200px/font 18.** The heuristic detail wraps one word — this is natural terminal behavior, not a bug. Don't increase width to fix it.
- **The GIF is a binary committed to git.** ~155KB is trivial. Don't add it to `.gitignore`.

## Build Brief

### Rules That Apply
- No production code changes — coding standards are informational only for this task.
- Use `--run` flag with `pnpm test` to avoid watch mode hang.
- GIF file goes in `assets/demo/`, not in `packages/` or `website/`.

### Pattern Extracts

README hero section being replaced (lines 9-50 of `README.md`):
```markdown
## Scan any project in 10 seconds

```bash
npx anatomia-cli scan .
```

No install. One command. Here's what you'll see:

```
┌─────────────────────────────────────────────────────────────────────┐
│  inbox-zero                                                web-app  │
│  TypeScript · Next.js · Prisma → PostgreSQL (63 models)             │
└─────────────────────────────────────────────────────────────────────┘
...
  Run `ana init` to scaffold 8 skills (5 core + ai-patterns, data-access, api-patterns)
```
```

The `## Install` section at line 52 is NOT touched — it stays as-is.

### Proof Context
No active proof findings for affected files.

### Checkpoint Commands
- After tape file created: Verify syntax with `vhs validate assets/demo/dub-scan.tape` (if VHS available)
- After README modified: Visual inspection of markdown structure
- After all changes: `pnpm run test -- --run` — Expected: all existing tests pass (no new tests added)
- Lint: `pnpm run lint`

### Build Baseline
- Command: `pnpm run test -- --run`
- No new tests expected — this is a documentation-only change
- Regression focus: None. No production code touched.
