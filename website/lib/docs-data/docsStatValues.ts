/**
 * docsStatValues — single source of truth for dynamic docs statistics.
 *
 * Maps 9 atomic value keys to their computed string representations.
 * Three consumers: the DocsStat component, the lib stripJsx, and the
 * prebuild stripJsx path in extract-docs-data.ts.
 */

/** Raw inputs needed to compute all 9 value keys. */
export interface DocsStatInput {
  proofCount: number;
  rejections: number;
  findings: number;
  skillCount: number;
  gotchaCount: number;
  medianThink: number;
  medianPlan: number;
  medianBuild: number;
  medianVerify: number;
}

/**
 * Build a map of all 9 dynamic value keys from raw data.
 *
 * @param input - Raw statistics from proof entries, skills, and gotchas
 * @returns Record mapping each value key to its string representation
 */
export function buildDocsStatValues(input: DocsStatInput): Record<string, string> {
  return {
    proofCount: String(input.proofCount),
    rejections: String(input.rejections),
    findings: String(input.findings),
    skillCount: String(input.skillCount),
    gotchaCount: String(input.gotchaCount),
    medianThink: String(input.medianThink),
    medianPlan: String(input.medianPlan),
    medianBuild: String(input.medianBuild),
    medianVerify: String(input.medianVerify),
  };
}

/**
 * Resolve `<DocsStat value="..." />` tags in text using a prebuilt values map.
 *
 * Replaces each tag with the corresponding value from the map. Unrecognized
 * keys are left as-is (they'll be caught by stripJsx's generic self-closing
 * component regex, producing an empty string — which surfaces as a visible
 * gap in output, making the bug obvious).
 *
 * @param text - Text containing DocsStat component tags
 * @param values - Map of value keys to their string representations
 * @returns Text with DocsStat tags replaced by computed values
 */
export function resolveDocsStatTags(text: string, values: Record<string, string>): string {
  return text.replace(
    /<DocsStat\s+value="([^"]+)"\s*\/>/g,
    (_match, key: string) => values[key] ?? _match,
  );
}
