import { copy } from "@/lib/copy";
import { Container } from "@/components/ui/Container";
import { PriceCard } from "./PriceCard";
import { TetrisSnake } from "./TetrisSnake";
import styles from "./pricing.module.css";

/**
 * Pricing section — tetris frame header + two price cards.
 * Server component. Only TetrisSnake is client (canvas).
 */
export function Pricing() {
  return (
    <section data-component="pricing" className={styles.section}>
      <Container>
        <div className="mx-auto max-w-[1100px]">
        <div className={styles.top}>
          <div className={styles.frame}>
            <TetrisSnake />
            <div id="pricing" className={styles.inner} style={{ scrollMarginTop: 72 }}>
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--ink-60)" }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-brand)" }} />
                {copy.pricing.eyebrow}
              </div>
              <h2 className="mt-3.5 text-[clamp(40px,5.5vw,68px)] leading-[1.02] tracking-[-0.04em]" style={{ color: "var(--fg-strong)", maxWidth: "18ch" }}>
                {copy.pricing.title}
              </h2>
              <p className="mt-3.5 text-base leading-relaxed" style={{ maxWidth: "52ch", color: "var(--ink-60)" }}>
                {copy.pricing.blurb}
              </p>
            </div>
          </div>
        </div>

        <div className={styles.grid}>
          {copy.pricing.plans.map((plan) => (
            <PriceCard key={plan.name} plan={plan} />
          ))}
        </div>
        </div>
      </Container>
    </section>
  );
}
