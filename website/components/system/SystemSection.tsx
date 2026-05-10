import { copy } from "@/lib/copy";
import { Container } from "@/components/ui/Container";
import { Formatted } from "@/components/ui/Formatted";
import { SpecStrip } from "./SpecStrip";
import { Drawer } from "./Drawer";
import styles from "./system.module.css";
import cliPkg from "../../../packages/cli/package.json";

/**
 * SystemSection — replaces the Bento section.
 * Two-column header, spec strip, 4-drawer accordion, section closer.
 * Server component (Drawer is the only client child).
 */
export function SystemSection() {
  return (
    <section
      className={`reveal ${styles.section}`}
      data-component="system"
    >
      <Container>
        <div className="mx-auto max-w-[1210px]">
        <span id="system" className="scroll-anchor" />
        {/* Header: two-column intro */}
        <header className={styles.header}>
          <div>
            {/* Eyebrow */}
            <div
              className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--ink-45)" }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--color-brand)" }}
              />
              {copy.system.eyebrow}
            </div>

            {/* Title */}
            <h2 className={styles.sectionTitle}>
              <Formatted text={copy.system.title} />
            </h2>
          </div>
          <div>
            <p className={styles.lede}>
              <Formatted text={copy.system.lede} />
            </p>
          </div>
        </header>

        {/* Spec strip */}
        <SpecStrip items={copy.system.specStrip} />

        {/* Drawers */}
        <Drawer version={cliPkg.version} />

        {/* Section closer */}
        <a href={copy.system.closer.href} className={styles.closer}>
          <span className={`${styles.closerArrow} ${styles.breathe}`}>↓</span>
          <p className={styles.closerText}>
            <Formatted text={copy.system.closer.text} />
          </p>
        </a>
        </div>
      </Container>
    </section>
  );
}
