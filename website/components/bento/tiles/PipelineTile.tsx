import { copy } from "@/lib/copy";
import styles from "../bento.module.css";

const { pipeline } = copy.bento;

export function PipelineTile() {
  return (
    <div className={`${styles.tile} ${styles.tPipeline}`}>
      <div className={`${styles.tilePad} ${styles.pipelineLayout}`}>
        {/* Left: pipeline viz */}
        <div className={styles.pipelineViz}>
          <div className={styles.stageRow}>
            {pipeline.stages.map((s) => (
              <div key={s.n} className={styles.stage}>
                <span className={styles.stageN}>{s.n}</span>
                <span className={styles.stageName}>{s.name}</span>
                <span className={styles.stageSub}>{s.sub}</span>
              </div>
            ))}
          </div>
          <div className={styles.stageFlow}>
            {pipeline.artifacts.map((a) => (
              <span key={a.key} className="contents">
                <span className={styles.flowTick}>✓</span>
                <span className={styles.flowKey}>{a.key}</span>
                <span className={styles.flowVal}>{a.val}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Right: copy */}
        <div>
          <div className={styles.tileEyebrow}>
            <span className={styles.tileNum}>{pipeline.num}</span>
            {pipeline.label}
          </div>
          <h3 style={{ fontSize: "clamp(30px, 3vw, 40px)", lineHeight: 1.08, letterSpacing: "-0.035em" }}>
            {pipeline.steps.map((step, i) => (
              <span key={step}>
                {i > 0 && <span style={{ color: "var(--ink-30)", margin: "0 0.18em", fontWeight: 500 }}>→</span>}
                <span style={step === "Verify" ? { color: "var(--color-brand)" } : undefined}>{step}</span>
              </span>
            ))}
          </h3>
          <p style={{ marginTop: 14, fontSize: 16, lineHeight: 1.55, color: "var(--ink-60)", maxWidth: "40ch" }}>
            {pipeline.prose}
          </p>
          <div className={styles.pipelineStatRow}>
            {pipeline.stats.map((s) => (
              <div key={s.l} className={styles.pipelineStat}>
                <div className={styles.statV}>{s.v}</div>
                <div className={styles.statL}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Tetris corners */}
      <span className={`${styles.tmark} ${styles.tmarkTl}`} />
      <span className={`${styles.tmark} ${styles.tmarkTr}`} />
      <span className={`${styles.tmark} ${styles.tmarkBl}`} />
      <span className={`${styles.tmark} ${styles.tmarkBr}`} />
    </div>
  );
}
