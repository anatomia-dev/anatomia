"use client";

import { useState, useEffect } from "react";
import type { ReactNode } from "react";

interface TocItem {
  title: ReactNode;
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
 * RightRail — sticky right sidebar matching supermock .right spec.
 * TOC with scroll spy, "Ask AI about this page" links, footer meta.
 */
export function RightRail({ toc, commitSha, buildTimestamp, editUrl }: RightRailProps) {
  const activeId = useScrollSpy(toc);
  const shortSha = commitSha?.slice(0, 7);

  return (
    <aside
      className="docs-right-rail"
      style={{
        position: "sticky",
        top: "58px",
        height: "calc(100vh - 58px)",
        width: "220px",
        flexShrink: 0,
        overflowY: "auto",
        borderLeft: "1px solid var(--hairline)",
        padding: "24px 18px",
        fontSize: "12.5px",
      }}
    >
      {/* TOC */}
      {toc.length > 0 && (
        <div>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--ink-45)",
              marginBottom: "14px",
            }}
          >
            On this page
          </div>
          <ul
            className="toc-list"
            style={{
              listStyle: "none",
              position: "relative",
              paddingLeft: "18px",
              marginTop: 0,
              marginBottom: "22px",
            }}
          >
            {/* Vertical timeline line */}
            <div
              style={{
                position: "absolute",
                left: "3px",
                top: "7px",
                bottom: "7px",
                width: "1px",
                background: "var(--hairline)",
              }}
            />
            {toc.map((item) => {
              const id = item.url.replace(/^#/, "");
              const active = activeId === id;
              return (
                <li
                  key={item.url}
                  style={{
                    marginBottom: "10px",
                    position: "relative",
                    lineHeight: 1.4,
                  }}
                >
                  {/* Dot */}
                  <span
                    style={{
                      position: "absolute",
                      left: "-18px",
                      top: "6px",
                      width: "7px",
                      height: "7px",
                      borderRadius: "50%",
                      background: active ? "var(--color-brand)" : "var(--bg)",
                      border: active
                        ? "1.5px solid var(--color-brand)"
                        : "1.5px solid var(--ink-25)",
                      boxSizing: "border-box",
                      boxShadow: active
                        ? "0 0 0 3px var(--brand-soft)"
                        : "none",
                      transition: "all 0.15s",
                    }}
                  />
                  <a
                    href={`#${id}`}
                    className="toc-link"
                    style={{
                      color: active ? "var(--fg)" : "var(--ink-60)",
                      fontSize: "12.5px",
                      fontWeight: active ? 500 : 400,
                      textDecoration: "none",
                      display: "block",
                      transition: "color 0.12s",
                    }}
                  >
                    {item.title}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Ask AI about this page */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          marginTop: "22px",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--ink-45)",
            marginBottom: "6px",
          }}
        >
          Ask AI about this page
        </div>
        <a
          href="#"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 10px",
            border: "1px solid var(--hairline)",
            borderRadius: "var(--radius-sm)",
            fontSize: "11.5px",
            color: "var(--ink-60)",
            textDecoration: "none",
          }}
        >
          Copy as Markdown
          <span style={{ marginLeft: "auto", color: "var(--ink-25)" }}>⌘C</span>
        </a>
        <a
          href="#"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 10px",
            border: "1px solid var(--hairline)",
            borderRadius: "var(--radius-sm)",
            fontSize: "11.5px",
            color: "var(--ink-60)",
            textDecoration: "none",
          }}
        >
          Open in Claude
          <span style={{ marginLeft: "auto", color: "var(--ink-25)" }}>↗</span>
        </a>
        <a
          href="#"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 10px",
            border: "1px solid var(--hairline)",
            borderRadius: "var(--radius-sm)",
            fontSize: "11.5px",
            color: "var(--ink-60)",
            textDecoration: "none",
          }}
        >
          Open in ChatGPT
          <span style={{ marginLeft: "auto", color: "var(--ink-25)" }}>↗</span>
        </a>
      </div>

      {/* Footer meta */}
      <div
        style={{
          marginTop: "32px",
          fontFamily: "var(--font-mono)",
          fontSize: "10.5px",
          color: "var(--ink-45)",
          lineHeight: 1.7,
        }}
      >
        {buildTimestamp && (
          <>Generated {new Date(buildTimestamp).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }).replace(",", "")}<br /></>
        )}
        {shortSha && (
          <>
            commit{" "}
            <a
              href={`https://github.com/TettoLabs/anatomia/commit/${commitSha}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--ink-60)",
                borderBottom: "1px dotted var(--ink-25)",
                textDecoration: "none",
              }}
            >
              {shortSha}
            </a>
            <br />
          </>
        )}
        {editUrl && (
          <a
            href={editUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--ink-60)",
              borderBottom: "1px dotted var(--ink-25)",
              textDecoration: "none",
            }}
          >
            Edit on GitHub ↗
          </a>
        )}
      </div>
    </aside>
  );
}

/**
 * Scroll spy — IntersectionObserver tracks visible headings.
 */
function useScrollSpy(toc: TocItem[]): string {
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    if (toc.length === 0) return;

    const ids = toc.map((item) => item.url.replace(/^#/, ""));
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
