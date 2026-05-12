import Link from "next/link";

interface BreadcrumbSegment {
  name: string;
  url?: string;
}

interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
}

/**
 * Breadcrumb — renders page position in tree.
 * Each segment is a link except the last (current page).
 */
export function Breadcrumb({ segments }: BreadcrumbProps) {
  if (segments.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1.5 font-mono text-[12px]" style={{ color: "var(--ink-45)" }}>
        <li>
          <Link href="/docs" className="transition-colors duration-100 hover:underline" style={{ color: "var(--ink-45)" }}>
            Docs
          </Link>
        </li>
        {segments.map((segment, i) => {
          const isLast = i === segments.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5">
              <span style={{ color: "var(--ink-15)" }}>/</span>
              {isLast || !segment.url ? (
                <span style={{ color: "var(--ink-60)" }}>{segment.name}</span>
              ) : (
                <Link href={segment.url} className="transition-colors duration-100 hover:underline">
                  {segment.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
