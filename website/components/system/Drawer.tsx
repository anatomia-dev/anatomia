"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import { FileTree } from "./FileTree";
import { ManPage } from "./ManPage";
import { Formatted } from "@/components/ui/Formatted";
import styles from "./system.module.css";

import type { TreeData } from "./FileTree";

/**
 * Drawer — client component managing the 4-drawer accordion.
 * Multiple drawers can be open simultaneously.
 * Uses IntersectionObserver for one-shot pulse animation on viewport entry.
 */
/**
 * @param version - CLI package version string
 * @param commandCount - total CLI command count from extraction data
 */
export function Drawer({
  version,
  commandCount,
}: {
  version: string;
  commandCount: number;
}) {
  const [openSet, setOpenSet] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const [pulsed, setPulsed] = useState(false);

  const toggle = useCallback((id: string) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // IntersectionObserver for pulse animation
  useEffect(() => {
    const target = containerRef.current;
    if (!target || pulsed) return;

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setPulsed(true);
            obs.disconnect();
          }
        }
      },
      { threshold: 0.25 },
    );
    obs.observe(target);
    return () => obs.disconnect();
  }, [pulsed]);

  const drawers = copy.system.drawers;

  return (
    <div
      ref={containerRef}
      className={pulsed ? styles.pulseFire : ""}
    >
      {drawers.map((drawer, i) => {
        const isOpen = openSet.has(drawer.id);
        const bodyId = `d-${drawer.id}-body`;

        return (
          <div
            key={drawer.id}
            className={`${styles.drawer} ${i === 0 ? styles.drawerFirst : ""}`}
          >
            <button
              className={styles.drawerHead}
              type="button"
              aria-expanded={isOpen}
              aria-controls={bodyId}
              onClick={() => toggle(drawer.id)}
            >
              <span className={styles.dNum}>{drawer.num}</span>
              <span className={styles.dName}>{drawer.name}</span>
              <span className={styles.dTeaser}>{drawer.teaser}</span>
              <span className={styles.dMeta}>
                {drawer.id === "cli" ? `${commandCount} commands` : drawer.meta}
              </span>
              <span
                className={`${styles.dToggle} ${isOpen ? styles.dToggleOpen : ""}`}
                aria-hidden="true"
              >
                +
              </span>
            </button>
            <div
              id={bodyId}
              className={`${styles.drawerBody} ${isOpen ? styles.drawerBodyOpen : ""}`}
            >
              <div className={styles.drawerBodyWrap}>
                <div
                  className={`${styles.drawerBodyInner} ${isOpen ? styles.drawerBodyInnerOpen : ""}`}
                >
                  {/* Copy column */}
                  <div className={styles.blockCopy}>
                    {drawer.copy.map((paragraph, pi) => (
                      <p key={pi} className={pi > 0 ? styles.blockCopyP : undefined}>
                        <Formatted text={paragraph} />
                      </p>
                    ))}
                  </div>

                  {/* Visual column */}
                  <div>
                    {"tree" in drawer && drawer.tree && (
                      <FileTree data={drawer.tree as TreeData} />
                    )}
                    {"manPage" in drawer && drawer.manPage && (
                      <ManPage
                        data={{
                          version,
                          commands: drawer.manPage.commands,
                          moreCount: commandCount - 6,
                          moreNames: drawer.manPage.moreNames,
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
