import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { BuildMeta } from './types';

const DATA_PATH = join(process.cwd(), 'data', 'docs', 'build-meta.json');

let cached: BuildMeta | null = null;

function load(): BuildMeta {
  if (!cached) {
    cached = JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as BuildMeta;
  }
  return cached;
}

export function getBuildMeta(): BuildMeta {
  return load();
}
