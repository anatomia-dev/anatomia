import type { Metadata } from "next";
import { geistSans, geistMono, fraunces } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anatomia — Verified AI development",
  description:
    "Your AI doesn't know your codebase. Ana does. Four sealed agents, one verified diff.",
  metadataBase: new URL("https://anatomia.dev"),
  openGraph: {
    title: "Anatomia — Verified AI development",
    description: "The independent verification layer for AI-written code.",
    url: "https://anatomia.dev",
    siteName: "Anatomia",
    type: "website",
  },
  icons: {
    icon: "/favicon.svg",
  },
};

/**
 * Prevent theme FOUC on hard reload.
 * Raw <script> runs synchronously before React hydrates.
 * Sets data-theme on <html> so CSS tokens resolve on first paint.
 */
const themeBootstrap = `
(function () {
  try {
    var stored = localStorage.getItem('anatomia-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        {children}
        {/* Analytics provider: wire PostHog here when ready */}
      </body>
    </html>
  );
}
