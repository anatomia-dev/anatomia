import Link from "next/link";
import { copy } from "@/lib/copy";
import { Formatted } from "@/components/ui/Formatted";
import { splitHeadline } from "@/lib/format";
import styles from "./manifesto.module.css";

/**
 * Manifesto — single <article>. Fraunces serif body text.
 * Oxblood drop cap on first paragraph. Pull quote. Signature.
 * NO numbered sections, no footnotes. Restraint is the point.
 */
export function Manifesto() {
  const title = splitHeadline(copy.manifesto.title);

  return (
    <article className={styles.article}>
      {/* Eyebrow */}
      <div className={styles.eyebrow}>{copy.manifesto.eyebrow}</div>

      {/* Title */}
      <h1 className={styles.title}>
        {title.map((p, i) =>
          p.em ? <em key={i}>{p.t}</em> : <span key={i}>{p.t}</span>,
        )}
      </h1>

      {/* Body paragraphs (before pull quote) */}
      {copy.manifesto.body.map((para, i) => (
        <p key={i} className={`${styles.body} ${i === 0 ? styles.lede : ""}`}>
          <Formatted text={para} />
        </p>
      ))}

      {/* Pull quote */}
      <blockquote className={styles.pull}>
        {copy.manifesto.pull}
      </blockquote>

      {/* Body paragraphs (after pull quote) */}
      {copy.manifesto.bodyAfterPull.map((para, i) => (
        <p key={i} className={styles.body}>
          <Formatted text={para} />
        </p>
      ))}

      {/* Signature */}
      <div className={styles.signature}>
        <span className={styles.signatureWho}>{copy.manifesto.signature.who}</span>
        <span>{copy.manifesto.signature.when}</span>
      </div>

      {/* Outbound links */}
      <div className={styles.outbound}>
        {copy.manifesto.outbound.map((l) => (
          <Link key={l.href} href={l.href}>{l.label}</Link>
        ))}
      </div>
    </article>
  );
}
