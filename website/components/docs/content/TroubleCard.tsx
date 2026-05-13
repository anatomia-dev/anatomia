import type { ReactNode } from "react";

interface TroubleCardProps {
  title: string;
  children: ReactNode;
}

export function TroubleCard({ title, children }: TroubleCardProps) {
  return (
    <div
      className="my-4 rounded-[var(--radius-sm)] px-5 py-4 text-[14px] leading-relaxed"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-soft)",
      }}
    >
      <h4
        className="mt-0 mb-3 text-[15px] font-semibold"
        style={{ color: "var(--fg)" }}
      >
        {title}
      </h4>
      <div style={{ color: "var(--ink-80)" }}>{children}</div>
    </div>
  );
}
