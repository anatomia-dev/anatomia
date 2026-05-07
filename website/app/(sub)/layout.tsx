import type { ReactNode } from "react";
import { Footer } from "@/components/footer/Footer";

/**
 * Sub-page layout — SubNav + Footer.
 * SubNav is rendered by each page (passing `current` prop).
 * Footer is shared.
 */
export default function SubPageLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Footer />
    </>
  );
}
