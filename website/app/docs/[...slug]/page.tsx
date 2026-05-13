import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { source } from "@/lib/source";
import { getBuildMeta } from "@/lib/docs-data/meta";
import { Breadcrumb } from "@/components/docs/layout/Breadcrumb";
import { RightRail } from "@/components/docs/layout/RightRail";
import { MetaRow } from "@/components/docs/content/MetaRow";
import { CodeBlock } from "@/components/docs/content/CodeBlock";
import { Callout } from "@/components/docs/content/Callout";
import { NextCards } from "@/components/docs/content/NextCards";
import { StatsStrip } from "@/components/docs/content/StatsStrip";
import { ForPlatform } from "@/components/docs/content/ForPlatform";
import { PipelineDiagram } from "@/components/docs/content/PipelineDiagram";
import { TroubleCard } from "@/components/docs/content/TroubleCard";

import { HeadingWithAnchor } from "@/components/docs/content/HeadingWithAnchor";

const mdxComponents = {
  pre: CodeBlock,
  h2: ({ children, id, ...props }: { children?: React.ReactNode; id?: string } & Record<string, unknown>) => (
    <HeadingWithAnchor level={2} id={id} {...props}>{children}</HeadingWithAnchor>
  ),
  Callout,
  NextCards,
  StatsStrip,
  ForPlatform,
  PipelineDiagram,
  TroubleCard,
};

interface DocsPageProps {
  params: Promise<{ slug: string[] }>;
}

export default async function DocsPage({ params }: DocsPageProps) {
  const { slug } = await params;
  const page = source.getPage(slug);

  if (!page) notFound();

  const MDXContent = page.data.body;
  const toc = page.data.toc ?? [];
  const meta = getBuildMeta();

  // Build breadcrumb segments from the page tree path
  const segments = buildBreadcrumb(slug);

  // Pass TOC items directly — RightRail accepts ReactNode titles
  const tocItems = toc.map((item) => ({
    title: item.title,
    url: item.url,
    depth: item.depth,
  }));

  return (
    <div style={{ display: "flex" }}>
      <article className="docs-prose docs-content-area min-w-0 flex-1" style={{ padding: "32px 120px 96px 40px" }}>
        <Breadcrumb segments={segments} />
        {/* Title — matches supermock h1.page-title */}
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 500,
            fontSize: "36px",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            marginBottom: "14px",
            textWrap: "balance",
            color: "var(--fg)",
          }}
        >
          {page.data.title}
        </h1>
        {/* Lede — matches supermock .lede */}
        {page.data.description && (
          <p
            style={{
              fontSize: "15.5px",
              lineHeight: 1.55,
              color: "var(--ink-75)",
              marginBottom: "24px",
              maxWidth: "62ch",
              textWrap: "pretty",
            }}
          >
            {page.data.description}
          </p>
        )}
        <MetaRow
          readingTime={page.data.readingTime}
          lastReviewed={page.data.lastReviewed}
        />
        <MDXContent components={mdxComponents} />
      </article>
      <RightRail
        toc={tocItems}
        commitSha={meta.commitSha}
        buildTimestamp={meta.buildTimestamp}
        editUrl={`https://github.com/TettoLabs/anatomia/edit/main/website/content/docs/${slug.join("/")}.mdx`}
      />
    </div>
  );
}

function buildBreadcrumb(slug?: string[]): { name: string; url?: string }[] {
  if (!slug || slug.length === 0) return [];

  return slug.map((segment, i) => ({
    name: segment
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
    url: i < slug.length - 1 ? `/docs/${slug.slice(0, i + 1).join("/")}` : undefined,
  }));
}

export function generateStaticParams(): { slug: string[] }[] {
  return source.generateParams().filter(
    (p) => Array.isArray(p.slug) && p.slug.length > 0,
  ) as { slug: string[] }[];
}

export async function generateMetadata({ params }: DocsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);

  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
