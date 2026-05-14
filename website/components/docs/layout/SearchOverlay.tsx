"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

interface SearchEntry {
  type: string;
  title: string;
  description: string;
  route: string;
}

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

/**
 * SearchOverlay — fixed overlay with search input, relevance-ranked results,
 * keyboard navigation, and grouped display (Pages, Commands, Proofs).
 *
 * Lazy-loads search-index.json on first open. Client-side substring filtering.
 */
export function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [entries, setEntries] = useState<SearchEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Lazy-load search index on first open
  useEffect(() => {
    if (open && !loaded) {
      fetch("/search-index.json")
        .then((res) => res.json())
        .then((data: SearchEntry[]) => {
          setEntries(data);
          setLoaded(true);
        })
        .catch(() => {
          // Silent fail — search will show empty state
        });
    }
  }, [open, loaded]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      // Delay focus slightly to ensure the input is mounted
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Filter and rank results
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();

    const scored = entries
      .map((entry) => {
        const titleLower = entry.title.toLowerCase();
        const descLower = entry.description.toLowerCase();
        let score = 0;
        if (titleLower === q) score = 3; // Exact title match
        else if (titleLower.includes(q)) score = 2; // Title contains
        else if (descLower.includes(q)) score = 1; // Description contains
        return { entry, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.map((s) => s.entry);
  }, [query, entries]);

  // Group results by type
  const grouped = useMemo(() => {
    const groups: { label: string; typeKey: string; items: SearchEntry[] }[] = [
      { label: "Pages", typeKey: "page", items: [] },
      { label: "Commands", typeKey: "command", items: [] },
      { label: "Proofs", typeKey: "proof", items: [] },
      { label: "Agents", typeKey: "agent", items: [] },
      { label: "Skills", typeKey: "skill", items: [] },
    ];
    for (const r of results) {
      const g = groups.find((g) => g.typeKey === r.type);
      if (g) g.items.push(r);
    }
    return groups.filter((g) => g.items.length > 0);
  }, [results]);

  // Flat list for keyboard navigation
  const flatResults = useMemo(() => {
    return grouped.flatMap((g) => g.items);
  }, [grouped]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const navigate = useCallback(
    (entry: SearchEntry) => {
      router.push(entry.route);
      onClose();
    },
    [router, onClose],
  );

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, flatResults.length - 1),
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (flatResults[selectedIndex]) {
          navigate(flatResults[selectedIndex]);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, flatResults, selectedIndex, onClose, navigate]);

  if (!open) return null;

  // Track cumulative index for flat selection
  let flatIdx = 0;

  return (
    <div
      className="docs-search-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="docs-search-modal">
        {/* Input row */}
        <div className="docs-search-input-row">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ flexShrink: 0, color: "var(--ink-40)" }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search docs, commands, proofs..."
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              fontSize: "15px",
              color: "var(--fg)",
              fontFamily: "var(--font-sans)",
            }}
          />
          <kbd
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              border: "1px solid var(--border)",
              padding: "2px 6px",
              borderRadius: "3px",
              color: "var(--ink-60)",
              flexShrink: 0,
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results area */}
        <div className="docs-search-results">
          {!query.trim() && (
            <div className="docs-sr-empty">
              Type to search pages, commands, and proofs
            </div>
          )}
          {query.trim() && results.length === 0 && (
            <div className="docs-sr-empty">No results found</div>
          )}
          {grouped.map((group) => (
            <div key={group.label} className="docs-sr-group">
              <div className="docs-sr-group-label">{group.label}</div>
              {group.items.map((item) => {
                const idx = flatIdx++;
                return (
                  <button
                    key={`${item.type}-${item.route}`}
                    className={`docs-sr-item${idx === selectedIndex ? " selected" : ""}`}
                    onClick={() => navigate(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className="docs-sr-item-title">{item.title}</span>
                    <span className="docs-sr-item-desc">{item.description}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
