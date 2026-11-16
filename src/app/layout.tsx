import type { Metadata, Viewport } from "next";
// Self-hosted fonts (bundled at build time — no external font requests).
import "@fontsource/cormorant-garamond/latin-400.css";
import "@fontsource/cormorant-garamond/latin-500.css";
import "@fontsource/cormorant-garamond/latin-600.css";
import "@fontsource/cormorant-garamond/latin-700.css";
import "@fontsource/cormorant-garamond/latin-400-italic.css";
import "@fontsource/cormorant-garamond/latin-500-italic.css";
import "@fontsource/jost/latin-300.css";
import "@fontsource/jost/latin-400.css";
import "@fontsource/jost/latin-500.css";
import "@fontsource/jost/latin-600.css";
import "./globals.css";
import { APP_NAME, DEDICATION } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: DEDICATION,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#fbf8f4", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
