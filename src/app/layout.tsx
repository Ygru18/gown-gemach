import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});
const jost = Jost({ subsets: ["latin"], weight: ["300", "400", "500", "600"], variable: "--font-jost", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Chaya Surah Feldman Gown Gemach", template: "%s · Chaya Surah Feldman Gown Gemach" },
  description: "Sharing beauty, kindness and generosity in loving memory of Chaya Surah Feldman.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#fbf8f4", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cormorant.variable} ${jost.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
