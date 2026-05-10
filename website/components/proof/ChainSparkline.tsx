import { copy } from "@/lib/copy";
import styles from "./proof.module.css";

const classMap: Record<string, string> = {
  G: styles.pipPass!,
  Y: styles.pipWarn!,
  R: styles.pipFail!,
};

/**
 * ChainSparkline — pip sparkline + stats + legend.
 * Server component — pips are generated from static pattern data.
 */
export function ChainSparkline() {
  const c = copy.proof.chain;

  return (
    <div className={styles.chain}>
      <div className={styles.chainHead}>
        <span className={styles.chainTitle}>{c.title}</span>
        <span className={styles.chainCount}>
          <span className={styles.chainShown}>{c.shown}</span>
          <strong>{c.count}</strong> {c.countLabel}
        </span>
      </div>

      <div className={styles.chainSpark} aria-label={c.footLeft}>
        {c.pattern.map((p, i) => (
          <span
            key={i}
            className={[
              styles.pip,
              classMap[p],
              i === c.pattern.length - 1 ? styles.pipLatest : "",
            ]
              .filter(Boolean)
              .join(" ")}
          />
        ))}
      </div>

      <div className={styles.chainFoot}>
        <span className={styles.chainFootLeft}>{c.footLeft}</span>
        <span className={styles.chainFootRight}>{c.footRight}</span>
      </div>

      <div className={styles.chainStats}>
        {c.stats.map((s) => (
          <div key={s.label} className={styles.chainStat}>
            <span className={styles.chainStatLabel}>{s.label}</span>
            <span
              className={styles.chainStatValue}
              dangerouslySetInnerHTML={{ __html: s.value }}
            />
          </div>
        ))}
      </div>

      <div className={styles.chainLegend}>
        {c.legend.map((l) => (
          <span key={l.label} className={styles.chainLegendItem}>
            <span
              className={[
                styles.swatch,
                l.color === "pass"
                  ? styles.swatchPass
                  : l.color === "warn"
                    ? styles.swatchWarn
                    : styles.swatchFail,
              ].join(" ")}
            />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
