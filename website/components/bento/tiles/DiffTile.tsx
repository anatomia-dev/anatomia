import { copy } from "@/lib/copy";
import styles from "../bento.module.css";

const { diff } = copy.bento;

export function DiffTile() {
  return (
    <div className={`${styles.tile} ${styles.tDiff}`}>
      <div className={styles.tilePad}>
        <div className={styles.tileEyebrow}>
          <span className={styles.tileNum}>{diff.num}</span>
          {diff.label}
        </div>
        <h3>{diff.title}</h3>
        <p>{diff.body}</p>
        <div className={styles.diffBlock}>
          {diff.lines.map((l, i) => (
            <div
              key={i}
              className={`${styles.diffLine} ${l.kind === "minus" ? styles.diffMinus : styles.diffPlus}`}
            >
              {l.kind === "minus" ? "−" : "+"} {l.code}
            </div>
          ))}
        </div>
        <div className={styles.diffFoot}>
          <span>{diff.foot.file}</span>
          <span className={styles.diffPass}>{diff.foot.pass}</span>
        </div>
      </div>
    </div>
  );
}
