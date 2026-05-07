import { copy } from "@/lib/copy";
import { Formatted } from "@/components/ui/Formatted";
import { splitHeadline } from "@/lib/format";
import { CopyAddress } from "./CopyAddress";

/**
 * Contact — eyebrow, title, lede, two channel rows.
 * Hairline separators. Mobile collapses to one column.
 */
export function Contact() {
  const title = splitHeadline(copy.contact.title);

  return (
    <div className="mx-auto max-w-[680px] px-2">
      {/* Eyebrow */}
      <div className="mb-7 inline-flex items-center gap-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--ink-45)" }}>
        <span className="h-px w-[18px]" style={{ background: "var(--color-brand)" }} />
        {copy.contact.eyebrow}
      </div>

      {/* Title */}
      <h1 className="mb-5 text-[clamp(40px,5.2vw,56px)] font-medium leading-[1.02] tracking-tight" style={{ color: "var(--fg-strong)" }}>
        {title.map((p, i) =>
          p.em ? (
            <em key={i} className="font-serif italic" style={{ color: "var(--color-brand)" }}>{p.t}</em>
          ) : (
            <span key={i}>{p.t}</span>
          ),
        )}
      </h1>

      {/* Lede */}
      <p className="mb-12 max-w-[58ch] text-[17px] leading-relaxed" style={{ color: "var(--ink-75)" }}>
        <Formatted text={copy.contact.lede} />
      </p>

      {/* Channel rows */}
      <div className="flex flex-col">
        {copy.contact.channels.map((ch, i) => (
          <div
            key={ch.kind}
            className={`flex flex-col gap-4 py-8 min-[640px]:flex-row min-[640px]:gap-12 ${i > 0 ? "border-t" : ""}`}
            style={{ borderColor: "var(--hairline)" }}
          >
            {/* Kind label */}
            <div className="min-w-[100px] shrink-0">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--ink-45)" }}>
                {ch.kind}
              </span>
            </div>

            {/* Address + note */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <a
                  href={ch.href}
                  target={ch.kind === "GitHub" ? "_blank" : undefined}
                  rel={ch.kind === "GitHub" ? "noopener noreferrer" : undefined}
                  className="font-mono text-[14px] font-medium transition-colors duration-150"
                  style={{ color: "var(--fg-strong)" }}
                >
                  {ch.addr}
                </a>
                <CopyAddress addr={ch.addr} href={ch.href} />
              </div>
              <p className="max-w-[48ch] text-sm leading-relaxed" style={{ color: "var(--ink-60)" }}>
                <Formatted text={ch.note} />
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Coda */}
      <div className="mt-10 flex flex-col gap-1 font-mono text-[11.5px]" style={{ color: "var(--ink-45)" }}>
        {copy.contact.coda.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
    </div>
  );
}
