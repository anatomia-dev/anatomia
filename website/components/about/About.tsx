import { Container } from "@/components/ui/Container";
import styles from "./about.module.css";

const GENESIS = new Date("2026-03-19T00:00:00Z");
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

export function About() {
  const days = daysSinceGenesis();
  const credits = computeCredits();

  return (
    <article className={styles.page}>
      <Container>
        <div className={styles.content}>

          <div className={styles.eyebrow}>
            <span className={styles.eyebrowLine} />
            About
          </div>

          <h1 className={styles.headline}>
            Building faster doesn't mean<br />
            you know what you <em>built</em>.
          </h1>

          <div className={styles.narrative}>
            <p className={styles.lede}>
              AI makes building easy. Knowing is the hard part.
            </p>

            <p className={styles.body}>
              Anatomia started with a frustration. Every AI coding tool we
              used was fast, fluent, and wrong in ways we couldn't catch until
              later. They all said yes. They all sounded confident. None of
              them showed their work.
            </p>

            <p className={styles.body}>
              The best features are sometimes the ones that don't get built.
              The best solutions expose a deeper problem worth solving first.
              A senior engineer knows this — they push back before the first
              line is written. They don't build what you said. They build what
              you meant.
            </p>

            <p className={styles.body}>
              So we built a system that does that. It scans your codebase,
              builds validated context, and runs every change through a
              pipeline that thinks before it builds, plans before it codes,
              and verifies independently before it ships.
            </p>

            <p className={styles.accent}>
              How do you know you built the right thing? How do you know you
              built it the right way? How do you know there isn't risk you
              can't see?
            </p>

            <p className={styles.body}>
              You ship with proof. A sealed contract before code is written.
              An independent verification after. A proof chain that compounds
              what the system learns into rules that shape the next build. Not
              opinion. Not a confident summary. Mechanical evidence that
              travels with the code.
            </p>
          </div>

          {/* ── Genesis ── */}
          <div className={styles.genesis}>
            <div className={styles.genesisLine} />
            <p className={styles.genesisIntro}>
              One developer. One AI subscription. Every feature verified
              through the same pipeline this tool installs for you.
            </p>

            <div className={styles.statsRow}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{days}</span>
                <span className={styles.statLabel}>days</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>113</span>
                <span className={styles.statLabel}>verified runs</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>2,400+</span>
                <span className={styles.statLabel}>tests</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>${credits.toLocaleString()}</span>
                <span className={styles.statLabel}>AI credits</span>
              </div>
            </div>

            <p className={styles.genesisCoda}>
              Open source. MIT-licensed. Works with{" "}
              <a href="https://claude.ai/code" target="_blank" rel="noopener noreferrer" className={styles.link}>
                Claude Code
              </a>
              . The{" "}
              <a href="https://github.com/anatomia-dev/anatomia" target="_blank" rel="noopener noreferrer" className={styles.link}>
                .ana/ directory
              </a>{" "}
              is the receipt.
            </p>
          </div>

          {/* ── Founder ── */}
          <div className={styles.founder}>
            <span className={styles.founderName}>Ryan Patrick Smith</span>
            <span className={styles.founderSep}>·</span>
            <span className={styles.founderMeta}>Denver, CO</span>
            <span className={styles.founderSep}>·</span>
            <span className={styles.founderMeta}>Schwab ML → solo founder</span>
            <span className={styles.founderSep}>·</span>
            <a
              href="https://www.linkedin.com/in/rsmith-ai/"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.founderLink}
            >
              LinkedIn
            </a>
          </div>

        </div>
      </Container>
    </article>
  );
}
