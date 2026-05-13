import type { Command } from "@/lib/docs-data/types";
import { HeadingWithAnchor } from "@/components/docs/content/HeadingWithAnchor";

interface CommandGroupProps {
  name: string;
  commands: Command[];
  className?: string;
}

/**
 * CommandGroup — renders a single command group with heading + command list.
 * Matches supermock renderCLIReference() command block styling.
 */
export function CommandGroup({ name, commands, className }: CommandGroupProps) {
  const id = name.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className={className}>
      <HeadingWithAnchor id={id} style={{ scrollMarginTop: "120px" }}>
        {name}
      </HeadingWithAnchor>
      {commands.map((cmd) => (
        <CommandItem key={cmd.name} command={cmd} prefix="ana" />
      ))}
    </div>
  );
}

function CommandItem({ command, prefix }: { command: Command; prefix: string }) {
  const fullName = `${prefix} ${command.name}`;

  return (
    <div style={{ marginBottom: "18px" }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          fontWeight: 500,
          color: "var(--ink)",
          marginBottom: "4px",
        }}
      >
        <code>{fullName}</code>
        {command.arguments.length > 0 && (
          <span style={{ color: "var(--ink-60)" }}>
            {" "}
            {command.arguments.map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`)).join(" ")}
          </span>
        )}
      </div>
      {command.description && (
        <p style={{ fontSize: "13px", color: "var(--ink-60)", marginBottom: "4px" }}>
          {command.description}
        </p>
      )}
      {command.options.length > 0 && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--ink-40)" }}>
          Flags:{" "}
          {command.options.map((opt) => (
            <code key={opt.flags} style={{ marginRight: "6px" }}>
              {opt.flags.split(",")[0].trim()}
            </code>
          ))}
        </div>
      )}
      {command.subcommands.length > 0 && (
        <div style={{ marginLeft: "16px", marginTop: "8px" }}>
          {command.subcommands.map((sub) => (
            <CommandItem key={sub.name} command={sub} prefix={fullName} />
          ))}
        </div>
      )}
    </div>
  );
}
