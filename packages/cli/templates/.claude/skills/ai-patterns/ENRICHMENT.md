<!-- Internal: read by ana-setup only. Not for manual editing. -->

# AI Patterns — Enrichment Guide

**Who reads this:** Only the setup agent during `ana-setup`. NOT read by Build, Plan, Verify, or Think.

**Purpose:** Build reads the skill file when implementing AI features. Plan references it when specs involve LLM integration.

## What to investigate (silent, before question)

Read: Search for the main AI integration file — grep for imports of the detected AI SDK (from `stack.aiSdk`). Read one file that makes LLM calls to see: wrapper pattern, streaming usage, error handling, prompt management.

Look for:
- Centralized AI client vs scattered SDK calls
- Streaming vs non-streaming (`streamText`, `StreamingTextResponse`, `stream()`)
- Structured output usage (`generateObject`, `response_format`, `tool_use`)
- Retry/timeout configuration
- Prompt template location: `prompts/` directory? inline strings? config file?
- Multiple provider support (Vercel AI SDK with multiple providers?)

Key off scan data: `stack.aiSdk` tells you the SDK. `externalServices` may list additional AI providers. Library rules may already be injected for the detected SDK.

## Question (asked during skill gate, loaded with investigation)

This is the ONE conditional skill that gets a dedicated question. Present what you found from code reading, then ask:

```
I found your AI integration using [SDK name]. [Observations — 
streaming detected/not, structured output usage, etc.]

One thing I couldn't determine from code: how do you manage prompts? 
Centralized in a directory, inline in handlers, or something else?
```

Write ai-patterns immediately after the answer. Combine code observations + library rules + human's prompt management answer.

## What to write

Write to: `## Rules` — add observations from code reading alongside template defaults. The template has 7 strong universal rules. Enrichment adds project-specific patterns.

**Important:** AI patterns vary enormously between projects. If code reading doesn't reveal clear patterns beyond what the template already covers, keep defaults. Don't fabricate project-specific rules from thin evidence.

## Skip conditions

Skip if: `stack.aiSdk` is null. Also skip the question (but still enrich from library rules) if no actual AI integration code is found — the SDK is in dependencies but unused.

## Expected output

0-2 rules added from code reading + 1 rule from prompt management answer. Flag ⚠ if AI integration is substantial but patterns are unclear.
