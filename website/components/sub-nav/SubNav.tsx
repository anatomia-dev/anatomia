import Link from "next/link";
import { copy } from "@/lib/copy";
import { ThemeToggle } from "@/components/nav/ThemeToggle";

const subLinks = [
  { label: "Docs", href: "/docs" },
  { label: "Manifesto", href: "/manifesto" },
  { label: "Contact", href: "/contact" },
];

/**
 * Reduced navigation for sub-pages (/docs, /manifesto, /contact).
 * Same visual shell as main Nav but with real route links instead of hash anchors.
 */
export function SubNav({ current }: { current: string }) {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-[150] flex items-center justify-between px-6 py-3.5 lg:px-8 lg:py-4"
      style={{
        background: "var(--nav-bg)",
        backdropFilter: "blur(14px) saturate(1.2)",
        WebkitBackdropFilter: "blur(14px) saturate(1.2)",
        borderBottom: "1px solid var(--hairline)",
      }}
      aria-label="Sub-page navigation"
    >
      <div className="flex items-center gap-3.5">
        <Link
          href="/"
          className="flex items-center gap-2 font-mono text-sm font-semibold"
          style={{ color: "var(--fg)" }}
          aria-label={copy.nav.brand}
        >
          <span style={{ color: "var(--color-brand)" }}>[</span>
          <span>{copy.nav.brand}</span>
          <span style={{ color: "var(--color-brand)" }}>]</span>
        </Link>
      </div>

      <div className="flex items-center gap-7">
        {subLinks.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="text-[13.5px] font-medium transition-colors duration-150"
            style={{
              color: l.label.toLowerCase() === current ? "var(--fg-strong)" : "var(--ink-60)",
            }}
          >
            {l.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-2.5">
        <ThemeToggle />
        <a
          href={copy.nav.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] transition-colors duration-150"
          style={{ color: "var(--ink-60)" }}
          aria-label="GitHub"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57v-2c-3.34.72-4.04-1.42-4.04-1.42-.55-1.4-1.34-1.78-1.34-1.78-1.1-.75.08-.73.08-.73 1.2.08 1.84 1.23 1.84 1.23 1.07 1.84 2.82 1.3 3.5 1 .1-.78.42-1.3.77-1.6-2.67-.3-5.48-1.33-5.48-5.92 0-1.3.47-2.38 1.23-3.22-.12-.3-.53-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.76.84 1.23 1.92 1.23 3.22 0 4.6-2.81 5.61-5.49 5.91.43.37.81 1.1.81 2.22v3.29c0 .31.23.69.84.57A12 12 0 0 0 12 .3" />
          </svg>
        </a>
      </div>
    </nav>
  );
}
