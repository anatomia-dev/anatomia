/**
 * lib/copy.ts
 * ==================================================================
 * Single source of truth for every user-visible string on the site.
 *
 * Why this exists:
 *   - Non-developers can open ONE file and ctrl-F any string on the site.
 *   - String changes become one-line diffs, easy to review.
 *   - Typed: TS will flag missing keys the moment you try to render them.
 *
 * Usage in a component:
 *
 *     import { copy } from "@/lib/copy";
 *     <h1>{copy.hero.headline}</h1>
 *
 * Format conventions:
 *   - *word*   → emphasis (<em>) via <Formatted> or splitHeadline()
 *   - **word** → strong (<strong>) via <Formatted>
 *   - `word`   → code (<code>) via <Formatted>
 *
 * NOTE: Version, hash, and "ago" fields in nav/hero/footer are NOT
 * hardcoded here — they come from getProofFeed() so that wiring
 * mock → real data is a one-function change. See lib/proof-feed.ts.
 * ==================================================================
 */

export const copy = {
  meta: {
    title: "Anatomia — Verified AI development",
    description:
      "Your AI doesn't know your codebase. Ana does. Four sealed agents, one verified diff.",
    siteUrl: "https://anatomia.dev",
  },

  nav: {
    brand: "anatomia",
    links: [
      { label: "Pipeline", href: "/#system" },
      { label: "Proof", href: "/#proof" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Docs", href: "/docs" },
    ],
    ctaInstall: "Install",
    ctaInstallHref: "https://www.npmjs.com/package/anatomia-cli",
    githubUrl: "https://github.com/TettoLabs/anatomia",
  },

  hero: {
    eyebrow: {
      tag: "New",
      feature:
        "*Proof chains* are live — every change now ships with receipts.",
    },
    headline: "Your AI doesn't know your codebase. *ana* does.",
    subhead:
      "You shipped fast. The codebase is 80% AI-generated. *ana* gives you the senior engineer you don\u2019t have time to hire \u2014 generated from your code, not your intentions.",
    ctas: {
      primary: { label: "Install", command: "npx anatomia-cli init", href: "https://www.npmjs.com/package/anatomia-cli" },
      secondary: { label: "See the pipeline", href: "#system" },
    },
    meta: [
      "MIT License",
      "Works with any AI tool",
      "5 languages parsed",
      "Zero vendor lock-in",
    ],
    scrollHint: { start: "Scroll", end: "See how" },
  },

  scan: {
    eyebrow: "Start here · free, local, 2–5s",
    title: "Before you install anything, run *ana\u00a0scan*.",
    lede:
      "One command reads your codebase — stack, architecture, git tempo, hot files, docs, secrets. If what Ana finds surprises you, keep going.",
    install: "npx anatomia-cli scan",
    asserts: [
      "Zero config. No account. Nothing leaves your machine.",
      "Stack, auth, AI, payments, deploy — detected in seconds.",
      "Keep going or stop here. The scan is yours either way.",
    ],
  },

  scanThread: {
    before: "What Ana finds",
    after: "feeds the system.",
    cta: "See how ↓",
    href: "#system",
  },

  system: {
    eyebrow: "The system",
    title: "Scan reads. *init* ships.",
    lede: "`ana init` takes the scan and ships a complete development system into your repo. Agents that follow your conventions. Skills matched to your stack. A CLI they use as a toolbelt.",
    specStrip: [
      { label: "format", value: "markdown" },
      { label: "lock-in", value: "zero" },
      { label: "ships", value: "5 agents" },
      { label: "skills", value: "8 matched" },
      { label: "context", value: "4 files" },
      { label: "cli", value: "25 commands" },
      { label: "install", value: "~3s" },
    ],
    drawers: [
      {
        id: "agents",
        num: "01",
        name: "Agents",
        teaser: "five sealed roles · markdown agents in your repo",
        meta: "5 agents",
        copy: [
          "Init ships **five specialized agents** as markdown templates in your repo. Each has a role, a toolset, and an independence guarantee.",
          "Think doesn't implement. Build doesn't verify. **Verify never reads Build's self-report.** Two agents, two accounts of the same work.",
        ],
        tree: {
          root: "your-repo/",
          folder: ".claude/agents/",
          count: "5 files",
          files: [
            { name: "ana", ext: ".md", anno: "scopes work, surfaces tradeoffs" },
            { name: "ana-plan", ext: ".md", anno: "writes spec + sealed contract" },
            { name: "ana-build", ext: ".md", anno: "implements, tags every test" },
            { name: "ana-verify", ext: ".md", anno: "fault-finds independently" },
            { name: "ana-learn", ext: ".md", anno: "tends quality between cycles" },
          ],
        },
      },
      {
        id: "skills",
        num: "02",
        name: "Skills",
        teaser: "rules matched to your stack · not generic advice",
        meta: "8 skills",
        copy: [
          "The scan detected your stack. Init turns that into **rules your agents follow** — coding standards for your framework, testing patterns for your test runner, deployment rules for your CI.",
          "Not generic advice. Your dependencies, your patterns, your conventions.",
        ],
        tree: {
          root: "your-repo/",
          folder: ".claude/skills/",
          count: "8 skills",
          files: [
            { name: "coding-standards/", anno: "TypeScript strict" },
            { name: "testing-standards/", anno: "Vitest" },
            { name: "api-patterns/", anno: "Next.js App Router" },
            { name: "data-access/", anno: "Prisma · PostgreSQL" },
            { name: "deployment/", anno: "Vercel · GitHub Actions" },
            { name: "ai-patterns/", anno: "Anthropic SDK" },
            { name: "git-workflow/", anno: "conventional commits" },
            { name: "troubleshooting/", anno: "logs · errors · proof findings" },
          ],
        },
      },
      {
        id: "context",
        num: "03",
        name: "Context",
        teaser: "project memory, not chat memory · persists across sessions",
        meta: "4 files",
        copy: [
          "**Project memory, not chat memory.** Architecture, conventions, design principles — files your agents read on every task.",
          "Persists across sessions because it's files in your repo, not conversation history. Enriched through setup. Compounded by the proof chain.",
        ],
        tree: {
          root: "your-repo/",
          folder: ".ana/",
          count: "4 files",
          nested: [
            {
              folder: "context/",
              files: [
                { name: "project-context", ext: ".md", anno: "architecture, decisions" },
                { name: "design-principles", ext: ".md", anno: "craft convictions" },
              ],
            },
          ],
          files: [
            { name: "scan", ext: ".json", anno: "structured scan output" },
            { name: "ana", ext: ".json", anno: "CLI configuration" },
          ],
        },
      },
      {
        id: "cli",
        num: "04",
        name: "The CLI",
        teaser: "deterministic commands · the system's hands, human or agent",
        meta: "25 commands",
        copy: [
          "The agent toolbelt. And yours. Every step is a single command — **deterministic, mechanical, the same whether a human runs it or an agent does.**",
          "This is what makes it a system, not a prompting tool. Without the CLI, the markdown is only suggestions. With it, the system has hands.",
        ],
        manPage: {
          commands: [
            { cmd: "scan", desc: "read the repo, write scan.json" },
            { cmd: "work start", desc: "claim work, start the clock" },
            { cmd: "work status", desc: "track in-flight work" },
            { cmd: "artifact save", desc: "record, hash, sign" },
            { cmd: "pr create", desc: "package the run" },
            { cmd: "proof health", desc: "quality trajectory across runs" },
          ],
          moreCount: 19,
          moreNames: "init, setup, verify, proof, agents",
        },
      },
    ],
    closer: {
      text: "That's the system. Next: **the proof**.",
      href: "#proof",
    },
  },

  proof: {
    eyebrow: "The proof",
    title: "Every run ships with *receipts*.",
    lede: "Every pipeline run produces a sealed record \u2014 **what was asserted before code was written, what the verifier found independently, and what shipped.** PASS doesn\u2019t mean perfect. It means verified and honestly assessed.",
    specPrompt: "$ ana proof add-stripe-webhooks",
    specStrip: [
      { label: "contract", value: "sealed" },
      { label: "artifact", value: "hash-signed" },
      { label: "chain", value: "append-only" },
    ],
    ledgerRubric: {
      left: "Proof \u00b7 126 of 126",
      right: "2026\u00b704\u00b729",
    },
    card: {
      pile: [
        { id: "120", date: "2026 \u00b7 04 \u00b7 11" },
        { id: "121", date: "2026 \u00b7 04 \u00b7 17" },
        { id: "122", date: "2026 \u00b7 04 \u00b7 19" },
        { id: "123", date: "2026 \u00b7 04 \u00b7 22" },
        { id: "124", date: "2026 \u00b7 04 \u00b7 24" },
        { id: "125", date: "2026 \u00b7 04 \u00b7 26" },
      ],
      meta: {
        entry: "Proof \u00b7 126",
        of: "of 126",
        date: "2026 \u00b7 04 \u00b7 29 \u00b7 11:07",
      },
      sealGlyph: "A",
      title: "Add Stripe Webhooks",
      subjectPrefix: "subject \u00b7",
      subjectSlug: "add-stripe-webhooks",
      subjectSuffix: "\u00b7 commit 7d3a91",
      result: {
        label: "Pass",
        detail: "21 / 21 satisfied \u00b7 0 unsatisfied \u00b7 0 deviated",
      },
      assertionsShown: 6,
      assertionsTotal: 21,
      assertions: [
        "Webhook endpoint verifies <code>Stripe-Signature</code> before any handler runs.",
        "Duplicate event delivery does not create duplicate records.",
        "Failed signature check returns <code>400</code>, not <code>500</code>.",
        "Webhook secret is read from environment, not hardcoded.",
        "Migration adds <code>idempotency_key</code> with a unique constraint.",
        "Existing checkout and billing portal flows pass without modification.",
      ],
      moreSealed: 15,
      findingsLabel: "noticed, not in scope \u00b7",
      findingsCount: 3,
      findings: [
        {
          level: "Risk \u00b7 scope",
          body: "Signature verification uses direct string comparison \u2014 <em>timing-safe equality</em> is not enforced.",
        },
        {
          level: "Debt \u00b7 scope",
          body: "No retry mechanism for failed event processing \u2014 transient database errors will drop events silently.",
        },
        {
          level: "Obs. \u00b7 monitor",
          body: "Handler is 340 lines with a switch that will grow with every new event type.",
        },
      ],
      timing: [
        { label: "Total", value: "52m" },
        { label: "Think", value: "4m" },
        { label: "Plan", value: "15m" },
        { label: "Build", value: "22m" },
        { label: "Verify", value: "11m" },
      ],
      signatureLabel: "AnaVerify",
      signatureHash: "7d3a \u00b7 e1f9",
    },
    chain: {
      title: "Proof chain",
      count: 126,
      countLabel: "pipeline runs",
      pattern: [
        "G","R","Y","G","G","R","Y","G","G","Y",
        "G","G","R","G","Y","G","G","Y","G","G",
        "G","G","G","Y","G","G","G","G","Y","G",
        "G","G","G","G","G","Y","G","G","G","G",
        "G","G","R","R","G","G","G","G","Y","G",
        "G","G","G","G","G",
      ],
      footLeft: "last 55 proofs",
      footRight: "proof 126 \u2193",
      stats: [
        { label: "First-pass rate", value: "82", unit: "%", trend: "\u2191 4% last month" },
        { label: "Assertions verified", value: "2,214" },
        { label: "Findings surfaced", value: "683" },
        { label: "Risks caught", value: "41" },
        { label: "Promoted to rules", value: "6" },
      ],
      legend: [
        { color: "pass", label: "Pass" },
        { color: "warn", label: "Pass \u00b7 risk found" },
        { color: "fail", label: "Fail \u00b7 sent back" },
      ],
    },
    closer: "**126 sealed.** The chain is the moat.",
  },

  systemThread: {
    before: "That's the system. Next:",
    cta: "the proof",
    href: "#proof",
  },

  marquee: {
    title: "Works with any AI tool",
    items: [
      "Claude Code", "Cursor", "Codex", "Windsurf", "Copilot", "Cline",
    ],
  },

  bento: {
    heading: {
      eyebrow: "How it works",
      title: "Four agents. Four artifacts. No one grades their own work.",
    },

    pipeline: {
      num: "01 / 04",
      label: "The pipeline",
      steps: ["Think", "Plan", "Build", "Verify"],
      prose:
        "Ana scopes. Plan designs. Build implements honestly. Verify's disposition is fault-finding — a report with zero findings means it didn't look hard enough.",
      stats: [
        { v: "< 8m", l: "median cycle" },
        { v: "100%", l: "specs verified" },
        { v: "0", l: "context leaks" },
      ],
      stages: [
        { n: "01", name: "ana", sub: "scopes the work" },
        { n: "02", name: "ana-plan", sub: "writes the spec" },
        { n: "03", name: "ana-build", sub: "implements honestly" },
        { n: "04", name: "ana-verify", sub: "fault-finds independently" },
      ],
      artifacts: [
        { key: "scope.md", val: "—" },
        { key: "spec.md + contract.yaml", val: "—" },
        { key: "build_report.md", val: "—" },
        { key: "verify_report.md", val: "—" },
      ],
    },

    scan: {
      num: "02", label: "Scan",
      title: "Ana reads your source. Not your README.",
      body: "Tree-sitter parses functions, imports, conventions across 5 languages. Every claim traced to file and line.",
      cells: [
        { v: "30s", l: "avg scan" },
        { v: "18+", l: "patterns" },
        { v: "5", l: "languages" },
        { v: "0", l: "guesses" },
      ],
    },

    proof: {
      num: "03", label: "Sealed contracts",
      title: "Tagged tests. Proven assertions.",
      body: "Plan seals a contract of assertions (A001, A002…). Build tags every test with the ID it satisfies. Verify checks the tags match the claims.",
      card: {
        id: "proof · #a3f9c1",
        status: "verified",
        rows: [
          { k: "spec", v: "parser-idempotent" },
          { k: "assertions", v: "6 / 6 passed" },
          { k: "cycles", v: "1" },
          { k: "duration", v: "4m 12s" },
        ],
      },
    },

    agents: {
      num: "04", label: "Agents",
      title: "Walled off by design.",
      body: "Verify reads the spec and the source — never Build's self-report. Two agents, two accounts of the same work. You compare the diff.",
      chips: [
        { n: "THINK", name: "ana", role: "reads · asks · scopes" },
        { n: "PLAN", name: "ana-plan", role: "specs · contracts" },
        { n: "BUILD", name: "ana-build", role: "implements · tests" },
        { n: "VERIFY", name: "ana-verify", role: "isolated · mechanical" },
      ],
    },

    diff: {
      num: "05", label: "Verify",
      title: "Mechanical, not vibes.",
      body: "Verify asserts the spec against source. No LLM grades its own code.",
      lines: [
        { kind: "minus", code: "expect(result).toBeDefined();" },
        { kind: "plus", code: "// @ana A001 — response.status === 200" },
      ],
      foot: { file: "parser-idempotent.spec.ts", pass: "6 / 6 ✓" },
    },

    compat: {
      num: "06", label: "Compatibility",
      title: "Works with your AI. Not against it.",
      body: "Standard markdown. Git-tracked. Zero lock-in. Claude Code gets native pipeline integration — any tool that reads markdown gets the intelligence.",
      chips: [
        "Claude Code", "Cursor", "Codex", "Windsurf", "Copilot", "Cline",
      ],
      catchChip: "+ any markdown-aware tool",
    },
  },

  pricing: {
    eyebrow: "Pricing",
    title: "Open source. Free forever.",
    blurb:
      "Anatomia is MIT-licensed. Every line on GitHub. The team edition adds a network \u2014 your agents get smarter from every team that ships with Anatomia.",
    plans: [
      {
        name: "Free",
        flag: "Open source",
        price: "$0",
        sub: "forever · MIT License",
        features: [
          "Full pipeline · think · plan · build · verify · learn",
          "Local proof chain · sealed and git-tracked",
          "Findings on every run · risks · debt · observations",
          "Skills matched to your stack · not generic advice",
          "Works with any AI tool · no lock-in",
        ],
        cta: { label: "Install", command: "npx anatomia-cli init", href: "https://www.npmjs.com/package/anatomia-cli" },
      },
      {
        name: "Team",
        flag: "Beta · waitlist",
        price: "$24",
        priceUnit: "/seat",
        sub: "hosted · coming Q3 2026",
        highlighted: true,
        features: [
          "Everything in Free",
          "Proof cards · a URL for every verified change",
          "Team visibility · Slack · GitHub PRs",
          "Hosted backlog · queue, build, verify",
          "Collective intelligence · the network learns",
        ],
        // TODO: Replace with waitlist form URL when available
        cta: { label: "Join the waitlist", href: "/contact" },
      },
    ],
  },

  proofFeed: {
    kicker: "Ship log",
    headTitle: "Our *proofs*.",
    headSub: "",
  },

  docs: {
    eyebrow: "Docs · Quickstart",
    title: "Get a *proof chain* in your repo.",
    lede:
      "Five minutes, four commands, no account. Anatomia runs locally against any Git repository and emits a signed proof for every change a model makes. This page walks the smallest useful path end-to-end — enough to see what the pipeline gives you before you commit to anything bigger.",
    install: {
      tag: "Install",
      reqs: "Requires Node 22+ and Git",
      commands: ["npx anatomia-cli init", "npm i -g anatomia-cli", "ana init"],
      reqNote: "macOS, Linux, Windows (WSL). No data leaves your machine by default.",
    },
    sectionRule: { walkthrough: "Walkthrough · ~5 minutes", next: "Where to next" },
    steps: [
      {
        num: "i",
        title: "Initialize the pipeline in your repo.",
        body:
          "Run `anatomia init` from the root of a Git repository. It writes an `.anatomia/` directory containing the pipeline config, the default agent set, and a local proof store. Nothing is pushed; nothing calls out.",
        outSourceRef: "pages/docs.html — step 1 output block",
      },
      {
        num: "ii",
        title: "Describe the change you want.",
        body:
          "Pipeline runs start with an *intent* — a short description of what you want changed. The planner reads your codebase and emits a plan, a set of assertions, and a list of files it expects to touch. You approve the plan before any code is written.",
        callout: {
          kind: "Tip",
          body:
            "You can edit assertions before approving — they become the contract the verifier checks at the end. More specific assertions, tighter proofs.",
        },
        outSourceRef: "pages/docs.html — step 2 output block",
      },
      {
        num: "iii",
        title: "Run the pipeline.",
        body:
          "`anatomia run` executes the approved plan through all four stages: *plan → write → test → verify*. Each stage emits a proof artifact. If any stage fails, the run halts and nothing is written to your working tree.",
        outSourceRef: "pages/docs.html — step 3 output block",
      },
      {
        num: "iv",
        title: "Inspect the proof, then commit.",
        body:
          "`anatomia show` prints the full chain for a given proof — intent, plan, diff, test output, verifier verdict. The verifier signs the final verdict so it can't be rewritten after the fact. Everything is plain text and lives in `.anatomia/proofs/`; commit the ones you want kept.",
        outSourceRef: "pages/docs.html — step 4 output block",
      },
    ],
    recap: {
      title: "What you just shipped.",
      body:
        "A real code change, a set of tests that ran green, and a signed verdict that the change does what you asked for. Those four artifacts are the *proof chain*. When you push, reviewers can replay it with `anatomia show` and see exactly what the model did and why the verifier accepted it.",
      tail: "You don't have to keep every proof. The ones you commit become part of your history; the rest are local.",
    },
    next: [
      { title: "CLI reference", status: "Coming soon", desc: "Every command, every flag, every config key. The boring but complete version of this page.", href: "/cli" },
      { title: "Examples", status: "Coming soon", desc: "A dozen worked changes with their proof chains — rate limits, schema migrations, refactors, bugfixes.", href: "/examples" },
      { title: "Writing assertions", status: "Draft", desc: "How to turn informal intent into assertions the verifier can actually check. The highest-leverage skill.", href: "/docs" },
      { title: "Custom agents", status: "Draft", desc: "Swap in your own planner, writer, or verifier. The pipeline is stages, not models; any model that honors the contracts fits.", href: "/docs" },
    ],
    coda: "Stuck? Open an issue on GitHub or email hello@anatomia.dev.",
  },

  manifesto: {
    eyebrow: "Manifesto",
    title: "Code should come with *proof*.",
    body: [
      "AI writes more of our code every month, and most of it arrives naked — a diff, a confident summary, no evidence. We read it, nod, and merge. The promise is speed. The hidden price is a codebase nobody can vouch for, least of all the model that wrote it.",
      "Anatomia is a small bet against that trade. Every change the pipeline ships arrives with a *proof chain*: the intent that produced it, the plan the model followed, the assertions it committed to, the tests it ran, and the verifier\u2019s signed verdict. You don\u2019t have to trust the model. You read the chain.",
    ],
    pull:
      "The future isn\u2019t AI that writes more code. It\u2019s AI that writes code you can actually stand behind.",
    bodyAfterPull: [
      "We\u2019re not trying to slow anyone down. Proofs are *cheap* when they\u2019re built into the pipeline; it\u2019s reviewing opaque code that\u2019s expensive. The whole point is that a verified change goes in without a human re-reading every line. Speed comes from trust, and trust has to come from somewhere real.",
      "Everything we build is open source, MIT-licensed, and runnable on your own machine. You can read the verifier. You can fork the pipeline. The proof is in the code, not in our word for it — which is how it should be.",
      "That\u2019s the whole idea. The rest is execution.",
    ],
    signature: { who: "— Anatomia", when: "Written April 2026" },
    outbound: [
      { label: "See the pipeline", href: "/#system" },
      { label: "Get in touch", href: "/contact" },
    ],
  },

  contact: {
    eyebrow: "Contact",
    title: "Two ways to reach *us*.",
    lede:
      "Anatomia is open source and developed in public, so most conversations happen on GitHub. For anything that doesn\u2019t belong in an issue — a long note, a security finding, a press question — email works. *We read everything.*",
    channels: [
      {
        kind: "GitHub",
        addr: "github.com/TettoLabs/anatomia",
        href: "https://github.com/TettoLabs/anatomia",
        note:
          "Bug reports, pull requests, feature discussions, RFCs. *The fastest way to get a real answer* — issues are triaged a few times a week.",
      },
      {
        kind: "Email",
        addr: "hello@anatomia.dev",
        href: "mailto:hello@anatomia.dev",
        note:
          "Everything else. Security reports, partnership questions, a long note you wanted to send. We reply within a few business days, sometimes faster.",
      },
    ],
    coda: ["Based in Denver.", "Mon–Fri, normal hours."],
  },

  changelog: {
    eyebrow: "Changelog",
    title: "What\u2019s *new*.",
    entries: [
      {
        version: "v1.0.2",
        date: "May 2026",
        items: [
          "Worktree isolation \u2014 concurrent agents, each in their own git index.",
          "Rejection artifact preservation \u2014 git-history extraction at save time.",
          "Non-main artifact branch support with 8 new tests.",
        ],
      },
      {
        version: "v1.0.1",
        date: "April 2026",
        items: [
          "Phase timing with sanity guards and danger map risk profile.",
          "Code comment cleanup \u2014 286 internal references removed across 97 files.",
        ],
      },
      {
        version: "v1.0.0",
        date: "April 2026",
        items: [
          "Initial public release.",
          "CLI UX polish \u2014 command grouping, jargon-free descriptions, help examples.",
          "Full pipeline: think, plan, build, verify.",
        ],
      },
    ],
  },

  cliRef: {
    eyebrow: "CLI Reference",
    title: "Every command, every *flag*.",
    body: "The complete CLI reference is coming soon. In the meantime, run `anatomia --help` for a full list of commands, or browse the source on GitHub.",
    githubHref: "https://github.com/TettoLabs/anatomia",
  },

  examples: {
    eyebrow: "Examples",
    title: "Worked changes with *proof*.",
    body: "Example proof chains are coming soon. Each will walk through a real change \u2014 the intent, the plan, the contract, the build, and the verification \u2014 so you can see what the pipeline produces end to end.",
  },

  about: {
    eyebrow: "About",
    title: "One *idea*. Shipped with proof.",
    body: [
      "Anatomia started with a simple observation: AI writes more code every month, and almost none of it arrives with evidence. A diff, a confident summary, no proof. We thought that was a solvable problem.",
      "We\u2019re based in Denver and built Anatomia because we wanted to ship AI-written code we could actually stand behind \u2014 not code we hoped was correct. The pipeline exists to make that possible: four agents, four artifacts, mechanical verification.",
      "Everything is open source, MIT-licensed, and runs on your machine. We believe the best way to earn trust is to make the proof readable.",
    ],
  },

  license: {
    eyebrow: "License",
    title: "MIT \u2014 free *forever*.",
    body: `MIT License

Copyright (c) 2026 TettoLabs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
  },

  footer: {
    brand: "anatomia",
    tagline: "Ship with *proof*.",
    blurb:
      "A four-stage pipeline for AI-written code. Built for teams who want their AI to prove it, not promise it. MIT-licensed.",
    status: "All systems nominal",
    columns: [
      {
        title: "Product",
        links: [
          { label: "Pipeline", href: "/#system" },
          { label: "Agents", href: "/#system" },
          { label: "Pricing", href: "/#pricing" },
          { label: "Changelog", href: "/changelog" },
        ],
      },
      {
        title: "Developers",
        links: [
          { label: "Docs", href: "/docs" },
          { label: "GitHub", href: "https://github.com/TettoLabs/anatomia" },
          { label: "CLI reference", href: "/cli" },
          { label: "Examples", href: "/examples" },
        ],
      },
      {
        title: "Company",
        links: [
          { label: "About", href: "/about" },
          { label: "Manifesto", href: "/manifesto" },
          { label: "Contact", href: "/contact" },
          { label: "MIT License", href: "/license" },
        ],
      },
    ],
    legal: "\u00a9 2026 Anatomia \u00b7 MIT",
  },
} as const;

export type Copy = typeof copy;
