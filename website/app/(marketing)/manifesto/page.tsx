import type { Metadata } from "next";
import { Manifesto } from "@/components/manifesto/Manifesto";

export const metadata: Metadata = {
  title: "Manifesto · Anatomia",
  description:
    "Code should come with proof. A short note on why Anatomia exists.",
  openGraph: {
    images: [{ url: "/og/og-manifesto.png", width: 1200, height: 630 }],
  },
};

export default function ManifestoPage() {
  return (
    <main id="main" className="relative pt-[140px] pb-24">
      <Manifesto />
    </main>
  );
}
