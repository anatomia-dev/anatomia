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
        background: "var(--bg-card)",
        // #06 soft elevation: hairline border + soft diffuse shadow so the
        // block floats off the paper (card = paper now, so lift IS the shadow).
        border: "1px solid var(--border-soft)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow)",
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
          borderBottom: "1px solid var(--hairline)",
          background: "var(--bg-elev)",
          fontSize: "11px",
          color: "var(--ink-60)",
        }}
      >
        <span
          style={{
            color: "var(--ink-45)",
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
          color: "var(--ink-75)",
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
