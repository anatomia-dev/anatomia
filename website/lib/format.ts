/**
 * lib/format.ts
 * Text formatting helpers for copy strings that use *emphasis* markers.
 */

export interface TextSegment {
  t: string;
  em?: boolean;
}

/**
 * splitHeadline("Your AI doesn't know your codebase. *Ana* does.")
 *   → [{t:"Your AI..."}, {t:"Ana", em:true}, {t:" does."}]
 *
 * Use in Hero headline, Footer tagline, and anywhere copy uses
 * *asterisks* to mark the emphasized word.
 */
export function splitHeadline(s: string): TextSegment[] {
  return s
    .split(/(\*[^*]+\*)/)
    .filter(Boolean)
    .map((chunk) =>
      chunk.startsWith("*") && chunk.endsWith("*")
        ? { t: chunk.slice(1, -1), em: true }
        : { t: chunk },
    );
}
