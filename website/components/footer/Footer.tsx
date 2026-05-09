import Link from "next/link";
import { copy } from "@/lib/copy";
import { getProofFeed, formatAge } from "@/lib/proof-feed";
import { splitHeadline } from "@/lib/format";
import { Container } from "@/components/ui/Container";

/**
 * Site footer — brand block, 3-column links, legal + commit pill.
 * Server component. Reads proof feed for the commit pill (latest hash + ago).
 */
export async function Footer() {
  const entries = await getProofFeed();
  const latest = entries[0];
  const tagline = splitHeadline(copy.footer.tagline);

  return (
    <footer
      className="border-t pt-15 pb-9"
      style={{
        background: "var(--footer-bg)",
        borderColor: "var(--hairline)",
      }}
    >
      <Container>
        {/* Grid: brand block + 3 link columns */}
        <div className="grid grid-cols-1 gap-10 min-[720px]:grid-cols-[2fr_1fr_1fr_1fr]">
          {/* Brand block */}
          <div className="flex max-w-[44ch] flex-col gap-3.5">
            <Link
              href="/"
              className="flex items-baseline font-serif text-[15px] font-medium"
              style={{ color: "var(--fg)", letterSpacing: "-0.02em" }}
            >
              <span>{copy.footer.brand}</span>
              <span
                className="ml-[0.22em] inline-block"
                style={{
                  width: "0.32em",
                  height: "0.39em",
                  background: "var(--color-brand)",
                  position: "relative",
                  top: "0.03em",
                }}
              />
            </Link>

            <p style={{
              fontSize: "clamp(32px, 3.6vw, 44px)",
              fontWeight: 600,
              lineHeight: 1.0,
              letterSpacing: "-0.02em",
              color: "var(--fg-strong)",
            }}>
              {tagline.map((p, i) =>
                p.em ? (
                  <em key={i} className="font-serif italic" style={{
                    color: "var(--color-brand)",
                    fontVariationSettings: '"opsz" 96',
                    fontWeight: 400,
                    letterSpacing: "-0.02em",
                  }}>
                    {p.t}
                  </em>
                ) : (
                  <span key={i}>{p.t}</span>
                ),
              )}
            </p>

            <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink-60)" }}>
              {copy.footer.blurb}
            </p>

            <div
              className="mt-0.5 flex items-center gap-1.5 font-mono text-[11.5px]"
              style={{ color: "var(--ink-45)" }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--color-brand)" }}
              />
              {copy.footer.status}
            </div>
          </div>

          {/* Link columns */}
          {copy.footer.columns.map((col) => (
            <div key={col.title} className="flex flex-col gap-3">
              <h4
                className="font-mono text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--ink-45)" }}
              >
                {col.title}
              </h4>
              {col.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-[13.5px] font-medium transition-colors duration-150"
                  style={{ color: "var(--ink-60)" }}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </div>

        {/* Bottom bar: legal + commit pill */}
        <div
          className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t pt-6 font-mono text-[11.5px]"
          style={{
            borderColor: "var(--hairline)",
            color: "var(--ink-45)",
          }}
        >
          <span>{copy.footer.legal}</span>

          {latest && (
            <span>
              <span style={{ color: "var(--ink-30)" }}>commit</span> ·{" "}
              <span>{latest.hash}</span> ·{" "}
              <span>{formatAge(latest.ts)}</span>
            </span>
          )}
        </div>
      </Container>
    </footer>
  );
}
