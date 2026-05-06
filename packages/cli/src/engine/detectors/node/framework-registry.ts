/**
 * Node.js framework detectors in PRIORITY ORDER.
 *
 * First match wins. Priority matters for disambiguation — Next.js depends on
 * React, Nest.js wraps Express, so the "parent" framework is always checked
 * before its dependency. The registry exists to make the priority chain the
 * single point of truth: previously the order was duplicated between
 * `detectors/framework.ts` (a hand-rolled sequence of `if (x.framework) return x`
 * blocks) and the priority comment inside each detector file. Splitting them
 * into a central array means adding or reordering a detector is a single-file
 * edit and the priority is visible at a glance.
 *
 * To add a new Node framework:
 *   1. Create `detectors/node/<framework>.ts` exporting `detectX(deps, hints)`.
 *   2. Import it here.
 *   3. Insert it in this array at the correct priority position.
 *
 * Signature contract: every detector in this array MUST accept
 * `(dependencies: string[], hints: FrameworkHintEntry[])` and return `Detection`.
 * All detectors receive census data directly instead of rootPath.
 */

import type { Detection } from '../python/fastapi.js';
import type { FrameworkHintEntry } from '../../types/census.js';
import { detectNextjs } from './nextjs.js';
import { detectRemix } from './remix.js';
import { detectNestjs } from './nestjs.js';
import { detectExpress } from './express.js';
import { detectReact } from './react.js';
import { detectOtherNodeFrameworks } from './other.js';

export type NodeFrameworkDetector = (
  dependencies: string[],
  hints: FrameworkHintEntry[]
) => Detection;

/**
 * Priority-ordered list of Node framework detectors.
 *
 * Rationale for ordering:
 *   1. Next.js — bundles React; must beat plain React detection.
 *   2. Remix / React Router v7 — bundles React; must beat plain React
 *      detection. Only fires on @react-router/dev or @remix-run/*,
 *      NOT on bare react-router (which is a routing lib, not the
 *      framework).
 *   3. Nest.js — wraps Express; must beat plain Express detection.
 *   4. Express — a common direct dependency, checked before React.
 *   5. React — fallback for pure React (no Next/Remix) projects.
 *   6. Other (Fastify/Koa/Hono) — catch-all for simpler frameworks.
 */
export const NODE_FRAMEWORK_DETECTORS: NodeFrameworkDetector[] = [
  detectNextjs,
  detectRemix,
  detectNestjs,
  detectExpress,
  detectReact,
  detectOtherNodeFrameworks,
];
