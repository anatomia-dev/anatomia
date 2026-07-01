import type { ProofProvenance } from "@/lib/docs-data/types";

interface ProvenanceTableProps {
  provenance: ProofProvenance;
  className?: string;
}

/** Abbreviate a token count the way the CLI does (7363 → "7.4k", 1_390_876 → "1.4M"). */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(costUsd: number | null): string {
  return costUsd == null ? "n/a" : `$${costUsd.toFixed(2)}`;
}

const HEADERS = ["session", "turns", "tools", "in", "out", "cache", "cost"];

/**
 * Provenance card — the CLI's Provenance section as a per-session table with a
 * totals footer. Muted mono only: it carries NO pass/fail color and sits after
 * Findings, subordinate to the verdict. Cost is a labeled, recomputable estimate;
 * an unpriced session reads "n/a", never "$0.00".
 */
export function ProvenanceTable({ provenance, className }: ProvenanceTableProps) {
  if (provenance.sessions.length === 0) return null;

  const { totals } = provenance;
  const totalCost =
    totals.unpriced > 0 && totals.costUsd === 0 ? "n/a" : `$${totals.costUsd.toFixed(2)}`;
  const sessionLabel = `${totals.sessions} session${totals.sessions === 1 ? "" : "s"}`;
  const unpricedNote = totals.unpriced > 0 ? ` · ${totals.unpriced} unpriced` : "";

  const numCell: React.CSSProperties = {
    padding: "6px 10px",
    textAlign: "right",
    color: "var(--ink)",
    whiteSpace: "nowrap",
  };
  const headCell: React.CSSProperties = {
    padding: "6px 10px",
    textAlign: "right",
    color: "var(--ink-45)",
    fontWeight: 400,
    borderBottom: "1px solid var(--hairline)",
  };

  return (
    <div
      className={className}
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        padding: "14px 18px",
        background: "var(--bg-card)",
        fontFamily: "var(--font-mono)",
        fontSize: "11.5px",
        marginTop: "14px",
      }}
    >
      {provenance.model && (
        <div style={{ color: "var(--ink-60)", marginBottom: "10px" }}>
          <span style={{ color: "var(--ink-45)" }}>model</span>{" "}
          <span style={{ color: "var(--ink)" }}>{provenance.model}</span>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {HEADERS.map((h, i) => (
              <th key={h} style={{ ...headCell, textAlign: i === 0 ? "left" : "right" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {provenance.sessions.map((s, i) => (
            <tr key={`${s.label}-${i}`}>
              <td
                style={{
                  padding: "6px 10px",
                  color: "var(--ink-60)",
                  whiteSpace: "nowrap",
                }}
              >
                {s.label}
              </td>
              {s.countsAvailable ? (
                <>
                  <td style={numCell}>{s.turns}</td>
                  <td style={numCell}>{s.toolCalls}</td>
                  <td style={numCell}>{fmtTokens(s.tokens.input)}</td>
                  <td style={numCell}>{fmtTokens(s.tokens.output)}</td>
                  <td style={numCell}>{fmtTokens(s.tokens.cache)}</td>
                  <td style={numCell}>{fmtCost(s.costUsd)}</td>
                </>
              ) : (
                <td colSpan={6} style={{ ...numCell, color: "var(--ink-45)" }}>
                  counts unavailable
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td
              style={{
                padding: "8px 10px 0",
                color: "var(--ink-60)",
                borderTop: "1px solid var(--hairline)",
                whiteSpace: "nowrap",
              }}
            >
              TOTAL{" "}
              <span style={{ color: "var(--ink-45)" }}>
                {sessionLabel}
                {unpricedNote}
              </span>
            </td>
            <td
              colSpan={6}
              style={{
                padding: "8px 10px 0",
                textAlign: "right",
                color: "var(--ink)",
                borderTop: "1px solid var(--hairline)",
                whiteSpace: "nowrap",
              }}
            >
              {totalCost}
              {provenance.priceTableVersion && (
                <span style={{ color: "var(--ink-45)" }}>
                  {" "}
                  (table {provenance.priceTableVersion})
                </span>
              )}
            </td>
          </tr>
        </tfoot>
      </table>

      {provenance.churn && (
        <div style={{ color: "var(--ink-60)", marginTop: "10px" }}>
          <span style={{ color: "var(--ink-45)" }}>churn</span>{" "}
          {provenance.churn.files} files · +{provenance.churn.added}/−{provenance.churn.deleted}
        </div>
      )}

      {provenance.completeness && (
        <div style={{ color: "var(--ink-60)", marginTop: "6px" }}>
          <span style={{ color: "var(--ink-45)" }}>completeness</span>{" "}
          {provenance.completeness.complete ? "✓ complete" : "⚠ incomplete"}{" "}
          <span style={{ color: "var(--ink-45)" }}>
            (plan {provenance.completeness.present.plan}/{provenance.completeness.expected.plan} ·
            build {provenance.completeness.present.build}/{provenance.completeness.expected.build} ·
            verify {provenance.completeness.present.verify}/{provenance.completeness.expected.verify})
          </span>
        </div>
      )}
    </div>
  );
}
