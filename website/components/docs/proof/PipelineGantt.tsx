import type { ProofTiming } from "@/lib/docs-data/types";

interface PipelineGanttProps {
  timing: ProofTiming;
  className?: string;
}

const STAGES: { key: keyof Omit<ProofTiming, "totalMinutes">; label: string; opacity: number }[] = [
  { key: "think", label: "Think", opacity: 0.85 },
  { key: "plan", label: "Plan", opacity: 0.65 },
  { key: "build", label: "Build", opacity: 0.50 },
  { key: "verify", label: "Verify", opacity: 0.78 },
];

export function PipelineGantt({ timing, className }: PipelineGanttProps) {
  if (timing.totalMinutes === 0) {
    return (
      <div className={className} style={{
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
        color: "var(--ink-40)",
        margin: "14px 0 8px",
      }}>
        No timing data
      </div>
    );
  }

  const total = timing.totalMinutes;

  return (
    <div className={className} style={{
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      margin: "14px 0 8px",
      fontFamily: "var(--font-mono)",
      fontSize: "11.5px",
    }}>
      {STAGES.map((stage) => {
        const value = timing[stage.key];
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        // Zero-duration stages get a 2% minimum width so the gap is visible
        const widthPct = value === 0 ? 2 : pct;

        // Calculate left offset: sum of preceding stages
        let left = 0;
        for (const s of STAGES) {
          if (s.key === stage.key) break;
          const v = timing[s.key];
          left += total > 0 ? Math.round((v / total) * 100) : 0;
        }

        return (
          <div key={stage.key} style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr 50px",
            gap: "14px",
            alignItems: "center",
          }}>
            <span style={{
              color: "var(--ink-60)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontSize: "10.5px",
            }}>
              {stage.label}
            </span>
            <div style={{
              height: "8px",
              background: "var(--code-bg)",
              borderRadius: "4px",
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${left}%`,
                width: `${widthPct}%`,
                background: "var(--brand)",
                borderRadius: "4px",
                opacity: stage.opacity,
              }} />
            </div>
            <span style={{
              color: "var(--ink-60)",
              textAlign: "right",
            }}>
              {value}m
            </span>
          </div>
        );
      })}
    </div>
  );
}
