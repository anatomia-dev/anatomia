import type { Metadata } from "next";
import { SubNav } from "@/components/sub-nav/SubNav";
import { DocsHero } from "@/components/docs/DocsHero";
import { DocsSteps } from "@/components/docs/DocsSteps";
import { DocsRecap } from "@/components/docs/DocsRecap";
import { DocsNext } from "@/components/docs/DocsNext";

export const metadata: Metadata = {
  title: "Docs · Anatomia",
  description:
    "Quickstart: install, init, plan, run, verify. Get a proof chain in your repo in five minutes.",
};

export default function DocsPage() {
  return (
    <>
      <SubNav current="docs" />
      <main id="main" className="relative pt-[140px] pb-24">
        <div className="mx-auto max-w-[760px] px-2">
          <DocsHero />
          <DocsSteps />
          <DocsRecap />
          <DocsNext />
        </div>
      </main>
    </>
  );
}
