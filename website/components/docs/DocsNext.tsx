import Link from "next/link";
import { copy } from "@/lib/copy";

/**
 * DocsNext — 2×2 grid of "where to next" cards with status badges.
 */
export function DocsNext() {
  return (
    <div className="mt-16">
      {/* Section rule */}
      <div className="mb-8 border-t pt-8" style={{ borderColor: "var(--hairline)" }}>
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--ink-45)" }}>
          {copy.docs.sectionRule.next}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {copy.docs.next.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className="group rounded-[var(--radius-md)] border p-6 transition-colors duration-150"
            style={{ borderColor: "var(--border-soft)", background: "var(--bg-card)" }}
          >
            <div className="mb-2 flex items-center gap-3">
              <h4 className="text-base font-semibold" style={{ color: "var(--fg-strong)" }}>
                {item.title}
              </h4>
              <span
                className="rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest"
                style={{
                  background: item.status === "Live"
                    ? "color-mix(in oklch, var(--color-brand) 12%, transparent)"
                    : "var(--border-soft)",
                  color: item.status === "Live"
                    ? "var(--color-brand)"
                    : "var(--ink-45)",
                }}
              >
                {item.status}
              </span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--ink-60)" }}>
              {item.desc}
            </p>
          </Link>
        ))}
      </div>

      {/* Coda */}
      <p className="mt-10 text-center text-sm" style={{ color: "var(--ink-45)" }}>
        {copy.docs.coda}
      </p>
    </div>
  );
}
