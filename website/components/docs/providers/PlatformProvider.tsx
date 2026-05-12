"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useEffect,
  useMemo,
} from "react";
import type { ReactNode } from "react";

export type Platform = "claude-code" | "cursor" | "codex" | "windsurf" | "copilot" | "cline";

interface PlatformContextValue {
  platform: Platform;
  setPlatform: (p: Platform) => void;
}

const PlatformContext = createContext<PlatformContextValue>({
  platform: "claude-code",
  setPlatform: () => {},
});

const COOKIE_KEY = "ana-docs-platform";
const DEFAULT_PLATFORM: Platform = "claude-code";

function readCookie(): Platform {
  if (typeof document === "undefined") return DEFAULT_PLATFORM;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return (match?.[1] as Platform) ?? DEFAULT_PLATFORM;
}

function writeCookie(value: Platform): void {
  document.cookie = `${COOKIE_KEY}=${value};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
}

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [platform, setPlatformState] = useState<Platform>(DEFAULT_PLATFORM);

  useEffect(() => {
    setPlatformState(readCookie());
  }, []);

  const setPlatform = useCallback((p: Platform) => {
    setPlatformState(p);
    writeCookie(p);
  }, []);

  const value = useMemo(() => ({ platform, setPlatform }), [platform, setPlatform]);

  return (
    <PlatformContext.Provider value={value}>
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform(): PlatformContextValue {
  return useContext(PlatformContext);
}
