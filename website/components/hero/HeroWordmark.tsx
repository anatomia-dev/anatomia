"use client";

import { useEffect, useRef } from "react";
import styles from "./hero.module.css";

/**
 * HeroWordmark — faint branded "anatomia" text that fills the space
 * between the hero content and the fold. Fades out on scroll.
 */
export function HeroWordmark() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let ticking = false;
    function update() {
      ticking = false;
      const y = window.scrollY;
      const vh = window.innerHeight;
      const start = vh * 0.25;
      const end = vh * 0.75;
      let op: number;
      if (y <= start) op = 1;
      else if (y >= end) op = 0;
      else op = 1 - (y - start) / (end - start);
      el!.style.setProperty("--mark-opacity", op.toFixed(3));
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={styles.wordmarkWrap} ref={ref} aria-hidden="true">
      <span className={styles.wordmark}>anatomia</span>
    </div>
  );
}
