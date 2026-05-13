import type { ReactNode } from "react";

type CalloutVariant = "rule" | "note";

interface CalloutProps {
  variant?: CalloutVariant;
  children: ReactNode;
}

const LABELS: Record<CalloutVariant, string> = {
  rule: "Rule",
  note: "Note",
};

const variantStyles: Record<
  CalloutVariant,
  { borderColor: string; labelColor: string }
> = {
  rule: {
    borderColor: "var(--color-brand)",
    labelColor: "var(--brand-light)",
  },
  note: {
    borderColor: "var(--info)",
    labelColor: "var(--info)",
  },
};

export function Callout({ variant = "note", children }: CalloutProps) {
  const styles = variantStyles[variant];

  return (
    <div
      role="note"
      className="my-[8px_0_22px] rounded-[var(--radius-md)] text-[13.5px] leading-[1.55]"
      style={{
        display: "flex",
        gap: "12px",
        padding: "14px 16px",
        border: "1px solid var(--border-soft)",
        borderLeft: `3px solid ${styles.borderColor}`,
        background: "var(--bg-card)",
        color: "var(--ink-80, var(--fg))",
      }}
    >
      <span
        className="shrink-0 font-mono text-[10px] font-semibold uppercase"
        style={{
          letterSpacing: "0.06em",
          color: styles.labelColor,
          paddingTop: "3px",
          whiteSpace: "nowrap",
        }}
      >
        {LABELS[variant]}
      </span>
      <div>{children}</div>
    </div>
  );
}
