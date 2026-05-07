import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Container — centered content with max-width and responsive padding.
 * Typed replacement for the .page CSS class.
 * Max-width: 1320px. Padding: 24px (mobile) / 40px (desktop).
 */
export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-[1320px] px-6 md:px-10",
        className,
      )}
    >
      {children}
    </div>
  );
}
