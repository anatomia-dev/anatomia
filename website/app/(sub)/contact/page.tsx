import type { Metadata } from "next";
import { SubNav } from "@/components/sub-nav/SubNav";
import { Contact } from "@/components/contact/Contact";

export const metadata: Metadata = {
  title: "Contact · Anatomia",
  description:
    "Two ways to reach us — GitHub for the fast lane, email for everything else.",
};

export default function ContactPage() {
  return (
    <>
      <SubNav current="contact" />
      <main id="main" className="relative pt-[140px] pb-24">
        <Contact />
      </main>
    </>
  );
}
