/**
 * Sound coverage construction for behavioral attestation (Phase 2, Step 1).
 *
 * This module owns the single correctness hinge of the behavioral pipeline:
 * building the {@link MandateEvaluationContext} that `runCompliance` evaluates
 * against. The core engine faithfully judges whatever coverage it is handed — so
 * if Anatomia OVER-STATES coverage, core will faithfully emit a `satisfied` it
 * cannot catch. The invariant that may never bend: **over-stated coverage must
 * never produce `satisfied`.**
 *
 * Anatomia's launcher captures only the ROOT agent's transcript, never delegate
 * (sub-agent) transcripts. The context must reflect exactly that and nothing
 * more. We never hand-construct a captured delegate lane — we declare the trusted
 * launcher's expected boundary (root only) and let core's reconciliation against
 * the observed {@link extractLineage} decide which lanes' bytes were actually
 * checked. Core's contract: "Expected launch records alone never prove capture;
 * absent lineage yields uncaptured lanes." Root is captured (its bytes were
 * checked); any observed delegate stays uncaptured.
 *
 * The "never over-state" discipline mirrors forensics' "omit the field when
 * unknown" honesty — here we under-claim rather than fabricate.
 */

import {
  coverageFromExpectedLaunchBoundary,
  extractLineage,
} from 'anatrace-core';
import type {
  AgentRef,
  ExpectedLaunchBoundary,
  MandateEvaluationContext,
  NamedBlob,
  NormalizedSession,
} from 'anatrace-core';

/** The single root {@link AgentRef} — the only lane Anatomia's launcher captures today. */
const ROOT_AGENT: AgentRef = { kind: 'root' };

/**
 * The trusted-launcher capture boundary this build supports.
 *
 * Today the launcher captures only the root lane (see `run.ts buildCaptureEnv`,
 * which emits `ANA_CAPTURE_BOUNDARY: 'root'`). A future phase that captures
 * delegate transcripts is a one-line change here plus a richer boundary.
 */
const ROOT_BOUNDARY = 'root';

/**
 * Build the sound evaluation context for a root-only captured session.
 *
 * Construction (faithful to core's published type contracts):
 *  1. Declare an {@link ExpectedLaunchBoundary} from the trusted launcher with a
 *     single root lane and no expected delegates.
 *  2. Project which lanes' bytes were actually checked via {@link extractLineage}
 *     over the captured transcript blobs.
 *  3. Reconcile boundary against lineage via
 *     {@link coverageFromExpectedLaunchBoundary} → a {@link CaptureCoverage} in
 *     which root is `captured: true` (its bytes were checked) and any observed
 *     delegate lane is `captured: false`. We NEVER fabricate a `captured: true`
 *     delegate lane.
 *
 * The `boundary` parameter records WHICH lanes the trusted launcher declares it
 * captured; absence (or any unrecognized value) defaults to `'root'`, the only
 * boundary this build captures. It exists so a future delegate-capturing phase
 * passes a richer value without changing call sites.
 *
 * @param session - The normalized root session (`parseSession` output)
 * @param blobs - The captured transcript blobs handed to `parseSession`
 * @param boundary - The trusted launcher's capture-boundary declaration (defaults to `'root'`)
 * @returns A context whose `captureCoverage` never over-states: root captured, delegates not
 */
export function buildRootLaneContext(
  session: NormalizedSession,
  blobs: NamedBlob[],
  boundary: string = ROOT_BOUNDARY,
): MandateEvaluationContext {
  // Only the root boundary is supported today; any other value degrades to it
  // rather than silently widening coverage (fail-closed). `boundary` is read so
  // the declaration lives at the one place that knows it — the trusted launcher.
  void boundary;

  const expectedLaunchBoundary: ExpectedLaunchBoundary = {
    source: 'trusted-launcher',
    lanes: [{ agent: ROOT_AGENT, expectedDelegates: [] }],
  };

  // Project actually-checked lanes from the captured bytes. Passing lineage is
  // mandatory: `coverageFromExpectedLaunchBoundary` with NO lineage marks ALL
  // lanes (including root) uncaptured → everything unverifiable. With lineage,
  // root is captured and any observed-but-uncaptured delegate stays uncaptured.
  const lineage = extractLineage(session, blobs);
  const captureCoverage = coverageFromExpectedLaunchBoundary(expectedLaunchBoundary, lineage);

  return {
    thisAgent: ROOT_AGENT,
    captureCoverage,
    lineage,
  };
}
