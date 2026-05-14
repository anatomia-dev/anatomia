import type { ProofTiming } from "@/lib/docs-data/types";

interface PipelineGanttProps {
  timing: ProofTiming;
  className?: string;
}

const STAGES: { key: keyof Omit<ProofTiming, "totalMinutes" | "segments">; label: string; opacity: number }[] = [
  { key: "think", label: "Think", opacity: 0.55 },
  { key: "plan", label: "Plan", opacity: 0.70 },
  { key: "build", label: "Build", opacity: 0.85 },
  { key: "verify", label: "Verify", opacity: 1.0 },
];

const OPACITY_MAP: Record<string, number> = {
  think: 0.55,
  plan: 0.70,
  build: 0.85,
  verify: 1.0,
};

export interface GanttBar {
  label: string;
  minutes: number;
  opacity: number;
  leftPct: number;
  widthPct: number;
}

/**
 * Build the bar array for the Gantt chart.
 *
 * When segments exist, renders per-phase bars (Think, Plan, Build 1, Verify 1, ...).
 * When absent, falls back to the 4-bar layout (Think, Plan, Build, Verify).
 *
 * @param timing - ProofTiming with optional segments
 * @returns Array of GanttBar objects describing each row
 */
export function buildGanttBars(timing: ProofTiming): GanttBar[] {
  const total = timing.totalMinutes;
  if (total === 0) return [];

  if (timing.segments && timing.segments.length > 0) {
    // Multi-phase: build bars from segments
    const bars: GanttBar[] = [];
    let cumulativeMinutes = 0;

    for (const seg of timing.segments) {
      const label = seg.phase != null
        ? `${seg.stage.charAt(0).toUpperCase() + seg.stage.slice(1)} ${seg.phase}`
        : seg.stage.charAt(0).toUpperCase() + seg.stage.slice(1);
      const pct = total > 0 ? Math.round((seg.minutes / total) * 100) : 0;
      const widthPct = seg.minutes === 0 ? 2 : pct;
      const leftPct = total > 0 ? Math.round((cumulativeMinutes / total) * 100) : 0;

      bars.push({
        label,
        minutes: seg.minutes,
        opacity: OPACITY_MAP[seg.stage] ?? 0.85,
        leftPct,
        widthPct,
      });

      cumulativeMinutes += seg.minutes;
    }

    return bars;
  }

  // Fallback: 4-bar layout from flat fields
  const bars: GanttBar[] = [];
  let cumulativeMinutes = 0;

  for (const stage of STAGES) {
    const value = timing[stage.key];
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    const widthPct = value === 0 ? 2 : pct;
    const leftPct = total > 0 ? Math.round((cumulativeMinutes / total) * 100) : 0;

    bars.push({
      label: stage.label,
      minutes: value,
      opacity: stage.opacity,
      leftPct,
      widthPct,
    });

    cumulativeMinutes += value;
  }

  return bars;
}

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

  const bars = buildGanttBars(timing);

  return (
    <div className={className} style={{
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      margin: "14px 0 8px",
      fontFamily: "var(--font-mono)",
      fontSize: "11.5px",
    }}>
      {bars.map((bar, i) => (
        <div key={`${bar.label}-${i}`} style={{
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
            {bar.label}
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
              left: `${bar.leftPct}%`,
              width: `${bar.widthPct}%`,
              background: "var(--color-brand)",
              borderRadius: "4px",
              opacity: bar.opacity,
            }} />
          </div>
          <span style={{
            color: "var(--ink-60)",
            textAlign: "right",
          }}>
            {bar.minutes}m
          </span>
        </div>
      ))}
    </div>
  );
}
