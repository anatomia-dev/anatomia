"use client";

import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import styles from "./proof-feed.module.css";

const STORAGE_KEY = "anatomia.proofFeed.open";
const CHANGE_EVENT = "anatomia-proof-feed-change";

function getSnapshot(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

/**
 * ProofFeedCard — client wrapper for the collapsible ship log.
 * Manages open/closed state with localStorage persistence.
 * Uses useSyncExternalStore to avoid setState-in-effect.
 */
export function ProofFeedCard({
  summaryContent,
  children,
}: {
  summaryContent: ReactNode;
  children: ReactNode;
}) {
  const open = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next = !getSnapshot();
    try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch {}
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return (
    <div className={styles.card} data-open={String(open)}>
      <button
        className={styles.summary}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="proof-feed-body"
      >
        {summaryContent}
      </button>
      <div className={styles.collapse} id="proof-feed-body">
        <div className={styles.collapseInner}>
          {children}
        </div>
      </div>
    </div>
  );
}
