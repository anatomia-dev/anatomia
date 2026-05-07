import { copy } from "@/lib/copy";
import styles from "../bento.module.css";

const { scan } = copy.bento;

export function ScanTile() {
  return (
    <div className={`${styles.tile} ${styles.tScan}`}>
      <div className={styles.tilePad}>
        <div className={styles.tileEyebrow}>
          <span className={styles.tileNum}>{scan.num}</span>
          {scan.label}
        </div>
        <h3>{scan.title}</h3>
        <p>{scan.body}</p>
        <div className={styles.metricGrid}>
          {scan.cells.map((c) => (
            <div key={c.l} className={styles.metric}>
              <div className={styles.metricV}>{c.v}</div>
              <div className={styles.metricL}>{c.l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
