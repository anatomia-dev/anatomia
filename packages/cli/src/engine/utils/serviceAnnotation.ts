/**
 * Service → stack role annotation.
 *
 * Annotates detected external services with the stack roles they fulfill,
 * so display code can dedupe trivially via `stackRoles.length === 0` instead
 * of 4 copies of `!stackValues.some(v => v.includes(svc.name))` — substring
 * matching that fails when one stack name is a prefix of another (the classic
 * "Vercel AI" includes "Vercel" case).
 *
 * Centralized rather than per-detector because individual detectors don't have
 * access to the assembled stack at detection time; this runs after stack is
 * built and services are merged. The elegant-solution-removes approach:
 * annotate once at detection, filter trivially everywhere.
 *
 * Contributor note: if a new stack field is added to EngineResult['stack']
 * that should produce a role-based dedup (e.g., a hypothetical `cache` field
 * where Redis would appear in both stack.cache and externalServices), add the
 * check below. The five checked fields (database, auth, payments, aiSdk,
 * deployment.platform) cover every current duplication case. The other stack
 * fields (language, framework, testing, workspace) are intentionally skipped —
 * no service has the same name as "TypeScript", "Next.js", "Vitest", or
 * "pnpm monorepo", so there is nothing to dedupe.
 */
import type { EngineResult, StackRole } from '../types/engineResult.js';

type ExternalService = EngineResult['externalServices'][number];

export function annotateServiceRoles(
  services: ExternalService[],
  stack: EngineResult['stack'],
  deploymentPlatform: string | null
): ExternalService[] {
  return services.map(svc => {
    const roles: StackRole[] = [];
    if (svc.name === stack.database) roles.push('database');
    // Auth field may be suffixed with " Auth" (e.g., "Supabase Auth" for the
    // "Supabase" service). Match both forms so Supabase-as-backend and
    // Supabase-as-auth dedupe correctly.
    if (stack.auth === svc.name || stack.auth === `${svc.name} Auth`) roles.push('auth');
    if (svc.name === stack.payments) roles.push('payments');
    if (svc.name === stack.aiSdk) roles.push('aiSdk');
    if (svc.name === deploymentPlatform) roles.push('deployment');
    return { ...svc, stackRoles: roles };
  });
}
