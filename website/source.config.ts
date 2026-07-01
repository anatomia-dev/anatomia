import { defineDocs, defineConfig, frontmatterSchema } from "fumadocs-mdx/config";
import { rehypeCode } from "fumadocs-core/mdx-plugins/rehype-code";
import { z } from "zod";

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: frontmatterSchema.extend({
      description: z.string().min(1),
      readingTime: z.number().optional(),
    }),
  },
});

/**
 * Custom Shiki transformer that preserves the language as a
 * data-language attribute on the <pre> element.
 * rehypeCode/Shiki strips the language info by default.
 */
const transformerPreserveLanguage = {
  name: "preserve-language",
  pre(node: { properties: Record<string, unknown> }) {
    // 'this.options.lang' is set by Shiki with the code fence language
    const lang = (this as unknown as { options: { lang: string } }).options?.lang;
    if (lang) {
      node.properties["data-language"] = lang;
    }
  },
};

export default defineConfig({
  mdxOptions: {
    rehypePlugins: [
      [
        rehypeCode,
        {
          // Docs code blocks are dark on both light + dark pages (T4 dark
          // terminal — mirrors the marketing hero terminal). A single dark
          // Shiki theme colors tokens for a dark surface unconditionally.
          themes: { light: "github-dark", dark: "github-dark" },
          transformers: [transformerPreserveLanguage],
        },
      ],
    ],
  },
});
