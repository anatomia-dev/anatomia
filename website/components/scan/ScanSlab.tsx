import { copy } from "@/lib/copy";
import { Container } from "@/components/ui/Container";
import { Formatted } from "@/components/ui/Formatted";
import { SectionThread } from "@/components/ui/SectionThread";
import { CopyButton } from "./CopyButton";

/**
 * ScanSlab — top-of-funnel on-ramp. "Run npx anatomia scan."
 * Two-column: terminal mock (left) + copy+install (right).
 * Server component. Only CopyButton is client.
 *
 * The terminal mock is verbatim from the handoff HTML (lines 3424-3473).
 * It shows a realistic "ana scan" output for a Next.js + Prisma project.
 */
export function ScanSlab() {
  return (
    <section
      className="reveal border-t py-22"
      style={{ borderColor: "var(--hairline)" }}
      id="scan"
      data-component="scan-slab"
    >
      <Container>
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 items-start gap-8 min-[920px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] min-[920px]:gap-14">

          {/* Left at desktop, below on mobile */}
          <div
            className="order-last overflow-hidden rounded-[var(--radius-md)] font-mono text-[12.5px] leading-relaxed min-[920px]:order-first"
            style={{
              background: "var(--terminal-bg)",
              color: "var(--terminal-fg)",
              padding: "18px 20px 20px",
              boxShadow: "0 1px 0 rgba(0,0,0,0.04), 0 24px 60px -30px rgba(0,0,0,0.35)",
            }}
            aria-label="ana scan output"
          >
            {/* Terminal header */}
            <div className="mb-3.5 flex items-center justify-between border-b border-dashed pb-3" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ef4444" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#eab308" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-brand)" }} />
              </div>
              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "11.5px" }}>~/work/papermark</span>
              <span className="text-[11px] uppercase tracking-widest" style={{ color: "var(--color-brand)" }}>scan · 3.1s</span>
            </div>

            {/* Command */}
            <div className="mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
              $ <span style={{ color: "var(--color-brand)" }}>ana scan</span>
            </div>

            {/* Project header card */}
            <div className="mb-4.5 rounded-lg border p-3" style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="text-[15px] font-semibold" style={{ color: "var(--terminal-fg)" }}>papermark</span>
                <span className="rounded-full px-2 py-0.5 text-[10.5px] uppercase tracking-wider" style={{ background: "rgba(103,232,249,0.12)", color: "#67e8f9" }}>web-app</span>
              </div>
              <div className="mt-2 text-[12.5px]" style={{ color: "rgba(255,255,255,0.72)" }}>
                <span style={{ color: "#67e8f9" }}>TypeScript</span>
                <span className="mx-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
                <span style={{ color: "#67e8f9" }}>Next.js</span>
                <span className="mx-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
                <span style={{ color: "var(--color-brand)" }}>Prisma</span>
                {" → "}
                <span style={{ color: "#fbbf24" }}>PostgreSQL</span>
                <span style={{ color: "rgba(255,255,255,0.45)" }}> (63 models)</span>
              </div>
            </div>

            {/* Stack group */}
            <div className="mt-4">
              <div className="mb-1.5 text-[10.5px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.45)" }}>Stack</div>
              <div className="grid gap-y-0.5" style={{ gridTemplateColumns: "92px 1fr" }}>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>Auth</span>
                <span><span style={{ color: "#67e8f9" }}>NextAuth</span></span>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>AI</span>
                <span><span style={{ color: "#67e8f9" }}>Anthropic</span> <span style={{ color: "rgba(255,255,255,0.45)" }}>·</span> <span style={{ color: "#67e8f9" }}>OpenAI</span></span>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>Payments</span>
                <span><span style={{ color: "#67e8f9" }}>Stripe</span></span>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>UI</span>
                <span><span style={{ color: "#67e8f9" }}>shadcn/ui</span> <span style={{ color: "rgba(255,255,255,0.45)" }}>(Tailwind)</span></span>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>Services</span>
                <span><span style={{ color: "#67e8f9" }}>S3</span> <span style={{ color: "rgba(255,255,255,0.45)" }}>·</span> <span style={{ color: "#67e8f9" }}>Resend</span> <span style={{ color: "rgba(255,255,255,0.45)" }}>·</span> <span style={{ color: "#67e8f9" }}>PostHog</span> <span style={{ color: "rgba(255,255,255,0.45)" }}>(+2 more)</span></span>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>Deploy</span>
                <span><span style={{ color: "#67e8f9" }}>Vercel</span> <span style={{ color: "rgba(255,255,255,0.45)" }}>·</span> <span style={{ color: "#67e8f9" }}>GitHub Actions</span></span>
              </div>
            </div>

            {/* Intelligence group */}
            <div className="mt-4">
              <div className="mb-1.5 text-[10.5px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.45)" }}>Intelligence</div>
              <div className="grid gap-y-0.5" style={{ gridTemplateColumns: "92px 1fr" }}>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>Activity</span>
                <span>12 contributors <span style={{ color: "rgba(255,255,255,0.45)" }}>·</span> 8→14→11→9 weekly <span className="ml-2 inline-flex items-end gap-[3px]" style={{ height: "12px", verticalAlign: "-2px" }} aria-hidden="true"><i className="inline-block w-[5px] rounded-[1px]" style={{ height: "4px", background: "var(--color-brand)", opacity: 0.75 }} /><i className="inline-block w-[5px] rounded-[1px]" style={{ height: "8px", background: "var(--color-brand)", opacity: 0.75 }} /><i className="inline-block w-[5px] rounded-[1px]" style={{ height: "6px", background: "var(--color-brand)", opacity: 0.75 }} /><i className="inline-block w-[5px] rounded-[1px]" style={{ height: "5px", background: "var(--color-brand)", opacity: 0.75 }} /></span></span>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>Hot files</span>
                <span><span style={{ color: "#67e8f9" }}>documents/[id]/page.tsx</span> <span style={{ color: "rgba(255,255,255,0.45)" }}>(7)</span>, <span style={{ color: "#67e8f9" }}>api/upload/route.ts</span> <span style={{ color: "rgba(255,255,255,0.45)" }}>(5)</span></span>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>Docs</span>
                <span>README.md <span style={{ color: "rgba(255,255,255,0.45)" }}>only</span></span>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>Secrets</span>
                <span><span style={{ color: "var(--color-brand)" }}>✓</span> none in source <span style={{ color: "rgba(255,255,255,0.45)" }}>·</span> .env gitignored</span>
              </div>
            </div>

            {/* Warning */}
            <div className="mt-4.5 border-l-2 px-3 py-2.5 text-[12.5px]" style={{ borderColor: "#fbbf24", background: "rgba(251,191,36,0.06)", color: "rgba(255,255,255,0.85)" }}>
              <span style={{ color: "#fbbf24" }}>⚠</span>{" "}No test framework detected — 0 test files.
            </div>

            {/* Footer */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dashed pt-3 text-[11.5px]" style={{ borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.55)" }}>
              <span>Full data: <span style={{ color: "#67e8f9" }}>.ana/scan.json</span></span>
              <span><span style={{ color: "var(--color-brand)" }}>›</span> Run <span style={{ color: "var(--color-brand)" }}>ana init</span> to scaffold 8 skills for Next.js · Prisma · Anthropic</span>
            </div>
          </div>

          {/* Right: copy + install */}
          <div className="max-w-[48ch]">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--ink-60)" }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-brand)" }} />
              <Formatted text={copy.scan.eyebrow} />
            </div>

            {/* Title */}
            <h2 className="mt-3.5 mb-4 text-[clamp(28px,3vw,44px)] font-semibold leading-[1.05] tracking-tight [&>em]:italic [&>em]:text-[var(--color-brand)]" style={{ color: "var(--fg-strong)" }}>
              <Formatted text={copy.scan.title} />
            </h2>

            {/* Lede */}
            <p className="mb-6 text-base leading-relaxed" style={{ color: "var(--ink-60)" }}>
              {copy.scan.lede}
            </p>

            {/* Install row */}
            <div
              className="flex w-fit max-w-full items-stretch overflow-hidden rounded-[var(--radius-sm)] border"
              style={{ borderColor: "var(--border-soft)", background: "var(--bg-card)" }}
              role="group"
              aria-label="Install command"
            >
              <span className="inline-flex items-center border-r px-3 font-mono text-[13.5px]" style={{ color: "var(--ink-45)", borderColor: "var(--hairline)" }}>$</span>
              <code className="flex-1 whitespace-nowrap px-3.5 py-3 font-mono text-[13.5px]" style={{ color: "var(--fg-strong)" }}>
                <span className="font-semibold" style={{ color: "var(--color-brand)" }}>{copy.scan.install}</span>
              </code>
              <CopyButton text={copy.scan.install} />
            </div>

            {/* Asserts */}
            <div className="mt-5 grid gap-y-1.5 font-mono text-xs" style={{ gridTemplateColumns: "auto 1fr", columnGap: "10px", color: "var(--ink-60)" }}>
              {copy.scan.asserts.map((a, i) => (
                <span key={i} className="contents">
                  <span className="font-bold" style={{ color: "var(--color-brand)" }}>✓</span>
                  <span>{a}</span>
                </span>
              ))}
            </div>

            {/* Thread */}
            <SectionThread
              segments={[copy.scanThread.before, copy.scanThread.after]}
              link={{ href: copy.scanThread.href, label: copy.scanThread.cta }}
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
