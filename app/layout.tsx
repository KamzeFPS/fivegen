import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FiveGen — Your next idea, made real",
  description:
    "Turn what you know into beautiful digital products. Create, publish, and sell from one workspace.",
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
