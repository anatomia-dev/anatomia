# Plan: web-proof-provenance-attestation

**Branch:** feature/web-proof-provenance-attestation

## Phases

- Extend the web proof page end-to-end (extract → type → render) with Provenance, Session Attestation, and verdict-veto sections — three independently-conditional blocks that leave the ~192 pre-1.3.0 proof pages byte-identical. Cost derived at build time from `packages/cli/src/data/pricing.ts` via an injected price function; pure shaping helpers in `lib/docs-data/` with Vitest tests.
  - Spec: spec.md
