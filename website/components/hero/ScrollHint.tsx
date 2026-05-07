"use client";

import { useEffect, useState } from "react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import styles from "./hero.module.css";

/**
 * ScrollHint — "Scroll · See how" with animated dot.
 * Fades out after 12px of scroll.
 */
export function ScrollHint() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onScroll = () => setHidden(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <a
      href="#pipeline"
      className={cn(styles.scrollHint, hidden && styles.scrollHintHidden)}
      aria-label="Scroll to pipeline"
    >
      <span>{copy.hero.scrollHint.start}</span>
      <span className={styles.shLine}>
        <span className={styles.shDot} />
      </span>
      <span>{copy.hero.scrollHint.end}</span>
    </a>
  );
}
