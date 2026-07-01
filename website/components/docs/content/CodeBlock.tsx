import type { ComponentPropsWithoutRef } from "react";
import { CopyButton } from "./CopyButton";

type PreProps = ComponentPropsWithoutRef<"pre">;

/**
 * CodeBlock — matches supermock .code exactly.
 * Container: bg-card, border, border-radius, mono 12.5px.
 * Header: bg-elev, language uppercase 10px, "Copy" always visible.
 * Body: padding 14px 16px, ink-75 color.
 *
 * Language comes from data-language attribute set by the custom
 * Shiki transformer in source.config.ts.
 */
export function CodeBlock(props: PreProps) {
  const { children, ...rest } = props;
  const language = (rest as Record<string, unknown>)["data-language"] as
    | string
    | undefined;
  const title = (rest as Record<string, unknown>)["data-title"] as
    | string
    | undefined;

  const textContent = extractText(children);
  const label = title ?? language;

  return (
    <div
      style={{
        // T4 dark terminal: the block is a dark material on the page (no
        // shadow — separation is the color difference). Same on light + dark
        // pages, mirroring the marketing hero terminal.
        background: "#111117",
        border: "1px solid rgba(11, 11, 16, 0.06)",
        borderRadius: "var(--radius-md)",
        margin: "8px 0 18px",
        fontFamily: "var(--font-mono)",
        fontSize: "12.5px",
        lineHeight: 1.65,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
          background: "#0B0B10",
          fontSize: "11px",
          color: "rgba(242, 240, 236, 0.5)",
        }}
      >
        <span
          style={{
            color: "rgba(242, 240, 236, 0.4)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontSize: "10px",
          }}
        >
          {label || ""}
        </span>
        <CopyButton text={textContent} />
      </div>
      <pre
        {...rest}
        style={{
          padding: "14px 16px",
          color: "rgba(242, 240, 236, 0.86)",
          overflowX: "auto",
          whiteSpace: "pre",
          margin: 0,
          background: "transparent",
          fontSize: "inherit",
          lineHeight: "inherit",
          fontFamily: "inherit",
        }}
      >
        {children}
      </pre>
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
