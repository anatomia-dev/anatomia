import type { ReactNode } from "react";

type CalloutVariant = "rule" | "note";

interface CalloutProps {
  variant?: CalloutVariant;
  children: ReactNode;
}

const variantStyles: Record<CalloutVariant, { borderColor: string; background: string }> = {
  rule: {
    borderColor: "var(--color-brand)",
    background: "var(--brand-soft)",
  },
  note: {
    borderColor: "var(--ink-30)",
    background: "var(--border-soft)",
  },
};

export function Callout({ variant = "note", children }: CalloutProps) {
  const styles = variantStyles[variant];

  return (
    <div
      role="note"
      className="my-6 rounded-[var(--radius-sm)] px-5 py-4 text-[14.5px] leading-relaxed"
      style={{
        borderLeft: `3px solid ${styles.borderColor}`,
        background: styles.background,
        color: "var(--fg)",
      }}
    >
      {children}
    </div>
  );
}
