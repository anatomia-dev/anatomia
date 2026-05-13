import Link from "next/link";

interface SkillCardProps {
  name: string;
  conditional: boolean;
  description: string;
  rules: number;
  className?: string;
}

/**
 * SkillCard — card for skill index grid.
 * Matches supermock .ref-card with .ref-card-meta for rule count.
 */
export function SkillCard({ name, conditional, description, rules, className }: SkillCardProps) {
  return (
    <Link
      href={`/docs/reference/skills/${name}`}
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
          {conditional ? "conditional" : "core"}
        </span>
      </div>
      <div style={{ fontSize: "13px", color: "var(--ink-80)", lineHeight: 1.45 }}>
        {description}
      </div>
      <div style={{ fontSize: "11px", color: "var(--ink-40)", marginTop: "6px" }}>
        {rules} rule{rules !== 1 ? "s" : ""}
      </div>
    </Link>
  );
}
