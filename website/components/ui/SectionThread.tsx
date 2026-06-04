import type { ReactNode } from "react";

/**
 * SectionThread — section-to-section connector.
 * Hairline border-top, mono text, arrow glyph, optional link.
 * Server component. Reused between ScanSlab → System and System → Proof.
 */
export function SectionThread({
  segments,
  arrow = "→",
  link,
  className = "",
}: {
  segments: ReactNode[];
  arrow?: string;
  link?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div
      className={`mt-7 flex flex-wrap items-baseline gap-3 border-t pt-5 font-mono text-xs ${className}`}
      style={{ borderColor: "var(--hairline)", color: "var(--ink-60)" }}
    >
      {segments.map((seg, i) => (
        <span key={i}>{seg}</span>
      ))}
      <span
        style={{ color: "var(--fg-strong)" }}
      >
        {arrow}
      </span>
      {link && (
        <a
          href={link.href}
          className="border-b font-semibold"
          style={{ color: "var(--fg-strong)", borderColor: "var(--fg-strong)" }}
        >
          {link.label}
        </a>
      )}
    </div>
  );
}
