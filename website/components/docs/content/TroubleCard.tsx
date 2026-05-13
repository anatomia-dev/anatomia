import type { ReactNode } from "react";

interface TroubleCardProps {
  title: string;
  children: ReactNode;
}

/**
 * TroubleCard — matches supermock .trouble-card.
 * padding: 18px 20px, title as bold h4, fix body at 13px.
 */
export function TroubleCard({ title, children }: TroubleCardProps) {
  return (
    <div
      className="docs-trouble-card"
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "18px 20px",
        background: "var(--bg-card)",
        marginBottom: "14px",
      }}
    >
      <h4
        style={{
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--fg)",
          marginTop: 0,
          marginBottom: "8px",
          fontFamily: "var(--font-sans)",
        }}
      >
        {title}
      </h4>
      <div
        style={{
          fontSize: "13px",
          lineHeight: 1.55,
          color: "var(--ink-75)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
