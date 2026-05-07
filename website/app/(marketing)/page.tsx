/**
 * Landing page — composition root.
 * Each section is its own component; this file only orders them.
 * Section order mirrors the handoff HTML:
 *   Hero → CompatMarquee → ScanSlab → Bento → DeepDive → Pricing
 *   → ProofFeed (between main and footer) → Footer (in layout)
 */
import { Hero } from "@/components/hero/Hero";
import { CompatMarquee } from "@/components/marquee/CompatMarquee";
import { ScanSlab } from "@/components/scan/ScanSlab";
import { Bento } from "@/components/bento/Bento";
import { DeepDive } from "@/components/deep/DeepDive";
import { Pricing } from "@/components/pricing/Pricing";
import { ProofFeed } from "@/components/proof-feed/ProofFeed";

export default function LandingPage() {
  return (
    <>
      <main id="main">
        <Hero />
        <CompatMarquee />
        <ScanSlab />
        <Bento />
        <DeepDive />
        <Pricing />
      </main>
      {/* ProofFeed sits between </main> and <Footer /> — bonded to footer when collapsed */}
      <ProofFeed />
    </>
  );
}
