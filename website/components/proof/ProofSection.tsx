import { copy } from "@/lib/copy";
import { Container } from "@/components/ui/Container";
import { Formatted } from "@/components/ui/Formatted";
import { LedgerObserver } from "./LedgerObserver";
import { ProofCard } from "./ProofCard";
import { ChainSparkline } from "./ChainSparkline";
import styles from "./proof.module.css";

/**
 * ProofSection — Section 5: the sealed proof ceremony.
 * Server component. LedgerObserver is the only client child.
 */
export function ProofSection() {
  const p = copy.proof;

  return (
    <section
      className={`reveal ${styles.section}`}
      id="proof"
      data-component="proof"
    >
      <Container>
        {/* Header: two-column intro */}
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>
              <span className={styles.dot} />
              {p.eyebrow}
            </div>
            <h2 className={styles.sectionTitle}>
              <Formatted text={p.title} />
            </h2>
          </div>
          <div>
            <p className={styles.lede}>
              <Formatted text={p.lede} />
            </p>
          </div>
        </header>

        {/* Spec strip: manifest style */}
        <div className={styles.specStrip}>
          <span className={styles.specStripPrompt}>{p.specPrompt}</span>
          {p.specStrip.map((item) => (
            <span key={item.label}>
              {item.label}: <span className={styles.specVal}>{item.value}</span>
            </span>
          ))}
        </div>

        {/* The ceremony: one sealed proof, six prior runs visible behind */}
        <LedgerObserver>
          <ProofCard />
        </LedgerObserver>

        {/* Chain sparkline */}
        <ChainSparkline />

        {/* Closer */}
        <div className={styles.closer}>
          <span className={styles.closerArrow}>{"\u2193"}</span>
          <p className={styles.closerText}>
            <Formatted text={p.closer} />
          </p>
        </div>
      </Container>
    </section>
  );
}
