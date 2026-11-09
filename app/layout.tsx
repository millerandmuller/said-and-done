import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Said & Done",
  description: "The counter that listens. Say the sale, show the code, get paid.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f6f1e7" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
