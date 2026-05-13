import Link from "next/link";

/**
 * PipelineDiagram — matches supermock .pipeline-flow exactly.
 * 5-column grid with → arrows between cards.
 * Each card: number, name (serif), description, artifact code pills, agent name.
 * Agent name in brand-light with border-top separator.
 * Footer: "Sealed" explanation + "How it works in depth →" link.
 */

interface Stage {
  number: string;
  name: string;
  description: string;
  artifacts: string[];
  agent: string;
  href: string;
}

const STAGES: Stage[] = [
  {
    number: "01",
    name: "Think",
    description: "Investigate. Push back. Scope.",
    artifacts: ["scope.md"],
    agent: "ana",
    href: "/docs/reference/agents/ana",
  },
  {
    number: "02",
    name: "Plan",
    description: "Spec the solution. Seal the contract.",
    artifacts: ["spec.md", "contract.yaml"],
    agent: "ana-plan",
    href: "/docs/reference/agents/ana-plan",
  },
  {
    number: "03",
    name: "Build",
    description: "Implement. Tag tests to contract.",
    artifacts: ["build_report.md"],
    agent: "ana-build",
    href: "/docs/reference/agents/ana-build",
  },
  {
    number: "04",
    name: "Verify",
    description: "Independent fault-finding.",
    artifacts: ["verify_report.md"],
    agent: "ana-verify",
    href: "/docs/reference/agents/ana-verify",
  },
  {
    number: "05",
    name: "Learn",
    description: "Promote findings to rules.",
    artifacts: ["skill files"],
    agent: "ana-learn",
    href: "/docs/reference/agents/ana-learn",
  },
];

export function PipelineDiagram() {
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "8px",
          margin: "8px 0 14px",
          position: "relative",
        }}
      >
        {STAGES.map((stage, i) => (
          <Link
            key={stage.number}
            href={stage.href}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "5px",
              padding: "14px 14px 12px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-card)",
              position: "relative",
              textDecoration: "none",
              transition: "border-color 0.15s",
            }}
          >
            {/* → arrow between cards */}
            {i < STAGES.length - 1 && (
              <span
                style={{
                  position: "absolute",
                  right: "-13px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--ink-25)",
                  fontSize: "14px",
                  fontFamily: "var(--font-mono)",
                  zIndex: 1,
                  background: "var(--bg)",
                  padding: "0 2px",
                }}
              >
                →
              </span>
            )}
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: "var(--ink-45)",
                letterSpacing: "0.06em",
              }}
            >
              {stage.number}
            </span>
            <span
              style={{
                fontFamily: "var(--font-serif)",
                fontWeight: 500,
                fontSize: "18px",
                letterSpacing: "-0.01em",
                color: "var(--fg)",
                marginBottom: "1px",
              }}
            >
              {stage.name}
            </span>
            <span
              style={{
                fontSize: "11.5px",
                color: "var(--ink-60)",
                lineHeight: 1.45,
              }}
            >
              {stage.description}
            </span>
            <span style={{ fontSize: "10.5px", marginTop: "2px" }}>
              {stage.artifacts.map((art, j) => (
                <span key={art}>
                  {j > 0 && " "}
                  <code
                    style={{
                      fontSize: "10px",
                      background: "var(--code-bg)",
                      border: "1px solid var(--hairline)",
                      padding: "1px 5px",
                      borderRadius: "3px",
                      color: "var(--ink-60)",
                    }}
                  >
                    {art}
                  </code>
                </span>
              ))}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10.5px",
                color: "var(--brand-light)",
                marginTop: "auto",
                paddingTop: "8px",
                borderTop: "1px solid var(--hairline)",
                letterSpacing: "0.02em",
              }}
            >
              {stage.agent}
            </span>
          </Link>
        ))}
      </div>
      {/* Footer — .pf-meta */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "18px",
          fontSize: "12px",
          color: "var(--ink-60)",
          padding: "10px 4px 0",
          marginBottom: "42px",
          flexWrap: "wrap",
        }}
      >
        <span>
          <b style={{ color: "var(--fg)", fontWeight: 500 }}>Sealed</b> — each
          agent sees only the artifacts it needs. Independent verification by
          design.
        </span>
        <Link
          href="/docs/concepts/pipeline"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11.5px",
            color: "var(--fg)",
            borderBottom: "1px solid var(--ink-25)",
            textDecoration: "none",
            transition: "border-color 0.12s",
            flexShrink: 0,
          }}
        >
          How it works in depth →
        </Link>
      </div>
    </div>
  );
}
