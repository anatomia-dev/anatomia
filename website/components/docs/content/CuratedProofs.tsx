import Link from "next/link";
import type { ProofEntry } from "@/lib/docs-data/types";

/**
 * CuratedProofs — matches supermock .explorer + .exp-tbl exactly.
 * Wrapped in a bordered card. Proper thead with bg-elev.
 * Pass pill with green dot. Footer with bg-elev background.
 */

interface CuratedEntry {
  slug: string;
  name: string;
  description: string;
  href: string;
}

interface CuratedProofsProps {
  entries: ProofEntry[];
  totalCount: number;
}

const CURATED: CuratedEntry[] = [
  {
    slug: "security-hardening",
    name: "Eliminate command injection across the CLI",
    description: "All slug args validated before reaching shell.",
    href: "/docs/proof/security-hardening",
  },
  {
    slug: "worktree-isolation",
    name: "Isolate every pipeline run in its own worktree",
    description: "Largest contract in the chain. 1 rejection cycle.",
    href: "/docs/proof/worktree-isolation",
  },
  {
    slug: "proof-promote",
    name: "Promote a finding into a skill rule",
    description: "The learning loop: finding \u2192 rule \u2192 better builds.",
    href: "/docs/proof/proof-promote",
  },
  {
    slug: "v1-documentation-overhaul",
    name: "Rewrite every public-facing document for v1",
    description: "README, CHANGELOG, CONTRIBUTING, ARCHITECTURE.",
    href: "/docs/proof",
  },
  {
    slug: "add-project-kind-detection",
    name: "Detect CLI, library, web app, API server, full-stack",
    description: "Scan-time classifier. Findings later mechanically closed.",
    href: "/docs/proof",
  },
  {
    slug: "cli-ux-polish",
    name: "Make the first 10 minutes feel professional",
    description: "Help text, command grouping, jargon-free descriptions.",
    href: "/docs/proof",
  },
];

export function CuratedProofs({ entries, totalCount }: CuratedProofsProps) {
  const rows = CURATED.map((c) => {
    const entry = entries.find((e) => e.slug === c.slug);
    if (!entry) return null;
    return { ...c, entry };
  }).filter(Boolean) as (CuratedEntry & { entry: ProofEntry })[];

  return (
    <section
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-card)",
        overflow: "hidden",
        marginBottom: 0,
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "13px",
        }}
      >
        <thead>
          <tr>
            {["Proof", "Stage", "Assertions", "Findings", ""].map((h, i) => (
              <th
                key={h || i}
                style={{
                  fontSize: "10.5px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--ink-45)",
                  textAlign: i >= 2 ? "right" : "left",
                  padding: "11px 16px",
                  background: "var(--bg-elev)",
                  borderBottom: "1px solid var(--border)",
                  userSelect: "none",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.slug}
              style={{
                borderBottom: "1px solid var(--hairline)",
                transition: "background 0.12s",
                cursor: "pointer",
              }}
            >
              <td style={{ padding: "13px 16px", verticalAlign: "middle" }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11.5px",
                    color: "var(--ink-60)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.slug}
                </div>
                <div
                  style={{
                    color: "var(--fg)",
                    fontWeight: 500,
                    fontSize: "13.5px",
                  }}
                >
                  {row.name}
                  <span
                    style={{
                      display: "block",
                      color: "var(--ink-60)",
                      fontSize: "12px",
                      marginTop: "2px",
                      fontWeight: 400,
                    }}
                  >
                    {row.description}{" "}
                    <span
                      style={{
                        display: "inline-block",
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        padding: "2px 6px",
                        borderRadius: "3px",
                        border: "1px solid var(--hairline)",
                        color: "var(--ink-60)",
                        letterSpacing: "0.02em",
                        marginRight: "4px",
                      }}
                    >
                      {row.entry.stage.toLowerCase()}
                    </span>
                  </span>
                </div>
              </td>
              <td style={{ padding: "13px 16px", verticalAlign: "middle" }}>
                <span
                  style={{
                    display: "inline-block",
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    padding: "2px 6px",
                    borderRadius: "3px",
                    border: "1px solid var(--hairline)",
                    color: "var(--ink-60)",
                    letterSpacing: "0.02em",
                  }}
                >
                  {row.entry.stage}
                </span>
              </td>
              <td
                style={{
                  padding: "13px 16px",
                  verticalAlign: "middle",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11.5px",
                  color: "var(--ink-75)",
                  textAlign: "right",
                  whiteSpace: "nowrap",
                }}
              >
                {row.entry.contract.satisfied}
                <span style={{ color: "var(--ink-45)" }}>
                  /{row.entry.contract.total}
                </span>
              </td>
              <td
                style={{
                  padding: "13px 16px",
                  verticalAlign: "middle",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11.5px",
                  color: "var(--ink-75)",
                  textAlign: "right",
                  whiteSpace: "nowrap",
                }}
              >
                {row.entry.findingCount}
              </td>
              <td
                style={{
                  padding: "13px 16px",
                  verticalAlign: "middle",
                  textAlign: "right",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    color: "var(--pass, #4ade80)",
                    background: "var(--pass-bg, rgba(74,222,128,0.10))",
                    border: "1px solid var(--pass-border, rgba(74,222,128,0.25))",
                    padding: "2px 7px",
                    borderRadius: "3px",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  <span
                    style={{
                      width: "5px",
                      height: "5px",
                      borderRadius: "50%",
                      background: "var(--pass, #4ade80)",
                    }}
                  />
                  pass
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Footer — .exp-foot */}
      <div
        style={{
          padding: "14px 18px",
          borderTop: "1px solid var(--hairline)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          color: "var(--ink-60)",
          background: "var(--bg-elev)",
        }}
      >
        <span>
          {rows.length} of {totalCount} proofs · curated
        </span>
        <Link
          href="/docs/proof"
          style={{
            color: "var(--ink-75)",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Browse all {totalCount} →
        </Link>
      </div>
    </section>
  );
}
