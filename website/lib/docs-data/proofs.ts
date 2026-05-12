import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ProofEntry, ProofStats } from './types';

const DATA_PATH = join(process.cwd(), 'data', 'docs', 'proof-entries.json');

let cached: ProofEntry[] | null = null;

function load(): ProofEntry[] {
  if (!cached) {
    cached = JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as ProofEntry[];
  }
  return cached;
}

export function getProofEntries(): ProofEntry[] {
  return load();
}

export function getProofStats(): ProofStats {
  const entries = load();
  let assertions = 0;
  let findings = 0;
  let rejections = 0;

  for (const entry of entries) {
    assertions += entry.assertionCount;
    findings += entry.findingCount;
    if (entry.result !== 'PASS') {
      rejections++;
    }
  }

  return { entries: entries.length, assertions, findings, rejections };
}
