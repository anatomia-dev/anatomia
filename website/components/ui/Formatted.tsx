import type { ReactNode } from "react";

/**
 * Renders copy strings with inline formatting markers:
 *   *word*   → <em>word</em>
 *   **word** → <strong>word</strong>
 *   `word`   → <code>word</code>
 *
 * Replaces dangerouslySetInnerHTML for copy strings.
 * Safe, composable, type-safe.
 */
export function Formatted({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const segments: ReactNode[] = [];
  // Match **bold**, *italic*, or `code` — bold must be checked before italic
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      segments.push(text.slice(lastIndex, match.index));
    }

    const raw = match[0];
    if (raw.startsWith("**") && raw.endsWith("**")) {
      segments.push(<strong key={match.index}>{raw.slice(2, -2)}</strong>);
    } else if (raw.startsWith("*") && raw.endsWith("*")) {
      segments.push(<em key={match.index}>{raw.slice(1, -1)}</em>);
    } else if (raw.startsWith("`") && raw.endsWith("`")) {
      segments.push(<code key={match.index}>{raw.slice(1, -1)}</code>);
    }

    lastIndex = match.index + raw.length;
  }

  // Remaining text after last match
  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex));
  }

  return className ? <span className={className}>{segments}</span> : <>{segments}</>;
}
