import type { ProofFinding } from "@/lib/docs-data/types";

interface FindingsListProps {
  findings: ProofFinding[];
  className?: string;
}

function severityLabel(severity: string): string {
  if (severity === "observation") return "obs";
  return severity;
}

function severityClass(severity: string): string {
  if (severity === "risk") return "risk";
  if (severity === "debt") return "debt";
  return "obs";
}

function severityColor(severity: string): { bg: string; fg: string } {
  switch (severity) {
    case "risk": return { bg: "var(--fail-bg)", fg: "var(--fail)" };
    case "debt": return { bg: "var(--warn-bg)", fg: "var(--warn)" };
    default: return { bg: "var(--info-bg)", fg: "var(--info)" };
  }
}

export function FindingsList({ findings, className }: FindingsListProps) {
  const visible = findings.slice(0, 5);
  const extra = findings.length - 5;

  return (
    <div className={className} style={{
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      marginTop: "14px",
    }}>
      {visible.map((f, i) => {
        const colors = severityColor(f.severity);
        return (
          <div key={f.id ?? i} style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            padding: "13px 16px",
            background: "var(--bg-card)",
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "6px",
              fontFamily: "var(--font-mono)",
              fontSize: "10.5px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              flexWrap: "wrap",
            }}>
              <span className={`docs-fnd-sev ${severityClass(f.severity)}`} style={{
                padding: "2px 7px",
                borderRadius: "3px",
                fontWeight: 500,
                letterSpacing: "0.06em",
                background: colors.bg,
                color: colors.fg,
              }}>
                {severityLabel(f.severity)}
              </span>
              {f.file && (
                <span style={{
                  color: "var(--ink-60)",
                  fontSize: "11px",
                  textTransform: "none",
                  letterSpacing: "0",
                }}>
                  {f.file}
                </span>
              )}
              {(f.status && f.status !== "active" ? f.status : f.suggestedAction) && (
                <span style={{
                  marginLeft: "auto",
                  color: "var(--ink-40)",
                  fontSize: "10.5px",
                }}>
                  → {f.status && f.status !== "active" ? f.status : f.suggestedAction}
                </span>
              )}
            </div>
            <div style={{
              fontSize: "13px",
              lineHeight: 1.55,
              color: "var(--ink-80)",
            }}>
              {f.summary}
            </div>
          </div>
        );
      })}
      {extra > 0 && (
        <div style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          padding: "13px 16px",
          background: "var(--bg-card)",
          opacity: 0.75,
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontFamily: "var(--font-mono)",
            fontSize: "10.5px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}>
            <span style={{
              padding: "2px 7px",
              borderRadius: "3px",
              fontWeight: 500,
              letterSpacing: "0.06em",
              background: "var(--info-bg)",
              color: "var(--info)",
            }}>
              +{extra}
            </span>
            <span style={{
              color: "var(--ink-60)",
              fontSize: "11px",
              textTransform: "none",
              letterSpacing: "0",
            }}>
              more findings
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
