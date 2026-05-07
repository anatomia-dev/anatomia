"use client";

import { useTheme } from "@/lib/theme";

/**
 * Theme toggle button — sun/moon icon.
 * Client component: reads and writes data-theme attribute.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      className="relative flex h-[34px] w-[34px] items-center justify-center rounded-[var(--radius-sm)] transition-colors duration-150 cursor-pointer after:absolute after:inset-[-5px] after:content-['']"
      style={{ color: "var(--ink-60)" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--border-soft)";
        e.currentTarget.style.color = "var(--fg)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--ink-60)";
      }}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? (
        // Sun icon
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        // Moon icon
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
