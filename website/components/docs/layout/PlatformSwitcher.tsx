"use client";

import { useState, useRef, useEffect } from "react";
import { BrandIcon } from "@/lib/icons";
import { usePlatform } from "@/components/docs/providers/PlatformProvider";
import type { Platform } from "@/components/docs/providers/PlatformProvider";

interface PlatformOption {
  id: Platform;
  label: string;
  disabled: boolean;
}

const platforms: PlatformOption[] = [
  { id: "claude-code", label: "Claude Code", disabled: false },
  { id: "cursor", label: "Cursor", disabled: true },
  { id: "codex", label: "Codex", disabled: false },
  { id: "windsurf", label: "Windsurf", disabled: true },
  { id: "copilot", label: "Copilot", disabled: true },
  { id: "cline", label: "Cline", disabled: true },
];

export function PlatformSwitcher() {
  const { platform, setPlatform } = usePlatform();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activePlatform = platforms.find((p) => p.id === platform);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "5px 10px",
          borderRadius: "var(--radius-sm)",
          fontSize: "12px",
          fontWeight: 500,
          color: "var(--ink-75)",
          border: "1px solid var(--border-soft)",
          background: "var(--bg-card)",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <BrandIcon name={activePlatform?.label ?? "Claude Code"} size={14} />
        <span className="docs-platform-label">{activePlatform?.label}</span>
        <svg
          className="docs-platform-chevron"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: "180px",
            padding: "4px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow, 0 8px 24px -8px rgba(0,0,0,0.4))",
            zIndex: 30,
          }}
          role="listbox"
          aria-label="Select platform"
        >
          {platforms.map((p) => {
            const isActive = p.id === platform;
            return (
              <button
                key={p.id}
                onClick={() => {
                  if (!p.disabled) {
                    setPlatform(p.id);
                    setOpen(false);
                  }
                }}
                disabled={p.disabled}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                  padding: "7px 10px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "12.5px",
                  color: "var(--ink-75)",
                  cursor: "default",
                  background: isActive ? "var(--brand-soft)" : "transparent",
                  border: "none",
                  fontFamily: "inherit",
                  textAlign: "left",
                  opacity: p.disabled ? 0.4 : 1,
                }}
                role="option"
                aria-selected={isActive}
                aria-disabled={p.disabled}
              >
                <BrandIcon name={p.label} size={14} />
                <span style={{ flex: 1 }}>{p.label}</span>
                {isActive && (
                  <span style={{ marginLeft: "auto", color: "var(--brand-light)", fontSize: "13px" }}>
                    ✓
                  </span>
                )}
                {p.disabled && (
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--ink-45)",
                    }}
                  >
                    soon
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
