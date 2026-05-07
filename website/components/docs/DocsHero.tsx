import { copy } from "@/lib/copy";
import { Formatted } from "@/components/ui/Formatted";
import { CopyButton } from "@/components/scan/CopyButton";

/**
 * DocsHero — eyebrow, title, lede, install block.
 */
export function DocsHero() {
  return (
    <div className="mb-12">
      {/* Eyebrow */}
      <div className="mb-7 inline-flex items-center gap-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--ink-45)" }}>
        <span className="h-px w-[18px]" style={{ background: "var(--color-brand)" }} />
        {copy.docs.eyebrow}
      </div>

      {/* Title */}
      <h1
        className="mb-5 max-w-[18ch] text-[clamp(40px,5.2vw,60px)] font-medium leading-[1.02] tracking-tight"
        style={{ color: "var(--fg-strong)" }}
      >
        <Formatted text={copy.docs.title} />
      </h1>

      {/* Lede */}
      <p className="mb-12 max-w-[58ch] text-[17px] leading-relaxed tracking-tight" style={{ color: "var(--ink-75)" }}>
        {copy.docs.lede}
      </p>

      {/* Install block */}
      <div className="mb-8 overflow-hidden rounded-[var(--radius-sm)] border" style={{ borderColor: "var(--border-soft)", background: "var(--bg-card)" }}>
        <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: "var(--hairline)" }}>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--ink-45)" }}>
            {copy.docs.install.tag}
          </span>
          <span className="font-mono text-[11px]" style={{ color: "var(--ink-45)" }}>
            {copy.docs.install.reqs}
          </span>
        </div>
        <div className="flex items-center gap-0">
          <code className="flex-1 px-4 py-3.5 font-mono text-[13.5px]" style={{ color: "var(--fg-strong)" }}>
            <span className="font-semibold" style={{ color: "var(--color-brand)" }}>{copy.docs.install.commands[0]}</span>
          </code>
          <CopyButton text={copy.docs.install.commands[0]} />
        </div>
        <div className="border-t px-4 py-2 font-mono text-[11px]" style={{ borderColor: "var(--hairline)", color: "var(--ink-45)" }}>
          {copy.docs.install.reqNote}
        </div>
      </div>
    </div>
  );
}
