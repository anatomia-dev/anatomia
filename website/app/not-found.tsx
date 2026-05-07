import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center" style={{ background: "var(--bg)" }}>
      <div className="text-center">
        <p
          className="font-mono text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--ink-45)" }}
        >
          404
        </p>
        <h1
          className="mt-3 text-2xl font-semibold tracking-tight"
          style={{ color: "var(--fg-strong)" }}
        >
          Page not found
        </h1>
        <p className="mt-3 text-sm" style={{ color: "var(--ink-60)", maxWidth: "36ch" }}>
          The page you&rsquo;re looking for doesn&rsquo;t exist yet.
          It might be coming soon.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
          style={{
            background: "var(--color-brand)",
            color: "var(--color-brand-ink)",
          }}
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
