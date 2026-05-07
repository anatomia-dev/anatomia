/**
 * lib/proof-feed.ts
 * ==================================================================
 * Data layer for the ship log + version pill + eyebrow + footer commit.
 *
 * Today: static mock data.
 * Production: GitHub API (commit history + proof chain files in repo).
 * NOT a platform database — keeps the marketing site fully open source.
 *
 * The *shape* here is the contract — don't change field names without
 * updating every consumer: Nav, Hero, ProofFeed, Footer.
 *
 * CRITICAL WIRING NOTE:
 * This data flows into 5 components: Nav (version pill), Hero (eyebrow),
 * ProofFeed (ship log rows + ship-dots), Footer (commit pill), and the
 * collapsed ticker. Each component calls getProofFeed() — Next.js
 * deduplicates the call. Swapping mock→real is a one-function change.
 * ==================================================================
 */

export type ProofKind = "feature" | "fix" | "chore";

export interface ProofEntry {
  version: string;
  hash: string;
  ts: string;
  kind: ProofKind;
  feat: string;
  feature_em: string;
  assertions: number;
  passed: number;
  url: string;
}

/**
 * Mock feed using relative timestamps so ages stay fresh across builds.
 * When wiring to real data, replace the body of getProofFeed() — not this function.
 */
function mockFeed(): ProofEntry[] {
  const NOW = Date.now();
  const m = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();
  return [
    { version: "v1.0.2", hash: "93a4cac", ts: m(4), kind: "feature", feat: "Worktree isolation — concurrent agents, each in their own git index.", feature_em: "Worktree isolation", assertions: 45, passed: 45, url: "#proof-93a4cac" },
    { version: "v1.0.2", hash: "426c378", ts: m(120), kind: "feature", feat: "Rejection artifact preservation — git-history extraction at save time.", feature_em: "Rejection artifact", assertions: 16, passed: 16, url: "#proof-426c378" },
    { version: "v1.0.2", hash: "8048ec7", ts: m(240), kind: "fix", feat: "Non-main artifact branch tests — 8 new tests + state display fix.", feature_em: "artifact branch", assertions: 10, passed: 10, url: "#proof-8048ec7" },
    { version: "v1.0.1", hash: "f987bb1", ts: m(1440), kind: "feature", feat: "Phase timing with sanity guards, danger map risk profile, agent identity.", feature_em: "Phase timing", assertions: 21, passed: 21, url: "#proof-f987bb1" },
    { version: "v1.0.1", hash: "3242d31", ts: m(2880), kind: "chore", feat: "Code comment cleanup — 286 internal references removed across 97 files.", feature_em: "comment cleanup", assertions: 24, passed: 24, url: "#proof-3242d31" },
    { version: "v1.0.0", hash: "7ff2987", ts: m(4320), kind: "feature", feat: "CLI UX polish — command grouping, jargon-free descriptions, help examples.", feature_em: "CLI UX", assertions: 19, passed: 19, url: "#proof-7ff2987" },
  ];
}

const PROOF_CHAIN_URL =
  "https://raw.githubusercontent.com/TettoLabs/anatomia/main/.ana/proof_chain.json";

interface ProofChainEntry {
  slug: string;
  feature: string;
  result: string;
  contract: { total: number; satisfied: number };
  hashes: { scope: string };
  completed_at: string;
}

function extractFeatureEm(feature: string): string {
  const beforeDash = feature.split(" — ")[0];
  return beforeDash.split(/\s+/).slice(0, 3).join(" ");
}

function mapEntry(entry: ProofChainEntry): ProofEntry {
  return {
    version: "v1.0.2",
    hash: entry.hashes.scope.slice(7, 14),
    ts: entry.completed_at,
    kind: entry.slug.startsWith("fix-") ? "fix" : "feature",
    feat: entry.feature,
    feature_em: extractFeatureEm(entry.feature),
    assertions: entry.contract.total,
    passed: entry.contract.satisfied,
    url: `#proof-${entry.slug}`,
  };
}

/**
 * Returns proof feed entries. Every component that shows proof data
 * calls this function — Next.js deduplicates across components.
 *
 * Fetches from GitHub raw API and maps proof chain entries to ProofEntry.
 * Falls back to mock data when GitHub is unreachable.
 */
export async function getProofFeed(): Promise<ProofEntry[]> {
  try {
    const res = await fetch(PROOF_CHAIN_URL, {
      next: { revalidate: 60 },
      headers: { "User-Agent": "anatomia-web" },
    });
    if (!res.ok) return mockFeed();

    const data: { entries: ProofChainEntry[] } = await res.json();
    if (!data.entries || data.entries.length === 0) return [];

    return data.entries
      .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
      .slice(0, 6)
      .map(mapEntry);
  } catch {
    return mockFeed();
  }
}

/** "30s ago" / "4m ago" / "3h ago" / "2d ago" */
export function formatAge(iso: string): string {
  const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${Math.max(1, Math.floor(diff))}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}
