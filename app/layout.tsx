import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nera — Baby Tracker",
  description: "Track tumbuh kembang anak, multi-user household.",
  applicationName: "Nera",
  appleWebApp: {
    capable: true,
    // black-translucent makes the iOS PWA status bar transparent so the
    // page background extends underneath. Important for night-lamp mode
    // (otherwise iOS draws a non-black bar at the top, leaving a visible
    // strip even with theme-color = #000000).
    statusBarStyle: "black-translucent",
    title: "Nera",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f43f5e",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={inter.variable}>
      <body className="font-sans text-gray-800">{children}</body>
    </html>
  );
}
