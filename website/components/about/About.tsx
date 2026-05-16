import { Container } from "@/components/ui/Container";
import styles from "./about.module.css";

/**
 * Genesis date — March 19, 2026. First consistent commit.
 */
const GENESIS = new Date("2026-03-19T00:00:00Z");

/**
 * AI credit cost tracking.
 * Base: actual invoices through May 9, 2026.
 * Auto-increments $200 on the 9th of each subsequent month (Max subscription).
 */
const CREDIT_BASE = 1085.13;
const CREDIT_BASE_DATE = new Date("2026-05-09T00:00:00Z");
const MONTHLY_RATE = 200;
const OVERAGE_ADDITIONS: { date: string; amount: number }[] = [];

function computeCredits(): number {
  const now = new Date();
  let total = CREDIT_BASE;
  let cursor = new Date(CREDIT_BASE_DATE);
  while (true) {
    const next = new Date(cursor);
    next.setMonth(next.getMonth() + 1);
    if (next > now) break;
    total += MONTHLY_RATE;
    cursor = next;
  }
  for (const o of OVERAGE_ADDITIONS) {
    if (new Date(o.date) <= now) total += o.amount;
  }
  return Math.round(total);
}

function daysSinceGenesis(): number {
  return Math.floor((Date.now() - GENESIS.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * About page — genesis stats, thesis, founder.
 * Server component. Stats computed at build/ISR time.
 */
export function About() {
  const days = daysSinceGenesis();
  const credits = computeCredits();

  return (
    <article className={styles.page}>
      {/* ── Section 1: Genesis Stats ── */}
      <Container>
        <section className={styles.genesis}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowLine} />
            Project genesis
          </div>

          <h1 className={styles.headline}>
            Built with <em>Ana</em>.
          </h1>
          <p className={styles.genesisIntro}>
            Every feature in this product was scoped, planned, built, and
            verified through the same pipeline it installs for you.
            One developer. One AI subscription. Here are the numbers.
          </p>

          <div className={styles.statsGrid}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{days}</span>
              <span className={styles.statLabel}>days since genesis</span>
              <span className={styles.statMeta}>March 19, 2026</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>113</span>
              <span className={styles.statLabel}>verified pipeline runs</span>
              <span className={styles.statMeta}>every one produces a proof</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>2,400+</span>
              <span className={styles.statLabel}>tests</span>
              <span className={styles.statMeta}>3 OS × 2 Node versions</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>114</span>
              <span className={styles.statLabel}>completed scopes</span>
              <span className={styles.statMeta}>think → plan → build → verify</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>${credits.toLocaleString()}</span>
              <span className={styles.statLabel}>total AI credits</span>
              <span className={styles.statMeta}>Claude Code Max · $200/mo</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>1</span>
              <span className={styles.statLabel}>developer</span>
              <span className={styles.statMeta}>the system is the team</span>
            </div>
          </div>
        </section>
      </Container>

      {/* ── Divider ── */}
      <Container>
        <div className={styles.dividerLine} />
      </Container>

      {/* ── Section 2: The Thesis ── */}
      <Container>
        <section className={styles.centered}>
          <div className={styles.sectionLabel}>Why we built this</div>
          <p className={styles.thesisText}>
            AI writes more code every month, and almost none of it arrives
            with evidence. A diff, a confident summary, no proof. We thought
            that was a solvable problem.
          </p>
          <p className={styles.bodyText}>
            Anatomia is a CLI that scans your codebase, generates validated
            context, and runs every change through a four-agent pipeline.
            It works with{" "}
            <a href="https://claude.ai/code" target="_blank" rel="noopener noreferrer" className={styles.link}>
              Claude Code
            </a>
            . It's open source, MIT-licensed, and runs entirely on your
            machine. The{" "}
            <code className={styles.inlineCode}>.ana/</code>{" "}
            directory in the{" "}
            <a
              href="https://github.com/anatomia-dev/anatomia"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              repository
            </a>{" "}
            is the receipt.
          </p>
        </section>
      </Container>

      {/* ── Divider ── */}
      <Container>
        <div className={styles.dividerLine} />
      </Container>

      {/* ── Section 3: The Founder ── */}
      <Container>
        <section className={styles.centered}>
          <div className={styles.sectionLabel}>The founder</div>
          <h2 className={styles.founderName}>Ryan Smith</h2>
          <p className={styles.founderRole}>Denver, CO</p>
          <p className={styles.bodyText}>
            Eight years at Charles Schwab, architecting ML systems that
            served 30 million clients. Computer science and economics at
            CU Boulder. The kind of background where you learn that
            production systems need proof, not promises.
          </p>
          <p className={styles.bodyText}>
            Anatomia started because every AI coding tool I used was
            fast and wrong in ways I couldn't catch until later. I wanted
            to ship AI-written code I could stand behind — so I built the
            verification layer, and then I built it <em>with</em> the
            verification layer.
          </p>
        </section>
      </Container>
    </article>
  );
}
