"use client";

import type { ReactNode } from "react";
import { usePlatform } from "@/components/docs/providers/PlatformProvider";
import type { Platform } from "@/components/docs/providers/PlatformProvider";

interface ForPlatformProps {
  platform: Platform;
  children: ReactNode;
}

export function ForPlatform({ platform, children }: ForPlatformProps) {
  const { platform: active } = usePlatform();
  if (active !== platform) return null;
  return <>{children}</>;
}
