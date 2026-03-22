import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#000000",
};

export const metadata: Metadata = {
  title: "Nexus",
  description: "Nexus - Personal Intelligence System",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NEXUS",
  },
  icons: {
    apple: "/nexus-logo.png",
    icon: [
      { url: "/nexus-logo.png", sizes: "any", type: "image/png" },
      { url: "/nexus-logo.png", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="nexus-body">{children}</body>
    </html>
  );
}
