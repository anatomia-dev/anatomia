import type { ReactNode } from "react";

/**
 * Docs layout — minimal wrapper, no Nav/Footer.
 * Full docs shell (sidebar, navbar, right rail) is a separate scope.
 */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {children}
    </div>
  );
}
