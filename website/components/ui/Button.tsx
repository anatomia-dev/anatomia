import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-[var(--color-brand)] text-[var(--color-brand-ink)] hover:brightness-110",
  secondary:
    "bg-[var(--btn-2-bg)] text-[var(--btn-2-text)] border border-[var(--btn-2-border)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]",
  ghost:
    "bg-transparent text-[var(--fg)] hover:text-[var(--fg-strong)]",
};

const sizeStyles: Record<Size, string> = {
  sm: "px-3.5 py-1.5 text-xs gap-1.5",
  md: "px-5 py-2.5 text-sm gap-2",
  lg: "px-6 py-3 text-base gap-2.5",
};

const base =
  "inline-flex items-center justify-center font-medium rounded-full transition-all duration-150 cursor-pointer";

/**
 * Button — renders as <button> or <a> based on presence of `href`.
 *
 * <Button variant="primary" href="/docs">Docs</Button>     → <a>
 * <Button variant="secondary" onClick={fn}>Click</Button>  → <button>
 */
export function Button({
  variant = "primary",
  size = "md",
  href,
  external,
  className,
  children,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  href?: string;
  external?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">) {
  const classes = cn(base, variantStyles[variant], sizeStyles[size], className);

  if (href) {
    const isExternal = external || href.startsWith("http");
    if (isExternal) {
      return (
        <a
          href={href}
          className={classes}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
