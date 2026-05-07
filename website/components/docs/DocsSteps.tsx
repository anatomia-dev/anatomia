import { copy } from "@/lib/copy";
import { Formatted } from "@/components/ui/Formatted";

/**
 * DocsSteps — four numbered steps with Roman numerals.
 * Each step: numeral (Fraunces italic), title, body, code output block.
 * Code output blocks are VERBATIM from the handoff — they are the product proof.
 */
export function DocsSteps() {
  return (
    <div>
      {/* Section rule */}
      <div className="mb-10 border-t pt-8" style={{ borderColor: "var(--hairline)" }}>
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--ink-45)" }}>
          {copy.docs.sectionRule.walkthrough}
        </span>
      </div>

      <div className="flex flex-col gap-16">
        {copy.docs.steps.map((step) => (
          <div key={step.num}>
            {/* Numeral + title */}
            <div className="mb-4 flex items-baseline gap-4">
              <span className="font-serif text-[28px] italic" style={{ color: "var(--color-brand)" }}>
                {step.num}
              </span>
              <h3 className="text-xl font-semibold tracking-tight" style={{ color: "var(--fg-strong)" }}>
                {step.title}
              </h3>
            </div>

            {/* Body */}
            <p className="mb-5 max-w-[58ch] text-[15.5px] leading-relaxed" style={{ color: "var(--ink-75)" }}>
              <Formatted text={step.body} />
            </p>

            {/* Callout (if present) */}
            {"callout" in step && step.callout && (
              <div className="mb-5 border-l-2 py-2 pl-4" style={{ borderColor: "var(--color-brand)" }}>
                <span className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--color-brand)" }}>
                  {step.callout.kind}
                </span>
                <p className="text-sm leading-relaxed" style={{ color: "var(--ink-60)" }}>
                  {step.callout.body}
                </p>
              </div>
            )}

            {/* Code output placeholder — references handoff source */}
            <div
              className="overflow-hidden rounded-[var(--radius-sm)] font-mono text-[12px] leading-relaxed"
              style={{ background: "var(--terminal-bg)", color: "var(--terminal-fg)", padding: "16px 18px" }}
            >
              <div className="mb-2 text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
                Output
              </div>
              <div style={{ color: "rgba(255,255,255,0.55)" }}>
                {/* Source: {step.outSourceRef} — port verbatim from HTML */}
                <span style={{ color: "var(--color-brand)" }}>$</span> anatomia {step.num === "i" ? "init" : step.num === "ii" ? "plan" : step.num === "iii" ? "run" : "show"}
              </div>
              <div style={{ color: "rgba(255,255,255,0.45)" }}>
                {step.num === "i" && "→ scanning project... ✓ context written to .ana/context.md"}
                {step.num === "ii" && "→ planner reading codebase... ✓ 6 assertions sealed in contract.yaml"}
                {step.num === "iii" && "→ executing plan... ✓ 4/4 stages complete · all assertions tagged"}
                {step.num === "iv" && "→ chain intact · verdict: PASS · 6/6 assertions verified"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
