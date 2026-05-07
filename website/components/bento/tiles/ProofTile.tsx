import { copy } from "@/lib/copy";
import styles from "../bento.module.css";

const { proof } = copy.bento;

export function ProofTile() {
  return (
    <div className={`${styles.tile} ${styles.tProof}`}>
      <div className={styles.tilePad}>
        <div className={styles.tileEyebrow}>
          <span className={styles.tileNum}>{proof.num}</span>
          {proof.label}
        </div>
        <h3>{proof.title}</h3>
        <p>{proof.body}</p>
        <div className={styles.proofCard}>
          <div className={styles.proofCardHead}>
            <span className={styles.proofCardId}>{proof.card.id}</span>
            <span className={styles.proofCardStatus}>{proof.card.status}</span>
          </div>
          <div className={styles.proofRow}>
            {proof.card.rows.map((r) => (
              <span key={r.k} className="contents">
                <span className={styles.proofK}>{r.k}</span>
                <span className={styles.proofV}>{r.v}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
