import Link from "next/link";
import type { ProofEntry } from "@/lib/docs-data/types";

interface CuratedConfig {
  slug: string;
  description: string;
}

interface CuratedProofsProps {
  entries: ProofEntry[];
  totalCount: number;
}

const CURATED: CuratedConfig[] = [
  {
    slug: "proof-list-view",
    description: "Added proof browsing with summary table and pagination",
  },
  {
    slug: "add-project-kind-detection",
    description: "Detect project kind (CLI, API, web app) during scan",
  },
  {
    slug: "proof-context-query",
    description: "Query proof chain context for worktree briefings",
  },
  {
    slug: "s10-engine",
    description: "Verification engine with contract-based assertion checking",
  },
  {
    slug: "s11-init-reset",
    description: "Init and reset commands with safe file management",
  },
  {
    slug: "s12-prove-it",
    description: "Proof chain recording and sealed contract generation",
  },
];

export function CuratedProofs({ entries, totalCount }: CuratedProofsProps) {
  const rows = CURATED.map((c) => {
    const entry = entries.find((e) => e.slug === c.slug);
    if (!entry) return null;
    return { ...c, entry };
  }).filter(Boolean) as { slug: string; description: string; entry: ProofEntry }[];

  return (
    <div className="my-10">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]" style={{ color: "var(--fg)" }}>
          <thead>
            <tr
              className="border-b text-left font-mono text-[11px] uppercase tracking-wider"
              style={{ borderColor: "var(--hairline)", color: "var(--ink-30)" }}
            >
              <th className="pb-2 pr-4 font-semibold">Proof</th>
              <th className="pb-2 pr-4 font-semibold">Stage</th>
              <th className="pb-2 pr-4 font-semibold">Assertions</th>
              <th className="pb-2 pr-4 font-semibold">Findings</th>
              <th className="pb-2 font-semibold">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.slug}
                className="border-b"
                style={{ borderColor: "var(--hairline)" }}
              >
                <td className="py-2.5 pr-4">
                  <span
                    className="block font-mono text-[12px]"
                    style={{ color: "var(--fg-strong)" }}
                  >
                    {row.slug}
                  </span>
                  <span
                    className="block text-[12px]"
                    style={{ color: "var(--ink-45)" }}
                  >
                    {row.description}
                  </span>
                </td>
                <td
                  className="py-2.5 pr-4 font-mono text-[12px]"
                  style={{ color: "var(--ink-60)" }}
                >
                  {row.entry.stage}
                </td>
                <td
                  className="py-2.5 pr-4 font-mono text-[12px]"
                  style={{ color: "var(--ink-60)" }}
                >
                  {row.entry.contract.satisfied}/{row.entry.contract.total}
                </td>
                <td
                  className="py-2.5 pr-4 font-mono text-[12px]"
                  style={{ color: "var(--ink-60)" }}
                >
                  {row.entry.findingCount}
                </td>
                <td className="py-2.5">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase"
                    style={{
                      background: "var(--brand-soft)",
                      color: "var(--color-brand)",
                    }}
                  >
                    {row.entry.result}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className="mt-3 flex items-center justify-between font-mono text-[12px]"
        style={{ color: "var(--ink-30)" }}
      >
        <span>
          {rows.length} of {totalCount} proofs · curated
        </span>
        <Link
          href="/docs/proof"
          className="font-medium transition-colors duration-100"
          style={{ color: "var(--color-brand)" }}
        >
          Browse all {totalCount} →
        </Link>
      </div>
    </div>
  );
}
