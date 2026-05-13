import Link from "next/link";
import { getBuildMeta } from "@/lib/docs-data/meta";
import { ThemeToggle } from "@/components/nav/ThemeToggle";
import { PlatformSwitcher } from "./PlatformSwitcher";

/**
 * DocsNav — docs-specific navbar, completely separate from marketing Nav.
 * Server component. 58px height, sticky, backdrop-blur.
 */
export function DocsNav() {
  const meta = getBuildMeta();

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-[150] flex items-center justify-between px-5"
      style={{
        height: "58px",
        background: "var(--nav-bg)",
        backdropFilter: "blur(14px) saturate(1.2)",
        WebkitBackdropFilter: "blur(14px) saturate(1.2)",
        borderBottom: "1px solid var(--hairline)",
      }}
      aria-label="Documentation"
    >
      {/* Left: wordmark + version pill */}
      <div className="flex items-center gap-3">
        <Link
          href="/docs"
          className="flex items-baseline font-serif text-[20px] font-medium"
          style={{ color: "var(--fg)", letterSpacing: "-0.02em" }}
        >
          <span>anaDocs</span>
          <span
            className="ml-[0.18em] inline-block"
            style={{
              width: "0.28em",
              height: "0.34em",
              background: "var(--brand-mark)",
              position: "relative",
              top: "0.03em",
            }}
          />
        </Link>

        <span
          className="font-mono text-[11px]"
          style={{ color: "var(--ink-30)" }}
        >
          v{meta.version}
        </span>
      </div>

      {/* Center: platform switcher + search placeholder */}
      <div className="flex items-center gap-3">
        <PlatformSwitcher />
        <button
          className="hidden items-center gap-2 rounded-[var(--radius-sm)] px-3 py-1.5 font-mono text-[12px] sm:flex"
          style={{
            border: "1px solid var(--border-soft)",
            color: "var(--ink-45)",
          }}
          aria-label="Search docs"
          disabled
        >
          Search docs...
          <kbd className="ml-1 text-[10px]" style={{ color: "var(--ink-30)" }}>⌘K</kbd>
        </button>
      </div>

      {/* Right: theme toggle + GitHub + anatomia link */}
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <a
          href="https://github.com/TettoLabs/anatomia"
          target="_blank"
          rel="noopener noreferrer"
          className="relative flex h-[34px] w-[34px] items-center justify-center rounded-[var(--radius-sm)] transition-colors duration-150"
          style={{ color: "var(--ink-60)" }}
          aria-label="GitHub"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57v-2c-3.34.72-4.04-1.42-4.04-1.42-.55-1.4-1.34-1.78-1.34-1.78-1.1-.75.08-.73.08-.73 1.2.08 1.84 1.23 1.84 1.23 1.07 1.84 2.82 1.3 3.5 1 .1-.78.42-1.3.77-1.6-2.67-.3-5.48-1.33-5.48-5.92 0-1.3.47-2.38 1.23-3.22-.12-.3-.53-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.76.84 1.23 1.92 1.23 3.22 0 4.6-2.81 5.61-5.49 5.91.43.37.81 1.1.81 2.22v3.29c0 .31.23.69.84.57A12 12 0 0 0 12 .3" />
          </svg>
        </a>
        <Link
          href="/"
          className="hidden text-[12.5px] font-medium sm:inline"
          style={{ color: "var(--ink-45)" }}
        >
          anatomia
        </Link>
      </div>
    </nav>
  );
}
