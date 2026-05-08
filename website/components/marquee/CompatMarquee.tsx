import { copy } from "@/lib/copy";
import { BrandIcon } from "@/lib/icons";
import { Container } from "@/components/ui/Container";
import styles from "./marquee.module.css";

/**
 * CompatMarquee — CSS-only infinite scroll of compatible tools.
 * Server component. No JS. Track is duplicated for seamless loop.
 */
export function CompatMarquee() {
  const items = copy.marquee.items;
  // Duplicate for seamless CSS animation
  const doubled = [...items, ...items];

  return (
    <section className={styles.section} data-component="compat-marquee">
      <Container>
        <div className={styles.label}>{copy.marquee.title}</div>
        <div className={styles.trackWrap}>
          <div className={styles.track}>
            {doubled.map((name, i) => (
              <span key={i} className={styles.item}>
                <span className={styles.glyph}>
                  <BrandIcon name={name} size={16} />
                </span>
                {name}
              </span>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
