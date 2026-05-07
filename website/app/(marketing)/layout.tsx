import type { ReactNode } from "react";
import { Nav } from "@/components/nav/Nav";
import { Footer } from "@/components/footer/Footer";

/**
 * Marketing layout — Nav + Footer wrapper.
 * All public marketing pages render inside this.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      {children}
      <Footer />
    </>
  );
}
