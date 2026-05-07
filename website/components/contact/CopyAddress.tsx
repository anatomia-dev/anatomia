"use client";

import { useCallback, useState } from "react";

/**
 * CopyAddress — click-to-copy address button.
 * Flashes "Copied" state for 1.2s.
 */
export function CopyAddress({ addr, href }: { addr: string; href: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(() => {
    const textToCopy = href.startsWith("mailto:") ? href.replace("mailto:", "") : addr;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }, [addr, href]);

  return (
    <button
      onClick={onCopy}
      className="cursor-pointer font-mono text-[14px] font-medium transition-colors duration-150"
      style={{ color: copied ? "var(--color-brand)" : "var(--fg-strong)" }}
      aria-label={`Copy ${addr}`}
    >
      {copied ? "Copied" : addr}
    </button>
  );
}
