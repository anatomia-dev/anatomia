"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { source } from "@/lib/source";

type TreeNode = (typeof source.pageTree)["children"][number];

/**
 * Sidebar — renders the Fumadocs page tree.
 * All 5 groups are folders (Get Started, Concepts, Guides, Reference, Proof Chain).
 * Top-level folders styled as group labels with chevron toggles.
 * Nested folders (Featured Proofs) styled as lighter sub-toggles.
 */
export function Sidebar() {
  const pathname = usePathname();
  const tree = source.pageTree;

  return (
    <aside
      className="docs-sidebar"
      style={{
        position: "sticky",
        top: "58px",
        height: "calc(100vh - 58px)",
        width: "248px",
        flexShrink: 0,
        overflowY: "auto",
        borderRight: "1px solid var(--hairline)",
        padding: "22px 14px 30px",
      }}
    >
      <nav aria-label="Sidebar">
        {tree.children.map((node, i) => (
          <SidebarNode key={i} node={node} pathname={pathname} depth={0} />
        ))}
      </nav>
    </aside>
  );
}

function SidebarNode({
  node,
  pathname,
  depth,
}: {
  node: TreeNode;
  pathname: string;
  depth: number;
}) {
  if (node.type === "separator") {
    // Separators shouldn't appear anymore (all groups are folders now)
    // but handle gracefully just in case
    return (
      <div
        style={{
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--ink-45)",
          padding: "4px 10px 8px",
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
        className="sidebar-link"
        style={{
          display: "block",
          padding: "5px 10px",
          borderRadius: "var(--radius-sm)",
          fontSize: "13px",
          color: active ? "var(--fg)" : "var(--ink-60)",
          background: active ? "var(--brand-soft)" : "transparent",
          fontWeight: active ? 500 : 400,
          textDecoration: "none",
          transition: "background 0.12s, color 0.12s",
          marginLeft: depth === 0 ? "12px" : undefined,
        }}
        aria-current={active ? "page" : undefined}
      >
        {node.name}
      </Link>
    );
  }

  if (node.type === "folder") {
    return <FolderNode node={node} pathname={pathname} depth={depth} />;
  }

  return null;
}

function FolderNode({
  node,
  pathname,
  depth,
}: {
  node: Extract<TreeNode, { type: "folder" }>;
  pathname: string;
  depth: number;
}) {
  const isFeaturedProofs =
    typeof node.name === "string" && node.name.includes("Featured");

  // Default open unless it's Featured Proofs or has defaultOpen: false
  const defaultOpen = isFeaturedProofs
    ? false
    : (node as { defaultOpen?: boolean }).defaultOpen !== false;
  const [open, setOpen] = useState(defaultOpen);

  // Top-level folders (depth 0) = group label style
  // Nested folders (depth 1+) = link-like style (smaller, lighter)
  const isTopLevel = depth === 0;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        style={
          isTopLevel
            ? {
                // Group label style — matches supermock .s-label
                display: "flex",
                alignItems: "center",
                gap: "6px",
                width: "100%",
                padding: "4px 10px 8px",
                marginTop: "18px",
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--ink-45)",
                fontFamily: "inherit",
                textAlign: "left",
              }
            : {
                // Nested toggle style — link-like, slightly dimmer
                display: "flex",
                alignItems: "center",
                gap: "6px",
                width: "100%",
                padding: "5px 10px",
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 400,
                color: "var(--ink-60)",
                fontFamily: "inherit",
                textAlign: "left",
                borderRadius: "var(--radius-sm)",
                transition: "background 0.12s, color 0.12s",
              }
        }
        aria-expanded={open}
      >
        <svg
          width={isTopLevel ? "8" : "8"}
          height={isTopLevel ? "8" : "8"}
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{
            transition: "transform 0.15s",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            flexShrink: 0,
            opacity: isTopLevel ? 1 : 0.6,
          }}
        >
          <path d="M3 2L7 5L3 8" />
        </svg>
        <span>{node.name}</span>
      </button>
      {open && (
        <div
          style={{
            marginLeft: "8px",
            borderLeft: "1px solid var(--hairline)",
            paddingLeft: "4px",
          }}
        >
          {node.children.map((child, i) => (
            <SidebarNode key={i} node={child} pathname={pathname} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
