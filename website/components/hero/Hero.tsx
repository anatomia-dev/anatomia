import { copy } from "@/lib/copy";
import { splitHeadline } from "@/lib/format";
import { getProofFeed, formatAge } from "@/lib/proof-feed";
import { Formatted } from "@/components/ui/Formatted";
import { Container } from "@/components/ui/Container";
import { HeroNoise } from "./HeroNoise";
import { ScrollHint } from "./ScrollHint";
import styles from "./hero.module.css";

/**
 * Hero section — above the fold.
 * Server component. Reads proof feed for eyebrow link.
 */
export async function Hero() {
  const entries = await getProofFeed();
  const latest = entries[0];
  const title = splitHeadline(copy.hero.headline);

  return (
    <section className={styles.hero} data-component="hero">
      <HeroNoise />

      <Container className={styles.inner}>
        {/* Eyebrow dispatch pill */}
        <a
          className={styles.eyebrow}
          href={latest?.url ?? "#"}
          aria-label="Latest proof: Proof chains are live"
        >
          <span className={styles.live} aria-hidden="true" />
          <span className={styles.tag}>{copy.hero.eyebrow.tag}</span>
          {latest && (
            <span className={styles.meta}>· {formatAge(latest.ts)}</span>
          )}
          <span className={styles.rule} aria-hidden="true" />
          <span className={styles.feature}>
            <Formatted text={copy.hero.eyebrow.feature} />
          </span>
          <span className={styles.chev} aria-hidden="true">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M3 8 L8 3 M4 3 H8 V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </a>

        {/* Headline */}
        <h1 className={styles.headline}>
          {title.map((p, i) =>
            p.em ? <em key={i}>{p.t}</em> : <span key={i}>{p.t}</span>,
          )}
        </h1>

        {/* Subhead */}
        <p className={styles.sub}>{copy.hero.subhead}</p>

        {/* CTAs */}
        <div className={styles.ctas}>
          <a
            href={copy.hero.ctas.primary.href}
            className="inline-flex items-center gap-[10px] whitespace-nowrap rounded-[var(--radius-sm)] px-[18px] py-[12px] font-mono text-[13px] font-semibold transition-all duration-150 hover:-translate-y-px hover:shadow-[0_10px_30px_-14px_var(--fg-strong)]"
            style={{ background: "var(--fg-strong)", color: "var(--bg)" }}
          >
            <span
              className="h-[6px] w-[6px] rounded-full"
              style={{
                background: "var(--color-brand)",
                boxShadow: "0 0 0 3px color-mix(in oklch, var(--color-brand) 30%, transparent)",
              }}
            />
            {copy.hero.ctas.primary.label} · <code style={{ opacity: 0.65 }}>{copy.hero.ctas.primary.command}</code>
          </a>
          <a
            href={copy.hero.ctas.secondary.href}
            className="inline-flex items-center gap-[10px] whitespace-nowrap rounded-[var(--radius-sm)] border px-[18px] py-[12px] font-mono text-[13px] font-semibold transition-all duration-150 hover:-translate-y-px"
            style={{
              background: "var(--btn-2-bg)",
              color: "var(--btn-2-text)",
              borderColor: "var(--btn-2-border)",
            }}
          >
            {copy.hero.ctas.secondary.label}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 6h6M6 3l3 3-3 3" />
            </svg>
          </a>
        </div>

        {/* Meta row */}
        <div className={styles.heroMeta}>
          {copy.hero.meta.map((item, i) => (
            <span key={i}>
              {i > 0 && <span className={styles.sep}>·</span>}
              {item}
            </span>
          ))}
        </div>
      </Container>

      <ScrollHint />
    </section>
  );
}
