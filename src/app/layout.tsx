import type { Metadata, Viewport } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const display = Instrument_Serif({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin", "latin-ext"],
});

const description =
  "Open-source AI fashion design studio: generate designs and prints, AI product photoshoots on models, ghost mannequin, image editing, 4K upscaling, video and production-ready tech packs. Bring your own Gemini and fal.ai API keys.";

export const metadata: Metadata = {
  title: "Open Fashion Studio — open-source AI fashion design, photoshoots & tech packs",
  description,
  keywords: [
    "AI fashion design",
    "open source",
    "AI photoshoot",
    "virtual model",
    "ghost mannequin",
    "tech pack generator",
    "textile print generator",
    "moodboard",
    "Gemini",
    "Nano Banana",
    "fal.ai",
  ],
  openGraph: {
    title: "Open Fashion Studio",
    description,
    type: "website",
    images: ["/screenshots/design.png"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f2ec" },
    { media: "(prefers-color-scheme: dark)", color: "#141311" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
