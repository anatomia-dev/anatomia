interface IntegritySealProps {
  hashes: Record<string, string>;
  slug: string;
  className?: string;
}

export function IntegritySeal({ hashes, slug, className }: IntegritySealProps) {
  return (
    <div className={className} style={{
      border: "1px solid var(--border)",
      borderRadius: "var(--r-md)",
      padding: "14px 18px",
      background: "var(--bg-card)",
      fontFamily: "var(--font-mono)",
      fontSize: "11.5px",
      marginTop: "14px",
    }}>
      {Object.entries(hashes).map(([key, value], i, arr) => (
        <div key={key} style={{
          display: "grid",
          gridTemplateColumns: "140px 1fr",
          gap: "14px",
          padding: "6px 0",
          borderBottom: i < arr.length - 1 ? "1px solid var(--hairline)" : undefined,
        }}>
          <span style={{ color: "var(--ink-60)" }}>{key}</span>
          <span style={{ color: "var(--ink)", overflowX: "auto", whiteSpace: "nowrap" }}>
            {value.substring(0, 20)}...
          </span>
        </div>
      ))}
      <div style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        gap: "14px",
        padding: "6px 0",
      }}>
        <span style={{ color: "var(--ink-60)" }}>audit cmd</span>
        <span style={{ color: "var(--ink)", overflowX: "auto", whiteSpace: "nowrap" }}>
          $ ana proof audit {slug} &nbsp;{" "}
          <span style={{ color: "var(--ink-40)" }}>→ all hashes match</span>
        </span>
      </div>
    </div>
  );
}
