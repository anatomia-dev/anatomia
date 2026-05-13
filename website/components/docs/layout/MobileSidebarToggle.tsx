"use client";

import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { source } from "@/lib/source";
import { ThemeToggle } from "@/components/nav/ThemeToggle";

type TreeNode = (typeof source.pageTree)["children"][number];

/**
 * MobileSidebarToggle — hamburger + full-viewport overlay for docs mobile.
 * Pattern matches NavMobile: createPortal to body, fixed inset-0, full bg.
 * Only visible at ≤880px via CSS.
 */
export function MobileSidebarToggle() {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((p) => !p), []);
  const close = useCallback(() => setOpen(false), []);
  const pathname = usePathname();
  const tree = source.pageTree;

  return (
    <>
      {/* Hamburger button — shown at ≤880px by CSS */}
      <button
        className="docs-mobile-hamburger"
        onClick={toggle}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        style={{
          display: "none",
          alignItems: "center",
          justifyContent: "center",
          width: "34px",
          height: "34px",
          borderRadius: "var(--radius-sm)",
          border: "none",
          background: "none",
          color: "var(--ink-60)",
          cursor: "pointer",
          padding: 0,
        }}
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

      {/* Full-viewport overlay — portaled to body */}
      {open && typeof document !== "undefined" && createPortal(
        <div
          className="docs-mobile-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            display: "flex",
            flexDirection: "column",
            background: "var(--bg)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 24px",
              borderBottom: "1px solid var(--hairline)",
            }}
          >
            <Link
              href="/docs"
              onClick={close}
              style={{
                fontFamily: "var(--font-serif)",
                fontWeight: 500,
                fontSize: "24px",
                letterSpacing: "-0.02em",
                color: "var(--fg)",
                textDecoration: "none",
                display: "flex",
                alignItems: "baseline",
              }}
            >
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
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <ThemeToggle />
              <button
                onClick={close}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "34px",
                  height: "34px",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  background: "none",
                  color: "var(--ink-60)",
                  cursor: "pointer",
                }}
                aria-label="Close menu"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Sidebar navigation */}
          <nav
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "22px 24px 30px",
            }}
            aria-label="Documentation"
          >
            {tree.children.map((node, i) => (
              <MobileNavNode key={i} node={node} pathname={pathname} close={close} depth={0} />
            ))}
          </nav>

          {/* Bottom links */}
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid var(--hairline)",
              display: "flex",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <a
              href="https://github.com/TettoLabs/anatomia"
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
              style={{ color: "var(--ink-60)", fontSize: "13px", textDecoration: "none" }}
            >
              GitHub
            </a>
            <a
              href="https://anatomia.dev"
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
              style={{ color: "var(--ink-60)", fontSize: "13px", textDecoration: "none" }}
            >
              anatomia.dev ↗
            </a>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function MobileNavNode({
  node,
  pathname,
  close,
  depth,
}: {
  node: TreeNode;
  pathname: string;
  close: () => void;
  depth: number;
}) {
  const [open, setOpen] = useState(true);

  if (node.type === "separator") {
    return (
      <div
        style={{
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--ink-45)",
          padding: "4px 0 8px",
          marginTop: depth === 0 ? "18px" : "8px",
        }}
      >
        {node.name}
      </div>
    );
  }

  if (node.type === "page") {
    const active = pathname === node.url;
    return (
      <Link
        href={node.url}
        onClick={close}
        style={{
          display: "block",
          padding: "8px 12px",
          borderRadius: "var(--radius-sm)",
          fontSize: "15px",
          color: active ? "var(--fg)" : "var(--ink-60)",
          background: active ? "var(--brand-soft)" : "transparent",
          fontWeight: active ? 500 : 400,
          textDecoration: "none",
          marginLeft: depth > 0 ? "12px" : "0",
        }}
      >
        {node.name}
      </Link>
    );
  }

  if (node.type === "folder") {
    return (
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            width: "100%",
            padding: depth === 0 ? "4px 0 8px" : "8px 12px",
            marginTop: depth === 0 ? "18px" : "0",
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: depth === 0 ? "11px" : "15px",
            fontWeight: depth === 0 ? 600 : 400,
            textTransform: depth === 0 ? "uppercase" : "none",
            letterSpacing: depth === 0 ? "0.06em" : "normal",
            color: depth === 0 ? "var(--ink-45)" : "var(--ink-60)",
            fontFamily: "inherit",
            textAlign: "left",
          }}
          aria-expanded={open}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{
              transition: "transform 0.15s",
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              flexShrink: 0,
            }}
          >
            <path d="M3 2L7 5L3 8" />
          </svg>
          <span>{node.name}</span>
        </button>
        {open && (
          <div style={{ marginLeft: depth === 0 ? "0" : "12px" }}>
            {node.children.map((child, i) => (
              <MobileNavNode key={i} node={child} pathname={pathname} close={close} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}
