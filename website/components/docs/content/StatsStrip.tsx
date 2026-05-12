interface Stat {
  value: string;
  label: string;
}

interface StatsStripProps {
  items: Stat[];
}

export function StatsStrip({ items }: StatsStripProps) {
  return (
    <div className="my-8 flex flex-wrap gap-8">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col items-center gap-1">
          <span
            className="font-mono text-[24px] font-semibold"
            style={{ color: "var(--fg-strong)" }}
          >
            {item.value}
          </span>
          <span
            className="text-[12px]"
            style={{ color: "var(--ink-45)" }}
          >
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
