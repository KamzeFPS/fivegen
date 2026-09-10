import type { Metadata } from "next";
import "./globals.css";
import "./studio-design.css";
import "./flow-design.css";
import "./sales-design.css";
import "./credits-design.css";
import "./connections-design.css";

export const metadata: Metadata = {
  title: "FiveGen — Your next idea, made real",
  description:
    "Turn what you know into beautiful digital products. Create, publish, and sell from one workspace.",
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
