import { copy } from "@/lib/copy";
import { Container } from "@/components/ui/Container";
import styles from "./marquee.module.css";

/** Brand glyph colors — matches handoff CSS. */
const glyphColors: Record<string, { bg: string; color: string }> = {
  "Claude Code": { bg: "#f97316", color: "#fff" },
  "Cursor": { bg: "#000", color: "#fff" },
  "Windsurf": { bg: "#a855f7", color: "#fff" },
  "Codex": { bg: "var(--color-brand)", color: "#fff" },
  "Zed": { bg: "#3b82f6", color: "#fff" },
};

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
        <div className={styles.label}>Compatible runtimes</div>
        <div className={styles.trackWrap}>
          <div className={styles.track}>
            {doubled.map((name, i) => {
              const colors = glyphColors[name];
              return (
                <span key={i} className={styles.item}>
                  <span
                    className={styles.glyph}
                    style={colors ? { background: colors.bg, color: colors.color } : undefined}
                  >
                    {name.charAt(0)}
                  </span>
                  {name}
                </span>
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}
