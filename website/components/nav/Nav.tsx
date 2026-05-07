import Link from "next/link";
import { copy } from "@/lib/copy";
import { getProofFeed, formatAge } from "@/lib/proof-feed";
import { ThemeToggle } from "./ThemeToggle";
import { NavMobile } from "./NavMobile";
import { NavScrollWrapper } from "./NavScrollWrapper";

/**
 * Fixed header with backdrop blur.
 * Wordmark · version pill · nav links · theme toggle · GitHub · CTA.
 * Server component — only ThemeToggle and NavScrollWrapper are client.
 *
 * Version pill reads from getProofFeed() so wiring to real data
 * is a one-function change in lib/proof-feed.ts.
 */
export async function Nav() {
  const entries = await getProofFeed();
  const latest = entries[0];

  return (
    <NavScrollWrapper>
      <nav
        className="fixed top-0 left-0 right-0 z-[150] flex items-center justify-between px-6 py-3.5 lg:px-8 lg:py-4"
        style={{
          background: "var(--nav-bg)",
          backdropFilter: "blur(14px) saturate(1.2)",
          WebkitBackdropFilter: "blur(14px) saturate(1.2)",
          borderBottom: "1px solid var(--hairline)",
        }}
        aria-label="Primary"
      >
        {/* Left: wordmark + version pill */}
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

          {latest && (
            <span
              className="hidden items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-[11px] min-[900px]:inline-flex"
              style={{
                color: "var(--ink-60)",
                background: "var(--bg-elev)",
                border: "1px solid var(--border-soft)",
              }}
              aria-label="Latest release"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: "var(--color-brand)",
                  boxShadow: "0 0 0 3px color-mix(in oklch, var(--color-brand) 25%, transparent)",
                }}
              />
              <span>{latest.version}</span>
              <span> · </span>
              <span>{formatAge(latest.ts)}</span>
            </span>
          )}
        </div>

        {/* Center: nav links */}
        <div className="hidden items-center gap-7 md:flex">
          {copy.nav.links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-[13.5px] font-medium transition-colors duration-150"
              style={{ color: "var(--ink-60)" }}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Right: theme toggle + GitHub + CTA + mobile menu */}
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <NavMobile />

          <a
            href={copy.nav.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="relative flex h-[34px] w-[34px] items-center justify-center rounded-[var(--radius-sm)] transition-colors duration-150 after:absolute after:inset-[-5px] after:content-['']"
            style={{ color: "var(--ink-60)" }}
            aria-label="GitHub"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57v-2c-3.34.72-4.04-1.42-4.04-1.42-.55-1.4-1.34-1.78-1.34-1.78-1.1-.75.08-.73.08-.73 1.2.08 1.84 1.23 1.84 1.23 1.07 1.84 2.82 1.3 3.5 1 .1-.78.42-1.3.77-1.6-2.67-.3-5.48-1.33-5.48-5.92 0-1.3.47-2.38 1.23-3.22-.12-.3-.53-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.76.84 1.23 1.92 1.23 3.22 0 4.6-2.81 5.61-5.49 5.91.43.37.81 1.1.81 2.22v3.29c0 .31.23.69.84.57A12 12 0 0 0 12 .3" />
            </svg>
          </a>

          <Link
            href="/#pricing"
            className="nav-cta hidden items-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] px-[16px] py-[9px] font-mono text-[12.5px] font-semibold transition-all duration-150 hover:-translate-y-px sm:inline-flex"
            style={{
              color: "var(--color-brand-ink)",
              background: "var(--fg-strong)",
            }}
          >
            {copy.nav.ctaInstall}
            <svg className="h-3 w-3" style={{ color: "var(--color-brand)" }} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 6h6M6 3l3 3-3 3" />
            </svg>
          </Link>
        </div>
      </nav>
    </NavScrollWrapper>
  );
}
