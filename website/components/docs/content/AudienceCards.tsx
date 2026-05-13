import Link from "next/link";

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
    heading: "See a real proof",
    description:
      "Browse a verified proof chain entry — scope, contract, build report, and verification result.",
    cta: "Open a proof →",
    href: "/docs/proof",
  },
  {
    tag: "Installing",
    heading: "Get started in 8 minutes",
    description:
      "Install Anatomia, run your first scan, and complete a pipeline run end to end.",
    cta: "Quickstart →",
    href: "/docs/start",
  },
  {
    tag: "Operating",
    heading: "Understand the pipeline",
    description:
      "Learn how five agents scope, plan, build, verify, and learn from every change.",
    cta: "How it works →",
    href: "/docs/concepts/pipeline",
  },
];

export function AudienceCards() {
  return (
    <div className="my-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
      {CARDS.map((card) => (
        <Link
          key={card.tag}
          href={card.href}
          className="group rounded-[var(--radius-md)] p-5 transition-colors duration-150"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-soft)",
          }}
        >
          <span
            className="mb-1 block font-mono text-[11px] font-medium uppercase tracking-wider"
            style={{ color: "var(--ink-30)" }}
          >
            {card.tag}
          </span>
          <span
            className="mb-1.5 block text-[15px] font-semibold"
            style={{ color: "var(--fg-strong)" }}
          >
            {card.heading}
          </span>
          <span
            className="mb-3 block text-[13.5px] leading-relaxed"
            style={{ color: "var(--ink-60)" }}
          >
            {card.description}
          </span>
          <span
            className="font-mono text-[12px] font-medium"
            style={{ color: "var(--color-brand)" }}
          >
            {card.cta}
          </span>
        </Link>
      ))}
    </div>
  );
}
