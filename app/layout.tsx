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
import "./workspace-navigation.css";
import "./workspace-content.css";
import "./overview-design.css";
import "./product-experience.css";

export const metadata: Metadata = {
  title: "FiveGen — Create, publish and sell digital products",
  description:
    "Turn your expertise into books, courses and digital products. Build with AI or your own content, publish your page, and manage sales from one workspace.",
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
