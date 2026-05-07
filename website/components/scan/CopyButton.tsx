"use client";

import { useCallback, useState } from "react";

/**
 * CopyButton — copies a command to clipboard, flashes "Copied" state.
 * Used in the scan slab install row.
 */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }, [text]);

  return (
    <button
      type="button"
      onClick={onCopy}
      className="cursor-pointer border-l px-3.5 font-mono text-[11px] font-semibold uppercase tracking-widest transition-colors duration-150"
      style={{
        borderColor: "var(--hairline)",
        color: copied ? "var(--color-brand)" : "var(--ink-60)",
        background: "transparent",
      }}
      aria-label="Copy command"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
