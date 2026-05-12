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
  { id: "codex", label: "Codex", disabled: true },
  { id: "windsurf", label: "Windsurf", disabled: true },
  { id: "copilot", label: "Copilot", disabled: true },
  { id: "cline", label: "Cline", disabled: true },
];

const labelMap: Record<Platform, string> = {
  "claude-code": "Claude Code",
  "cursor": "Cursor",
  "codex": "Codex",
  "windsurf": "Windsurf",
  "copilot": "Copilot",
  "cline": "Cline",
};

export function PlatformSwitcher() {
  const { platform, setPlatform } = usePlatform();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150"
        style={{
          color: "var(--fg)",
          border: "1px solid var(--border-soft)",
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <BrandIcon name={labelMap[platform]} size={14} />
        <span>{labelMap[platform]}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          style={{ color: "var(--ink-45)" }}
        >
          <path d="M2.5 3.75L5 6.25L7.5 3.75" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute top-full left-0 z-[200] mt-1.5 min-w-[180px] rounded-[var(--radius-md)] py-1.5 shadow-lg"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
          role="listbox"
          aria-label="Select platform"
        >
          {platforms.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                if (!p.disabled) {
                  setPlatform(p.id);
                  setOpen(false);
                }
              }}
              disabled={p.disabled}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors duration-100"
              style={{
                color: p.disabled ? "var(--ink-30)" : "var(--fg)",
                cursor: p.disabled ? "default" : "pointer",
              }}
              role="option"
              aria-selected={p.id === platform}
              aria-disabled={p.disabled}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  background: p.id === platform ? "var(--color-brand)" : "transparent",
                  border: p.id === platform ? "none" : "1px solid var(--ink-30)",
                }}
              />
              <BrandIcon name={p.label} size={14} />
              <span className="flex-1">{p.label}</span>
              {p.disabled && (
                <span className="font-mono text-[10px]" style={{ color: "var(--ink-30)" }}>
                  soon
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
