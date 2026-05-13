import Link from "next/link";
import { getBuildMeta } from "@/lib/docs-data/meta";
import { ThemeToggle } from "@/components/nav/ThemeToggle";
import { PlatformSwitcher } from "./PlatformSwitcher";

/**
 * DocsNav — docs-specific navbar, completely separate from marketing Nav.
 * Server component. Sticky, backdrop-blur. Matches supermock .navbar exactly.
 */
export function DocsNav() {
  const meta = getBuildMeta();

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        display: "grid",
        gridTemplateColumns: "auto auto 1fr auto",
        alignItems: "center",
        padding: "14px 24px",
        gap: "24px",
        background: "var(--nav-bg)",
        backdropFilter: "blur(14px) saturate(1.2)",
        WebkitBackdropFilter: "blur(14px) saturate(1.2)",
        borderBottom: "1px solid var(--hairline)",
      }}
      aria-label="Documentation"
    >
      {/* Column 1: Logo + version */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "14px", justifySelf: "start" }}>
        <Link
          href="/docs"
          style={{
            display: "flex",
            alignItems: "baseline",
            fontFamily: "var(--font-serif)",
            fontWeight: 500,
            fontSize: "24px",
            letterSpacing: "-0.02em",
            color: "var(--fg)",
            textDecoration: "none",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "baseline" }}>
            anaDocs
            <span
              style={{
                display: "inline-block",
                width: "0.32em",
                height: "0.39em",
                background: "var(--color-brand)",
                marginLeft: "0.22em",
                position: "relative",
                top: "0.03em",
              }}
            />
          </span>
        </Link>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--ink-45)",
            fontWeight: 400,
          }}
        >
          v{meta.version}
        </span>
      </div>

      {/* Column 2: Platform switcher */}
      <PlatformSwitcher />

      {/* Column 3: Search bar (centered in 1fr column) */}
      <div style={{ justifySelf: "center", gridColumn: 3 }}>
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: "9px",
            padding: "6px 11px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            width: "420px",
            maxWidth: "50vw",
            fontSize: "13px",
            color: "var(--ink-45)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
          aria-label="Search docs"
          disabled
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <span>Search docs, commands, proofs...</span>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              border: "1px solid var(--border)",
              padding: "1px 5px",
              borderRadius: "3px",
              color: "var(--ink-60)",
            }}
          >
            ⌘K
          </span>
        </button>
      </div>

      {/* Column 4: Theme toggle + GitHub + anatomia */}
      <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: "4px" }}>
        <ThemeToggle />
        <a
          href="https://github.com/TettoLabs/anatomia"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "6px 8px",
            color: "var(--ink-60)",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            alignItems: "center",
          }}
          aria-label="GitHub"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
        </a>
        <a
          href="https://anatomia.dev"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--ink-60)",
            padding: "4px 10px",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            alignItems: "center",
            gap: "3px",
            textDecoration: "none",
          }}
        >
          anatomia<span style={{ fontSize: "11px" }}>↗</span>
        </a>
      </div>
    </nav>
  );
}
