import Link from "next/link";

interface AgentCardProps {
  name: string;
  model: string;
  role: string;
  description: string;
  className?: string;
}

/**
 * AgentCard — card for agent index grid.
 * Matches supermock .ref-card, .ref-card-head, .ref-card-name,
 * .ref-card-badge, .ref-card-role, .ref-card-desc.
 */
export function AgentCard({ name, model, role, description, className }: AgentCardProps) {
  return (
    <Link
      href={`/docs/reference/agents/${name}`}
      className={`docs-ref-card${className ? ` ${className}` : ""}`}
      style={{
        display: "block",
        padding: "16px 18px",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        textDecoration: "none",
        color: "inherit",
        cursor: "pointer",
        transition: "border-color 120ms",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <code style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)", fontFamily: "var(--font-mono)" }}>
          {name}
        </code>
        <span
          style={{
            fontSize: "10px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "2px 6px",
            borderRadius: "3px",
            background: "var(--code-bg)",
            color: "var(--ink-60)",
          }}
        >
          {model}
        </span>
      </div>
      <div style={{ fontSize: "12px", color: "var(--ink-40)", marginBottom: "4px" }}>
        {role}
      </div>
      <div style={{ fontSize: "13px", color: "var(--ink-80)", lineHeight: 1.45 }}>
        {description}
      </div>
    </Link>
  );
}
