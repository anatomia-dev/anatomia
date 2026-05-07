"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Adds `data-scrolled="true"` to its child <nav> after 12px of scroll.
 * Used for the subtle bottom-border shadow on scroll.
 */
export function NavScrollWrapper({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current?.firstElementChild as HTMLElement | null;
    if (!el) return;

    const onScroll = () => {
      el.setAttribute("data-scrolled", window.scrollY > 12 ? "true" : "false");
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return <div ref={ref}>{children}</div>;
}
