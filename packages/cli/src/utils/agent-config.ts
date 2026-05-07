/**
 * Agent configuration utilities — frontmatter parsing and writing
 *
 * Pure functions that operate on file content strings. I/O stays in the caller.
 * Frontmatter is the first `---` pair only — body `---` horizontal rules are never touched.
 *
 * @module
 */

/**
 * Parsed frontmatter fields from an agent file
 */
export interface AgentFrontmatter {
  name: string | null;
  model: string | null;
  description: string | null;
  skills: string[];
  /** All raw key-value pairs from the frontmatter block */
  raw: Record<string, string>;
}

/**
 * Enriched agent info with computed fields
 */
export interface AgentInfo {
  /** Agent name (filename stem) */
  name: string;
  /** Model from frontmatter, or null if not set */
  model: string | null;
  /** Description from frontmatter */
  description: string;
  /** Skill names from frontmatter */
  skills: string[];
  /** Total character count (template + resolved skill files) */
  charCount: number;
  /** Number of skills */
  skillCount: number;
}

/**
 * Parse YAML frontmatter from agent file content.
 *
 * Extracts fields from the first `---` pair anchored to the start of the file.
 * Body content (including `---` horizontal rules) is never parsed.
 *
 * @param content - File content string
 * @returns Parsed frontmatter or null if no valid frontmatter block exists
 */
export function parseFrontmatter(content: string): AgentFrontmatter | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match?.[1]) {
    return null;
  }

  const block = match[1];
  const raw: Record<string, string> = {};

  for (const line of block.split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv?.[1] && kv[2] !== undefined) {
      raw[kv[1]] = kv[2].trim();
    }
  }

  const name = raw['name']?.replace(/^["']|["']$/g, '') ?? null;
  const model = raw['model']?.replace(/^["']|["']$/g, '') ?? null;
  const descRaw = raw['description']?.replace(/^["']|["']$/g, '') ?? null;
  const description = descRaw ? descRaw.slice(0, 60) : null;

  // Parse skills: [skill1, skill2] inline YAML array
  const skills: string[] = [];
  const skillsRaw = raw['skills'];
  if (skillsRaw) {
    const inner = skillsRaw.match(/^\[([^\]]*)\]$/);
    if (inner?.[1]) {
      for (const s of inner[1].split(',')) {
        const trimmed = s.trim();
        if (trimmed) {
          skills.push(trimmed);
        }
      }
    }
  }

  return { name, model, description, skills, raw };
}

/**
 * Set a field in the frontmatter block.
 *
 * If the field already exists, its value is updated. If not, the field is appended
 * before the closing `---`. Body content is never modified.
 *
 * @param content - Full file content
 * @param key - Frontmatter field name
 * @param value - New value for the field
 * @returns Updated file content, or null if no frontmatter block exists
 */
export function setFrontmatterField(content: string, key: string, value: string): string | null {
  const match = content.match(/^(---\s*\n)([\s\S]*?)(\n---)/);
  if (!match) {
    return null;
  }

  const opener = match[1] ?? '';
  const block = match[2] ?? '';
  const closer = match[3] ?? '';
  const rest = content.slice(match[0].length);

  // Check if field already exists
  const fieldRegex = new RegExp(`^(${key}:\\s*)(.*)$`, 'm');
  const fieldMatch = block.match(fieldRegex);

  let newBlock: string;
  if (fieldMatch) {
    newBlock = block.replace(fieldRegex, `${key}: ${value}`);
  } else {
    newBlock = block + `\n${key}: ${value}`;
  }

  return opener + newBlock + closer + rest;
}

/**
 * Remove a field from the frontmatter block.
 *
 * If the field doesn't exist, the content is returned unchanged.
 * Body content is never modified.
 *
 * @param content - Full file content
 * @param key - Frontmatter field name to remove
 * @returns Updated file content, or null if no frontmatter block exists
 */
export function removeFrontmatterField(content: string, key: string): string | null {
  const match = content.match(/^(---\s*\n)([\s\S]*?)(\n---)/);
  if (!match) {
    return null;
  }

  const opener = match[1] ?? '';
  const block = match[2] ?? '';
  const closer = match[3] ?? '';
  const rest = content.slice(match[0].length);

  const fieldRegex = new RegExp(`^${key}:.*$\n?`, 'm');
  const newBlock = block.replace(fieldRegex, '');

  // Clean up trailing newline if we removed the last field
  const cleaned = newBlock.replace(/\n$/, '');

  return opener + cleaned + closer + rest;
}

/**
 * Resolve total character count for skill files.
 *
 * @param skills - Array of skill names from frontmatter
 * @param skillsDir - Absolute path to the .claude/skills directory
 * @param statSync - Function to stat a file path, returning { size: number }
 * @returns Total byte size of all resolved skill files. Missing skills contribute 0.
 */
export function resolveSkillCharCount(
  skills: string[],
  skillsDir: string,
  statSync: (filePath: string) => { size: number }
): number {
  let total = 0;
  for (const skill of skills) {
    try {
      const skillPath = `${skillsDir}/${skill}/SKILL.md`;
      const stat = statSync(skillPath);
      total += stat.size;
    } catch {
      // Missing skill file — contributes 0 characters
    }
  }
  return total;
}
