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
      { label: "Pipeline", href: "/#pipeline" },
      { label: "Agents", href: "/#agents" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Docs", href: "/docs" },
    ],
    ctaInstall: "Install",
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
      "Four specialized agents. Four sealed artifacts. Ana scopes. Plan designs. Build implements and reports honestly. Verify forms an independent account — it never reads Build's report. You compare the two.",
    ctas: {
      primary: { label: "Install", command: "npx anatomia init", href: "#pricing" },
      secondary: { label: "See the pipeline", href: "#pipeline" },
    },
    meta: [
      "MIT License",
      "Works with Claude, Cursor, Codex",
      "5 languages parsed",
      "Zero vendor lock-in",
    ],
    scrollHint: { start: "Scroll", end: "See how" },
  },

  scan: {
    eyebrow: "Start here · free, local, 2–5s",
    title: "Before you install anything, run *ana scan*.",
    lede:
      "One command reads your codebase — stack, architecture, git tempo, hot files, docs, secrets. No account, no API key, nothing leaves your machine. If what Ana finds surprises you, keep going.",
    install: "npx anatomia scan",
    asserts: [
      "~20 signals across stack, git, docs & security",
      "Runs locally. No account. No cloud.",
      "Works standalone — pipeline optional.",
    ],
  },

  marquee: {
    items: [
      "Claude Code", "Cursor", "Codex", "Windsurf", "Zed",
      "GitHub Actions", "pnpm", "TypeScript", "Rust", "Python",
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
        "Claude Code", "Cursor", "Windsurf", "Codex", "Zed",
      ],
      catchChip: "+ any markdown-aware tool",
    },
  },

  pricing: {
    eyebrow: "Pricing",
    title: "Open source. Free forever.",
    blurb:
      "Anatomia is MIT-licensed. Every line on GitHub. If you ship with it and want hosted proofs, the team edition handles the rest.",
    plans: [
      {
        name: "Free",
        flag: "Open source",
        price: "$0",
        sub: "forever · MIT License",
        features: [
          "Full pipeline · think · plan · build · verify",
          "Local proof chain · git-tracked",
          "Context drift detection",
          "Configurable agents · pick your model",
          "Works with Claude, Cursor, Codex, Zed",
        ],
        cta: { label: "Install", command: "npx anatomia init", href: "/#pricing" },
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
          "Hosted proof chain · shareable URLs",
          "Team dashboard · drift alerts",
          "Parallel pipelines · shared context",
          "SSO · priority support",
        ],
        // TODO: Replace with waitlist form URL when available
        cta: { label: "Join the waitlist", href: "/contact" },
      },
    ],
  },

  proofFeed: {
    kicker: "Ship log",
    headTitle: "Every commit has *receipts*.",
    headSub:
      "This isn\u2019t a changelog. Each row is the verification record \u2014 the contract Plan wrote before the work began, with Verify\u2019s independent account stapled to it. The claims, the matchers, the pass/fail \u2014 all there.",
    footSource: "github.com/TettoLabs/anatomia/commits",
    footLink: { label: "Full history \u2192", href: "https://github.com/TettoLabs/anatomia/commits/main" },
  },

  docs: {
    eyebrow: "Docs · Quickstart",
    title: "Get a *proof chain* in your repo.",
    lede:
      "Five minutes, four commands, no account. Anatomia runs locally against any Git repository and emits a signed proof for every change a model makes. This page walks the smallest useful path end-to-end — enough to see what the pipeline gives you before you commit to anything bigger.",
    install: {
      tag: "Install",
      reqs: "Requires Node 20+ and Git",
      commands: ["npx anatomia init", "npm i -g anatomia", "anatomia init"],
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
      { label: "See the pipeline", href: "/#pipeline" },
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
    coda: ["Based in San Francisco.", "Mon–Fri, normal hours."],
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
    title: "Two people. One *idea*.",
    body: [
      "Anatomia started with a simple observation: AI writes more code every month, and almost none of it arrives with evidence. A diff, a confident summary, no proof. We thought that was a solvable problem.",
      "We\u2019re a two-person team based in San Francisco. We built Anatomia because we wanted to ship AI-written code we could actually stand behind \u2014 not code we hoped was correct. The pipeline exists to make that possible: four agents, four artifacts, mechanical verification.",
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
          { label: "Pipeline", href: "/#pipeline" },
          { label: "Agents", href: "/#agents" },
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
