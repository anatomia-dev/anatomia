import { getProofEntries, getProofStats, getMedianTimings } from '@/lib/docs-data/proofs';
import { getSkillCount } from '@/lib/docs-data/skills';
import { getGotchaCount } from '@/lib/docs-data/gotchas';
import { buildDocsStatValues } from '@/lib/docs-data/docsStatValues';

interface DocsStatProps {
  value: string;
}

/**
 * Server component that renders a single computed docs statistic as an inline span.
 *
 * @param props - Contains the value key to look up
 * @returns A span element with the resolved value, or the raw key if unrecognized
 */
export function DocsStat({ value }: DocsStatProps) {
  const entries = getProofEntries();
  const stats = getProofStats();
  const medians = getMedianTimings();

  const values = buildDocsStatValues({
    proofCount: entries.length,
    rejections: stats.rejections,
    findings: stats.findings,
    skillCount: getSkillCount(),
    gotchaCount: getGotchaCount(),
    medianThink: medians.think,
    medianPlan: medians.plan,
    medianBuild: medians.build,
    medianVerify: medians.verify,
  });

  return <span>{values[value] ?? value}</span>;
}
