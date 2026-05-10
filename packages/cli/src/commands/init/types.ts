/**
 * Shared types for the init command.
 *
 * These types are used across multiple split files: index.ts (action
 * handler), preflight.ts (validateInitPreconditions), and potentially
 * scaffold helpers. Putting them in their own file avoids a
 * cross-file cycle between index.ts and preflight.ts.
 */

/** Command options */
export interface InitCommandOptions {
  force?: boolean;
  yes?: boolean;
}

/** Installation state detected during pre-scan validation */
export type InitState = 'fresh' | 'reinit' | 'upgrade' | 'corrupted';

/** Pre-flight validation result.
 *
 * Backup paths removed — the swap-based atomic rename no
 * longer copies user state to /tmp before deleting .ana/. Instead, the
 * existing .ana/ is left in place until the replacement is fully built,
 * then swapped atomically via preserveUserState + oldPath rename. User
 * state is sourced directly from the live .ana/ (which still exists).
 */
export interface PreflightResult {
  canProceed: boolean;
  initState: InitState;
  /** Whether an existing `.ana/` directory was detected. Signals to the
   *  orchestrator whether to run preserveUserState and the swap rename. */
  anaExisted: boolean;
  /** Pipeline readiness warnings collected during preflight.
   *  Informational only — never prevents init from completing.
   *  Flows through the orchestrator to displaySuccessMessage for recap. */
  warnings: string[];
}
