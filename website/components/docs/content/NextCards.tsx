import Link from "next/link";

interface CardData {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
}

interface NextCardsProps {
  cards: CardData[];
}

export function NextCards({ cards }: NextCardsProps) {
  return (
    <div className="my-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {cards.map((card) => (
        <Link
          key={card.href}
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
            {card.eyebrow}
          </span>
          <span
            className="mb-1.5 block text-[15px] font-semibold"
            style={{ color: "var(--fg-strong)" }}
          >
            {card.title}
          </span>
          <span
            className="block text-[13.5px] leading-relaxed"
            style={{ color: "var(--ink-60)" }}
          >
            {card.description}
          </span>
        </Link>
      ))}
    </div>
  );
}
