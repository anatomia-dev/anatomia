import { copy } from "@/lib/copy";
import { Formatted } from "@/components/ui/Formatted";

/**
 * DocsRecap — "What you just shipped" summary panel.
 */
export function DocsRecap() {
  return (
    <div className="mt-16 rounded-[var(--radius-md)] border p-8" style={{ borderColor: "var(--border-soft)", background: "var(--bg-card)" }}>
      <h3 className="mb-3 text-xl font-semibold tracking-tight" style={{ color: "var(--fg-strong)" }}>
        {copy.docs.recap.title}
      </h3>
      <p className="mb-4 max-w-[58ch] text-[15.5px] leading-relaxed" style={{ color: "var(--ink-75)" }}>
        <Formatted text={copy.docs.recap.body} />
      </p>
      <p className="text-sm" style={{ color: "var(--ink-45)" }}>
        {copy.docs.recap.tail}
      </p>
    </div>
  );
}
