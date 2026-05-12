interface MetaRowProps {
  readingTime?: number;
  lastReviewed?: string;
}

export function MetaRow({ readingTime, lastReviewed }: MetaRowProps) {
  const timeLabel = readingTime ? `${readingTime} min read` : "\u2014";
  const reviewLabel = lastReviewed ? `Last reviewed ${lastReviewed}` : "\u2014";

  return (
    <div
      className="mb-8 font-mono text-[12px]"
      style={{ color: "var(--ink-45)" }}
    >
      {timeLabel}
      <span className="mx-2">&middot;</span>
      {reviewLabel}
    </div>
  );
}
