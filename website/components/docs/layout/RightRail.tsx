"use client";

import { useState, useEffect } from "react";
import type { ReactNode } from "react";

interface TocItem {
  title: ReactNode;
  url: string;
  depth: number;
}

interface ProofLinks {
  githubUrl: string;
}

interface RightRailProps {
  toc: TocItem[];
  commitSha?: string;
  buildTimestamp?: string;
  editUrl?: string;
  variant?: "proof";
  proofLinks?: ProofLinks;
}

/**
 * RightRail — matches supermock .right exactly.
 * Container: 220px, padding 24px 18px, font-size 12.5px, border-left.
 * TOC: 18px padding-left, ::before line via CSS, 7px hollow dots on li.
 * Ask AI: 3 bordered link rows.
 * Footer: mono 10.5px, dotted underlines, short SHA link.
 */
export function RightRail({ toc, commitSha, buildTimestamp, editUrl, variant, proofLinks }: RightRailProps) {
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
        <>
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
            {variant === "proof" ? "On this proof" : "On this page"}
          </div>
          <ul
            className="right-rail-toc"
            style={{
              listStyle: "none",
              position: "relative",
              paddingLeft: "18px",
              margin: "0 0 22px 0",
            }}
          >
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
                  {/* Dot — rendered as span, positioned like supermock li::before */}
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
        </>
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
          {variant === "proof" ? "Grade this proof" : "Ask AI about this page"}
        </div>
        {(variant === "proof"
          ? [
              { text: "View on GitHub", arr: "↗", href: proofLinks?.githubUrl ?? "#" },
              { text: "Download artifacts", arr: "↗", href: "#" },
              { text: "Open in Claude", arr: "↗", href: "#" },
            ]
          : [
              { text: "Copy as Markdown", arr: "⌘C", href: "#" },
              { text: "Open in Claude", arr: "↗", href: "#" },
              { text: "Open in ChatGPT", arr: "↗", href: "#" },
            ]
        ).map((link) => (
          <a
            key={link.text}
            href={link.href}
            target={link.href !== "#" ? "_blank" : undefined}
            rel={link.href !== "#" ? "noopener noreferrer" : undefined}
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
              transition: "border-color 0.12s, color 0.12s",
            }}
          >
            {link.text}
            <span style={{ marginLeft: "auto", color: "var(--ink-25)" }}>
              {link.arr}
            </span>
          </a>
        ))}
      </div>

      {/* Footer */}
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
          <>
            Generated {new Date(buildTimestamp).toISOString().slice(0, 10)}
            <br />
          </>
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
 * Scroll spy — matches supermock approach: scroll-position-based,
 * runs immediately on mount, always defaults to first item.
 * The last heading whose offsetTop <= scrollY + 120 wins.
 */
function useScrollSpy(toc: TocItem[]): string {
  const firstId = toc.length > 0 ? toc[0].url.replace(/^#/, "") : "";
  const [activeId, setActiveId] = useState(firstId);

  useEffect(() => {
    if (toc.length === 0) return;

    const ids = toc.map((item) => item.url.replace(/^#/, ""));

    function spy() {
      const targets = ids
        .map((id) => document.getElementById(id))
        .filter(Boolean) as HTMLElement[];

      if (targets.length === 0) return;

      let active = 0;
      const y = window.scrollY + 120;
      targets.forEach((t, i) => {
        if (t.offsetTop <= y) active = i;
      });
      setActiveId(ids[active]);
    }

    window.addEventListener("scroll", spy, { passive: true });
    // Run immediately to set initial active state
    spy();

    return () => window.removeEventListener("scroll", spy);
  }, [toc]);

  return activeId;
}
