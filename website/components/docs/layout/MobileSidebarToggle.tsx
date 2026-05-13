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
 * Pattern matches NavMobile from the marketing site.
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

      {open && typeof document !== "undefined" && createPortal(
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            display: "flex",
            flexDirection: "column",
            background: "var(--bg)",
            overflow: "hidden",
          }}
        >
          {/* Header — X on left, logo center, theme toggle on right */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 20px",
              borderBottom: "1px solid var(--hairline)",
              flexShrink: 0,
              gap: "12px",
            }}
          >
            {/* X close — far left */}
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
                flexShrink: 0,
              }}
              aria-label="Close menu"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            {/* Logo */}
            <Link
              href="/docs"
              onClick={close}
              style={{
                fontFamily: "var(--font-serif)",
                fontWeight: 500,
                fontSize: "22px",
                letterSpacing: "-0.02em",
                color: "var(--fg)",
                textDecoration: "none",
                display: "flex",
                alignItems: "baseline",
                flex: 1,
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

            {/* Right: theme toggle */}
            <ThemeToggle />
          </div>

          {/* Navigation — vertical scroll */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              padding: "16px 24px 24px",
            }}
          >
            {tree.children.map((node, i) => (
              <MobileNavNode key={i} node={node} pathname={pathname} close={close} depth={0} />
            ))}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid var(--hairline)",
              display: "flex",
              alignItems: "center",
              gap: "16px",
              flexShrink: 0,
            }}
          >
            <a
              href="https://github.com/TettoLabs/anatomia"
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
              style={{
                color: "var(--ink-60)",
                fontSize: "13px",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
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

/**
 * Mobile nav node — renders vertically, collapsible folders.
 * Get Started pages are always visible (separator + pages).
 * Folders default COLLAPSED on mobile except when a child is active.
 */
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
  // Check if any child in this folder is active
  const hasActiveChild = node.type === "folder"
    ? node.children.some((c) =>
        c.type === "page" ? pathname === c.url :
        c.type === "folder" ? c.children.some((gc) => gc.type === "page" && pathname === gc.url) :
        false
      )
    : false;

  const [open, setOpen] = useState(hasActiveChild);

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
          marginTop: "20px",
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
          padding: "10px 12px",
          borderRadius: "var(--radius-sm)",
          fontSize: "16px",
          color: active ? "var(--fg)" : "var(--ink-60)",
          background: active ? "var(--brand-soft)" : "transparent",
          fontWeight: active ? 500 : 400,
          textDecoration: "none",
          marginLeft: depth > 0 ? "8px" : "0",
        }}
      >
        {node.name}
      </Link>
    );
  }

  if (node.type === "folder") {
    const isTopLevel = depth === 0;
    return (
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            width: "100%",
            padding: isTopLevel ? "4px 0 8px" : "10px 12px",
            marginTop: isTopLevel ? "20px" : "0",
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: isTopLevel ? "11px" : "16px",
            fontWeight: isTopLevel ? 600 : 400,
            textTransform: isTopLevel ? "uppercase" : "none",
            letterSpacing: isTopLevel ? "0.06em" : "normal",
            color: isTopLevel ? "var(--ink-45)" : "var(--ink-60)",
            fontFamily: "inherit",
            textAlign: "left",
          }}
          aria-expanded={open}
        >
          <svg
            width="10"
            height="10"
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
          <div style={{ marginLeft: isTopLevel ? "0" : "8px" }}>
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
