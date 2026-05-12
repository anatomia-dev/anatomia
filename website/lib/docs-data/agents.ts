import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { AgentTemplate } from './types';

const DATA_PATH = join(process.cwd(), 'data', 'docs', 'agent-templates.json');

let cached: AgentTemplate[] | null = null;

function load(): AgentTemplate[] {
  if (!cached) {
    cached = JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as AgentTemplate[];
  }
  return cached;
}

export function getAgentTemplates(): AgentTemplate[] {
  return load();
}

export function getAgentByName(name: string): AgentTemplate | null {
  return load().find(a => a.name === name) ?? null;
}

export function getAgentCount(): number {
  return load().length;
}
