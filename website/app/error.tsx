"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center" style={{ background: "var(--bg)" }}>
      <div className="text-center">
        <p
          className="font-mono text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--ink-45)" }}
        >
          Error
        </p>
        <h1
          className="mt-3 text-2xl font-semibold tracking-tight"
          style={{ color: "var(--fg-strong)" }}
        >
          Something went wrong
        </h1>
        <p className="mt-3 text-sm" style={{ color: "var(--ink-60)" }}>
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
          style={{
            background: "var(--color-brand)",
            color: "var(--color-brand-ink)",
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
