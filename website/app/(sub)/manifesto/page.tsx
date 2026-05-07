import type { Metadata } from "next";
import { SubNav } from "@/components/sub-nav/SubNav";
import { Manifesto } from "@/components/manifesto/Manifesto";

export const metadata: Metadata = {
  title: "Manifesto · Anatomia",
  description:
    "Code should come with proof. A short note on why Anatomia exists.",
};

export default function ManifestoPage() {
  return (
    <>
      <SubNav current="manifesto" />
      <main id="main" className="relative pt-[140px] pb-24">
        <Manifesto />
      </main>
    </>
  );
}
