import type { Metadata } from "next";
import { About } from "@/components/about/About";

export const metadata: Metadata = {
  title: "About · Anatomia",
  description:
    "AI made building easy. Understanding what you built is the hard part. The story behind Anatomia — why it exists, what drives it, and who\u2019s building it.",
};

export default function AboutPage() {
  return (
    <main id="main" className="relative pt-[140px] pb-24">
      <About />
    </main>
  );
}
