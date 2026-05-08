import { copy } from "@/lib/copy";
import { BrandIcon } from "@/lib/icons";
import styles from "../bento.module.css";

const { compat } = copy.bento;

export function CompatTile() {
  return (
    <div className={`${styles.tile} ${styles.tCompat}`}>
      <div className={styles.tilePad}>
        <div className={styles.tileEyebrow}>
          <span className={styles.tileNum}>{compat.num}</span>
          {compat.label}
        </div>
        <h3>{compat.title}</h3>
        <p>{compat.body}</p>
        <div className={styles.compatChips}>
          {compat.chips.map((c) => (
            <span key={c} className={styles.compatChip} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <BrandIcon name={c} size={14} />
              {c}
            </span>
          ))}
          <span className={styles.compatCatch}>{compat.catchChip}</span>
        </div>
      </div>
    </div>
  );
}
