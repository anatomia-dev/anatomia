import { copy } from "@/lib/copy";
import { getProofFeed, formatAge } from "@/lib/proof-feed";
import { Formatted } from "@/components/ui/Formatted";
import { Container } from "@/components/ui/Container";
import { ProofFeedCard } from "./ProofFeedCard";
import { cn } from "@/lib/utils";
import styles from "./proof-feed.module.css";

/**
 * ProofFeed — ship log dock between main and footer.
 * Server component with async data fetch.
 * The ProofFeedCard (client) handles collapse/expand.
 */
export async function ProofFeed() {
  const entries = await getProofFeed();
  const latest = entries[0];
  const passedCount = entries.filter((e) => e.passed === e.assertions).length;

  const kindClass = (kind: string) => {
    if (kind === "milestone") return styles.kindMilestone;
    if (kind === "feature") return styles.kindFeature;
    if (kind === "fix") return styles.kindFix;
    return styles.kindChore;
  };

  const kindLabel = (kind: string) => {
    if (kind === "milestone") return "milestone";
    if (kind === "feature") return "feature";
    if (kind === "fix") return "fix";
    return "improve";
  };

  return (
    <section className={styles.section} id="proof-feed" data-component="proof-feed">
      <Container>
        <ProofFeedCard
          summaryContent={
            <>
              {/* Left: kicker + latest ticker */}
              <span className={styles.psLeft}>
                <span className={styles.psKicker}>
                  <span className={styles.psDot} />
                  <span className={styles.psKickerLabel}>{copy.proofFeed.kicker}</span>
                  <span style={{ color: "var(--ink-30)", fontWeight: 400 }}>·</span>
                  <span className={styles.kCollapsed}>{latest.version}</span>
                  <span className={styles.kOpen}>{entries.length} verified changes</span>
                </span>
                <span className={styles.psDivider} aria-hidden="true" />
                <span className={styles.psLatest} aria-label="Most recent ship">
                  <span className={styles.psLatestHash}>{latest.hash}</span>
                  <span className={styles.psLatestAgo}>{formatAge(latest.ts)}</span>
                </span>
              </span>

              {/* Right: ship dots + chevron */}
              <span className={styles.psMeta}>
                <span className={styles.shipDots} aria-hidden="true">
                  {entries.map((e, i) => (
                    <span
                      key={e.hash}
                      className={cn(
                        styles.sd,
                        e.passed !== e.assertions && styles.sdFailed,
                        i === 0 && styles.sdLatest,
                      )}
                      title={`${e.hash} — ${e.passed === e.assertions ? "✓" : "✗"} ${e.passed}/${e.assertions}`}
                    />
                  ))}
                </span>
                <span className={styles.dotsLabel}>
                  <span className={styles.dotsLabelN}>{passedCount}</span>/<span className={styles.dotsLabelN}>{entries.length}</span> verified
                </span>
                <span className={styles.psChev} aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </span>
            </>
          }
        >
          {/* Expanded body */}
          <div className={styles.feedHead}>
            <div style={{ maxWidth: "44ch" }}>
              <h3 className={styles.feedHeadTitle}>
                <Formatted text={copy.proofFeed.headTitle.replace("\n", " ")} />
              </h3>
              <p className={styles.feedHeadSub}>{copy.proofFeed.headSub}</p>
            </div>
            <div className="font-mono text-[11px]" style={{ color: "var(--ink-45)" }}>
              updated <span>{formatAge(latest.ts)}</span>
            </div>
          </div>

          <div className={styles.feed} role="list">
            {entries.map((e) => (
              <div
                key={e.hash}
                className={styles.proofRow}
                role="listitem"
              >
                <span className={styles.rowHash}>{e.hash}</span>
                <span className={cn(styles.rowKind, kindClass(e.kind))}>
                  {kindLabel(e.kind)}
                </span>
                <span className={styles.rowFeat}>
                  <Formatted text={e.feat} />
                </span>
                <span className={styles.rowMeta}>
                  <span className={styles.rowAssert}>
                    <span className={styles.rowAssertPass}>{e.passed}</span>/{e.assertions}
                  </span>
                  <span className={styles.rowAgo}>{formatAge(e.ts)}</span>
                </span>
              </div>
            ))}
          </div>

        </ProofFeedCard>
      </Container>
    </section>
  );
}
