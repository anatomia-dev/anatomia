import type { ComponentPropsWithoutRef } from "react";
import { CopyButton } from "./CopyButton";

type PreProps = ComponentPropsWithoutRef<"pre">;

/**
 * CodeBlock — maps to the `pre` element in MDX component overrides.
 * rehypeCode annotates `<pre>` with data-language and data-title.
 * The highlighted `<code>` is passed as children.
 */
export function CodeBlock(props: PreProps) {
  const { children, ...rest } = props;
  const language = (rest as Record<string, unknown>)["data-language"] as string | undefined;
  const title = (rest as Record<string, unknown>)["data-title"] as string | undefined;

  // Extract text content for the copy button
  const textContent = extractText(children);

  const showHeader = language || title;

  return (
    <div className="code-block group my-6 overflow-hidden rounded-[var(--radius-md)]">
      {showHeader && (
        <div
          className="flex items-center justify-between px-4 py-2 font-mono text-[12px]"
          style={{
            background: "var(--bg-deep)",
            borderBottom: "1px solid var(--border-soft)",
            color: "var(--ink-45)",
          }}
        >
          <span>{title ?? language}</span>
          <CopyButton text={textContent} />
        </div>
      )}
      <pre
        {...rest}
        className="overflow-x-auto p-4 text-[13.5px] leading-relaxed"
        style={{
          background: "var(--bg-deep)",
          color: "var(--fg)",
          margin: 0,
        }}
      >
        {children}
      </pre>
      {!showHeader && (
        <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
          <CopyButton text={textContent} />
        </div>
      )}
    </div>
  );
}

/** Recursively extract text content from React children. */
function extractText(node: unknown): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && node !== null && "props" in node) {
    const props = (node as { props: { children?: unknown } }).props;
    return extractText(props.children);
  }
  return "";
}
