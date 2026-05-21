import type { ProofEntry } from "@/lib/docs-data/types";

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

interface ProofHeroProps {
  entry: ProofEntry;
  className?: string;
}

export function ProofHero({ entry, className }: ProofHeroProps) {
  const { risk, debt, observation } = entry.findingSeverity;

  return (
    <div className={className} style={{
      marginBottom: "32px",
      paddingBottom: "24px",
      borderBottom: "1px solid var(--hairline)",
    }}>
      <h1 style={{
        fontFamily: "var(--font-serif)",
        fontWeight: 500,
        fontSize: "32px",
        lineHeight: 1.1,
        letterSpacing: "-0.02em",
        marginBottom: "12px",
        textWrap: "balance",
        color: "var(--fg)",
      }}>
        {entry.feature}
      </h1>
      {entry.scopeSummary && (
        <p style={{
          fontSize: "15px",
          color: "var(--ink-80)",
          maxWidth: "62ch",
          lineHeight: 1.55,
        }}>
          {entry.scopeSummary}
        </p>
      )}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "20px",
        fontFamily: "var(--font-mono)",
        fontSize: "11.5px",
        color: "var(--ink-60)",
        marginTop: "18px",
      }}>
        <span>
          <b style={{ color: "var(--ink)", fontWeight: 500 }}>verdict</b>{" "}
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            background: "var(--pass-bg)",
            border: "1px solid var(--pass-border)",
            color: "var(--pass)",
            padding: "3px 10px",
            borderRadius: "3px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}>
            <span style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "var(--pass)",
            }} />
            {entry.result}
          </span>
        </span>
        <span><b style={{ color: "var(--ink)", fontWeight: 500 }}>score</b> {entry.contract.satisfied} / {entry.contract.total}</span>
        <span><b style={{ color: "var(--ink)", fontWeight: 500 }}>findings</b> {entry.findingCount} ({risk} risk · {debt} debt · {observation} obs)</span>
        <span><b style={{ color: "var(--ink)", fontWeight: 500 }}>duration</b> {formatDuration(entry.duration)}</span>
        <span><b style={{ color: "var(--ink)", fontWeight: 500 }}>rejection cycles</b> {entry.rejectionCycles}</span>
        <span><b style={{ color: "var(--ink)", fontWeight: 500 }}>shipped</b> {formatDate(entry.completedAt)}</span>
        {entry.surface && (
          <span><b style={{ color: "var(--ink)", fontWeight: 500 }}>surface</b> {entry.surface}</span>
        )}
      </div>
    </div>
  );
}
