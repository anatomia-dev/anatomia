/**
 * Landing page — composition root.
 * Each section is its own component; this file only orders them.
 * Section order:
 *   Hero → CompatMarquee → ScanSlab → SystemSection → ProofSection → Pricing
 *   → ProofFeed (between main and footer) → Footer (in layout)
 */
import type { Metadata } from "next";
import { Hero } from "@/components/hero/Hero";
import { ScanSlab } from "@/components/scan/ScanSlab";
import { SystemSection } from "@/components/system/SystemSection";
import { ProofSection } from "@/components/proof/ProofSection";
import { Pricing } from "@/components/pricing/Pricing";
import { ProofFeed } from "@/components/proof-feed/ProofFeed";

export const metadata: Metadata = {
  openGraph: {
    images: [{ url: "/og/og-home.png", width: 1200, height: 630 }],
  },
};

export default function LandingPage() {
  return (
    <>
      <main id="main">
        <Hero />

        <ScanSlab />
        <SystemSection />
        <ProofSection />
        <Pricing />
      </main>
      {/* ProofFeed sits between </main> and <Footer /> — bonded to footer when collapsed */}
      <ProofFeed />
    </>
  );
}
