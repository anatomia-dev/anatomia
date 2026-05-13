import type { ReactNode } from "react";

interface ReferenceGridProps {
  children: ReactNode;
  className?: string;
}

/**
 * ReferenceGrid — 2-column CSS grid for reference cards.
 * Matches supermock .ref-grid: 1fr 1fr, 12px gap, 24px vertical margin.
 * Responsive collapse handled by docs-ref-grid class in docs.css.
 */
export function ReferenceGrid({ children, className }: ReferenceGridProps) {
  return (
    <div
      className={`docs-ref-grid${className ? ` ${className}` : ""}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "12px",
        margin: "24px 0",
      }}
    >
      {children}
    </div>
  );
}
