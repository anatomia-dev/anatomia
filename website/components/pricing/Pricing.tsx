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
    <section id="pricing" data-component="pricing" className={styles.section}>
      <Container>
        <div className={styles.top}>
          <div className={styles.frame}>
            <TetrisSnake />
            <div className={styles.inner}>
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--ink-60)" }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-brand)" }} />
                {copy.pricing.eyebrow}
              </div>
              <h2 className="mt-3.5 text-[clamp(32px,3.8vw,52px)] leading-[1.05] tracking-tight" style={{ color: "var(--fg-strong)" }}>
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
      </Container>
    </section>
  );
}
