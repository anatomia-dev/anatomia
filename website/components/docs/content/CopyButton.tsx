"use client";

import { useState, useCallback } from "react";

interface CopyButtonProps {
  text: string;
}

/**
 * CopyButton — matches supermock .code-head .copy.
 * Shows "Copy" text, changes to "Copied" on click.
 * 10.5px, ink-60 color, hover to ink.
 */
export function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API not available
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="copy-btn"
      style={{
        fontSize: "10.5px",
        color: "var(--ink-60)",
        cursor: "pointer",
        background: "none",
        border: "none",
        fontFamily: "inherit",
        padding: 0,
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
