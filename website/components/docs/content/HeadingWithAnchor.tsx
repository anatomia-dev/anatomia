import type { ReactNode } from "react";

interface HeadingWithAnchorProps {
  level?: 2 | 3;
  children: ReactNode;
  id?: string;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Heading with hover anchor — matches supermock .prose h2 .anchor.
 * The # appears on hover, linking to the heading ID.
 * Shared across MDX catch-all and custom page.tsx routes.
 */
export function HeadingWithAnchor({
  level = 2,
  children,
  id,
  style,
  className,
}: HeadingWithAnchorProps) {
  const Tag = `h${level}` as "h2" | "h3";
  return (
    <Tag id={id} style={style} className={className}>
      {id && (
        <a
          href={`#${id}`}
          className="heading-anchor"
          aria-hidden="true"
          style={{
            color: "var(--ink-25)",
            marginRight: "8px",
            fontFamily: "var(--font-mono)",
            fontSize: "14px",
            opacity: 0,
            transition: "opacity 0.12s",
            textDecoration: "none",
            border: "none",
            borderBottom: "none",
          }}
        >
          #
        </a>
      )}
      {children}
    </Tag>
  );
}
