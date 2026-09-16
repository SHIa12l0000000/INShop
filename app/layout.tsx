import type { Metadata } from "next";
import "./globals.css";
import "./marketplace.css";
import "./responsive.css";

export const metadata: Metadata = {
  title: "INShop — Everything you need. One smart shop.",
  description:
    "Discover everyday favourites across electronics, fashion, home and more at INShop.",
  manifest: "/manifest.webmanifest",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
