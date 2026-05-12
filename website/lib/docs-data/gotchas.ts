import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { GotchaEntry } from './types';

const DATA_PATH = join(process.cwd(), 'data', 'docs', 'gotchas.json');

let cached: GotchaEntry[] | null = null;

function load(): GotchaEntry[] {
  if (!cached) {
    cached = JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as GotchaEntry[];
  }
  return cached;
}

export function getGotchas(): GotchaEntry[] {
  return load();
}

export function getGotchaCount(): number {
  return load().length;
}
