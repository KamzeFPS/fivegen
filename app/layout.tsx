import type { Metadata } from "next";
import {SEO_ORIGIN} from '@/lib/seo';
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
import "./workspace-search.css";
import "./workspace-product-navigation.css";
import "./product-page-design.css";
import "./product-builder-navigation.css";
import "./file-sale-navigation.css";

export const metadata: Metadata = {
  metadataBase: new URL(SEO_ORIGIN),
  applicationName: 'FiveGen',
  title: "FiveGen — Create, publish and sell digital products",
  description:
    "Turn your expertise into books, courses and digital products. Build with AI or your own content, publish your page, and manage sales from one workspace.",
  // Public routes explicitly opt in. New account and workspace routes stay out
  // of search even before they receive their own route-specific metadata.
  robots: {index: false, follow: false},
  icons: {
    icon: [{url: "/brand/favicon-96.png", type: 'image/png', sizes: '96x96'}],
    shortcut: "/brand/favicon-96.png",
    apple: [{url: '/brand/apple-touch-icon.png', type: 'image/png', sizes: '180x180'}],
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
