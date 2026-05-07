/**
 * app/fonts.ts
 * Self-hosted Geist + Geist Mono + Fraunces via next/font/local.
 * No Google Fonts requests. Zero layout shift via font-display: swap.
 *
 * CSS variables set here are consumed by globals.css @theme:
 *   --font-geist-sans  → --font-sans
 *   --font-geist-mono  → --font-mono
 *   --font-fraunces    → --font-serif
 */
import localFont from "next/font/local";

export const geistSans = localFont({
  variable: "--font-geist-sans",
  display: "swap",
  src: [
    { path: "../public/fonts/Geist-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/Geist-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/Geist-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/Geist-Bold.woff2", weight: "700", style: "normal" },
  ],
});

export const geistMono = localFont({
  variable: "--font-geist-mono",
  display: "swap",
  src: [
    { path: "../public/fonts/GeistMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/GeistMono-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/GeistMono-SemiBold.woff2", weight: "600", style: "normal" },
  ],
});

export const fraunces = localFont({
  variable: "--font-fraunces",
  display: "swap",
  src: [
    { path: "../public/fonts/Fraunces-Variable.woff2", weight: "400 700", style: "normal" },
    { path: "../public/fonts/Fraunces-Italic-Variable.woff2", weight: "400 700", style: "italic" },
  ],
});
