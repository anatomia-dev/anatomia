import { Container } from "@/components/ui/Container";

/**
 * DeepDive — "Under the hood" two-panel section.
 * Left: terminal transcript of `ana init`.
 * Right: sealed contract.yaml spec box.
 * Server component. Static content — typewriter polish is a later enhancement.
 */
export function DeepDive() {
  return (
    <section
      className="reveal py-22 border-t"
      style={{ borderColor: "var(--hairline)" }}
      data-component="deep-dive"
    >
      <Container>
        {/* Heading */}
        <div className="mb-14">
          <div className="mb-3.5 inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--ink-60)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-brand)" }} />
            Under the hood
          </div>
          <h2 className="text-[clamp(32px,3.8vw,52px)] leading-[1.05] tracking-tight" style={{ color: "var(--fg-strong)" }}>
            One command. Every assumption made explicit.
          </h2>
        </div>

        {/* Two-panel grid */}
        <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
          {/* Left: terminal */}
          <div className="rounded-[var(--radius-md)] border p-7" style={{ background: "var(--bg-card)", borderColor: "var(--border-soft)" }}>
            <div className="mb-2.5 inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--ink-60)" }}>
              Terminal
            </div>
            <h3 className="mb-2 text-[22px] font-semibold leading-tight tracking-tight" style={{ color: "var(--fg-strong)" }}>
              Run it on your own repo.
            </h3>
            <p className="mb-4 text-sm leading-relaxed" style={{ color: "var(--ink-60)" }}>
              Parses your project, writes a markdown context file. Any AI tool can read it.
            </p>
            <div className="overflow-hidden rounded-[var(--radius-sm)] font-mono text-[12.5px] leading-relaxed" style={{ background: "var(--terminal-bg)", color: "var(--terminal-fg)", padding: "16px 18px" }}>
              <div className="mb-3 flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ef4444" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#eab308" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-brand)" }} />
              </div>
              <div><span style={{ color: "rgba(255,255,255,0.45)" }}>~/projects/acme-api $</span> <span style={{ color: "var(--color-brand)" }}>ana init</span></div>
              <div><span style={{ color: "rgba(255,255,255,0.45)" }}>→ scanning project (tree-sitter × 5 languages)</span></div>
              <div><span style={{ color: "var(--color-brand)" }}>✓</span> Framework · <span style={{ color: "#67e8f9" }}>Next.js 14 (App Router)</span></div>
              <div><span style={{ color: "var(--color-brand)" }}>✓</span> Language · <span style={{ color: "#67e8f9" }}>TypeScript strict</span></div>
              <div><span style={{ color: "var(--color-brand)" }}>✓</span> Data · <span style={{ color: "#67e8f9" }}>Prisma → PostgreSQL</span></div>
              <div><span style={{ color: "var(--color-brand)" }}>✓</span> Patterns · <span style={{ color: "#67e8f9" }}>12 detected</span> <span style={{ color: "rgba(255,255,255,0.45)" }}>· auth, rpc, schema</span></div>
              <div><span style={{ color: "var(--color-brand)" }}>✓</span> Conventions · <span style={{ color: "#67e8f9" }}>8 captured</span></div>
              <div><span style={{ color: "rgba(255,255,255,0.45)" }}>→ context written to</span> <span style={{ color: "#fbbf24" }}>.ana/context.md</span></div>
              <div className="mt-2"><span style={{ color: "var(--color-brand)" }}>Ready.</span> <span style={{ color: "rgba(255,255,255,0.45)" }}>Next:</span> <span style={{ color: "#67e8f9" }}>ana think &quot;add rate limiting to /api/*&quot;</span></div>
            </div>
          </div>

          {/* Right: contract spec */}
          <div className="rounded-[var(--radius-md)] border p-7" style={{ background: "var(--bg-card)", borderColor: "var(--border-soft)" }}>
            <div className="mb-2.5 inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--ink-60)" }}>
              contract.yaml · sealed
            </div>
            <h3 className="mb-2 text-[22px] font-semibold leading-tight tracking-tight" style={{ color: "var(--fg-strong)" }}>
              Assertions Build must satisfy.
            </h3>
            <p className="mb-4 text-sm leading-relaxed" style={{ color: "var(--ink-60)" }}>
              Sealed by Plan. Build tags the tests. Verify checks the tags.
            </p>
            <div className="overflow-hidden rounded-[var(--radius-sm)] border" style={{ borderColor: "var(--border-soft)", background: "var(--bg-deep)" }}>
              <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: "var(--hairline)" }}>
                <span className="font-mono text-[12px]" style={{ color: "var(--ink-60)" }}>contract.yaml</span>
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--color-brand)" }}>Sealed</span>
              </div>
              <div className="px-4 py-3.5 font-mono text-[12.5px] leading-relaxed" style={{ color: "var(--fg)" }}>
                <div><span style={{ color: "var(--ink-45)" }}>feature:</span> <span>&quot;rate limit /api/*&quot;</span></div>
                <div><span style={{ color: "var(--ink-45)" }}>sealed_by:</span> <span>ana-plan</span></div>
                <div><span style={{ color: "var(--ink-45)" }}>assertions:</span></div>
                <div className="ml-4"><span style={{ color: "var(--ink-60)" }}>- id:</span> <span>A001</span></div>
                <div className="ml-8"><span style={{ color: "var(--ink-60)" }}>says:</span> <span>&quot;Under limit returns 200&quot;</span></div>
                <div className="ml-8"><span style={{ color: "var(--ink-60)" }}>target:</span> <span>response.status</span></div>
                <div className="ml-8"><span style={{ color: "var(--ink-60)" }}>matcher:</span> <span>equals · 200</span></div>
                <div className="ml-4"><span style={{ color: "var(--ink-60)" }}>- id:</span> <span>A002</span></div>
                <div className="ml-8"><span style={{ color: "var(--ink-60)" }}>says:</span> <span>&quot;Breach returns 429 + Retry-After&quot;</span></div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
