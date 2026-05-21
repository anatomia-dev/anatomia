"use client";

import { type CSSProperties, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ProofEntry, ProofStats } from "@/lib/docs-data/types";

interface ProofExplorerProps {
  entries: ProofEntry[];
  stats: ProofStats;
  className?: string;
}

type SortKey = "assertions" | "findings" | "duration" | "completed";
type SortDir = "asc" | "desc";

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }
  return `${minutes}m`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const thBase: CSSProperties = {
  fontSize: "10.5px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--ink-40)",
  padding: "11px 16px",
  background: "var(--bg-elev)",
  borderBottom: "1px solid var(--border)",
};

const thSortable: CSSProperties = {
  cursor: "pointer",
  userSelect: "none",
};

export function ProofExplorer({ entries, stats, className }: ProofExplorerProps) {
  const router = useRouter();

  // Filter state
  const [stageFilter, setStageFilter] = useState<string>("All");
  const [findingsFilter, setFindingsFilter] = useState<string | null>(null);
  const [cyclesFilter, setCyclesFilter] = useState<string | null>(null);

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>("completed");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Compute stage chips from data
  const stageChips = useMemo(() => {
    const stages = new Set(entries.map((e) => e.stage));
    return ["All", ...Array.from(stages).sort()];
  }, [entries]);

  // Filter
  const filtered = useMemo(() => {
    let result = [...entries];
    if (stageFilter !== "All") {
      result = result.filter((e) => e.stage === stageFilter);
    }
    if (findingsFilter === ">=5") {
      result = result.filter((e) => e.findingCount >= 5);
    } else if (findingsFilter === "any") {
      result = result.filter((e) => e.findingCount > 0);
    }
    if (cyclesFilter === "first-try") {
      result = result.filter((e) => e.rejectionCycles === 0);
    } else if (cyclesFilter === "rejected") {
      result = result.filter((e) => e.rejectionCycles >= 1);
    }
    return result;
  }, [entries, stageFilter, findingsFilter, cyclesFilter]);

  // Sort
  const sorted = useMemo(() => {
    const result = [...filtered];
    result.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (sortKey) {
        case "assertions": av = a.assertionCount; bv = b.assertionCount; break;
        case "findings": av = a.findingCount; bv = b.findingCount; break;
        case "duration": av = a.duration; bv = b.duration; break;
        case "completed": av = a.completedAt; bv = b.completedAt; break;
      }
      if (typeof av === "string") {
        return sortDir === "desc" ? (bv as string).localeCompare(av) : av.localeCompare(bv as string);
      }
      return sortDir === "desc" ? (bv as number) - av : av - (bv as number);
    });
    return result;
  }, [filtered, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function chip(
    label: string,
    active: boolean,
    onClick: () => void,
  ) {
    return (
      <button
        key={label}
        onClick={onClick}
        className={`docs-fchip${active ? " on" : ""}`}
        style={{
          padding: "4px 9px",
          border: active ? "1px solid var(--color-brand)" : "1px solid var(--border)",
          borderRadius: "3px",
          color: active ? "var(--brand-light)" : "var(--ink-60)",
          background: active ? "var(--brand-soft)" : "transparent",
          letterSpacing: "0.02em",
          cursor: "pointer",
          fontSize: "inherit",
          fontFamily: "inherit",
        }}
      >
        {label}
      </button>
    );
  }

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "desc" ? " ↓" : " ↑";
  };

  return (
    <section className={className} style={{
      marginBottom: 0,
      border: "1px solid var(--border)",
      borderRadius: "var(--r-md)",
      background: "var(--bg-card)",
      overflow: "hidden",
    }}>
      <header style={{
        padding: "18px 20px 16px",
        borderBottom: "1px solid var(--hairline)",
      }}>
        <div className="docs-exp-filters" style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "6px",
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
        }}>
          <span style={{
            color: "var(--ink-40)",
            marginRight: "6px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontSize: "10px",
          }}>Stage</span>
          {stageChips.map((s) =>
            chip(s, stageFilter === s, () => setStageFilter(s))
          )}
          <span style={{ width: "14px" }} />
          <span style={{
            color: "var(--ink-40)",
            marginRight: "6px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontSize: "10px",
          }}>Findings</span>
          {chip("≥5", findingsFilter === ">=5", () => setFindingsFilter(findingsFilter === ">=5" ? null : ">=5"))}
          {chip("Any", findingsFilter === "any", () => setFindingsFilter(findingsFilter === "any" ? null : "any"))}
          <span style={{ width: "14px" }} />
          <span style={{
            color: "var(--ink-40)",
            marginRight: "6px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontSize: "10px",
          }}>Cycles</span>
          {chip("First-try", cyclesFilter === "first-try", () => setCyclesFilter(cyclesFilter === "first-try" ? null : "first-try"))}
          {chip("Rejected ≥1", cyclesFilter === "rejected", () => setCyclesFilter(cyclesFilter === "rejected" ? null : "rejected"))}
          <span style={{
            marginLeft: "auto",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--ink-60)",
          }}>
            showing <b style={{ color: "var(--ink)", fontWeight: 500 }}>{sorted.length}</b> of <b style={{ color: "var(--ink)", fontWeight: 500 }}>{stats.entries}</b>
          </span>
        </div>
      </header>
      <div className="docs-exp-tbl-wrap">
        <table className="docs-exp-tbl" style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "13px",
        }}>
          <thead>
            <tr>
              <th style={{ ...thBase, textAlign: "left" }}>Proof</th>
              <th style={{ ...thBase, textAlign: "left" }}>Stage</th>
              <th onClick={() => handleSort("assertions")} className="docs-exp-th-sort" style={{ ...thBase, ...thSortable, textAlign: "right" }}>Assertions{sortArrow("assertions")}</th>
              <th onClick={() => handleSort("findings")} className="docs-exp-th-sort" style={{ ...thBase, ...thSortable, textAlign: "right" }}>Findings{sortArrow("findings")}</th>
              <th onClick={() => handleSort("duration")} className="docs-exp-th-sort" style={{ ...thBase, ...thSortable, textAlign: "right" }}>Duration{sortArrow("duration")}</th>
              <th onClick={() => handleSort("completed")} className="docs-exp-th-sort" style={{ ...thBase, ...thSortable, textAlign: "right" }}>Shipped{sortArrow("completed")}</th>
              <th style={{ ...thBase, textAlign: "right" }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => (
              <tr
                key={e.slug}
                onClick={() => router.push(`/docs/proof/${e.slug}`)}
                className="docs-exp-row"
                style={{
                  borderBottom: "1px solid var(--hairline)",
                  cursor: "pointer",
                  transition: "background .12s",
                }}
              >
                <td style={{ padding: "13px 16px", verticalAlign: "middle" }}>
                  <div style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11.5px",
                    color: "var(--ink-60)",
                    whiteSpace: "nowrap",
                  }}>{e.slug}</div>
                  <div style={{ color: "var(--ink)", fontWeight: 500, fontSize: "13.5px" }}>
                    {e.feature}
                    <span style={{ display: "inline-flex", gap: "4px", marginLeft: "8px" }}>
                      <span style={{
                        display: "inline-block",
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        padding: "2px 6px",
                        borderRadius: "3px",
                        border: "1px solid var(--hairline)",
                        color: "var(--ink-60)",
                        letterSpacing: "0.02em",
                      }}>{e.stage.toLowerCase()}</span>
                      {e.surface && (
                        <span style={{
                          display: "inline-block",
                          fontFamily: "var(--font-mono)",
                          fontSize: "10px",
                          padding: "2px 6px",
                          borderRadius: "3px",
                          border: "1px solid var(--hairline)",
                          background: "var(--ink-05, rgba(0,0,0,0.04))",
                          color: "var(--ink-50)",
                          letterSpacing: "0.02em",
                        }}>
                          {e.surface}
                        </span>
                      )}
                      {e.rejectionCycles > 0 && (
                        <span style={{
                          display: "inline-block",
                          fontFamily: "var(--font-mono)",
                          fontSize: "10px",
                          padding: "2px 6px",
                          borderRadius: "3px",
                          border: "1px solid var(--hairline)",
                          color: "var(--ink-60)",
                          letterSpacing: "0.02em",
                        }}>
                          {e.rejectionCycles} rejection{e.rejectionCycles > 1 ? "s" : ""}
                        </span>
                      )}
                    </span>
                  </div>
                </td>
                <td style={{ padding: "13px 16px", verticalAlign: "middle" }}>
                  <span style={{
                    display: "inline-block",
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    padding: "2px 6px",
                    borderRadius: "3px",
                    border: "1px solid var(--hairline)",
                    color: "var(--ink-60)",
                    letterSpacing: "0.02em",
                  }}>{e.stage}</span>
                </td>
                <td style={{
                  padding: "13px 16px",
                  verticalAlign: "middle",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11.5px",
                  color: "var(--ink-80)",
                  textAlign: "right",
                }}>
                  {e.contract.satisfied}<span style={{ color: "var(--ink-40)" }}>/{e.contract.total}</span>
                </td>
                <td style={{
                  padding: "13px 16px",
                  verticalAlign: "middle",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11.5px",
                  color: "var(--ink-80)",
                  textAlign: "right",
                }}>{e.findingCount}</td>
                <td style={{
                  padding: "13px 16px",
                  verticalAlign: "middle",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11.5px",
                  color: "var(--ink-80)",
                  textAlign: "right",
                }}>{formatDuration(e.duration)}</td>
                <td style={{
                  padding: "13px 16px",
                  verticalAlign: "middle",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--ink-40)",
                  textAlign: "right",
                }}>{formatDate(e.completedAt)}</td>
                <td style={{
                  padding: "13px 16px",
                  verticalAlign: "middle",
                  fontFamily: "var(--font-mono)",
                  textAlign: "right",
                }}>
                  <span style={{
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
                  }}>
                    <span style={{
                      width: "5px",
                      height: "5px",
                      borderRadius: "50%",
                      background: "var(--pass)",
                    }} />
                    pass
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{
        padding: "14px 18px",
        borderTop: "1px solid var(--hairline)",
        background: "var(--bg-elev)",
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        color: "var(--ink-60)",
      }}>
        {sorted.length} of {stats.entries} proofs
      </div>
    </section>
  );
}
