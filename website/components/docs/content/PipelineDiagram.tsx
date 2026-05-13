import Link from "next/link";

interface Stage {
  number: string;
  name: string;
  description: string;
  artifact: string;
  agent: string;
  href: string;
}

const STAGES: Stage[] = [
  {
    number: "01",
    name: "Think",
    description: "Scope the change, define acceptance criteria",
    artifact: "scope.md",
    agent: "ana",
    href: "/docs/concepts/pipeline",
  },
  {
    number: "02",
    name: "Plan",
    description: "Design the spec, seal the contract",
    artifact: "spec.md",
    agent: "ana-plan",
    href: "/docs/concepts/pipeline",
  },
  {
    number: "03",
    name: "Build",
    description: "Implement the spec, write tests, commit",
    artifact: "build_report.md",
    agent: "ana-build",
    href: "/docs/concepts/pipeline",
  },
  {
    number: "04",
    name: "Verify",
    description: "Run the contract, compare reports, judge",
    artifact: "verify_report.md",
    agent: "ana-verify",
    href: "/docs/concepts/pipeline",
  },
  {
    number: "05",
    name: "Learn",
    description: "Triage findings, promote rules, evolve",
    artifact: "findings",
    agent: "ana-learn",
    href: "/docs/concepts/pipeline",
  },
];

export function PipelineDiagram() {
  return (
    <div className="my-10 grid grid-cols-1 gap-3 sm:grid-cols-5">
      {STAGES.map((stage) => (
        <Link
          key={stage.number}
          href={stage.href}
          className="group rounded-[var(--radius-md)] p-4 transition-colors duration-150"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-soft)",
          }}
        >
          <span
            className="mb-1 block font-mono text-[11px] font-semibold"
            style={{ color: "var(--ink-30)" }}
          >
            {stage.number}
          </span>
          <span
            className="mb-1 block text-[15px] font-semibold"
            style={{ color: "var(--fg-strong)" }}
          >
            {stage.name}
          </span>
          <span
            className="mb-2 block text-[12.5px] leading-snug"
            style={{ color: "var(--ink-60)" }}
          >
            {stage.description}
          </span>
          <span
            className="block font-mono text-[11px]"
            style={{ color: "var(--ink-30)" }}
          >
            {stage.artifact}
          </span>
          <span
            className="block font-mono text-[11px]"
            style={{ color: "var(--ink-30)" }}
          >
            {stage.agent}
          </span>
        </Link>
      ))}
    </div>
  );
}
