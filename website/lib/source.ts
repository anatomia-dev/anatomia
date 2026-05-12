import { loader } from "fumadocs-core/source";
import { docs } from "collections/server";

/**
 * Page tree transformer — injects Reference and Proof Chain sections
 * into the sidebar tree. These sections link to routes that don't exist
 * yet (future content scopes) so they'll 404 until those scopes land.
 */
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  pageTree: {
    transformers: [
      {
        root(node) {
          node.children.push(
            // ── Reference ──
            { type: "separator", name: "Reference" },
            { type: "page", name: "CLI Commands", url: "/docs/reference/cli-commands" },
            { type: "page", name: "Agent Templates", url: "/docs/reference/agent-templates" },
            { type: "page", name: "Skill Files", url: "/docs/reference/skill-files" },
            { type: "page", name: "Context Files", url: "/docs/reference/context-files" },

            // ── Proof Chain ──
            { type: "separator", name: "Proof Chain" },
            { type: "page", name: "Browse All", url: "/docs/proof" },
            { type: "page", name: "Featured Proofs", url: "/docs/proof/featured" },
          );
          return node;
        },
      },
    ],
  },
});
