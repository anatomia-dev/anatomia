import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface PageDatesMap {
  [slug: string]: string;
}

const DATA_PATH = join(process.cwd(), 'data', 'docs', 'page-dates.json');

let cached: PageDatesMap | null = null;

function load(): PageDatesMap {
  if (!cached) {
    cached = JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as PageDatesMap;
  }
  return cached;
}

export function getPageDate(slug: string): string | null {
  const dates = load();
  return dates[slug] ?? null;
}
