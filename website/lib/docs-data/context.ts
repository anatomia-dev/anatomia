import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ContextFile } from './types';

const DATA_PATH = join(process.cwd(), 'data', 'docs', 'context-files.json');

let cached: ContextFile[] | null = null;

function load(): ContextFile[] {
  if (!cached) {
    cached = JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as ContextFile[];
  }
  return cached;
}

export function getContextFiles(): ContextFile[] {
  return load();
}
