import { Container } from "@/components/ui/Container";
import styles from "./about.module.css";

const GENESIS = new Date("2026-03-19T00:00:00Z");
const CREDIT_BASE = 1085.13;
const CREDIT_BASE_DATE = new Date("2026-05-09T00:00:00Z");
const MONTHLY_RATE = 200;
const DAILY_RATE = MONTHLY_RATE / 30;
const OVERAGE_ADDITIONS: { date: string; amount: number }[] = [];

function computeCredits(): number {
  const now = new Date();
  let total = CREDIT_BASE;

  // Count full months since base date
  let cursor = new Date(CREDIT_BASE_DATE);
  let lastBillingDate = new Date(CREDIT_BASE_DATE);
  while (true) {
    const next = new Date(cursor);
    next.setMonth(next.getMonth() + 1);
    if (next > now) break;
    total += MONTHLY_RATE;
    lastBillingDate = next;
    cursor = next;
  }

  // Add partial month: daily interpolation since last billing date
  const daysSinceLastBilling = Math.floor(
    (now.getTime() - lastBillingDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  total += daysSinceLastBilling * DAILY_RATE;

  // Add manual overages
  for (const o of OVERAGE_ADDITIONS) {
    if (new Date(o.date) <= now) total += o.amount;
  }

  return Math.round(total);
}

function daysSinceGenesis(): number {
  return Math.floor((Date.now() - GENESIS.getTime()) / (1000 * 60 * 60 * 24));
}

const PRINCIPLES = [
  {
    name: "The elegant solution is the one that removes.",
    body: "Adding code to manage a problem is engineering. Removing the code that causes the problem is design. The best diff is mostly red.",
  },
  {
    name: "Verified over trusted.",
    body: "When software can verify something mechanically, don\u2019t rely on intention to get it right. Trust is earned through proof, not good behavior.",
  },
  {
    name: "When building costs zero, taste is the differentiator.",
    body: "Everyone can build anything. The person who knows what to build wins. Correctness is table stakes. Craft is the product.",
  },
];

export async function About() {
  const days = daysSinceGenesis();
  const credits = computeCredits();

  // Proof count — same data source and fetch pattern as the ship log (proof-feed.ts)
  let proofCount = 124;
  try {
    const res = await fetch(
      "https://raw.githubusercontent.com/anatomia-dev/anatomia/main/.ana/proof_chain.json",
      { next: { revalidate: 60 }, headers: { "User-Agent": "anatomia-web" } },
    );
    if (res.ok) {
      const data = await res.json();
      if (data.entries) proofCount = data.entries.length;
    }
  } catch {
    // Silent fallback
  }

  return (
    <article className={styles.page}>
      <Container>
        <div className={styles.content}>

          <div className={styles.eyebrow}>
            <span className={styles.eyebrowLine} />
            About
          </div>

          <h1 className={styles.headline}>
            AI made building easy. Understanding what you <em>built</em> is the hard part.
          </h1>

          {/* ── Narrative ── */}
          <div className={styles.narrative}>
            <p className={styles.body}>
              The code ships fast. It looks right. The tests pass. Three months
              later nobody can explain why it&apos;s structured the way it is —
              because the reasoning that produced it didn&apos;t survive the
              conversation that generated it.
            </p>

            <p className={styles.body}>
              The AI doesn&apos;t remember your last review. It doesn&apos;t
              learn from your feedback. It builds from whatever context it has
              right now, and that context disappears the moment the session ends.
              What&apos;s left is the artifact. Not the thinking behind it.
            </p>

            <p className={styles.body}>
              Every engineering team knows the fix: scope before you build,
              define what correct means before anyone writes code, have someone
              else check who wasn&apos;t the one building, record what you
              learned and let it shape what comes next.
            </p>

            <p className={styles.accent}>
              AI made it easy to skip all of it.
            </p>

            <p className={styles.body}>
              Anatomia makes it mechanical. It reads your codebase, builds
              verified context specific to your project, and structures how your
              team works with AI so that good engineering happens whether
              you&apos;re disciplined enough to enforce it yourself or not.
            </p>

            <p className={styles.body}>
              Good methodology shouldn&apos;t depend on good intentions.
            </p>

            <p className={styles.body}>
              What comes out naturally — not as extra work, but as a byproduct
              of the process — is a structured record of every decision. What
              problem was being solved. What was asserted. What was found. What
              shipped. When someone new joins the team, the record is the
              context. When someone leaves, the knowledge doesn&apos;t leave
              with them.
            </p>
          </div>

          {/* ── Principles ── */}
          <div className={styles.principles}>
            <h2 className={styles.sectionHead}>What drives this</h2>
            {PRINCIPLES.map((p) => (
              <div key={p.name} className={styles.principle}>
                <p className={styles.principleName}>{p.name}</p>
                <p className={styles.principleBody}>{p.body}</p>
              </div>
            ))}
          </div>

          {/* ── Genesis ── */}
          <div className={styles.genesis}>
            <h2 className={styles.sectionHead}>Genesis</h2>

            <div className={styles.statsRow}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{proofCount}</span>
                <span className={styles.statLabel}>verified runs</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>2,400+</span>
                <span className={styles.statLabel}>tests</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{days}</span>
                <span className={styles.statLabel}>days</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>${credits.toLocaleString()}</span>
                <span className={styles.statLabel}>AI credits</span>
              </div>
            </div>

            <p className={styles.genesisCoda}>
              Every feature shipped through the same pipeline you install with{" "}
              <code className={styles.inlineCode}>ana init</code>. Every run
              is auditable in the{" "}
              <a
                href="https://github.com/anatomia-dev/anatomia"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                repo
              </a>
              . Open source. MIT licensed.
            </p>

            <p className={styles.genesisVision}>
              We&apos;re building toward a future where AI-written code is more
              trustworthy than human-written code — because it ships with
              mechanical proof that human code never had.
            </p>
          </div>

          {/* ── Founder ── */}
          <div className={styles.founder}>
            <div className={styles.founderHeader}>
              <span className={styles.founderName}>Ryan Patrick Smith</span>
              <span className={styles.founderRole}>Founder</span>
            </div>
            <p className={styles.founderMeta}>
              Denver, CO · 8 years building ML systems at enterprise scale (30M+ clients) · CU Boulder CS + Economics
            </p>
            <p className={styles.founderStory}>
              Built five projects with AI coding tools. Couldn&apos;t fully
              trust any of them. Anatomia is the verification layer all of them
              needed.
            </p>
            <a
              href="mailto:ryan@anatomia.dev"
              className={styles.founderLink}
            >
              ryan@anatomia.dev
            </a>
          </div>

        </div>
      </Container>
    </article>
  );
}
