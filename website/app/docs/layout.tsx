import type { ReactNode } from "react";
import { DocsNav } from "@/components/docs/layout/DocsNav";
import { Sidebar } from "@/components/docs/layout/Sidebar";
import { DocsErrorBoundary } from "@/components/docs/layout/DocsErrorBoundary";
import { PlatformProvider } from "@/components/docs/providers/PlatformProvider";
import "./docs.css";

/**
 * Docs layout — three-column grid shell.
 * Sidebar (248px) + Content (flexible) + Right Rail (220px).
 * DocsNav is sticky 58px. Responsive collapse at 1180px and 880px.
 *
 * Note: RightRail is rendered in the page component (not here) because
 * it needs access to page-level TOC data that the layout doesn't have.
 */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <PlatformProvider>
      <div className="docs-layout">
        <DocsNav />
        <div className="flex">
          <Sidebar />
          <main className="min-w-0 flex-1" style={{ padding: "32px 40px 96px" }}>
            <DocsErrorBoundary>
              {children}
            </DocsErrorBoundary>
          </main>
        </div>
      </div>
    </PlatformProvider>
  );
}
