import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { CommandsData, CommandGroup } from './types';

const DATA_PATH = join(process.cwd(), 'data', 'docs', 'commands.json');

let cached: CommandsData | null = null;

function load(): CommandsData {
  if (!cached) {
    cached = JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as CommandsData;
  }
  return cached;
}

export function getCommands(): CommandsData {
  return load();
}

export function getCommandCount(): number {
  return load().totalCommands;
}

export function getCommandGroups(): CommandGroup[] {
  return load().groups;
}
