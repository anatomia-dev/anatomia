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
          <span className={`${styles.chainShown} ${styles.shownDesktop}`}>55/</span>
          <span className={`${styles.chainShown} ${styles.shownTablet}`}>35/</span>
          <span className={`${styles.chainShown} ${styles.shownPhone}`}>25/</span>
          <strong>{c.count}</strong> {c.countLabel}
        </span>
      </div>

      <div className={styles.chainSpark} aria-label={`showing ${c.pattern.length} of ${c.count} proofs`}>
        {c.pattern.map((p, i) => {
          // Last visible pip at each breakpoint gets the highlight
          const isLastDesktop = i === c.pattern.length - 1;
          const isLastTablet = i === 34;  // last before pipDesktopOnly kicks in
          const isLastPhone = i === 24;   // last before pipTabletUp kicks in
          return (
            <span
              key={i}
              className={[
                styles.pip,
                classMap[p],
                isLastDesktop ? styles.pipLatest : "",
                isLastTablet ? styles.pipLatestTablet : "",
                isLastPhone ? styles.pipLatestPhone : "",
                i >= 35 ? styles.pipDesktopOnly : "",
                i >= 25 ? styles.pipTabletUp : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          );
        })}
      </div>

      <div className={styles.chainStats}>
        {c.stats.map((s) => (
          <div key={s.label} className={styles.chainStat}>
            <span className={styles.chainStatLabel}>{s.label}</span>
            <span className={styles.chainStatValue}>
              {s.value}
              {"unit" in s && s.unit && (
                <span className={styles.unit}>{s.unit}</span>
              )}
              {"trend" in s && s.trend && (
                <span className={styles.trend}>{s.trend}</span>
              )}
            </span>
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
