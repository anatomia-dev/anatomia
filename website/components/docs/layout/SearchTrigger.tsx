"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { SearchOverlay } from "./SearchOverlay";

/**
 * SearchTrigger — client component wrapping the search button.
 * Renders the button + SearchOverlay. Used inside DocsNav (server component)
 * to isolate the client boundary.
 *
 * Pattern: same as MobileSidebarToggle — a client wrapper inside a server component.
 */
export function SearchTrigger() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <button
        className="docs-nav-search"
        onClick={() => setOpen(true)}
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
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <span className="docs-nav-search-text">
          Search docs, commands, proofs...
        </span>
        <span
          className="docs-nav-search-kbd"
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
      {open && createPortal(
        <SearchOverlay open={open} onClose={close} />,
        document.body,
      )}
    </>
  );
}
