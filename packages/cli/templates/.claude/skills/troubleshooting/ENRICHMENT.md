<!-- Internal: read by ana-setup only. Not for manual editing. -->

# Troubleshooting — Enrichment Guide

**Who reads this:** Only the setup agent during `ana-setup`. NOT read by Build, Plan, Verify, or Think.

**Purpose:** Think and Build read the skill file when debugging failures.

## What to investigate (silent, before questions)

This skill grows primarily from real debugging experience, not from code reading. The common issues library already provides stack-matched entries during init.

During setup investigation, check:
- `documentation.files` for TROUBLESHOOTING.md, FAQ.md, KNOWN_ISSUES.md — if found, read and extract symptom/fix entries
- Cross-reference what you learned during project-context investigation: patterns that would confuse a new engineer are troubleshooting entries. Reframe as "If you see X, it's because Y. Fix: Z."
- Search for TODO, FIXME, HACK comments in source files — these often describe known issues

## Question (asked during skill gate, loaded with findings)

If you found diagnostic patterns during investigation, present them: "I noticed these patterns that could trip someone up: [findings]. Anything else that regularly trips people up?"

If nothing found, skip the question — say "Troubleshooting grows from real debugging — keeping the library defaults for now."

## What to write

Write to: `## Rules` — diagnostic patterns. Format each as: "**[symptom]** — [explanation]. Fix: [action]."

Don't duplicate entries already in `## Detected` (Common Issues). Don't fabricate — only write entries from real findings.

## Expected output

0-3 rules from investigation + human input. This section grows naturally from pipeline use, not primarily from setup.
