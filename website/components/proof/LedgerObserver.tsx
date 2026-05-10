"use client";

import { useRef, useEffect, type ReactNode } from "react";
import styles from "./proof.module.css";

/**
 * LedgerObserver — wraps the ledger div and adds `inView` class
 * once the element enters the viewport. Fires once, then disconnects.
 */
export function LedgerObserver({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!("IntersectionObserver" in window)) {
      el.classList.add(styles.inView!);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add(styles.inView!);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.2 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={styles.ledger}>
      {children}
    </div>
  );
}
