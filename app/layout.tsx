import type { Metadata } from "next";
import "./globals.css";
import "./studio-design.css";
import "./flow-design.css";
import "./sales-design.css";
import "./credits-design.css";
import "./connections-design.css";
import "./journey-design.css";
import "./generator-design.css";
import "./studio-chat.css";
import "./growth-design.css";
import "./growth-strategy.css";
import "./commerce-design.css";
import "./automation-design.css";

export const metadata: Metadata = {
  title: "FiveGen — Your AI growth operator",
  description:
    "Build your launch around your expertise. Create a VSL script, publish your landing page, and manage leads while keeping your course in your own voice.",
  icons: {
    icon: "/brand/fivegen-transparent.webp",
    shortcut: "/brand/fivegen-transparent.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
