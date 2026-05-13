/**
 * ResourceStrip — matches supermock .res-grid exactly.
 * 3 resource cards (GitHub, npm, Manifesto).
 * Each: type label (mono uppercase), name, description.
 */

interface Resource {
  type: string;
  name: string;
  description: string;
  href: string;
  external: boolean;
}

const RESOURCES: Resource[] = [
  {
    type: "Repo",
    name: "GitHub \u2197",
    description: "Source, issues, releases",
    href: "https://github.com/TettoLabs/anatomia",
    external: true,
  },
  {
    type: "Pkg",
    name: "npm: anatomia-cli \u2197",
    description: "v1.0.2 \u00B7 MIT",
    href: "https://www.npmjs.com/package/anatomia-cli",
    external: true,
  },
  {
    type: "Brief",
    name: "Manifesto",
    description: "Why proofs, not promises",
    href: "https://anatomia.dev/manifesto",
    external: true,
  },
];

export function ResourceStrip() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "10px",
        marginBottom: "40px",
      }}
    >
      {RESOURCES.map((resource) => (
        <a
          key={resource.name}
          href={resource.href}
          target={resource.external ? "_blank" : undefined}
          rel={resource.external ? "noopener noreferrer" : undefined}
          style={{
            padding: "14px 16px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-card)",
            transition: "border-color 0.12s",
            textDecoration: "none",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--ink-45)",
              marginBottom: "6px",
              fontFamily: "var(--font-mono)",
            }}
          >
            {resource.type}
          </div>
          <div
            style={{
              fontSize: "13.5px",
              fontWeight: 500,
              color: "var(--fg)",
              marginBottom: "3px",
            }}
          >
            {resource.name}
          </div>
          <div
            style={{
              fontSize: "11.5px",
              color: "var(--ink-60)",
            }}
          >
            {resource.description}
          </div>
        </a>
      ))}
    </div>
  );
}
