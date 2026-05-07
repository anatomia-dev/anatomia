import type { Metadata } from "next";
import { Contact } from "@/components/contact/Contact";

export const metadata: Metadata = {
  title: "Contact · Anatomia",
  description:
    "Two ways to reach us — GitHub for the fast lane, email for everything else.",
  openGraph: {
    images: [{ url: "/og/og-contact.png", width: 1200, height: 630 }],
  },
};

export default function ContactPage() {
  return (
    <main id="main" className="relative pt-[140px] pb-24">
      <Contact />
    </main>
  );
}
