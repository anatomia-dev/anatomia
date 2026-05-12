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

const mdxComponents = {
  pre: CodeBlock,
  Callout,
  NextCards,
  StatsStrip,
  ForPlatform,
};

interface DocsPageProps {
  params: Promise<{ slug?: string[] }>;
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

  // Map TOC items to the format RightRail expects
  const tocItems = toc.map((item) => ({
    title: typeof item.title === "string" ? item.title : "",
    url: `#${item.url}`,
    depth: item.depth,
  }));

  return (
    <div className="flex gap-8">
      <article className="docs-prose min-w-0 flex-1">
        <Breadcrumb segments={segments} />
        <h1>{page.data.title}</h1>
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
        editUrl={`https://github.com/anatomia-dev/anatomia/edit/main/website/content/docs/${slug?.join("/") ?? "index"}.mdx`}
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

export function generateStaticParams(): { slug?: string[] }[] {
  return source.generateParams();
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
