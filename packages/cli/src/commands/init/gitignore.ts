/**
 * Managed `.gitignore` merge for `ana init` — the single source of truth for
 * stock ignore content and the only place sentinel/idempotency logic lives.
 *
 * `ana init` owns a delimited *managed region* inside each surface's
 * `.gitignore` (`.ana/`, `.claude/`, `.codex/`). On every run we regenerate
 * ONLY that region from the current stock and leave everything outside it —
 * the user's own lines — untouched. This replaces the prior wholesale writes
 * that clobbered user content on re-init.
 *
 * This module is pure: zero CLI dependencies (no chalk/ora) and no `fs`. It is
 * imported by both `assets.ts` and `state.ts`; living standalone breaks the
 * `state ↔ assets` cycle that co-locating in `assets.ts` would create.
 */

/**
 * Start sentinel marking the top of the Anatomia-managed region.
 */
const START_SENTINEL = '# >>> Anatomia managed (do not edit) >>>';

/**
 * End sentinel marking the bottom of the Anatomia-managed region.
 */
const END_SENTINEL = '# <<< Anatomia managed <<<';

/**
 * Stock managed-region content for `.ana/.gitignore`. Project-type-independent
 * (no language/framework tokens) — identical for every customer.
 */
export const ANA_GITIGNORE_STOCK = `# Anatomia runtime state — local to each developer
state/
worktrees/
# Raw test-capture logs — scratch; deleted after the count + sha are sealed into the compact build_report.md marker
plans/active/*/.captures/`;

/**
 * Stock managed-region content for `.claude/.gitignore`. Includes the Claude
 * Code harness session lock, which is regenerated each session and never
 * committed.
 */
export const CLAUDE_GITIGNORE_STOCK = `# Per-developer state — not committed
agent-memory/
settings.local.json
# Claude Code harness runtime lock — regenerated each session, never committed
scheduled_tasks.lock`;

/**
 * Stock managed-region content for `.codex/.gitignore`. Grounded in the Codex
 * per-developer entries already enumerated by EXCLUDED_PREFIXES (commit.ts):
 * `.codex/agent-memory/` and `.codex/settings.local.json`.
 */
export const CODEX_GITIGNORE_STOCK = `# Per-developer state — not committed
agent-memory/
settings.local.json`;

/**
 * Normalize a line for content matching: strip a trailing `\r` (CRLF input)
 * and surrounding whitespace so sentinel and stock-line comparisons are
 * line-ending-agnostic.
 *
 * @param line - A single line (no trailing newline)
 * @returns The trimmed form used for equality comparison
 */
function normalizeForMatch(line: string): string {
  return line.trim();
}

/**
 * Trim leading and trailing blank/whitespace-only lines from a block of text,
 * preserving the interior verbatim (interior blank lines and CRLF untouched).
 *
 * @param content - Raw user content
 * @returns Content with surrounding blank lines removed
 */
function trimBlankEdges(content: string): string {
  const lines = content.split('\n');
  let start = 0;
  let end = lines.length;
  while (start < end && (lines[start] ?? '').trim() === '') start++;
  while (end > start && (lines[end - 1] ?? '').trim() === '') end--;
  return lines.slice(start, end).join('\n');
}

/**
 * Merge the Anatomia-managed `.gitignore` region into existing content without
 * clobbering the user's own lines.
 *
 * The managed block is always written first, with user content after it.
 * `.gitignore` resolves "later pattern wins", so user lines — including
 * `!negations` — take precedence over stock by construction. This is the
 * intended precedence and the documented escape hatch: a user can override a
 * stock ignore's effect with a later `!path`.
 *
 * The managed block is regenerated wholesale every run: stock evolves, the
 * block changes, deprecated stock vanishes, new stock appears. User content is
 * never read for ownership. Feeding this function's own output back in is
 * byte-identical (idempotent).
 *
 * Three input cases:
 *  1. null/empty/whitespace-only → block-only output.
 *  2. Well-formed managed block (exactly one START before exactly one END,
 *     matched line-ending-agnostically) → regenerate the block; preserve all
 *     content outside it (consolidated below the block).
 *  3. Legacy / fail-safe (no markers, or partial/duplicate/malformed markers)
 *     → treat the entire input as candidate user content, strip bare stock
 *     lines, wrap into the managed block. Never deletes unrecognized content.
 *
 * @param existingContent - Current `.gitignore` content, or null if absent
 * @param stockBlock - Raw inner stock lines for this surface (no sentinels)
 * @returns The full merged `.gitignore` content
 */
export function mergeGitignore(existingContent: string | null, stockBlock: string): string {
  // A044 hard gate: the managed block must never ignore provenance. It holds by
  // construction (stock is a known constant), but assert it — a generated
  // ignore of provenance corrupts cross-machine proof-chain assembly.
  if (stockBlock.includes('provenance')) {
    throw new Error('mergeGitignore: stockBlock must never contain "provenance" (A044 invariant)');
  }

  const block = `${START_SENTINEL}\n${stockBlock.replace(/\n+$/, '')}\n${END_SENTINEL}`;

  // Case 1: nothing (or only whitespace) to preserve → block only.
  if (existingContent === null || existingContent.trim() === '') {
    return `${block}\n`;
  }

  const lines = existingContent.split('\n');
  const startIndices: number[] = [];
  const endIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const norm = normalizeForMatch(lines[i] ?? '');
    if (norm === START_SENTINEL) startIndices.push(i);
    else if (norm === END_SENTINEL) endIndices.push(i);
  }

  const startIdx = startIndices[0];
  const endIdx = endIndices[0];
  const wellFormed =
    startIndices.length === 1 &&
    endIndices.length === 1 &&
    startIdx !== undefined &&
    endIdx !== undefined &&
    startIdx < endIdx;

  let userContent: string;

  if (wellFormed) {
    // Case 2: regenerate the block, preserve content outside it. Content above
    // the start sentinel is consolidated below the block (deterministic order).
    const before = lines.slice(0, startIdx).join('\n');
    const after = lines.slice(endIdx + 1).join('\n');
    const combined = before && after ? `${before}\n${after}` : before + after;
    userContent = trimBlankEdges(combined);
  } else {
    // Case 3: legacy / fail-safe. Strip bare stock lines, preserve everything
    // else. A partial or hand-authored marker does NOT match stock, so it
    // survives as user content — the helper never deletes what it can't
    // recognize as stock.
    const stockSet = new Set(stockBlock.split('\n').map(normalizeForMatch));
    const surviving = lines.filter(line => !stockSet.has(normalizeForMatch(line)));
    userContent = trimBlankEdges(surviving.join('\n'));
  }

  if (userContent === '') {
    return `${block}\n`;
  }
  return `${block}\n\n${userContent}\n`;
}
