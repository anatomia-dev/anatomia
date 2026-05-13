import Link from "next/link";

/**
 * DocsGrid — matches supermock .qgrid exactly.
 * 3-column card grid. Each card: eyebrow with brand dot, h4, description, link list with → arrows.
 */

interface DocLink {
  title: string;
  href: string;
  code?: boolean;
}

interface DocsCard {
  eyebrow: string;
  heading: string;
  description: string;
  links: DocLink[];
}

interface DocsGridProps {
  proofCount: number;
}

export function DocsGrid({ proofCount }: DocsGridProps) {
  const cards: DocsCard[] = [
    {
      eyebrow: "Get started",
      heading: "Your first run",
      description:
        "From zero to a working ana scan on your repo. No login. Two minutes to scaffold.",
      links: [
        { title: "Install the CLI", href: "/docs/start#install" },
        { title: "Scan your repo (3s)", href: "/docs/start#init" },
        { title: "ana init \u2014 ship the system", href: "/docs/start#init", code: true },
        { title: "Your first cycle", href: "/docs/start#pipeline-run" },
        { title: "Your first proof", href: "/docs/start#complete" },
      ],
    },
    {
      eyebrow: "Guides",
      heading: "Doing the work",
      description:
        "Recipes for the moves you\u2019ll make, in the order you\u2019ll need them.",
      links: [
        { title: "Using ana-setup", href: "/docs/guides/using-ana-setup" },
        { title: "Verifying changes", href: "/docs/guides/verifying-changes" },
        { title: "Reading a proof", href: "/docs/guides/reading-a-proof" },
        { title: "Using ana-learn", href: "/docs/guides/using-ana-learn" },
        { title: "Configurability", href: "/docs/guides/configurability" },
        { title: "Troubleshooting", href: "/docs/guides/troubleshooting" },
      ],
    },
    {
      eyebrow: "Reference",
      heading: "Files & commands",
      description:
        "Every CLI command, every template, every artifact format. The source of truth.",
      links: [
        { title: "CLI commands", href: "/docs/reference/cli-commands" },
        { title: "Agent templates", href: "/docs/reference/agent-templates" },
        { title: "Skill files", href: "/docs/reference/skill-files" },
        { title: "Context files", href: "/docs/reference/context-files" },
        { title: `Proof chain (${proofCount})`, href: "/docs/proof" },
      ],
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "14px",
        marginBottom: "48px",
      }}
    >
      {cards.map((card) => (
        <div
          key={card.eyebrow}
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "18px 18px 20px",
            background: "var(--bg-card)",
            transition: "border-color 0.12s",
          }}
        >
          {/* Eyebrow with brand dot */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--ink-45)",
              marginBottom: "10px",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "var(--color-brand)",
              }}
            />
            {card.eyebrow}
          </div>
          <h4
            style={{
              fontSize: "15px",
              fontWeight: 600,
              marginBottom: "5px",
              letterSpacing: "-0.005em",
              color: "var(--fg)",
            }}
          >
            {card.heading}
          </h4>
          <p
            style={{
              fontSize: "13px",
              lineHeight: 1.5,
              color: "var(--ink-60)",
              marginBottom: "14px",
            }}
          >
            {card.description}
          </p>
          <ul
            style={{
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: "5px",
              margin: 0,
              padding: 0,
            }}
          >
            {card.links.map((link) => (
              <li key={link.href + link.title}>
                <Link
                  href={link.href}
                  className="qcard-link"
                  style={{
                    fontSize: "12.5px",
                    color: "var(--ink-75)",
                    display: "flex",
                    alignItems: "center",
                    gap: "7px",
                    textDecoration: "none",
                  }}
                >
                  <span
                    style={{
                      color: "var(--ink-25)",
                      fontSize: "11px",
                      width: "10px",
                    }}
                  >
                    →
                  </span>
                  {link.code ? (
                    <code
                      style={{
                        fontSize: "11.5px",
                        background: "var(--code-bg)",
                        border: "1px solid var(--hairline)",
                        padding: "1px 5px",
                        borderRadius: "3px",
                      }}
                    >
                      {link.title}
                    </code>
                  ) : (
                    link.title
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
