import type { Metadata, Viewport } from "next";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ScrollToTop } from "@/components/ScrollToTop";
import { BadgeClearer } from "@/components/BadgeClearer";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

// Self-hosted via next/font so there is no runtime Google Fonts request.
// Fraunces needs the `opsz` axis (headings set font-variation-settings: "opsz" …)
// and italic (font-display italic is used across the app).
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-fraunces",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Dispatch — Developer of Code support",
  description:
    "Filed dispatches and live-wire support for Developer of Code, LLC clients.",
  applicationName: "Dispatch",
  appleWebApp: {
    capable: true,
    title: "Dispatch",
    statusBarStyle: "default",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  // Paired so the iOS PWA status bar and the browser chrome follow the theme.
  // These are the resolved --parchment values from globals.css.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F1E8" },
    { media: "(prefers-color-scheme: dark)", color: "#12151C" },
  ],
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${fraunces.variable} ${jetbrainsMono.variable}`}
      // The init script below stamps data-theme onto <html> before React sees
      // it, which is exactly the kind of difference this suppresses.
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Must run synchronously, before anything paints, or a dark-themed
            load flashes the light parchment first. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
        <ScrollToTop />
        <BadgeClearer />
      </body>
    </html>
  );
}
