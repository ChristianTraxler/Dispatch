import type { Metadata, Viewport } from "next";
import { Spectral, Mona_Sans } from "next/font/google";
import "./globals.css";
import { ScrollToTop } from "@/components/ScrollToTop";
import { BadgeClearer } from "@/components/BadgeClearer";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

// Self-hosted via next/font so there is no runtime Google Fonts request.
// Spectral sets headings; Mona Sans (with its width axis) sets everything else.
const spectral = Spectral({
  subsets: ["latin"],
  // 300 for headings, 400 for serif body text, 500 for the <strong> words
  // inside it (the browser bolds up from the nearest weight it has).
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-display",
});

const monaSans = Mona_Sans({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-ui",
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
  // These are the resolved --parchment values from globals.css (Workbench white and after-hours walnut).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#241A14" },
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
      className={`h-full antialiased ${spectral.variable} ${monaSans.variable}`}
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
