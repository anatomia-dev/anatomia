"use client";

import { useState, useEffect } from "react";

interface TocItem {
  title: string;
  url: string;
  depth: number;
}

interface RightRailProps {
  toc: TocItem[];
  commitSha?: string;
  buildTimestamp?: string;
  editUrl?: string;
}

/**
 * RightRail — sticky right sidebar with TOC scroll spy,
 * "Ask AI" placeholder links, and footer meta.
 */
export function RightRail({ toc, commitSha, buildTimestamp, editUrl }: RightRailProps) {
  const activeId = useScrollSpy(toc);

  return (
    <aside className="docs-right-rail sticky top-[58px] hidden h-[calc(100vh-58px)] w-[220px] shrink-0 overflow-y-auto xl:block">
      <div className="px-4 py-6">
        {/* TOC */}
        {toc.length > 0 && (
          <div className="mb-8">
            <div
              className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--ink-30)" }}
            >
              On this page
            </div>
            <ul className="toc-list space-y-1">
              {toc.map((item) => {
                const id = item.url.replace("#", "");
                const active = activeId === id;
                return (
                  <li key={item.url}>
                    <a
                      href={item.url}
                      className="toc-link block rounded-sm py-0.5 text-[12.5px] leading-snug transition-colors duration-100"
                      style={{
                        paddingLeft: `${(item.depth - 2) * 12 + 4}px`,
                        color: active ? "var(--fg-strong)" : "var(--ink-45)",
                        fontWeight: active ? 500 : 400,
                      }}
                      data-active={active || undefined}
                    >
                      {item.title}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Ask AI placeholder */}
        <div className="mb-8">
          <div
            className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--ink-30)" }}
          >
            Ask AI...
          </div>
          <div
            className="rounded-[var(--radius-sm)] p-3 text-[12px]"
            style={{
              background: "var(--border-soft)",
              color: "var(--ink-45)",
            }}
          >
            AI assistance coming soon
          </div>
        </div>

        {/* Footer meta */}
        <div
          className="space-y-1.5 border-t pt-4 font-mono text-[11px]"
          style={{ borderColor: "var(--hairline)", color: "var(--ink-30)" }}
        >
          {buildTimestamp && (
            <div>Generated {new Date(buildTimestamp).toLocaleDateString()}</div>
          )}
          {commitSha && <div>Commit {commitSha}</div>}
          {editUrl && (
            <a
              href={editUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block transition-colors duration-100"
              style={{ color: "var(--ink-45)" }}
            >
              Edit on GitHub &rarr;
            </a>
          )}
        </div>
      </div>
    </aside>
  );
}

/**
 * Scroll spy hook — uses IntersectionObserver to track which heading
 * is currently visible in the viewport.
 */
function useScrollSpy(toc: TocItem[]): string {
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    if (toc.length === 0) return;

    const ids = toc.map((item) => item.url.replace("#", ""));
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      {
        rootMargin: "-80px 0px -60% 0px",
        threshold: 0,
      },
    );

    for (const el of elements) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [toc]);

  return activeId;
}
