import Link from "next/link";

/**
 * AudienceCards — matches supermock .aud-grid exactly.
 * 3-column grid. Each card: tag (mono uppercase), heading (serif),
 * description, CTA with brand arrow + border-top separator at bottom.
 */

interface AudienceCard {
  tag: string;
  heading: string;
  description: string;
  cta: string;
  href: string;
}

const CARDS: AudienceCard[] = [
  {
    tag: "Evaluating",
    heading: "I want to see if this is real",
    description:
      "Read one complete proof end to end \u2014 scope, contract, build report, verify findings, integrity seal. Five minutes; no install.",
    cta: "Open a real proof",
    href: "/docs/proof/security-hardening",
  },
  {
    tag: "Installing",
    heading: "I want to run this on my repo",
    description:
      "Scan in three seconds, no login. Init ships the pipeline into your repo for Claude Code or Codex.",
    cta: "Quickstart",
    href: "/docs/start",
  },
  {
    tag: "Operating",
    heading: "I have it running and want depth",
    description:
      "How sealed agents work, how to read a verify report, when to promote a finding, how to recover from a rejection cycle.",
    cta: "How it works",
    href: "/docs/concepts/pipeline",
  },
];

export function AudienceCards() {
  return (
    <div
      className="docs-aud-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "12px",
        margin: "8px 0 44px",
      }}
    >
      {CARDS.map((card) => (
        <Link
          key={card.tag}
          href={card.href}
          style={{
            padding: "18px 18px 16px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-card)",
            transition: "border-color 0.15s",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            textDecoration: "none",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--ink-45)",
            }}
          >
            {card.tag}
          </span>
          <h4
            style={{
              fontFamily: "var(--font-serif)",
              fontWeight: 500,
              fontSize: "17px",
              letterSpacing: "-0.01em",
              color: "var(--fg)",
              margin: 0,
            }}
          >
            {card.heading}
          </h4>
          <p
            style={{
              fontSize: "12.5px",
              color: "var(--ink-60)",
              lineHeight: 1.5,
              marginBottom: "4px",
              margin: 0,
            }}
          >
            {card.description}
          </p>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              color: "var(--ink-75)",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              paddingTop: "8px",
              borderTop: "1px solid var(--hairline)",
              marginTop: "auto",
            }}
          >
            <span style={{ color: "var(--color-brand)" }}>→</span> {card.cta}
          </span>
        </Link>
      ))}
    </div>
  );
}
