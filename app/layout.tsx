import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
  // Android Chrome PWA: resize layout when the keyboard opens instead of overlaying blindly
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: "Nexus",
  description: "Nexus - Personal Intelligence System",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    // Opaque bar: "black-translucent" + viewport-fit cover draws under the status area in standalone
    // and can contribute to hit-target / focus quirks in the home-screen WebView vs in-Safari.
    statusBarStyle: "black",
    title: "NEXUS",
  },
  icons: {
    apple: "/icon-192.png",
    icon: [
      { url: "/nexus-mark.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
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
