import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SkillTemplate } from './types';

const DATA_PATH = join(process.cwd(), 'data', 'docs', 'skill-templates.json');

let cached: SkillTemplate[] | null = null;

function load(): SkillTemplate[] {
  if (!cached) {
    cached = JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as SkillTemplate[];
  }
  return cached;
}

export function getSkillTemplates(): SkillTemplate[] {
  return load();
}

export function getSkillByName(name: string): SkillTemplate | null {
  return load().find(s => s.name === name) ?? null;
}

export function getSkillCount(): number {
  return load().length;
}
