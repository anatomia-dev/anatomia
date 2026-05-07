import { copy } from "@/lib/copy";
import styles from "../bento.module.css";

const { agents } = copy.bento;

export function AgentsTile() {
  return (
    <div className={`${styles.tile} ${styles.tAgents}`}>
      <div className={styles.tilePad}>
        <div className={styles.tileEyebrow}>
          <span className={styles.tileNum}>{agents.num}</span>
          {agents.label}
        </div>
        <h3>{agents.title}</h3>
        <p>{agents.body}</p>
        <div className={styles.chipGrid}>
          {agents.chips.map((c) => (
            <div key={c.name} className={styles.chip}>
              <span className={styles.chipN}>{c.n}</span>
              <span className={styles.chipName}>{c.name}</span>
              <span className={styles.chipRole}>{c.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
