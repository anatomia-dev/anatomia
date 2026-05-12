"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { source } from "@/lib/source";

type TreeNode = (typeof source.pageTree)["children"][number];

/**
 * Sidebar — renders the Fumadocs page tree as a nested list.
 * Five groups: Get Started, Concepts, Guides, Reference, Proof Chain.
 * Active state highlights current page. Featured proofs section toggleable.
 */
export function Sidebar() {
  const pathname = usePathname();
  const tree = source.pageTree;

  return (
    <aside
      className="docs-sidebar sticky top-[58px] hidden h-[calc(100vh-58px)] w-[248px] shrink-0 overflow-y-auto md:block"
      style={{ borderRight: "1px solid var(--hairline)" }}
    >
      <nav className="px-4 py-6" aria-label="Sidebar">
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
    return (
      <div
        className="mb-2 mt-6 px-2 font-mono text-[11px] font-semibold uppercase tracking-wider first:mt-0"
        style={{ color: "var(--ink-30)" }}
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
        className="sidebar-link mb-0.5 block rounded-[var(--radius-sm)] px-2 py-1.5 text-[13.5px] transition-colors duration-100"
        style={{
          color: active ? "var(--fg-strong)" : "var(--ink-60)",
          background: active ? "var(--border-soft)" : "transparent",
          fontWeight: active ? 600 : 400,
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
  const isFeaturedProofs = typeof node.name === "string" && node.name.includes("Featured");
  const [open, setOpen] = useState(!isFeaturedProofs);

  return (
    <div className="mb-0.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[13.5px] transition-colors duration-100"
        style={{ color: "var(--ink-60)" }}
        aria-expanded={open}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        >
          <path d="M3 2L7 5L3 8" />
        </svg>
        <span>{node.name}</span>
      </button>
      {open && (
        <div className="ml-2 border-l" style={{ borderColor: "var(--hairline)" }}>
          {node.children.map((child, i) => (
            <SidebarNode key={i} node={child} pathname={pathname} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
