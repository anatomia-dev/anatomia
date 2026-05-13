import Link from "next/link";
import type { ProofEntry } from "@/lib/docs-data/types";

/**
 * CuratedProofs — matches supermock .explorer + .exp-tbl exactly.
 * Wrapped in bordered card. Slug + name + desc in one cell (name wraps desc).
 * Pass pill with green dot. Footer with bg-elev.
 */

interface CuratedEntry {
  slug: string;
  name: string;
  description: string;
  stageTag: string;
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
    stageTag: "security",
    href: "/docs/proof/security-hardening",
  },
  {
    slug: "worktree-isolation",
    name: "Isolate every pipeline run in its own worktree",
    description: "Largest contract in the chain. 1 rejection cycle.",
    stageTag: "infra",
    href: "/docs/proof/worktree-isolation",
  },
  {
    slug: "proof-promote",
    name: "Promote a finding into a skill rule",
    description: "The learning loop: finding \u2192 rule \u2192 better builds.",
    stageTag: "cli",
    href: "/docs/proof/proof-promote",
  },
  {
    slug: "v1-documentation-overhaul",
    name: "Rewrite every public-facing document for v1",
    description: "README, CHANGELOG, CONTRIBUTING, ARCHITECTURE.",
    stageTag: "infra",
    href: "/docs/proof",
  },
  {
    slug: "add-project-kind-detection",
    name: "Detect CLI, library, web app, API server, full-stack",
    description: "Scan-time classifier. Findings later mechanically closed.",
    stageTag: "engine",
    href: "/docs/proof",
  },
  {
    slug: "cli-ux-polish",
    name: "Make the first 10 minutes feel professional",
    description: "Help text, command grouping, jargon-free descriptions.",
    stageTag: "cli",
    href: "/docs/proof",
  },
];

const tag = (text: string) => (
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
    {text}
  </span>
);

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
        overflowX: "auto",
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
            <th
              style={{
                fontSize: "10.5px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--ink-45)",
                textAlign: "left",
                padding: "11px 16px",
                background: "var(--bg-elev)",
                borderBottom: "1px solid var(--border)",
                userSelect: "none",
              }}
            >
              Proof
            </th>
            <th
              style={{
                fontSize: "10.5px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--ink-45)",
                textAlign: "left",
                padding: "11px 16px",
                background: "var(--bg-elev)",
                borderBottom: "1px solid var(--border)",
                userSelect: "none",
              }}
            >
              Stage
            </th>
            <th
              style={{
                fontSize: "10.5px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--ink-45)",
                textAlign: "right",
                padding: "11px 16px",
                background: "var(--bg-elev)",
                borderBottom: "1px solid var(--border)",
                userSelect: "none",
              }}
            >
              Assertions
            </th>
            <th
              style={{
                fontSize: "10.5px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--ink-45)",
                textAlign: "right",
                padding: "11px 16px",
                background: "var(--bg-elev)",
                borderBottom: "1px solid var(--border)",
                userSelect: "none",
              }}
            >
              Findings
            </th>
            <th
              style={{
                fontSize: "10.5px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--ink-45)",
                textAlign: "right",
                padding: "11px 16px",
                background: "var(--bg-elev)",
                borderBottom: "1px solid var(--border)",
                userSelect: "none",
              }}
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.slug}
              className="curated-row"
              style={{
                borderBottom:
                  i < rows.length - 1
                    ? "1px solid var(--hairline)"
                    : "none",
                cursor: "pointer",
                transition: "background 0.12s",
              }}
            >
              {/* Proof cell — slug + name(desc + tag) nested like supermock */}
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
                    {row.description} {tag(row.stageTag)}
                  </span>
                </div>
              </td>
              {/* Stage */}
              <td style={{ padding: "13px 16px", verticalAlign: "middle" }}>
                {tag(row.entry.stage)}
              </td>
              {/* Assertions */}
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
              {/* Findings */}
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
              {/* Pass pill */}
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
                    color: "var(--pass)",
                    background: "var(--pass-bg)",
                    border: "1px solid var(--pass-border)",
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
                      background: "var(--pass)",
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
          className="curated-browse"
          style={{
            color: "var(--ink-75)",
            fontWeight: 500,
            textDecoration: "none",
            cursor: "pointer",
          }}
        >
          Browse all {totalCount} →
        </Link>
      </div>
    </section>
  );
}
