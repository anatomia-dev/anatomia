"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { copy } from "@/lib/copy";
import { ThemeToggle } from "./ThemeToggle";

/**
 * NavMobile — hamburger button + full-screen overlay for mobile.
 * Only renders the toggle button on small screens; overlay appears on open.
 */
export function NavMobile() {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((p) => !p), []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      {/* Hamburger button — visible only on mobile */}
      <button
        className="relative flex h-[34px] w-[34px] items-center justify-center rounded-[var(--radius-sm)] md:hidden after:absolute after:inset-[-5px] after:content-['']"
        style={{ color: "var(--ink-60)" }}
        onClick={toggle}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        {open ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        )}
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[200] flex flex-col md:hidden"
          style={{ background: "var(--bg)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3.5">
            <Link
              href="/"
              onClick={close}
              className="flex items-center gap-2 font-mono text-sm font-semibold"
              style={{ color: "var(--fg)" }}
            >
              <span style={{ color: "var(--color-brand)" }}>[</span>
              <span>{copy.nav.brand}</span>
              <span style={{ color: "var(--color-brand)" }}>]</span>
            </Link>
            <div className="flex items-center gap-2.5">
              <ThemeToggle />
              <button
                onClick={close}
                className="relative flex h-[34px] w-[34px] items-center justify-center rounded-[var(--radius-sm)] after:absolute after:inset-[-5px] after:content-['']"
                style={{ color: "var(--ink-60)" }}
                aria-label="Close menu"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Links */}
          <nav className="flex flex-1 flex-col items-center justify-center gap-8">
            {copy.nav.links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={close}
                className="text-2xl font-semibold"
                style={{ color: "var(--fg-strong)" }}
              >
                {l.label}
              </Link>
            ))}
            <a
              href={copy.nav.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
              className="text-lg"
              style={{ color: "var(--ink-60)" }}
            >
              GitHub
            </a>
          </nav>

          {/* Bottom CTA */}
          <div className="px-6 pb-8">
            <Link
              href="/#pricing"
              onClick={close}
              className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] py-3.5 font-mono text-sm font-semibold"
              style={{ background: "var(--fg-strong)", color: "var(--bg)" }}
            >
              {copy.nav.ctaInstall}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
