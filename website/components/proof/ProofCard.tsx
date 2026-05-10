import { copy } from "@/lib/copy";
import styles from "./proof.module.css";

/**
 * ProofCard — the sealed proof document with stacked prior runs behind it.
 * Server component — all content is static.
 */
export function ProofCard() {
  const p = copy.proof.card;

  return (
    <div className={styles.stack}>
      {/* Receding paper edges of prior proofs */}
      {p.pile.map((item, i) => (
        <div
          key={item.id}
          className={`${styles.pile} ${styles[`pile${p.pile.length - i}` as keyof typeof styles]}`}
          data-id={item.id}
          data-date={item.date}
        />
      ))}

      {/* The active proof */}
      <article className={styles.proof}>
        <div className={styles.proofMeta}>
          <span className={styles.stamp}>
            <span className={styles.stampNum}>{p.meta.entry}</span>
            <span>{p.meta.of}</span>
          </span>
          <span className={styles.date}>{p.meta.date}</span>
        </div>

        <h3 className={styles.proofTitle}>{p.title}</h3>
        <p className={styles.proofSubjectLine}>
          {p.subjectPrefix} <span className={styles.slug}>{p.subjectSlug}</span> {p.subjectSuffix}
        </p>

        <div className={styles.proofResult}>
          <span className={styles.resultPip} />
          <span className={styles.resultLab}>{p.result.label}</span>
          <span className={styles.resultDet}>{p.result.detail}</span>
        </div>

        <div className={styles.sealRule} />

        <div className={styles.proofH}>
          <span>Assertions</span>
          <span className={styles.proofHOf}>
            <strong>{p.assertionsShown}</strong> of {p.assertionsTotal} shown
          </span>
        </div>
        <ul className={styles.asserts}>
          {p.assertions.map((a, i) => (
            <li key={i} className={styles.assertItem}>
              <span className={styles.ck}>{"\u2713"}</span>
              <span dangerouslySetInnerHTML={{ __html: a }} />
            </li>
          ))}
        </ul>
        <p className={styles.assertsMore}>
          + {p.moreSealed} more sealed
        </p>

        <div className={styles.findings}>
          <div className={`${styles.sealRule} ${styles.sealRuleLate}`} />
          <div className={`${styles.proofH} ${styles.findingsProofH}`}>
            <span>Findings</span>
            <span className={styles.proofHOf}>
              {p.findingsLabel} <strong>{p.findingsCount}</strong>
            </span>
          </div>
          <ul className={styles.findingsList}>
            {p.findings.map((f, i) => (
              <li key={i} className={styles.findingItem}>
                <span className={styles.findingLvl}>{f.level}</span>
                <span
                  className={styles.findingBody}
                  dangerouslySetInnerHTML={{ __html: f.body }}
                />
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.proofFoot}>
          <div className={styles.timing}>
            {p.timing.map((t) => (
              <span key={t.label}>
                {t.label} <span className={styles.timingVal}>{t.value}</span>
              </span>
            ))}
          </div>
          <div className={styles.signature}>
            <div className={styles.sigLine}>
              {p.signatureLabel} <span className={styles.sigHash}>{p.signatureHash}</span>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
