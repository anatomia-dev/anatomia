/**
 * lib/format.ts
 * Text formatting helpers for copy strings that use *emphasis* markers.
 */

export interface TextSegment {
  t: string;
  em?: boolean;
  /** A forced line break. Carries no text; render as <br>. */
  br?: boolean;
}

/**
 * splitHeadline("Your AI doesn't know your codebase. *Ana* does.")
 *   → [{t:"Your AI..."}, {t:"Ana", em:true}, {t:" does."}]
 *
 * A "\n" in the source forces a line break: emits a {br:true} segment.
 *   splitHeadline("The Coding Harness\nwith an *engine*.")
 *     → [{t:"The Coding Harness"}, {br:true}, {t:"with an "}, {t:"engine", em:true}, {t:"."}]
 *
 * Use in Hero headline, Footer tagline, and anywhere copy uses
 * *asterisks* to mark the emphasized word.
 */
export function splitHeadline(s: string): TextSegment[] {
  return s
    .split(/(\*[^*]+\*)/)
    .filter(Boolean)
    .flatMap((chunk) => {
      if (chunk.startsWith("*") && chunk.endsWith("*")) {
        return [{ t: chunk.slice(1, -1), em: true }];
      }
      const segs: TextSegment[] = [];
      chunk.split("\n").forEach((part, i) => {
        if (i > 0) segs.push({ t: "", br: true });
        if (part) segs.push({ t: part });
      });
      return segs;
    });
}
