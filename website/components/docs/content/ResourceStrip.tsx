interface Resource {
  type: string;
  name: string;
  description: string;
  href: string;
  external: boolean;
}

const RESOURCES: Resource[] = [
  {
    type: "Repository",
    name: "GitHub",
    description: "Source code, issues, and pull requests",
    href: "https://github.com/TettoLabs/anatomia",
    external: true,
  },
  {
    type: "Package",
    name: "npm",
    description: "Install with npm install -g anatomia-cli",
    href: "https://www.npmjs.com/package/anatomia-cli",
    external: true,
  },
  {
    type: "Philosophy",
    name: "Manifesto",
    description: "Why verified AI development matters",
    href: "/manifesto",
    external: false,
  },
];

export function ResourceStrip() {
  return (
    <div className="my-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
      {RESOURCES.map((resource) => {
        const linkProps = resource.external
          ? { target: "_blank" as const, rel: "noopener noreferrer" }
          : {};

        return (
          <a
            key={resource.name}
            href={resource.href}
            className="rounded-[var(--radius-md)] p-4 transition-colors duration-150"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-soft)",
            }}
            {...linkProps}
          >
            <span
              className="mb-1 block font-mono text-[11px] font-medium uppercase tracking-wider"
              style={{ color: "var(--ink-30)" }}
            >
              {resource.type}
            </span>
            <span
              className="mb-1 block text-[14px] font-semibold"
              style={{ color: "var(--fg-strong)" }}
            >
              {resource.name}
            </span>
            <span
              className="block text-[12.5px]"
              style={{ color: "var(--ink-45)" }}
            >
              {resource.description}
            </span>
          </a>
        );
      })}
    </div>
  );
}
