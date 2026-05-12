import { defineDocs, defineConfig, frontmatterSchema } from "fumadocs-mdx/config";
import { rehypeCode } from "fumadocs-core/mdx-plugins/rehype-code";
import { z } from "zod";

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: frontmatterSchema.extend({
      description: z.string(),
      lastReviewed: z.string().optional(),
      readingTime: z.number().optional(),
    }),
  },
});

export default defineConfig({
  mdxOptions: {
    rehypePlugins: [rehypeCode],
  },
});
