import type { Metadata, Viewport } from "next";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ScrollToTop } from "@/components/ScrollToTop";
import { BadgeClearer } from "@/components/BadgeClearer";

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
  themeColor: "#F5F1E8",
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
    >
      <body className="min-h-full flex flex-col">
        {children}
        <ScrollToTop />
        <BadgeClearer />
      </body>
    </html>
  );
}
