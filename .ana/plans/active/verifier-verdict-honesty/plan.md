# Plan: verifier-verdict-honesty

**Branch:** feature/verifier-verdict-honesty

## Phases

- Components 1 + 2 — de-contradict `ana-verify.md` (remove the build-report read license, keep the prohibition) and collapse the 6 duplicated `**Result:**` scrapes into one verdict function that coerces a contradicted PASS (UNSATISFIED table row or `risk` finding) to FAIL. Pure anatomia, no anatrace dependency.
  - Spec: spec-1.md
- Component 3 — deterministic read-build-report veto. Persist `source` on the compliance record and force-FAIL the proof when the verify session's `ana-verify:verify-independence` claim is `violated` with `source: deterministic`. Forward-only, fail-open-but-surfaced.
  - Spec: spec-2.md
  - Depends on: Phase 1
