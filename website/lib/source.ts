import { loader } from "fumadocs-core/source";
import { docs } from "collections/server";

/**
 * Page tree transformer — restructures the sidebar into 5 folder groups:
 * Get Started, Concepts, Guides (from MDX), Reference, Proof Chain (injected).
 * All folders use the same dropdown pattern. Featured Proofs is a nested
 * folder inside Proof Chain.
 */
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  pageTree: {
    transformers: [
      {
        root(node) {
          // Find and remove the Quickstart page from top-level children
          const startIndex = node.children.findIndex(
            (c) => c.type === "page" && c.url === "/docs/start",
          );
          const startNode =
            startIndex >= 0 ? node.children.splice(startIndex, 1)[0] : null;

          // Insert "Get Started" as a static group at the very top:
          // separator label + Overview + Quickstart (no folder, no collapse)
          const getStartedItems: typeof node.children = [
            { type: "separator", name: "Get Started" },
            { type: "page", name: "Overview", url: "/docs" },
          ];
          if (startNode) {
            getStartedItems.push(startNode as (typeof node.children)[number]);
          }
          node.children.unshift(...getStartedItems);

          // Append Reference and Proof Chain as folders
          node.children.push(
            // ── Reference ──
            {
              type: "folder",
              name: "Reference",
              defaultOpen: true,
              children: [
                { type: "page", name: "CLI Commands", url: "/docs/reference/cli-commands" },
                { type: "page", name: "Agent Templates", url: "/docs/reference/agent-templates" },
                { type: "page", name: "Skill Files", url: "/docs/reference/skill-files" },
                { type: "page", name: "Context Files", url: "/docs/reference/context-files" },
              ],
            },

            // ── Proof Chain ──
            {
              type: "folder",
              name: "Proof Chain",
              defaultOpen: true,
              children: [
                { type: "page", name: "Browse All", url: "/docs/proof" },
                {
                  type: "folder",
                  name: "Featured Proofs",
                  defaultOpen: false,
                  children: [
                    { type: "page", name: "security-hardening", url: "/docs/proof/security-hardening" },
                    { type: "page", name: "proof-promote", url: "/docs/proof/proof-promote" },
                    { type: "page", name: "worktree-isolation", url: "/docs/proof/worktree-isolation" },
                  ],
                },
              ],
            },
          );
          return node;
        },
      },
    ],
  },
});
